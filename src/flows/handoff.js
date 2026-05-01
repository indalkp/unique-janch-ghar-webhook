/**
 * src/flows/handoff.js — "Talk to Staff" flow.
 *
 * Step machine:
 *   ask_when → buttons [Now, Within 2h, Tomorrow morning]
 *   done     → write Handoff row, send confirmation, clear state
 *
 * Handoff tab columns:
 *   timestamp | wa_id | customer_name | preferred_callback_time | status | notes
 */

'use strict';

const { sendText, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { appendRow } = require('../sheets');
const { t } = require('../lang');

async function start(wa_id, lang, seed = {}) {
  await sendInteractiveButtons(wa_id, t('handoff.prompt', lang), [
    { id: 'handoff_now',      title: t('handoff.now', lang) },
    { id: 'handoff_2h',       title: t('handoff.2h', lang) },
    { id: 'handoff_tomorrow', title: t('handoff.tomorrow', lang) },
  ]);
  await setState(wa_id, 'handoff', 'ask_when', { lang, name: seed.name || '' });
}

async function handle(wa_id, input, state) {
  const lang = state.context.lang || 'en';
  const ctx = { ...state.context };
  const norm = (input || '').trim().toLowerCase();

  // Single-step flow — any inbound while in this flow attempts to record.
  let when;
  let label;
  if (norm === 'handoff_now')           { when = 'now';            label = t('handoff.now', lang); }
  else if (norm === 'handoff_2h')       { when = 'within_2_hours'; label = t('handoff.2h', lang); }
  else if (norm === 'handoff_tomorrow') { when = 'tomorrow_am';    label = t('handoff.tomorrow', lang); }
  else                                  { when = 'unspecified';    label = input || ''; }

  await appendRow('Handoff', [
    new Date().toISOString(),
    wa_id,
    ctx.name || '',
    when,
    'PENDING',
    label,
  ]);
  await sendText(wa_id, t('handoff.success', lang, { when: label }));
  await clearState(wa_id);
}

module.exports = { start, handle };
