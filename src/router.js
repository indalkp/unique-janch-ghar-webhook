/**
 * src/router.js — Inbound webhook event router (v2.3).
 *
 * v2 rules:
 *   1. Pull state for the wa_id (cached 30 s).
 *   2. Per-sender rate limit (10 msgs / 60 s) — drop excess + log.
 *   3. Detect language from the inbound text.
 *   4. If text matches "menu" / "मेनू" OR state.flow === 'idle' OR no state
 *      exists yet — show the main menu and set state.
 *   5. Else dispatch to the current flow's handler. Each flow handles its own
 *      step transitions and outbound messages.
 *   6. Run logInbound + outbound + setState in parallel via Promise.allSettled.
 *
 * v2.2: pass the full inbound msg as the 4th arg to handler.handle() so flows
 * can inspect msg.type === 'location' (lat/lng/name/address) without going
 * through extractText. extractText still returns "[location]" for logging.
 *
 * v2.3: multi-tenant routing guard. The Indalkp WABA hosts multiple phone
 * numbers (UJG, indalkp.com, ...). This bot ONLY serves UJG's phone_number_id.
 * Inbound for any other PNID gets a polite cross-tenant redirect (sent FROM
 * the actual recipient PNID so the user sees the reply on the right line)
 * and skips UJG flow dispatch. Status callbacks for foreign PNIDs are
 * silently ignored — they belong to messages we never sent.
 *
 * Cloud Functions Gen 2 freezes the instance the moment res.send() flushes,
 * so EVERY async call must be awaited (or pushed into Promise.allSettled)
 * before this function returns — orphaned promises die.
 */

'use strict';

const { logInbound, logStatus, upsertCustomer, upsertStaffActive } = require('./sheets');
const { getState, setState, isRateLimited, recordRateLimit } = require('./state');
const { detectLang, t } = require('./lang');
const { sendText, markRead } = require('./actions');
const { handleWaButton } = require('./actions-coordinate');
const { maybeRefreshStaffActive } = require('./wa-alerts');
const { config } = require('./config');
const { log } = require('./logger');

const { showMenu } = require('./flows/menu');
const bookFlow    = require('./flows/book');
const statusFlow  = require('./flows/status');
const catalogFlow = require('./flows/catalog');
const infoFlow    = require('./flows/info');
const handoffFlow = require('./flows/handoff');

// ---- v2.3: Multi-tenant routing constants ---------------------------------
// The ONLY phone_number_id this bot serves. Anything else on the same WABA
// (e.g. the indalkp.com line) gets the cross-tenant redirect below. Hardcoded
// (not env) because the value is a permanent property of the UJG number.
const UJG_PHONE_NUMBER_ID = '1155334040987245';

// Bilingual redirect text. Sent FROM the foreign PNID so the user gets it on
// the line they actually messaged.
const CROSS_TENANT_REDIRECT_TEXT =
  'This is a separate business line. For lab tests and bookings, please message *+91 97985 86981* — Unique Janch Ghar.\n\n' +
  'यह एक अलग बिज़नेस लाइन है। लैब टेस्ट और बुकिंग के लिए कृपया *+91 97985 86981* पर मैसेज करें — Unique Janch Ghar।';

// Words that always reset the conversation back to the main menu.
const MENU_TRIGGERS = ['menu', 'मेनू', 'start', 'शुरू', 'hi', 'hello', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार', 'help', 'मदद'];

// Maps a top-level menu row id → flow start fn.
const FLOW_STARTERS = {
  book:    (wa_id, lang, name) => bookFlow.start(wa_id, lang, { name }),
  status:  (wa_id, lang)       => statusFlow.start(wa_id, lang),
  catalog: (wa_id, lang)       => catalogFlow.start(wa_id, lang),
  info:    (wa_id, lang)       => infoFlow.start(wa_id, lang),
  handoff: (wa_id, lang, name) => handoffFlow.start(wa_id, lang, { name }),
};

// Maps a flow key → handler module (for in-flow dispatch).
const FLOW_HANDLERS = {
  book:    bookFlow,
  status:  statusFlow,
  catalog: catalogFlow,
  info:    infoFlow,
  handoff: handoffFlow,
};

function isAfterHours() {
  const start = config.AFTERHOURS_START;
  const end = config.AFTERHOURS_END;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.TZ || 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  });
  const hour = parseInt(fmt.format(new Date()), 10);
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

