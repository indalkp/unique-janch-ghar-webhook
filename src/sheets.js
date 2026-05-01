/**
 * src/sheets.js â€” Google Sheets append client.
 *
 * Auth: uses Application Default Credentials (ADC). On Cloud Functions Gen 2
 * this is the function's service account â€” no JSON key file needed.
 * The target Sheet must be shared with that service account email
 * (Editor permission). The README explains how.
 *
 * Sheet tabs the lab pipeline expects, with the EXACT column order the
 * live Sheet uses (verified 2026-05-01):
 *   Inbound   : timestamp_iso | wa_id | name | message_type | message_text |
 *               keyword_detected | action_taken | replied | responder
 *   Outbound  : timestamp_iso | wa_id | message_id | message_type | body | sent_by
 *   Status    : timestamp_iso | message_id | recipient_wa_id | status |
 *               error_code | conversation_type
 *   Customers : wa_id | display_name | first_seen | last_seen |
 *               total_messages | last_keyword | tags | notes
 *
 * If a tab does not exist, append throws â€” we surface the error and keep going
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
 * @param {string} tab    â€” tab name, e.g. "Inbound"
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
    // Do NOT rethrow â€” Sheet failures must not break the customer reply.
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

/**
 * Inbound row â€” column order matches live Sheet:
 *   timestamp_iso | wa_id | name | message_type | message_text |
 *   keyword_detected | action_taken | replied | responder
 *
 * @param {InboundRow} r
 */
async function logInbound(r) {
  // action_taken: what the webhook did with this inbound (which response file
  // we sent, or "fallback"). replied: "auto" because all replies are bot-driven
  // in free-tier mode. responder: "webhook" so staff can filter manual replies.
  const actionTaken = r.keyword ? `auto_reply:${r.keyword.toLowerCase()}` : 'auto_reply:fallback';
  return appendRow('Inbound', [
    r.timestamp,
    r.wa_id,
    r.name,
    r.type,
    r.text,
    r.keyword || '',
    actionTaken,
    'auto',
    'webhook',
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

/**
 * Outbound row â€” column order matches live Sheet:
 *   timestamp_iso | wa_id | message_id | message_type | body | sent_by
 *
 * @param {OutboundRow} r
 */
async function logOutbound(r) {
  return appendRow('Outbound', [
    r.timestamp,
    r.wa_id,
    r.messageId,
    r.type,
    r.preview,
    'webhook',
  ]);
}

/**
 * @typedef {Object} StatusRow
 * @property {string} timestamp
 * @property {string} wa_id
 * @property {string} status
 * @property {string} messageId
 * @property {string} errorCode
 * @property {string} [conversationType]
 */

/**
 * Status row â€” column order matches live Sheet:
 *   timestamp_iso | message_id | recipient_wa_id | status |
 *   error_code | conversation_type
 *
 * @param {StatusRow} r
 */
async function logStatus(r) {
  return appendRow('Status', [
    r.timestamp,
    r.messageId,
    r.wa_id,
    r.status,
    r.errorCode || '',
    r.conversationType || '',
  ]);
}

/**
 * Append a Customers row. The live Sheet uses a per-customer schema with
 * first_seen / last_seen / total_messages columns; lab staff handle de-dup
 * via a UNIQUE() / QUERY() formula on a separate tab if desired.
 *
 * Column order matches live Sheet:
 *   wa_id | display_name | first_seen | last_seen |
 *   total_messages | last_keyword | tags | notes
 *
 * @param {string} wa_id
 * @param {{name?:string, lastMessage?:string, lastKeyword?:string}} data
 */
async function upsertCustomer(wa_id, data) {
  data = data || {};
  const now = new Date().toISOString();
  return appendRow('Customers', [
    wa_id,
    data.name || '',
    now,                       // first_seen â€” UNIQUE formula collapses to earliest
    now,                       // last_seen
    1,                         // total_messages â€” SUM via QUERY for true total
    data.lastKeyword || '',
    '',                        // tags
    data.lastMessage || '',    // notes â€” useful free-form context
  ]);
}

module.exports = {
  appendRow,
  logInbound,
  logOutbound,
  logStatus,
  upsertCustomer,
};
