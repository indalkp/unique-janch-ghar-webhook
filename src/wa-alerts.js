/**
 * src/wa-alerts.js — Staff WhatsApp alert dispatch (v2.2).
 *
 * On each new booking, fan out an interactive message to every wa_id in
 * STAFF_WA env var. Each message has 3 reply buttons:
 *   [✓ Confirm] [❌ Cancel] [📍 Open Map]
 *
 * Button ids carry the booking id so router can route the click to
 * actions-coordinate.handleWaButton.
 *
 * 24-hour service window:
 *   Best-effort. If StaffAlerts tab exists with a real last_active_at, we
 *   skip sends outside the window. If the tab is missing or the wa_id isn't
 *   tracked, we attempt the send and log Meta's error if outside window.
 *   This keeps the StaffAlerts tab optional for v2.2 ship.
 */

'use strict';

const { sendInteractiveButtons, sendText } = require('./actions');
const { getStaffActiveStatus } = require('./sheets');
const { log } = require('./logger');

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function sendStaffAlerts(booking) {
  const staffList = (process.env.STAFF_WA || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!staffList.length) {
    log.info('wa.alerts.no_staff', { booking_id: booking.booking_id });
    return { ok: false, sent: 0, skipped: 0 };
  }
  const body = buildAlertBody(booking);
  const results = await Promise.allSettled(staffList.map(function (sw) { return sendOne(sw, booking, body); }));
  const sent = results.filter(function (r) { return r.status === 'fulfilled' && r.value && r.value.ok; }).length;
  const skipped = results.length - sent;
  log.info('wa.alerts.dispatched', { booking_id: booking.booking_id, sent: sent, skipped: skipped, total: staffList.length });
  return { ok: true, sent: sent, skipped: skipped };
}

async function sendOne(staffWa, booking, body) {
  let active = true;
  try {
    const status = await getStaffActiveStatus(staffWa);
    if (status && status.last_active_at) {
      const t = Date.parse(status.last_active_at);
      if (Number.isFinite(t)) active = (Date.now() - t) < WINDOW_MS;
    }
  } catch (e) {
    log.warn('wa.alerts.window_check_failed', { staff: staffWa, error: e.message });
  }
  if (!active) {
    log.info('wa.alerts.skip_outside_window', { staff: staffWa, booking_id: booking.booking_id });
    return { ok: false, reason: 'outside_24h_window' };
  }
  const buttons = [
    { id: 'act_confirm_' + booking.booking_id, title: '✓ Confirm' },
    { id: 'act_cancel_' + booking.booking_id, title: '❌ Cancel' },
    { id: 'act_map_' + booking.booking_id, title: '📍 Open Map' },
  ];
  const result = await sendInteractiveButtons(staffWa, body, buttons);
  return { ok: !!result.ok, response: result.response };
}

function buildAlertBody(b) {
  const lines = [
    '🩺 *New booking* ' + b.booking_id,
    '',
    'Customer: ' + (b.customer_name || 'Customer'),
    'Phone: +' + (b.wa_id || ''),
    'Tests: ' + (b.test_summary || ''),
    'Total: ₹' + (b.total_price || 0),
    'Date: ' + (b.date || ''),
    'Slot: ' + (b.slot || ''),
    'Pickup: ' + (b.pickup_address || '—'),
  ];
  if (b.maps_link) lines.push('', 'Map: ' + b.maps_link);
  return lines.join('\n').slice(0, 1024);
}

async function maybeRefreshStaffActive(wa_id) {
  const { upsertStaffActive } = require('./sheets');
  const staffList = (process.env.STAFF_WA || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!staffList.includes(wa_id)) return false;
  try {
    await upsertStaffActive(wa_id, new Date().toISOString());
    return true;
  } catch (e) {
    log.warn('wa.alerts.refresh_failed', { wa_id, error: e.message });
    return false;
  }
}

module.exports = {
  sendStaffAlerts: sendStaffAlerts,
  maybeRefreshStaffActive: maybeRefreshStaffActive,
  buildAlertBody: buildAlertBody,
};
