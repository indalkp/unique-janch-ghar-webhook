/**
 * src/sheets.js — Google Sheets append client.
 *
 * Auth: uses Application Default Credentials (ADC). On Cloud Functions Gen 2
 * this is the function's service account — no JSON key file needed.
 * The target Sheet must be shared with that service account email
 * (Editor permission). The README explains how.
 *
 * Sheet tabs the lab pipeline expects:
 *   Inbound    — every customer message we received
 *   Outbound   — every reply we sent (logged from actions.js call sites)
 *   Status     — delivery / read receipts from Meta
 *   Customers  — wa_id → name, last_seen, etc. (one row per unique number)
 *
 * If a tab does not exist, append throws — we surface the error and keep going
 * (we never block the user response on Sheet failures).
 */

'use strict';

// googleapis is lazy-required inside getClient() so unit tests that don't
// touch Sheets can run without installing the dep.
const { config } = require('./config');
const { log } = require('./logger');

let _sheetsClient = null;

/**
 * Lazy-init the Sheets API client. Reuses the same client across invocations.
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
async function getClient() {
  if (_sheetsClient) return _sheetsClient;

  // eslint-disable-next-line global-require
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

/**
 * Append a row to a tab. Caller decides column order.
 * @param {string} tab    — tab name, e.g. "Inbound"
 * @param {Array<string|number|boolean|null>} row
 */
async function appendRow(tab, row) {
  try {
    const sheets = await getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    log.info('sheet.append.ok', { tab, cols: row.length });
  } catch (err) {
    log.error('sheet.append.failed', {
      tab,
      error: err.message,
      code: err.code || null,
    });
    // Do NOT rethrow — Sheet failures must not break the customer reply.
  }
}

/**
 * @typedef {Object} InboundRow
 * @property {string} timestamp
 * @property {string} wa_id
 * @property {string} name
 * @property {string} type
 * @property {string} text
 * @property {string} keyword
 * @property {string} messageId
 */

/** @param {InboundRow} r */
async function logInbound(r) {
  return appendRow('Inbound', [
    r.timestamp, r.wa_id, r.name, r.type, r.text, r.keyword, r.messageId,
  ]);
}

/**
 * @typedef {Object} OutboundRow
 * @property {string} timestamp
 * @property {string} wa_id
 * @property {string} type
 * @property {string} preview
 * @property {string} messageId
 */

/** @param {OutboundRow} r */
async function logOutbound(r) {
  return appendRow('Outbound', [
    r.timestamp, r.wa_id, r.type, r.preview, r.messageId,
  ]);
}

/**
 * @typedef {Object} StatusRow
 * @property {string} timestamp
 * @property {string} wa_id
 * @property {string} status
 * @property {string} messageId
 * @property {string} errorCode
 */

/** @param {StatusRow} r */
async function logStatus(r) {
  return appendRow('Status', [
    r.timestamp, r.wa_id, r.status, r.messageId, r.errorCode || '',
  ]);
}

/**
 * Add a Customers row. We append every time and let a Sheet formula
 * de-duplicate by wa_id (UNIQUE() / QUERY()). Documented in README.
 *
 * @param {string} wa_id
 * @param {{name?:string, lastMessage?:string}} data
 */
async function upsertCustomer(wa_id, data) {
  data = data || {};
  return appendRow('Customers', [
    new Date().toISOString(),
    wa_id,
    data.name || '',
    data.lastMessage || '',
  ]);
}

module.exports = {
  appendRow,
  logInbound,
  logOutbound,
  logStatus,
  upsertCustomer,
};
