/**
 * src/verify.js — HMAC-SHA256 signature verification for Meta webhook.
 *
 * Meta signs every POST with the App Secret using HMAC-SHA256 and puts the
 * result in the `x-hub-signature-256` header, formatted as `sha256=<hex>`.
 * We re-compute the signature over the EXACT raw bytes of the request body
 * (no JSON re-stringify — that changes whitespace and breaks the hash) and
 * compare with crypto.timingSafeEqual to avoid timing-attack leakage.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 */

'use strict';

const crypto = require('crypto');
const { log } = require('./logger');

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 *
 * @param {Buffer|string} rawBody  — exact bytes of the POST body
 * @param {string|undefined} signatureHeader  — value of `x-hub-signature-256`
 * @param {string} appSecret  — Meta App Secret
 * @returns {boolean} true if signature is valid
 */
function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) {
    log.warn('verify.missing_inputs', {
      hasHeader: Boolean(signatureHeader),
      hasSecret: Boolean(appSecret),
    });
    return false;
  }

  // Header looks like "sha256=abcdef0123…". Reject anything weirder.
  if (!signatureHeader.startsWith('sha256=')) {
    log.warn('verify.bad_prefix');
    return false;
  }

  const provided = signatureHeader.slice('sha256='.length);

  // Compute our own HMAC over the raw bytes.
  const computed = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  // Both buffers must be the same length before timingSafeEqual or it throws.
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(computed, 'hex');

  if (a.length !== b.length) {
    log.warn('verify.length_mismatch');
    return false;
  }

  try {
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    // Should not happen given the length check above, but never trust crypto inputs.
    log.warn('verify.compare_threw', { error: err.message });
    return false;
  }
}

module.exports = { verifySignature };
