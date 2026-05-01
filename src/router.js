/**
 * src/router.js — Inbound webhook event router.
 *
 * Meta's webhook payload is an envelope:
 *   { object: "whatsapp_business_account",
 *     entry: [ { changes: [ { value: { messages?, statuses?, contacts? } } ] } ] }
 *
 * For each entry we look at value.messages (incoming) and value.statuses
 * (delivery receipts). One payload can contain multiple of either.
 *
 * Decision flow for an incoming message:
 *   1. Log to Sheet (Inbound tab) and update Customers tab.
 *   2. If after-hours, send the after-hours auto-reply and stop.
 *   3. Resolve the message text/button-id/list-id to a keyword.
 *   4. Dispatch:
 *        REPORT → sendResponse('report')
 *        BOOK   → sendResponse('book')
 *        HOME   → sendResponse('home')
 *        PRICE  → sendResponse('price')
 *        MENU   → sendMenu(to)
 *        null   → sendResponse('fallback') + sendMenu(to)
 *   4. Mark the inbound message as read (blue ticks).
 */

'use strict';

const { keywordToAction } = require('./keywords');
const { sendResponse, sendMenu, markRead } = require('./actions');
const { logInbound, logStatus, upsertCustomer } = require('./sheets');
const { config } = require('./config');
const { log } = require('./logger');

/**
 * Is the current time inside after-hours window?
 * Window crosses midnight, so we check (hour >= start || hour < end).
 * Uses the configured timezone (default Asia/Kolkata).
 * @returns {boolean}
 */
function isAfterHours() {
  const start = config.AFTERHOURS_START;
  const end = config.AFTERHOURS_END;
  // Get hour in the configured timezone using Intl (avoids extra deps).
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.TZ || 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  });
  const hour = parseInt(fmt.format(new Date()), 10);
  if (start > end) {
    // Wraps midnight, e.g. 21..8.
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/**
 * Pull the user-visible text out of any inbound message type.
 * @param {Object} msg  — single message object from value.messages
 * @returns {string}
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
 * Handle one inbound message.
 * @param {Object} msg       — value.messages[i]
 * @param {Object} contact   — value.contacts[i] (may be undefined)
 */
async function handleMessage(msg, contact) {
  const wa_id = msg.from;
  const name = contact?.profile?.name || '';
  const text = extractText(msg);
  const keyword = keywordToAction(text);

  // 1. Log + customer upsert (don't await — fire-and-forget so reply isn't blocked).
  logInbound({
    timestamp: new Date().toISOString(),
    wa_id,
    name,
    type: msg.type,
    text,
    keyword: keyword || '',
    messageId: msg.id,
  });
  upsertCustomer(wa_id, { name, lastMessage: text });

  // 2. After-hours short-circuit.
  if (isAfterHours()) {
    await sendResponse(wa_id, 'afterhours', { patientName: name });
    markRead(msg.id);
    return;
  }

  // 3. Dispatch on keyword.
  switch (keyword) {
    case 'REPORT':
      await sendResponse(wa_id, 'report', { patientName: name });
      break;
    case 'BOOK':
      await sendResponse(wa_id, 'book', { patientName: name });
      break;
    case 'HOME':
      await sendResponse(wa_id, 'home', { patientName: name });
      break;
    case 'PRICE':
      await sendResponse(wa_id, 'price', { patientName: name });
      break;
    case 'MENU':
      await sendResponse(wa_id, 'greeting', { patientName: name });
      await sendMenu(wa_id);
      break;
    default:
      // No keyword matched — say so, then offer the menu.
      await sendResponse(wa_id, 'fallback', { patientName: name });
      await sendMenu(wa_id);
  }

  // 4. Blue ticks.
  markRead(msg.id);
}

/**
 * Handle one delivery / read / failed status update.
 * @param {Object} st  — value.statuses[i]
 */
async function handleStatus(st) {
  logStatus({
    timestamp: new Date().toISOString(),
    wa_id: st.recipient_id,
    status: st.status,
    messageId: st.id,
    errorCode: st.errors?.[0]?.code || '',
  });
}

/**
 * Top-level router — called from index.js after signature verification.
 * Iterates through Meta's nested envelope and dispatches to handlers.
 *
 * @param {Object} body  — parsed JSON request body
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

      // Pair messages with their contact (same index) where possible.
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

  // Wait for all handlers — but each one already swallows its own errors,
  // so this Promise.all won't reject in normal operation.
  await Promise.allSettled(tasks);
}

module.exports = {
  routeEvent,
  handleMessage,
  handleStatus,
  // Exported for tests:
  extractText,
  isAfterHours,
};
