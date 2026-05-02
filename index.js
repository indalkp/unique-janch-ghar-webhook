/**
 * index.js — Google Cloud Function entry point (v2.2).
 *
 * Routes:
 *   GET  /          — Meta webhook verification (hub.challenge)
 *   POST /          — Meta webhook event delivery (signed)
 *   GET  /action    — Cross-channel booking action handler (signed URL)
 *
 * Cloud Functions Gen 2 may freeze the instance the moment res.send() flushes,
 * so we await async work BEFORE responding — fire-and-forget is unreliable
 * on Gen 2. Meta allows up to 5 s; our worst-case round-trip is ~600 ms.
 */

'use strict';

const functions = require('@google-cloud/functions-framework');
const { verifySignature } = require('./src/verify');
const { routeEvent } = require('./src/router');
const { handleHttpAction } = require('./src/actions-coordinate');
const { config } = require('./src/config');
const { log } = require('./src/logger');

functions.http('whatsappWebhook', async (req, res) => {
  const startedAt = Date.now();

  try {
    // ---- v2.2: GET /action — signed-URL action handler --------------------
    // Cloud Functions strips the function-name prefix from req.path, so the
    // path is just "/action" relative to the function root.
    if (req.method === 'GET' && req.path && req.path.replace(/\/$/, '') === '/action') {
      try {
        await handleHttpAction(req, res);
      } catch (err) {
        log.error('action.http.threw', { error: err.message, stack: err.stack });
        if (!res.headersSent) res.status(500).send('Action handler error');
      }
      return;
    }

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

    if (req.method !== 'POST') {
      return res.sendStatus(405);
    }

    const signature = req.get('x-hub-signature-256');
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

    if (!verifySignature(rawBody, signature, config.META_APP_SECRET)) {
      log.warn('webhook.signature.invalid');
      return res.sendStatus(401);
    }

    // Process FIRST, ACK SECOND. See file header for why.
    try {
      await routeEvent(req.body);
    } catch (err) {
      log.error('webhook.route.error', { error: err.message, stack: err.stack });
    }

    log.info('webhook.ack', { ms: Date.now() - startedAt });
    return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    log.error('webhook.fatal', { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(200).send('EVENT_RECEIVED');
    }
  }
});
