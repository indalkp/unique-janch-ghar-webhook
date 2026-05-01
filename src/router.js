/**
 * src/router.js â€” Inbound webhook event router (Gen 2 safe).
 *
 * Cloud Functions Gen 2 freezes the instance the moment res.send() flushes.
 * Therefore EVERY async call must be awaited (or pushed to Promise.allSettled)
 * before this function returns â€” orphaned promises die.
 */

'use strict';

const { keywordToAction } = require('./keywords');
const { sendResponse, sendMenu, markRead } = require('./actions');
const { logInbound, logStatus, upsertCustomer } = require('./sheets');
const { config } = require('./config');
const { log } = require('./logger');

function isAfterHours() {
  const start = config.AFTERHOURS_START;
  const end = config.AFTERHOURS_END;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.TZ || 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  });
  const hour = parseInt(fmt.format(new Date()), 10);
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

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

async function handleMessage(msg, contact) {
  const wa_id = msg.from;
  const name = contact?.profile?.name || '';
  const text = extractText(msg);
  const keyword = keywordToAction(text);
  const tasks = [];

  // Sheet log + customer upsert run in parallel with the reply.
  // Pushed onto tasks[] so Promise.allSettled at the end ensures completion
  // before the function returns (Gen 2 freeze fix).
  tasks.push(
    logInbound({
      timestamp: new Date().toISOString(),
      wa_id,
      name,
      type: msg.type,
      text,
      keyword: keyword || '',
      messageId: msg.id,
    })
  );
  tasks.push(upsertCustomer(wa_id, { name, lastMessage: text, lastKeyword: keyword || '' }));

  // After-hours short-circuit.
  if (isAfterHours()) {
    tasks.push(sendResponse(wa_id, 'afterhours', { patientName: name }));
    tasks.push(markRead(msg.id));
    await Promise.allSettled(tasks);
    return;
  }

  // Dispatch on keyword.
  switch (keyword) {
    case 'REPORT':
      tasks.push(sendResponse(wa_id, 'report', { patientName: name }));
      break;
    case 'BOOK':
      tasks.push(sendResponse(wa_id, 'book', { patientName: name }));
      break;
    case 'HOME':
      tasks.push(sendResponse(wa_id, 'home', { patientName: name }));
      break;
    case 'PRICE':
      tasks.push(sendResponse(wa_id, 'price', { patientName: name }));
      break;
    case 'MENU':
      tasks.push(sendResponse(wa_id, 'greeting', { patientName: name }));
      tasks.push(sendMenu(wa_id));
      break;
    default:
      tasks.push(sendResponse(wa_id, 'fallback', { patientName: name }));
      tasks.push(sendMenu(wa_id));
  }

  // Blue ticks.
  tasks.push(markRead(msg.id));

  // Wait for everything â€” Sheet writes, sends, mark-read.
  await Promise.allSettled(tasks);
}

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
};
