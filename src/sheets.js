/**
 * src/sheets.js — Google Sheets append client (v2.2).
 *
 * Auth: uses Application Default Credentials (ADC). On Cloud Functions Gen 2
 * this is the function's service account — no JSON key file needed.
 * The target Sheet must be shared with that service account email
 * (Editor permission).
 *
 * Sheet tabs the lab pipeline expects, with the column order the live Sheet
 * uses (verified 2026-05-02):
 *   Inbound   : timestamp_iso | wa_id | name | message_type | message_text |
 *               keyword_detected | action_taken | replied | responder
 *   Outbound  : timestamp_iso | wa_id | message_id | message_type | body | sent_by
 *   Status    : timestamp_iso | message_id | recipient_wa_id | status |
 *               error_code | conversation_type
 *   Customers : wa_id | display_name | first_seen | last_seen |
 *               total_messages | last_keyword | tags | notes
 *   Bookings  : booking_id (A) | timestamp (B) | wa_id (C) | customer_name (D) |
 *               tests (E) | date (F) | slot (G) | status (H) | notes (I) |
 *               total (J) | reserved (K) | reserved (L) |
 *               pickup_address (M) | maps_link (N)         ← v2.2 added
 *
 * If a tab does not exist, append throws — we log the error and keep going
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
 * v2.2 — append a Bookings row with all 14 columns including pickup_address (M)
 * and maps_link (N). Cols K and L are reserved (filled with '') so the M/N
 * positions are stable regardless of future schema additions.
 *
 * @param {Object} b
 * @param {string} b.booking_id
 * @param {string} b.timestamp
 * @param {string} b.wa_id
 * @param {string} b.customer_name
 * @param {string} b.tests
 * @param {string} b.date
 * @param {string} b.slot
 * @param {string} b.status
 * @param {string} b.notes
 * @param {number} b.total
 * @param {string} [b.pickup_address]
 * @param {string} [b.maps_link]
 */
async function appendBooking(b) {
  const row = [
    b.booking_id,             // A
    b.timestamp,              // B
    b.wa_id,                  // C
    b.customer_name || '',    // D
    b.tests || '',            // E
    b.date || '',             // F
    b.slot || '',             // G
    b.status || 'PENDING',    // H
    b.notes || '',            // I
    Number(b.total) || 0,     // J
    '',                       // K — reserved for payment_mode
    '',                       // L — reserved for payment_status
    b.pickup_address || '',   // M
    b.maps_link || '',        // N
  ];
  return appendRow('Bookings', row);
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
 * Inbound row — column order matches live Sheet:
 *   timestamp_iso | wa_id | name | message_type | message_text |
 *   keyword_detected | action_taken | replied | responder
 *
 * @param {InboundRow} r
 */
async function logInbound(r) {
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
 * Outbound row — column order matches live Sheet:
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
 * Status row — column order matches live Sheet:
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
 * Append a Customers row.
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
    now,
    now,
    1,
    data.lastKeyword || '',
    '',
    data.lastMessage || '',
  ]);
}

// =============================================================================
// v2.2 — Bridge-backed helpers for find/update + StaffAlerts management
// =============================================================================

const { bridgeGet, bridgePost } = require('./sheets-bridge');

const BOOKINGS_RANGE = 'A2:P1000'; // up to 999 rows; tune if needed

/**
 * Find a booking row by booking_id. Reads via bridge so we don't need a full
 * googleapis read implementation. Returns null if not found or bridge unavailable.
 */
async function findBookingById(bookingId) {
  const r = await bridgeGet('read', { sheet: 'Bookings', range: BOOKINGS_RANGE });
  if (!r || !r.data) return null;
  for (let i = 0; i < r.data.length; i++) {
    const row = r.data[i];
    if (String(row[0]) === String(bookingId)) {
      return {
        row_index: i + 2, // +2 because data starts at row 2 (header at row 1)
        booking_id: row[0] || '',
        timestamp: row[1] || '',
        wa_id: row[2] || '',
        customer_name: row[3] || '',
        tests: row[4] || '',
        date: row[5] || '',
        slot: row[6] || '',
        status: row[7] || '',
        notes: row[8] || '',
        total_price: row[9] || 0,
        payment_method: row[10] || '',
        payment_ref: row[11] || '',
        pickup_address: row[12] || '',
        maps_link: row[13] || '',
        actioned_by: row[14] || '',
        actioned_at: row[15] || '',
      };
    }
  }
  return null;
}

/**
 * Update a booking's status + actioned_by + actioned_at. Writes 3 cells in
 * the matched row. Returns {ok, error?}.
 */
async function updateBookingAction(bookingId, statusLabel, actor, atIso) {
  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, error: 'booking not found' };
  const rowNum = booking.row_index;
  // Status is column H (8), actioned_by O (15), actioned_at P (16).
  // Bridge `write` takes a contiguous range. Status is far from O/P, so two writes.
  const r1 = await bridgePost('write', { sheet: 'Bookings' }, {
    range: 'H' + rowNum,
    values: [[statusLabel]],
  });
  if (r1?.error) return { ok: false, error: r1.error };
  const r2 = await bridgePost('write', { sheet: 'Bookings' }, {
    range: 'O' + rowNum + ':P' + rowNum,
    values: [[actor, atIso]],
  });
  if (r2?.error) return { ok: false, error: r2.error };
  return { ok: true };
}

/**
 * Returns true if the staff wa_id has a last_active_at within `windowMs`.
 */
async function isStaffActive(wa_id, windowMs) {
  const status = await getStaffActiveStatus(wa_id);
  if (!status) return false;
  if (!status.last_active_at) return false;
  const t = Date.parse(status.last_active_at);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < windowMs;
}

/**
 * Read StaffAlerts row for a wa_id. Returns null if tab missing or wa_id absent.
 */
async function getStaffActiveStatus(wa_id) {
  const r = await bridgeGet('read', { sheet: 'StaffAlerts', range: 'A2:D100' });
  if (!r || !r.data) return null;
  for (let i = 0; i < r.data.length; i++) {
    const row = r.data[i];
    if (String(row[0]) === String(wa_id)) {
      return {
        row_index: i + 2,
        wa_id: row[0] || '',
        name: row[1] || '',
        alerts_subscribed: String(row[3] || '').toLowerCase(),
      };
    }
  }
  return null;
}

/**
 * Upsert a StaffAlerts row's last_active_at. If row missing, append it.
 */
async function upsertStaffActive(wa_id, atIso, displayName) {
  const existing = await getStaffActiveStatus(wa_id);
  if (existing) {
    await bridgePost('write', { sheet: 'StaffAlerts' }, {
      range: 'C' + existing.row_index,
      values: [[atIso]],
    });
    return { ok: true, action: 'updated', row: existing.row_index };
  }
  await bridgePost('append', { sheet: 'StaffAlerts' }, {
    values: [[wa_id, displayName || '', atIso, 'yes']],
  });
  return { ok: true, action: 'appended' };
}

module.exports = {
  appendRow,
  appendBooking,
  logInbound,
  logOutbound,
  logStatus,
  upsertCustomer,
  findBookingById,
  updateBookingAction,
  isStaffActive,
  getStaffActiveStatus,
  upsertStaffActive,
};
