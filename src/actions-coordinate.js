/**
 * src/actions-coordinate.js — Cross-channel booking action coordination (v2.2).
 *
 * Each booking can be actioned via:
 *   - Email CTA buttons   (signed URL → GET /action)
 *   - WhatsApp staff alert buttons (button id like "act_confirm_UJG-...")
 *   - Direct Sheet edit by lab staff (no automation, manual)
 *
 * When ANY channel acts on a booking, this module:
 *   1. Validates the request (HMAC sig for email; staff-wa-id list for WA)
 *   2. Reads current Bookings status — if already actioned, returns "already
 *      actioned by X" (idempotent / no double-confirm)
 *   3. Updates Bookings status + actioned_by + actioned_at
 *   4. Broadcasts the change to OTHER channels (email + the OTHER staff WA),
 *      so nobody else clicks the same button thinking it's still pending.
 *
 * Env vars:
 *   ACTION_SECRET  — HMAC SHA256 secret. Generate with `openssl rand -hex 32`.
 *                    Rotating this invalidates all outstanding email links.
 *   STAFF_WA       — comma-separated list of staff E.164 wa_ids without '+'.
 *
 * Action URL shape:
 *   https://<fn-base>/action?id=UJG-...&action=confirm&actor=email&exp=<ts>&sig=<hex>
 *   Signed payload = `${id}|${action}|${actor}|${exp}` (pipe-joined)
 *   exp is unix-seconds; we reject if Date.now()/1000 > exp.
 */

'use strict';

const crypto = require('crypto');
const { config } = require('./config');
const { log } = require('./logger');
const { sendInteractiveButtons, sendText } = require('./actions');

const VALID_ACTIONS = new Set(['confirm', 'cancel', 'collected']);
const ACTION_LABELS = {
  confirm: 'CONFIRMED',
  cancel: 'CANCELLED',
  collected: 'COLLECTED',
};
const ACTION_VERBS = {
  confirm: 'confirmed',
  cancel: 'cancelled',
  collected: 'marked as collected',
};

// 7-day default expiry on signed URLs.
const DEFAULT_EXPIRY_SEC = 7 * 24 * 60 * 60;

function getSecret() {
  return process.env.ACTION_SECRET || '';
}

/**
 * Sign a payload — returns hex digest. Lazy callers can use buildSignedUrl.
 */
function sign(payload) {
  const secret = getSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(String(payload)).digest('hex');
}

/**
 * Build a signed action URL for a given booking + action + actor.
 *
 * @param {string} fnBase    — e.g. "https://asia-south1-unique-janch-ghar.cloudfunctions.net/whatsappWebhook"
 * @param {string} bookingId
 * @param {string} action    — confirm | cancel | collected
 * @param {string} actor     — email | wa-XXXX | web (audit only)
 */
function buildSignedUrl(fnBase, bookingId, action, actor) {
  const exp = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_SEC;
  const payload = bookingId + '|' + action + '|' + actor + '|' + exp;
  const sig = sign(payload);
  const params = new URLSearchParams({
    id: bookingId,
    action: action,
    actor: actor,
    exp: String(exp),
    sig: sig,
  });
  return fnBase.replace(/\/$/, '') + '/action?' + params.toString();
}

/**
 * Verify a signed query — returns {ok, reason?}.
 * Uses timing-safe comparison.
 */
function verifySignedQuery(q) {
  const { id, action, actor, exp, sig } = q || {};
  if (!id || !action || !actor || !exp || !sig) return { ok: false, reason: 'missing_params' };
  if (!VALID_ACTIONS.has(action)) return { ok: false, reason: 'invalid_action' };
  const now = Math.floor(Date.now() / 1000);
  if (Number(exp) < now) return { ok: false, reason: 'expired' };
  const payload = id + '|' + action + '|' + actor + '|' + exp;
  const expected = sign(payload);
  if (!expected) return { ok: false, reason: 'no_secret' };
  // Timing-safe compare requires equal-length buffers.
  const aBuf = Buffer.from(sig, 'hex');
  const bBuf = Buffer.from(expected, 'hex');
  if (aBuf.length !== bBuf.length) return { ok: false, reason: 'bad_sig' };
  if (!crypto.timingSafeEqual(aBuf, bBuf)) return { ok: false, reason: 'bad_sig' };
  return { ok: true };
}

/**
 * GET /action handler — entry point from the Cloud Function for clicked links.
 * @param {object} req  — Cloud Functions request (express-like .query)
 * @param {object} res
 */
async function handleHttpAction(req, res) {
  const q = req.query || {};
  const verify = verifySignedQuery(q);
  if (!verify.ok) {
    log.warn('action.http.reject', { reason: verify.reason, id: q.id, action: q.action });
    return renderActionPage(res, 400, 'Invalid or expired link', '<p>This action link has expired or is not valid. Please use a fresh notification.</p>');
  }
  const result = await applyAction(q.id, q.action, q.actor || 'web');
  if (result.alreadyDone) {
    return renderActionPage(res, 200, 'Already ' + ACTION_LABELS[result.previousAction] || 'Already actioned',
      '<p>Booking <b>' + escHtml(q.id) + '</b> was already <b>' + ACTION_LABELS[result.previousAction] + '</b> by <i>' + escHtml(result.previousActor) + '</i> at ' + escHtml(result.previousAt) + '.</p>' +
      '<p>No further action needed.</p>');
  }
  if (!result.ok) {
    return renderActionPage(res, 500, 'Action failed', '<p>' + escHtml(result.error || 'unknown') + '</p>');
  }
  return renderActionPage(res, 200, 'Booking ' + ACTION_LABELS[q.action],
    '<p>Booking <b>' + escHtml(q.id) + '</b> is now <b>' + ACTION_LABELS[q.action] + '</b>.</p>' +
    '<p>Other staff have been notified.</p>');
}

