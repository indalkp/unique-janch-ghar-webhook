/**
 * src/actions.js — Outbound senders to Meta Cloud API.
 *
 * IMPORTANT — FREE-TIER RULE:
 *   This file ONLY sends free-form messages inside the 24-hour customer
 *   service window. It NEVER sends template messages (those are paid).
 *   Template-message logic was deliberately moved to /optional-paid/ —
 *   see ARCHIVE.md when the lab decides to go paid.
 *
 * v2 additions:
 *   sendInteractiveList(to, header, body, button, sections) — list message
 *   sendInteractiveButtons(to, body, buttons)               — reply buttons (max 3)
 *   sendText(to, body)                                       — plain text
 *
 * Each helper returns { ok, response } — on failure ok=false and response
 * carries the Meta error so the caller can decide whether to swallow or log.
 *
 * Endpoint shape:
 *   POST https://graph.facebook.com/{version}/{phone-number-id}/messages
 *   Authorization: Bearer {META_ACCESS_TOKEN}
 *   Body: { messaging_product: "whatsapp", to: "<E.164 no '+'>", type: ..., ... }
 */

'use strict';

const { config } = require('./config');
const { log } = require('./logger');

// Lazy-loaded response payloads — read once on first use, cached after.
const responsesCache = {};
function loadResponse(name) {
  if (!responsesCache[name]) {
    // eslint-disable-next-line global-require
    responsesCache[name] = require(`../responses/${name}.json`);
  }
  return responsesCache[name];
}

/**
 * Substitute {{var}} placeholders. Missing vars become "" so we never leak
 * raw template strings to a customer.
 */
function fill(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

/**
 * Low-level Meta Cloud API call. Returns { ok, response }.
 * Never throws — callers shouldn't have to wrap every send in try/catch.
 */
async function metaPost(payload) {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.META_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.error('meta.send.failed', {
        status: res.status,
        error: json.error || null,
        type: payload.type,
        to: payload.to,
      });
      return { ok: false, response: json };
    }
    log.info('meta.send.ok', {
      type: payload.type,
      to: payload.to,
      messageId: json.messages?.[0]?.id || null,
    });
    return { ok: true, response: json };
  } catch (err) {
    log.error('meta.send.threw', { error: err.message, type: payload.type });
    return { ok: false, response: { error: { message: err.message } } };
  }
}

/**
 * Build the "combined" Hindi+English text from a response file.
 */
function buildCombined(resp, vars) {
  const text = resp.combined || `${resp.hindi}\n\n— English —\n${resp.english}`;
  return fill(text, vars);
}

/**
 * Send a plain text message. Alias-friendly: also exported as `send`.
 * @param {string} to     — E.164 without '+', e.g. "919876543210"
 * @param {string} body
 */
async function sendText(to, body) {
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
}

/**
 * Send a response file as text (Hindi + English combined). Kept for v1 callers.
 */
async function sendResponse(to, responseName, vars = {}) {
  const resp = loadResponse(responseName);
  const body = buildCombined(resp, vars);
  return sendText(to, body);
}

/**
 * Send the v1 keyword-driven interactive list menu. Kept for backward-compat.
 */
async function sendMenu(to) {
  const menu = loadResponse('menu');
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: menu.interactive,
  });
}

/**
 * v2: Send a WhatsApp List Message.
 * @param {string} to
 * @param {string} headerText  — short header (max 60 chars)
 * @param {string} bodyText    — main body (max 1024 chars)
 * @param {string} buttonText  — text on the trigger button (max 20 chars)
 * @param {Array<{title:string, rows:Array<{id:string,title:string,description?:string}>}>} sections
 *        — up to 10 sections, max 10 rows total across all sections
 */
async function sendInteractiveList(to, headerText, bodyText, buttonText, sections) {
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: headerText ? { type: 'text', text: truncate(headerText, 60) } : undefined,
      body: { text: truncate(bodyText, 1024) },
      action: {
        button: truncate(buttonText, 20),
        sections,
      },
    },
  });
}

/**
 * v2: Send up to 3 quick-reply buttons.
 * @param {string} to
 * @param {string} bodyText
 * @param {Array<{id:string, title:string}>} buttons  — max 3, title <= 20 chars
 */
async function sendInteractiveButtons(to, bodyText, buttons) {
  // WhatsApp hard limit: 3 buttons, 20 chars per title.
  const safe = (buttons || []).slice(0, 3).map((b) => ({
    type: 'reply',
    reply: { id: b.id, title: truncate(b.title, 20) },
  }));
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: truncate(bodyText, 1024) },
      action: { buttons: safe },
    },
  });
}

/**
 * Mark an inbound message as read. Optional but customers see "blue ticks"
 * which is reassurance. Free.
 */
async function markRead(messageId) {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.META_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch((err) => {
    log.warn('meta.mark_read.failed', { error: err.message, messageId });
  });
}

// ----- helpers --------------------------------------------------------------

function truncate(s, n) {
  if (typeof s !== 'string') return s;
  return s.length > n ? s.slice(0, n) : s;
}

module.exports = {
  // v1 (kept):
  sendText,
  sendResponse,
  sendMenu,
  markRead,
  // v2:
  sendInteractiveList,
  sendInteractiveButtons,
  // alias the brief asked for:
  send: sendText,
  // exported for tests:
  fill,
  buildCombined,
  metaPost,
};
