/**
 * src/actions.js — Outbound senders to Meta Cloud API.
 *
 * IMPORTANT — FREE-TIER RULE:
 *   This file ONLY sends free-form messages inside the 24-hour customer
 *   service window. It NEVER sends template messages (those are paid).
 *   Template-message logic was deliberately moved to /optional-paid/ —
 *   see ARCHIVE.md when the lab decides to go paid.
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
 * @param {string} template
 * @param {Record<string,string>} vars
 * @returns {string}
 */
function fill(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

/**
 * Low-level Meta Cloud API call. Uses native fetch (Node 18+).
 * @param {Object} payload  — full message body
 * @returns {Promise<Object>}  — Meta's JSON response
 */
async function metaPost(payload) {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.META_PHONE_NUMBER_ID}/messages`;

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
    throw new Error(`Meta API ${res.status}: ${json.error?.message || 'unknown'}`);
  }

  log.info('meta.send.ok', {
    type: payload.type,
    to: payload.to,
    messageId: json.messages?.[0]?.id || null,
  });
  return json;
}

/**
 * Build the "combined" Hindi+English text from a response file.
 * @param {{hindi:string,english:string,combined?:string}} resp
 * @param {Record<string,string>} vars
 * @returns {string}
 */
function buildCombined(resp, vars) {
  const text = resp.combined || `${resp.hindi}\n\n— English —\n${resp.english}`;
  return fill(text, vars);
}

/**
 * Send a plain text message.
 * @param {string} to     — E.164 without '+', e.g. "919876543210"
 * @param {string} text
 * @returns {Promise<Object>}
 */
async function sendText(to, text) {
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

/**
 * Send a response file as text (Hindi + English combined).
 * @param {string} to
 * @param {string} responseName  — file in responses/ without extension
 * @param {Record<string,string>} [vars]
 */
async function sendResponse(to, responseName, vars = {}) {
  const resp = loadResponse(responseName);
  const body = buildCombined(resp, vars);
  return sendText(to, body);
}

/**
 * Send the interactive list menu — 5 keyword options.
 * @param {string} to
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
 * Generic interactive list sender — kept for future use.
 * @param {string} to
 * @param {Object} interactivePayload  — already-built `interactive` body
 */
async function sendInteractiveList(to, interactivePayload) {
  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: interactivePayload,
  });
}

/**
 * Mark an inbound message as read. Optional but customers see "blue ticks"
 * which is reassurance. Free.
 * @param {string} messageId  — id from inbound message object
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
    // Non-fatal — log and move on.
    log.warn('meta.mark_read.failed', { error: err.message, messageId });
  });
}

module.exports = {
  sendText,
  sendResponse,
  sendMenu,
  sendInteractiveList,
  markRead,
  // Exported for testing only:
  fill,
  buildCombined,
};
