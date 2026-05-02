/**
 * src/email.js — Booking notification email via Resend (v2.2).
 *
 * Why Resend, not Apps Script bridge?
 *   - Apps Script web-app deployments require an OAuth grant click that
 *     Google's anti-automation specifically blocks via synthetic clicks.
 *     Resend gives us a plain HTTP API with a Bearer token — no OAuth dance.
 *
 * Custom-domain requirement:
 *   Without a verified domain, Resend ONLY accepts:
 *     sender    : onboarding@resend.dev (Resend's default)
 *     recipient : the verified team email (signup email)
 *   With lab.indalkp.com verified:
 *     sender    : <anything>@lab.indalkp.com (set via FROM_EMAIL env)
 *     recipient : any email (multiple OK via STAFF_EMAILS env)
 *
 * Env vars:
 *   RESEND_API_KEY  — required, starts with re_ ; do NOT log this value.
 *   STAFF_EMAILS    — comma-separated list of staff recipients.
 *                     Defaults to OWNER_EMAIL or indalkp@gmail.com.
 *   OWNER_EMAIL     — single fallback recipient if STAFF_EMAILS unset.
 *   FROM_EMAIL      — sender. Default 'Unique Janch Ghar <onboarding@resend.dev>'.
 *                     After domain verify: 'Unique Janch Ghar <bookings@lab.indalkp.com>'.
 *   FN_BASE_URL     — base URL of this Cloud Function for action links.
 *
 * Brand: maroon #3E1D1D / navy #1D1F36 / cream #F4EFE5
 */

'use strict';

const { log } = require('./logger');
const { buildSignedUrl } = require('./actions-coordinate');

const RESEND_URL = 'https://api.resend.com/emails';
const SHEET_ID = '1kF33DjK54XQdfVU0h-ozpUhnsdAGxls1V_voMWFv_KU';

function getRecipients() {
  const list = process.env.STAFF_EMAILS || process.env.OWNER_EMAIL || 'indalkp@gmail.com';
  return list.split(',').map(s => s.trim()).filter(Boolean);
}
function getFnBase() { return process.env.FN_BASE_URL || ''; }
function getFromAddress() { return process.env.FROM_EMAIL || 'Unique Janch Ghar <onboarding@resend.dev>'; }

async function sendBookingEmail(b) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { log.info('email.skipped', { booking_id: b.booking_id, reason: 'no_api_key' }); return { ok: false, error: 'no_api_key' }; }
  const recipients = getRecipients();
  const subject = '🩺 New Booking — ' + b.booking_id + ' — ' + (b.customer_name || 'Customer') + ' (' + (b.test_summary || 'Test') + ')';
  const html = buildBookingHtml(b);
  return await postResend(apiKey, recipients, subject, html, b.booking_id, 'booking');
}

async function sendStatusUpdateEmail(opts) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'no_api_key' };
  const recipients = getRecipients();
  const subject = 'ℹ️ Booking ' + opts.booking_id + ' is ' + opts.action_label;
  const html = '<!doctype html><html><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F4EFE5;padding:24px;">' +
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:10px;padding:24px;">' +
    '<h2 style="margin:0 0 12px;color:#3E1D1D;">Booking status changed</h2>' +
    '<p style="margin:6px 0;color:#1D1F36;">Booking <b>' + esc(opts.booking_id) + '</b> for ' + esc(opts.customer_name) + ' is now <b>' + esc(opts.action_label) + '</b>.</p>' +
    '<p style="margin:6px 0;color:#1D1F36;">Actioned by: <i>' + esc(opts.actor) + '</i> at ' + esc(opts.at) + '.</p>' +
    '<p style="margin:18px 0 0;font-size:12px;color:#888;">No action needed — FYI broadcast.</p>' +
    '</div></body></html>';
  return await postResend(apiKey, recipients, subject, html, opts.booking_id, 'broadcast');
}

async function postResend(apiKey, recipients, subject, html, booking_id, kind) {
  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: getFromAddress(), to: recipients, subject: subject, html: html }),
    });
    const result = await resp.json().catch(() => ({}));
    if (resp.ok) { log.info('email.' + kind + '.sent', { booking_id, message_id: result.id || null, count: recipients.length }); return { ok: true, id: result.id || null }; }
    log.error('email.' + kind + '.failed', { booking_id, status: resp.status, error: (result && (result.message || result.name)) || null });
    return { ok: false, error: result };
  } catch (err) { log.error('email.' + kind + '.threw', { booking_id, error: err.message }); return { ok: false, error: err.message }; }
}

