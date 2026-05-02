/**
 * src/router.js — Inbound webhook event router (v2).
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
 *      logOutbound is currently best-effort and is NOT called from the router
 *      — flows send via actions.metaPost which already logs to Cloud Logging.
 *      (Switch to per-message logOutbound by wrapping send helpers if you want
 *      Sheet rows for every outbound; left unwired to keep API call counts low.)
 *
 * Cloud Functions Gen 2 freezes the instance the moment res.send() flushes,
 * so EVERY async call must be awaited (or pushed into Promise.allSettled)
 * before this function returns — orphaned promises die.
 */

'use strict';

const { logInbound, logStatus, upsertCustomer } = require('./sheets');
const { getState, setState, isRateLimited, recordRateLimit } = require('./state');
const { detectLang, t } = require('./lang');
const { sendText, markRead } = require('./actions');
const { config } = require('./config');
const { log } = require('./logger');

const { showMenu } = require('./flows/menu');
const bookFlow    = require('./flows/book');
const statusFlow  = require('./flows/status');
const catalogFlow = require('./flows/catalog');
const infoFlow    = require('./flows/info');
const handoffFlow = require('./flows/handoff');

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
 *
 * Kept as a placeholder for future tightening — see brief: "Outside window →
 * reply only with a static 'Send any message to wake up' plus log to ConvoState."
 */
function isWithin24h() {
  // Trivially true: receiving an inbound IS the customer talking, which
  // re-opens the window. We keep the function so the routing path is explicit.
  return true;
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
    // Do not even reply — we only want to *not* pile more sends on a spammy
    // sender. Still log inbound for audit.
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

  // ----- After-hours short-circuit ------------------------------------------
  if (false && isAfterHours()) { // DISABLED: bot serves 24/7; staff fulfills during business hours
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
  // 2) Idle and the inbound is a menu row id (book/status/catalog/info/handoff)
  //    → enter that flow.
  // 3) Idle otherwise (or unknown flow) → show menu.
  // 4) In-flow → dispatch to the flow's handle() with the input.
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
        // Unknown flow — recover by resetting to menu.
        log.warn('router.unknown_flow', { wa_id, flow: state.flow });
        tasks.push(showMenu(wa_id, lang));
      } else {
        tasks.push(handler.handle(wa_id, text, state));
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
};
