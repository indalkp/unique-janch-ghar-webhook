/**
 * src/sheets.js — Google Sheets append client (v3.0).
 *
 * Auth: uses Application Default Credentials (ADC). On Cloud Functions Gen 2
 * this is the function's service account — no JSON key file needed.
 *
 * Bookings tab schema (v3.0 — APPEND-ONLY, no shift from v2.2):
 *   A=booking_id      B=timestamp     C=wa_id         D=customer_name
 *   E=tests           F=date          G=slot          H=status
 *   I=notes           J=total
 *   K=payment_method  ← v2.2 reserved this slot (empty); v3.0 starts USING it.
 *   L=payment_ref     ← v2.2 reserved this slot (empty); v3.0 starts USING it.
 *   M=pickup_address  ← v2.2
 *   N=maps_link       ← v2.2
 *   O=actioned_by     ← v2.2
 *   P=actioned_at     ← v2.2
 *   Q=chosen_lab      ← v3.0 NEW — THYROCARE / LALPATHLABS / MIXED
 *
 * Why chosen_lab at Q (rightmost) instead of K? K and L were already designed
 * as payment_method/payment_ref slots in v2.2 (findBookingById reads them
 * there). Putting chosen_lab at K would have required shifting M..P right by
 * one — a breaking migration. Q is the next free column → zero migration.
 *
 * Other tabs (Inbound, Outbound, Status, Customers, StaffAlerts, Catalog) are
 * UNCHANGED from v2.2.
 */

'use strict';

const { config } = require('./config');
const { log } = require('./logger');

let _sheetsClient = null;

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
  }
}

/**
 * v3.0 — append a Bookings row with all 17 columns.
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
 * @param {string} [b.payment_method]  — UPI_PENDING / UPI_CLAIMED / UPI_VERIFIED / CASH_AT_COLLECTION
 * @param {string} [b.payment_ref]     — UPI tx id or WhatsApp media_id of the screenshot
 * @param {string} [b.pickup_address]
 * @param {string} [b.maps_link]
 * @param {string} [b.chosen_lab]      — THYROCARE / LALPATHLABS / MIXED / ""
 */
async function appendBooking(b) {
  const row = [
    b.booking_id,                  // A
    b.timestamp,                   // B
    b.wa_id,                       // C
    b.customer_name || '',         // D
    b.tests || '',                 // E
    b.date || '',                  // F
    b.slot || '',                  // G
    b.status || 'PENDING',         // H
    b.notes || '',                 // I
    Number(b.total) || 0,          // J
    b.payment_method || '',        // K — v2.2 slot, v3.0 first use
    b.payment_ref || '',           // L — v2.2 slot, v3.0 first use
    b.pickup_address || '',        // M
    b.maps_link || '',             // N
    '',                            // O — actioned_by (filled later by updateBookingAction)
    '',                            // P — actioned_at (filled later by updateBookingAction)
    b.chosen_lab || '',            // Q — v3.0 NEW
  ];
  return appendRow('Bookings', row);
}

/**
 * v3.0 — Update payment_method (col K) + payment_ref (col L) for a booking.
 * Used by the [I've Paid] / [Pay at Collection] buttons + screenshot inbound.
 *
 * @param {string} booking_id
 * @param {string} payment_method  — UPI_CLAIMED / UPI_VERIFIED / CASH_AT_COLLECTION
 * @param {string} [payment_ref]   — UPI tx id or WhatsApp media_id
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function updateBookingPayment(booking_id, payment_method, payment_ref) {
  const booking = await findBookingById(booking_id);
  if (!booking) return { ok: false, error: 'booking not found' };
  const rowNum = booking.row_index;
  const r = await bridgePost('write', { sheet: 'Bookings' }, {
    range: 'K' + rowNum + ':L' + rowNum,
    values: [[payment_method || '', payment_ref || '']],
  });
  if (r && r.error) return { ok: false, error: r.error };
  log.info('sheet.update_payment.ok', { booking_id, payment_method, has_ref: Boolean(payment_ref) });
  return { ok: true };
}

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
// Bridge-backed helpers for find/update + StaffAlerts (v2.2 + v3.0).
// Column offsets unchanged from v2.2 except chosen_lab (idx 16, col Q) is NEW.
// =============================================================================

const { bridgeGet, bridgePost } = require('./sheets-bridge');

const BOOKINGS_RANGE = 'A2:Q1000'; // v3.0 — extended to col Q (chosen_lab)

/**
 * Find a booking row by booking_id. Returns null if not found.
 *
 * v3.0 column offsets (idx 0-based):
 *   0=A booking_id, 1=B timestamp, 2=C wa_id, 3=D customer_name,
 *   4=E tests, 5=F date, 6=G slot, 7=H status, 8=I notes, 9=J total,
 *   10=K payment_method, 11=L payment_ref,
 *   12=M pickup_address, 13=N maps_link,
 *   14=O actioned_by, 15=P actioned_at,
 *   16=Q chosen_lab                ← v3.0 NEW
 */
async function findBookingById(bookingId) {
  const r = await bridgeGet('read', { sheet: 'Bookings', range: BOOKINGS_RANGE });
  if (!r || !r.data) return null;
  for (let i = 0; i < r.data.length; i++) {
    const row = r.data[i];
    if (String(row[0]) === String(bookingId)) {
      return {
        row_index: i + 2,
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
        chosen_lab: row[16] || '',         // v3.0
      };
    }
  }
  return null;
}

/**
 * Update a booking's status + actioned_by + actioned_at. Status at H,
 * actioned_by at O, actioned_at at P. UNCHANGED from v2.2.
 */
async function updateBookingAction(bookingId, statusLabel, actor, atIso) {
  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, error: 'booking not found' };
  const rowNum = booking.row_index;
  const r1 = await bridgePost('write', { sheet: 'Bookings' }, {
    range: 'H' + rowNum,
    values: [[statusLabel]],
  });
  if (r1 && r1.error) return { ok: false, error: r1.error };
  const r2 = await bridgePost('write', { sheet: 'Bookings' }, {
    range: 'O' + rowNum + ':P' + rowNum,
    values: [[actor, atIso]],
  });
  if (r2 && r2.error) return { ok: false, error: r2.error };
  return { ok: true };
}

async function isStaffActive(wa_id, windowMs) {
  const status = await getStaffActiveStatus(wa_id);
  if (!status) return false;
  if (!status.last_active_at) return false;
  const t = Date.parse(status.last_active_at);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < windowMs;
}

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
  updateBookingPayment, // v3.0 export
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
