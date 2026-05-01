/**
 * src/flows/info.js — Static "Hours & Directions" reply.
 *
 * Sends a localized info text and clears state. The phone/address strings are
 * placeholders in lang.js — staff replace them post-deploy.
 */

'use strict';

const { sendText } = require('../actions');
const { clearState } = require('../state');
const { t } = require('../lang');

async function start(wa_id, lang) {
  await sendText(wa_id, t('info.body', lang));
  await clearState(wa_id);
}

// Info has no follow-up steps — handle() just bounces back to start.
async function handle(wa_id, _input, state) {
  return start(wa_id, state.context.lang || 'en');
}

module.exports = { start, handle };
