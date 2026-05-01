/**
 * index.js — Google Cloud Function entry point.
 *
 * What this file does (plain English):
 *   - Exposes a single HTTP function: `whatsappWebhook`.
 *   - GET requests are Meta's verification handshake (when you first attach
 *     the webhook URL in the developers.facebook.com dashboard).
 *   - POST requests are real events: inbound messages, delivery receipts,
 *     read receipts, etc. We verify the X-Hub-Signature-256 header so we
 *     know the request actually came from Meta, then ACK with 200 within
 *     a few hundred ms (Meta retries aggressively if you're slow), and
 *     process the payload AFTER the response is sent.
 *   - All real work (keyword detection, replying, Sheet logging) lives in
 *     src/router.js — this file is intentionally thin.
 *
 * Free-tier rule: we never call Meta's template-message endpoint here.
 * Every outbound is a free-form reply inside the 24-hour customer-service
 * window. See ARCHIVE.md for the paid template flow if/when needed.
 */

'use strict';

const functions = require('@google-cloud/functions-framework');
const { verifySignature } = require('./src/verify');
const { routeEvent } = require('./src/router');
const { config } = require('./src/config');
const { log } = require('./src/logger');

// Capture the raw request body — required for HMAC signature verification.
// Without this, JSON middleware will have already mutated the bytes and the
// signature won't match. Functions Framework gives us req.rawBody for free
// when Content-Type is application/json, but we double-check below.
functions.http('whatsappWebhook', async (req, res) => {
  const startedAt = Date.now();

  try {
    // -------- GET: Meta verification handshake --------
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
        log.info('webhook.verify.ok');
        return res.status(200).send(challenge);
      }

      log.warn('webhook.verify.failed', { mode, tokenMatches: token === config.META_VERIFY_TOKEN });
      return res.sendStatus(403);
    }

    // -------- POST: actual event --------
    if (req.method !== 'POST') {
      return res.sendStatus(405);
    }

    // Signature check FIRST. Reject anything that isn't from Meta.
    const signature = req.get('x-hub-signature-256');
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

    if (!verifySignature(rawBody, signature, config.META_APP_SECRET)) {
      log.warn('webhook.signature.invalid');
      return res.sendStatus(401);
    }

    // ACK to Meta IMMEDIATELY. Anything more than ~5 seconds and Meta retries.
    res.status(200).send('EVENT_RECEIVED');

    // Process asynchronously — we already responded, so a thrown error here
    // only ends up in Cloud Logging, not in an HTTP error to Meta. That's
    // exactly what we want: be honest in logs, never make Meta retry.
    routeEvent(req.body).catch((err) => {
      log.error('webhook.route.error', { error: err.message, stack: err.stack });
    });

    log.info('webhook.ack', { ms: Date.now() - startedAt });
    return; // response already sent
  } catch (err) {
    log.error('webhook.fatal', { error: err.message, stack: err.stack });
    // If we haven't sent yet, send 200 anyway — we don't want Meta to retry
    // a malformed/poison payload forever. We log it; we don't loop on it.
    if (!res.headersSent) {
      res.status(200).send('EVENT_RECEIVED');
    }
  }
});