/**
 * WhatsApp button id handler. Button ids look like `act_confirm_UJG-...`.
 * @param {string} wa_id   — sender's E.164 wa_id (acts as actor identity)
 * @param {string} buttonId
 */
async function handleWaButton(wa_id, buttonId) {
  // Parse: act_<action>_<bookingId>
  const m = String(buttonId || '').match(/^act_(confirm|cancel|collected|map)_(.+)$/);
  if (!m) return false;
  const action = m[1];
  const bookingId = m[2];
  // 'map' is a no-op (the button itself is just the URL link); skip backend.
  if (action === 'map') return true;
  const result = await applyAction(bookingId, action, 'wa-' + wa_id.slice(-4));
  if (result.alreadyDone) {
    await sendText(wa_id, '⚠️ Booking ' + bookingId + ' was already ' + ACTION_LABELS[result.previousAction] + ' by ' + result.previousActor + '. No further action needed.');
  } else if (result.ok) {
    await sendText(wa_id, '✅ Booking ' + bookingId + ' is now ' + ACTION_LABELS[action] + '. Other staff have been notified.');
  } else {
    await sendText(wa_id, '⚠️ Could not update booking ' + bookingId + ': ' + (result.error || 'unknown error'));
  }
  return true;
}

/**
 * Core: read current booking, decide if already actioned, otherwise update +
 * broadcast. Returns:
 *   { ok: true } — applied
 *   { alreadyDone: true, previousAction, previousActor, previousAt } — no-op
 *   { ok: false, error } — Sheet write failed / booking not found
 */
async function applyAction(bookingId, action, actor) {
  const { findBookingById, updateBookingAction } = require('./sheets');
  const booking = await findBookingById(bookingId);
  if (!booking) return { ok: false, error: 'booking not found' };

  // Already actioned? (status is one of the terminal labels)
  const currentStatus = String(booking.status || '').toUpperCase();
  if (currentStatus === ACTION_LABELS[action]) {
    return {
      alreadyDone: true,
      previousAction: action,
      previousActor: booking.actioned_by || 'unknown',
      previousAt: booking.actioned_at || '',
    };
  }
  if (currentStatus !== 'PENDING' && currentStatus !== '') {
    // Different terminal state already — also treat as "already done".
    const prev = Object.keys(ACTION_LABELS).find((k) => ACTION_LABELS[k] === currentStatus) || 'unknown';
    return {
      alreadyDone: true,
      previousAction: prev,
      previousActor: booking.actioned_by || 'unknown',
      previousAt: booking.actioned_at || '',
    };
  }

  const nowIso = new Date().toISOString();
  const writeResult = await updateBookingAction(bookingId, ACTION_LABELS[action], actor, nowIso);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error || 'sheet write failed' };
  }

  // Broadcast — fire-and-forget. We don't block the actor's response on
  // broadcast latency.
  broadcastUpdate(booking, action, actor, nowIso).catch((e) => {
    log.error('broadcast.threw', { booking_id: bookingId, error: e.message });
  });

  return { ok: true };
}

/**
 * Notify all OTHER channels that the booking was actioned, so nobody else
 * acts on it. Skips the actor's own channel (best-effort: 'email' or 'wa-XXXX').
 */
async function broadcastUpdate(booking, action, actor, atIso) {
  const tasks = [];

  // 1) Email broadcast — only if RESEND key present and actor wasn't email.
  if (process.env.RESEND_API_KEY && actor !== 'email') {
    const { sendStatusUpdateEmail } = require('./email');
    tasks.push(sendStatusUpdateEmail({
      booking_id: booking.booking_id,
      customer_name: booking.customer_name || '',
      action_label: ACTION_LABELS[action],
      actor: actor,
      at: atIso,
    }));
  }

  // 2) WhatsApp broadcast — to every staff wa_id EXCEPT the actor's wa.
  const staffList = (process.env.STAFF_WA || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const sw of staffList) {
    if (actor === 'wa-' + sw.slice(-4)) continue; // skip actor's own number
    const msg = '✅ Booking ' + booking.booking_id + ' was ' + ACTION_VERBS[action] +
      ' by ' + actor + ' at ' + atIso + '. No action needed from you.';
    tasks.push(sendText(sw, msg));
  }

  await Promise.allSettled(tasks);
}

/**
 * Tiny HTML page renderer for the GET /action response.
 */
function renderActionPage(res, status, title, bodyHtml) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escHtml(title) + ' — Unique Janch Ghar</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '</head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F4EFE5;padding:24px;">' +
    '<div style="max-width:560px;margin:40px auto;background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
    '<h1 style="margin:0 0 16px;color:#3E1D1D;font-size:22px;">🩺 ' + escHtml(title) + '</h1>' +
    '<div style="color:#1D1F36;font-size:15px;line-height:1.5;">' + bodyHtml + '</div>' +
    '<p style="margin:24px 0 0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;">Unique Janch Ghar (formerly Hi-tech Patho Lab Rajgir) · Rajgir, Bihar</p>' +
    '</div></body></html>';
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = {
  buildSignedUrl: buildSignedUrl,
  verifySignedQuery: verifySignedQuery,
  handleHttpAction: handleHttpAction,
  handleWaButton: handleWaButton,
  applyAction: applyAction,
  broadcastUpdate: broadcastUpdate,
  ACTION_LABELS: ACTION_LABELS,
  VALID_ACTIONS: VALID_ACTIONS,
};
