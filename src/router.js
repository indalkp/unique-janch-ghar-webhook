/**
 * src/router.js — Inbound webhook event router (v3.0).
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
 * can inspect msg.type === 'location'/'image' etc. without going through
 * extractText. extractText still returns "[location]"/"[image]" for logging.
 *
 * v2.3: multi-tenant routing guard. The Indalkp WABA hosts multiple phone
 * numbers (UJG, indalkp.com, ...). This bot ONLY serves UJG's phone_number_id.
 *
 * v3.0 — Lab-aware booking + UPI payment routing notes:
 *   The v3.0 conversational button IDs all flow through normal flow dispatch
 *   (state-driven). Router does NOT short-circuit them; the book.js step
 *   machine owns the logic. The IDs:
 *     - lab_thyrocare           — pick_lab step → lab=THYROCARE
 *     - lab_lal                 — pick_lab step → lab=LALPATHLABS
 *     - paid_upi                — awaiting_payment_choice → UPI_CLAIMED
 *     - pay_at_collection       — awaiting_payment_choice → CASH_AT_COLLECTION
 *     - inbound msg.type==='image' during awaiting_payment_choice → screenshot
 *       saved as payment_ref + treated as UPI_CLAIMED
 *
 *   Router DOES add a defensive log line for any of these IDs so we can spot
 *   state-drift (button clicked while flow is somewhere else). The handling
 *   itself stays inside book.js so cart context isn't fragmented.
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
const UJG_PHONE_NUMBER_ID = '1155334040987245';

const CROSS_TENANT_REDIRECT_TEXT =
  'This is a separate business line. For lab tests and bookings, please message *+91 97985 86981* — Unique Janch Ghar.\n\n' +
  'यह एक अलग बिज़नेस लाइन है। लैब टेस्ट और बुकिंग के लिए कृपया *+91 97985 86981* पर मैसेज करें — Unique Janch Ghar।';

const MENU_TRIGGERS = ['menu', 'मेनू', 'start', 'शुरू', 'hi', 'hello', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार', 'help', 'मदद'];

// v3.0 — IDs we recognise as in-flow conversational buttons. Listed here only
// for diagnostic logging in the router; actual handling stays in book.js.
const V3_BOOK_BUTTON_PREFIXES = ['lab_thyrocare', 'lab_lal', 'paid_upi', 'pay_at_collection', 'pay_now_upi'];

const FLOW_STARTERS = {
  book:    (wa_id, lang, name) => bookFlow.start(wa_id, lang, { name }),
  status:  (wa_id, lang)       => statusFlow.start(wa_id, lang),
  catalog: (wa_id, lang)       => catalogFlow.start(wa_id, lang),
  info:    (wa_id, lang)       => infoFlow.start(wa_id, lang),
  handoff: (wa_id, lang, name) => handoffFlow.start(wa_id, lang, { name }),
};

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

function isWithin24h() {
  return true;
}

/** v3.0 helper — true if input matches a known book-flow conversational button. */
function isV3BookButton(text) {
  if (!text) return false;
  const norm = String(text).trim().toLowerCase();
  return V3_BOOK_BUTTON_PREFIXES.some((p) => norm === p || norm.startsWith(p + '_'));
}

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

  tasks.push(maybeRefreshStaffActive(wa_id));

  // v2.2: cross-channel action buttons (booking-id-bound, e.g. act_confirm_UJG-...).
  if (text && /^act_(confirm|cancel|collected|map)_/.test(text)) {
    tasks.push(handleWaButton(wa_id, text));
    await Promise.allSettled(tasks);
    return;
  }

  if (text && text.trim().toLowerCase() === 'subscribe') {
    tasks.push((async () => {
      await upsertStaffActive(wa_id, new Date().toISOString(), name || '');
      await sendText(wa_id, '✅ Subscribed to UJG staff alerts. You will receive a WhatsApp message for each new booking. Reply "stop" to unsubscribe.');
    })());
    await Promise.allSettled(tasks);
    return;
  }

  if (false && isAfterHours()) {
    tasks.push(sendText(wa_id, t('common.outside_window', lang)));
    await Promise.allSettled(tasks);
    return;
  }

  if (false && !isWithin24h()) {
    tasks.push(sendText(wa_id, t('common.outside_window', lang)));
    await Promise.allSettled(tasks);
    return;
  }

  // ----- Pull state ---------------------------------------------------------
  const state = await getState(wa_id);
  state.context.lang = lang;

  const norm = (text || '').trim().toLowerCase();
  const isMenuTrigger = MENU_TRIGGERS.some((w) => norm === w || norm.startsWith(w + ' '));

  // v3.0 — diagnostic log for in-flow buttons. Helps us spot state drift in
  // production without changing behaviour.
  if (isV3BookButton(text) || (msg.type === 'image' && state.flow === 'book' && /payment/.test(state.step || ''))) {
    log.info('router.v3.book_button_observed', {
      wa_id, button: text, state_flow: state.flow, state_step: state.step, msg_type: msg.type,
    });
  }

  // ----- Routing decision ---------------------------------------------------
  try {
    if (isMenuTrigger) {
      tasks.push(showMenu(wa_id, lang));
    } else if (state.flow === 'idle') {
      const starter = FLOW_STARTERS[norm];
      if (starter) {
        tasks.push(starter(wa_id, lang, name));
      } else if (isV3BookButton(text)) {
        // v3.0 — payment button arrived without active flow (state lost).
        // Send a short note so the customer knows what happened. Recovery
        // requires staff to look up the booking manually for now.
        log.warn('router.v3.payment_button_no_state', { wa_id, button: text });
        tasks.push(sendText(wa_id, t('common.unknown', lang)));
      } else {
        tasks.push(showMenu(wa_id, lang));
      }
    } else {
      const handler = FLOW_HANDLERS[state.flow];
      if (!handler) {
        log.warn('router.unknown_flow', { wa_id, flow: state.flow });
        tasks.push(showMenu(wa_id, lang));
      } else {
        tasks.push(handler.handle(wa_id, text, state, msg));
      }
    }
  } catch (err) {
    log.error('router.dispatch.threw', { wa_id, error: err.message, stack: err.stack });
  }

  await Promise.allSettled(tasks);
}


/**
 * Status (delivery/read) callback handler — unchanged.
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

      if (incomingPnid && incomingPnid !== UJG_PHONE_NUMBER_ID) {
        for (const msg of value.messages || []) {
          log.info('router.cross_tenant', {
            incoming_pnid: incomingPnid,
            wa_id: msg.from,
            type: msg.type,
            messageId: msg.id,
          });
          tasks.push(sendTextFromPNID(incomingPnid, msg.from, CROSS_TENANT_REDIRECT_TEXT));
        }
        continue;
      }

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
  UJG_PHONE_NUMBER_ID,
  CROSS_TENANT_REDIRECT_TEXT,
  sendTextFromPNID,
  // v3.0 exports for tests
  isV3BookButton,
  V3_BOOK_BUTTON_PREFIXES,
};