/**
 * Pull the user-meaningful "text" from any inbound message type. Interactive
 * messages return the row/button id (so flows can dispatch on stable IDs).
 */
function extractText(msg) {
  switch (msg.type) {
    case 'text':
      return msg.text?.body || '';
    case 'button':
      return msg.button?.text || msg.button?.payload || '';
    case 'interactive': {
      const i = msg.interactive || {};
      if (i.type === 'list_reply') return i.list_reply?.id || i.list_reply?.title || '';
      if (i.type === 'button_reply') return i.button_reply?.id || i.button_reply?.title || '';
      return '';
    }
    case 'location':
      // Return a marker so logging/upsert sees it; the flow reads msg.location
      // directly via the 4th arg passed to handle().
      return '[location]';
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker':
      return `[${msg.type}]`;
    default:
      return '';
  }
}

/**
 * The 24-hour service window check. Meta only allows free-form messages within
 * 24h of the customer's last inbound. We track last_inbound on the Customers
 * tab via upsertCustomer() — for now, any inbound resets the clock so it's
 * always "in window" by the time we reach handleMessage.
 */
function isWithin24h() {
  return true;
}

/**
 * v2.3: Send a free-form text message FROM a specific phone_number_id (NOT
 * the env-configured default in actions.js). Used by the cross-tenant
 * redirect path where the recipient PNID is a sibling number on the same
 * WABA, so the reply needs to come from THAT line. The META_ACCESS_TOKEN
 * has access to all PNIDs registered under the WABA, so the same token works.
 *
 * Failures are logged but never thrown — a redirect bouncing should never
 * crash the webhook.
 */
async function sendTextFromPNID(senderPnid, to, body) {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${senderPnid}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      log.warn('router.cross_tenant.send_failed', {
        senderPnid, to, status: res.status, error: json.error || null,
      });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    log.warn('router.cross_tenant.send_threw', { senderPnid, to, error: err.message });
    return { ok: false };
  }
}

/**
 * Single-message handler. Called once per inbound message.
 */
async function handleMessage(msg, contact) {
  const wa_id = msg.from;
  const name = contact?.profile?.name || '';
  const text = extractText(msg);
  const lang = detectLang(text);
  const tasks = [];

  // ----- Rate limiting -------------------------------------------------------
  if (isRateLimited(wa_id)) {
    log.warn('router.rate_limited', { wa_id });
    tasks.push(logInbound({
      timestamp: new Date().toISOString(),
      wa_id, name, type: msg.type, text,
      keyword: 'RATE_LIMITED', messageId: msg.id,
    }));
    await Promise.allSettled(tasks);
    return;
  }
  recordRateLimit(wa_id);

  // ----- Always log + upsert customer ---------------------------------------
  tasks.push(logInbound({
    timestamp: new Date().toISOString(),
    wa_id, name, type: msg.type, text,
    keyword: '', messageId: msg.id,
  }));
  tasks.push(upsertCustomer(wa_id, { name, lastMessage: text }));
  tasks.push(markRead(msg.id));

  // v2.2: refresh staff active timestamp if sender is in STAFF_WA list.
  // This keeps the 24h alert window open without staff thinking about it.
  tasks.push(maybeRefreshStaffActive(wa_id));

  // v2.2: cross-channel action buttons. WhatsApp Reply Button ids carry the
  // booking id like `act_confirm_UJG-...`. Short-circuit before flow dispatch
  // so any in-flight conversation isn't disturbed.
  if (text && /^act_(confirm|cancel|collected|map)_/.test(text)) {
    tasks.push(handleWaButton(wa_id, text));
    await Promise.allSettled(tasks);
    return;
  }

  // v2.2: 'subscribe' keyword opts a wa_id into staff alerts (sets last_active_at).
  if (text && text.trim().toLowerCase() === 'subscribe') {
    tasks.push((async () => {
      await upsertStaffActive(wa_id, new Date().toISOString(), name || '');
      await sendText(wa_id, '✅ Subscribed to UJG staff alerts. You will receive a WhatsApp message for each new booking. Reply "stop" to unsubscribe.');
    })());
    await Promise.allSettled(tasks);
    return;
  }

  // ----- After-hours short-circuit ------------------------------------------
  if (false && isAfterHours()) { // DISABLED: bot serves 24/7
    tasks.push(sendText(wa_id, t('common.outside_window', lang)));
    await Promise.allSettled(tasks);
    return;
  }

  // ----- 24-hour window guard (placeholder for future tightening) -----------
  if (false && !isWithin24h()) { // DISABLED: inbound is in-window by definition
    tasks.push(sendText(wa_id, t('common.outside_window', lang)));
    await Promise.allSettled(tasks);
    return;
  }

  // ----- Pull state ---------------------------------------------------------
  const state = await getState(wa_id);
  state.context.lang = lang; // refresh per-message; user might switch language

  const norm = (text || '').trim().toLowerCase();
  const isMenuTrigger = MENU_TRIGGERS.some((w) => norm === w || norm.startsWith(w + ' '));

  // ----- Routing decision ---------------------------------------------------
  // 1) Explicit menu word → reset.
  // 2) Idle and the inbound is a menu row id → enter that flow.
  // 3) Idle otherwise (or unknown flow) → show menu.
  // 4) In-flow → dispatch to the flow's handle() with input + msg.
  try {
    if (isMenuTrigger) {
      tasks.push(showMenu(wa_id, lang));
    } else if (state.flow === 'idle') {
      const starter = FLOW_STARTERS[norm];
      if (starter) {
        tasks.push(starter(wa_id, lang, name));
      } else {
        tasks.push(showMenu(wa_id, lang));
      }
    } else {
      const handler = FLOW_HANDLERS[state.flow];
      if (!handler) {
        log.warn('router.unknown_flow', { wa_id, flow: state.flow });
        tasks.push(showMenu(wa_id, lang));
      } else {
        // v2.2: pass the full msg so handlers can read msg.location etc.
        tasks.push(handler.handle(wa_id, text, state, msg));
      }
    }
  } catch (err) {
    log.error('router.dispatch.threw', { wa_id, error: err.message, stack: err.stack });
  }

  await Promise.allSettled(tasks);
}