function buildBookingHtml(b) {
  const phone = String(b.wa_id || '').replace(/[^0-9]/g, '');
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
  const mapsBlock = (b.maps_link && b.pickup_address && b.pickup_address !== 'self-visit')
    ? '<p style="margin:24px 0;text-align:center;"><a href="' + esca(b.maps_link) + '" style="display:inline-block;background:#3E1D1D;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;">📍 Open Pickup Location</a></p>'
    : '';
  const fnBase = getFnBase();
  const ctaButtons = fnBase ? buildActionButtonsHtml(fnBase, b.booking_id) : '';
  return [
    '<!doctype html><html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F4EFE5;padding:20px;">',
    '<table style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);" cellpadding="0" cellspacing="0">',
    '<tr><td style="background:#3E1D1D;color:white;padding:24px 32px;"><h1 style="margin:0;font-size:20px;">🩺 New Booking Received</h1>',
    '<p style="margin:8px 0 0;font-size:13px;opacity:0.85;">Unique Janch Ghar (formerly Hi-tech Patho Lab Rajgir)</p></td></tr>',
    '<tr><td style="padding:24px 32px;">',
    '<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1D1F36;" cellpadding="0" cellspacing="0">',
    row('Customer', esc(b.customer_name || 'Customer'), true),
    row('Phone', '+' + esc(phone)),
    row('Tests', esc(b.test_summary || ''), true),
    row('Total', '₹' + esc(String(b.total_price || 0))),
    row('Date', esc(b.date || '')),
    row('Slot', esc(b.slot || '')),
    row('Pickup', esc(b.pickup_address || '—')),
    row('Payment', esc(b.payment_method || 'PENDING')),
    '</table>',
    mapsBlock, ctaButtons,
    '<table style="width:100%;border-top:1px solid #eee;margin-top:24px;padding-top:16px;" cellpadding="0" cellspacing="0">',
    '<tr><td style="padding:6px 0;font-size:13px;color:#888;">Quick contact:</td></tr>',
    '<tr><td style="padding:6px 0;">',
    '<a href="tel:+' + esca(phone) + '" style="display:inline-block;background:#1D1F36;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-size:13px;margin-right:8px;">📞 Call</a> ',
    '<a href="https://wa.me/' + esca(phone) + '" style="display:inline-block;background:#25D366;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-size:13px;">💬 WhatsApp</a>',
    '</td></tr></table>',
    '<p style="margin:24px 0 0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;">Booking ID: ' + esc(b.booking_id) + '<br/>',
    '<a href="' + esca(sheetUrl) + '" style="color:#3E1D1D;">View / edit in Sheet →</a></p>',
    '</td></tr></table></body></html>',
  ].join('');
}

function buildActionButtonsHtml(fnBase, bookingId) {
  const cConfirm = esca(buildSignedUrl(fnBase, bookingId, 'confirm', 'email'));
  const cCancel = esca(buildSignedUrl(fnBase, bookingId, 'cancel', 'email'));
  const cCollected = esca(buildSignedUrl(fnBase, bookingId, 'collected', 'email'));
  return [
    '<table style="width:100%;margin-top:24px;border-collapse:collapse;" cellpadding="0" cellspacing="0">',
    '<tr><td style="padding:6px 0;font-size:13px;color:#888;">Quick actions:</td></tr>',
    '<tr><td style="padding:6px 0;">',
    '<a href="' + cConfirm + '" style="display:inline-block;background:#3E1D1D;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin:4px 6px 4px 0;">✓ Confirm</a> ',
    '<a href="' + cCancel + '" style="display:inline-block;background:#a00;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin:4px 6px 4px 0;">❌ Cancel</a> ',
    '<a href="' + cCollected + '" style="display:inline-block;background:#1D1F36;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin:4px 6px 4px 0;">✅ Mark Collected</a>',
    '</td></tr></table>',
  ].join('');
}

function row(label, value, bold) {
  return '<tr><td style="padding:6px 0;color:#888;width:30%;">' + label + '</td><td style="padding:6px 0;' + (bold ? 'font-weight:600;' : '') + '">' + value + '</td></tr>';
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function esca(s) { return esc(s).replace(/"/g, '&quot;'); }

module.exports = {
  sendBookingEmail: sendBookingEmail,
  sendStatusUpdateEmail: sendStatusUpdateEmail,
  buildBookingHtml: buildBookingHtml,
  getRecipients: getRecipients,
};