/**
 * Status (delivery/read) callback handler — unchanged from v1.
 */
async function handleStatus(st) {
  await logStatus({
    timestamp: new Date().toISOString(),
    wa_id: st.recipient_id,
    status: st.status,
    messageId: st.id,
    errorCode: st.errors?.[0]?.code || '',
    conversationType: st.conversation?.origin?.type || '',
  });
}

/**
 * Top-level webhook event router.
 *
 * v2.3: cross-tenant guard at the change-level. Meta puts the recipient
 * phone_number_id on `change.value.metadata.phone_number_id`. If it isn't
 * UJG's PNID, every message in that change gets a cross-tenant redirect
 * (sent FROM the foreign PNID) and the normal UJG dispatch is skipped.
 * Status callbacks on a foreign PNID are dropped — they belong to messages
 * we didn't send.
 */
async function routeEvent(body) {
  if (!body || body.object !== 'whatsapp_business_account') {
    log.warn('router.unexpected_object', { object: body?.object });
    return;
  }

  const tasks = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const incomingPnid = value.metadata?.phone_number_id;

      // ---- v2.3 cross-tenant guard ---------------------------------------
      if (incomingPnid && incomingPnid !== UJG_PHONE_NUMBER_ID) {
        for (const msg of value.messages || []) {
          log.info('router.cross_tenant', {
            incoming_pnid: incomingPnid,
            wa_id: msg.from,
            type: msg.type,
            messageId: msg.id,
          });
          // Send the bilingual redirect from the actual recipient PNID.
          tasks.push(sendTextFromPNID(incomingPnid, msg.from, CROSS_TENANT_REDIRECT_TEXT));
        }
        // Drop status callbacks for foreign PNIDs entirely.
        continue;
      }

      // ---- Normal UJG processing -----------------------------------------
      const contacts = value.contacts || [];
      for (let i = 0; i < (value.messages || []).length; i++) {
        const msg = value.messages[i];
        const contact = contacts[i] || contacts[0];
        tasks.push(handleMessage(msg, contact));
      }
      for (const st of value.statuses || []) {
        tasks.push(handleStatus(st));
      }
    }
  }

  await Promise.allSettled(tasks);
}

module.exports = {
  routeEvent,
  handleMessage,
  handleStatus,
  extractText,
  isAfterHours,
  isWithin24h,
  // v2.3: exported for tests
  UJG_PHONE_NUMBER_ID,
  CROSS_TENANT_REDIRECT_TEXT,
  sendTextFromPNID,
};
