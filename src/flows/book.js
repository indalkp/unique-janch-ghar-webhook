/**
 * src/flows/book.js — "Book Test" flow.
 *
 * Step machine:
 *   entry         → buttons [Common tests, Doctor referred, Type test name]
 *   pick_common   → list with 10 popular tests
 *   type_name     → free-text "what test?"
 *   pick_date     → buttons [Today, Tomorrow, Pick a date]
 *   custom_date   → free-text DD/MM
 *   pick_slot     → buttons [Morning 7-10, Afternoon 10-12]
 *   confirm       → buttons [Confirm, Cancel]
 *   done          → write Bookings row, send confirmation, clear state
 *
 * Each handler:
 *   - reads the inbound event (text or interactive id)
 *   - sends 0..N outbound messages
 *   - persists next-step state
 *
 * State context shape:
 *   { lang, name, test, date, slot }
 */

'use strict';

const { sendText, sendInteractiveList, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { appendRow } = require('../sheets');
const { t } = require('../lang');

// Top-of-list popular tests. Pulled from catalog-data manually to avoid a
// runtime Sheet read on every Book entry — these 10 don't change often.
const POPULAR_TESTS = [
  'CBC (Complete Blood Count)',
  'LFT (Liver Function Test)',
  'KFT (Kidney Function Test)',
  'Lipid Profile',
  'HbA1c',
  'TSH',
  'Vitamin D',
  'Vitamin B12',
  'Urine R/M',
  'Blood Sugar Fasting',
];

/**
 * Generate a short booking ID. Format: UJG-{YYMMDD}-{4-digit-random}.
 * Not a strong unique ID — fine for a small lab; collisions are extremely
 * unlikely at the scale and easy to spot in the Sheet.
 */
function newBookingId() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const r = Math.floor(1000 + Math.random() * 9000);
  return `UJG-${yy}${mm}${dd}-${r}`;
}

/**
 * Format DD/MM as a friendly date string anchored to current year. Returns
 * null if the input doesn't look like DD/MM.
 */
function parseDdMm(text) {
  const m = (text || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
  const yyyy = new Date().getFullYear();
  return `${String(day).padStart(2, '0')}/${String(mon).padStart(2, '0')}/${yyyy}`;
}

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function tomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Send the date-pick buttons. Used twice — extracted so step transitions stay
 * clean.
 */
async function promptDate(wa_id, lang) {
  await sendInteractiveButtons(wa_id, t('book.prompt.date', lang), [
    { id: 'date_today',    title: t('book.date.today', lang) },
    { id: 'date_tomorrow', title: t('book.date.tomorrow', lang) },
    { id: 'date_pick',     title: t('book.date.pick', lang) },
  ]);
}

/**
 * Send the slot-pick buttons.
 */
async function promptSlot(wa_id, lang) {
  await sendInteractiveButtons(wa_id, t('book.prompt.slot', lang), [
    { id: 'slot_morning',   title: t('book.slot.morning', lang) },
    { id: 'slot_afternoon', title: t('book.slot.afternoon', lang) },
  ]);
}

/**
 * Send the confirmation summary + buttons.
 */
async function promptConfirm(wa_id, lang, ctx) {
  await sendInteractiveButtons(
    wa_id,
    t('book.confirm.body', lang, { test: ctx.test, date: ctx.date, slot: ctx.slot }),
    [
      { id: 'confirm_yes', title: t('book.confirm.yes', lang) },
      { id: 'confirm_no',  title: t('book.confirm.no', lang) },
    ],
  );
}

/**
 * Entry — first time the customer hits "Book Test" from the menu (or via
 * pre-selected test from the catalog flow).
 *
 * @param {string} wa_id
 * @param {'hi'|'en'} lang
 * @param {{test?:string, name?:string}} [seed] — optional pre-selected test
 */
async function start(wa_id, lang, seed = {}) {
  // If catalog pre-selected a test, skip straight to date picking.
  if (seed.test) {
    await setState(wa_id, 'book', 'pick_date', { lang, test: seed.test, name: seed.name || '' });
    return promptDate(wa_id, lang);
  }

  await sendInteractiveButtons(wa_id, t('book.entry.body', lang), [
    { id: 'book_common',   title: t('book.entry.common', lang) },
    { id: 'book_referred', title: t('book.entry.referred', lang) },
    { id: 'book_type',     title: t('book.entry.type', lang) },
  ]);
  await setState(wa_id, 'book', 'entry', { lang, name: seed.name || '' });
}

/**
 * Handle an inbound event while the customer is in the book flow.
 *
 * @param {string} wa_id
 * @param {string} input   — extracted text/id from the inbound message
 * @param {Object} state   — { flow, step, context }
 * @returns {Promise<void>}
 */
async function handle(wa_id, input, state) {
  const lang = state.context.lang || 'en';
  const ctx = { ...state.context };
  const step = state.step;
  const norm = (input || '').trim().toLowerCase();

  switch (step) {
    case 'entry': {
      if (norm === 'book_common' || norm.includes('common')) {
        // List of popular tests.
        const sections = [{
          title: t('book.list.header', lang),
          rows: POPULAR_TESTS.map((name, i) => ({
            id: `bt_${i}`,
            title: name.length > 24 ? name.slice(0, 24) : name,
            description: name,
          })),
        }];
        await sendInteractiveList(
          wa_id,
          t('book.list.header', lang),
          t('book.list.body', lang),
          t('book.list.button', lang),
          sections,
        );
        await setState(wa_id, 'book', 'pick_common', ctx);
        return;
      }
      // Doctor referred / type test name — both prompt for free text.
      await sendText(wa_id, t('book.prompt.name', lang));
      await setState(wa_id, 'book', 'type_name', ctx);
      return;
    }

    case 'pick_common': {
      // The customer either picked a row (id starts with bt_) or typed a name.
      let test;
      const m = norm.match(/^bt_(\d+)$/);
      if (m) {
        test = POPULAR_TESTS[parseInt(m[1], 10)] || input;
      } else {
        test = input;
      }
      ctx.test = test;
      await promptDate(wa_id, lang);
      await setState(wa_id, 'book', 'pick_date', ctx);
      return;
    }

    case 'type_name': {
      ctx.test = input.trim();
      await promptDate(wa_id, lang);
      await setState(wa_id, 'book', 'pick_date', ctx);
      return;
    }

    case 'pick_date': {
      if (norm === 'date_today') {
        ctx.date = todayLabel();
      } else if (norm === 'date_tomorrow') {
        ctx.date = tomorrowLabel();
      } else if (norm === 'date_pick') {
        await sendText(wa_id, t('book.prompt.date.custom', lang));
        await setState(wa_id, 'book', 'custom_date', ctx);
        return;
      } else {
        // Treat the text as a custom date.
        const parsed = parseDdMm(input);
        if (!parsed) {
          await sendText(wa_id, t('book.invalid.date', lang));
          return;
        }
        ctx.date = parsed;
      }
      await promptSlot(wa_id, lang);
      await setState(wa_id, 'book', 'pick_slot', ctx);
      return;
    }

    case 'custom_date': {
      const parsed = parseDdMm(input);
      if (!parsed) {
        await sendText(wa_id, t('book.invalid.date', lang));
        return;
      }
      ctx.date = parsed;
      await promptSlot(wa_id, lang);
      await setState(wa_id, 'book', 'pick_slot', ctx);
      return;
    }

    case 'pick_slot': {
      if (norm === 'slot_morning') ctx.slot = t('book.slot.morning', lang);
      else if (norm === 'slot_afternoon') ctx.slot = t('book.slot.afternoon', lang);
      else ctx.slot = input;
      await promptConfirm(wa_id, lang, ctx);
      await setState(wa_id, 'book', 'confirm', ctx);
      return;
    }

    case 'confirm': {
      if (norm === 'confirm_no' || norm.includes('cancel') || norm.includes('रद्द')) {
        await sendText(wa_id, t('book.cancelled', lang));
        await clearState(wa_id);
        return;
      }
      // Default: treat anything else as confirm. Friendlier for tap-happy users.
      const id = newBookingId();
      const row = [
        id,
        new Date().toISOString(),
        wa_id,
        ctx.name || '',
        ctx.test || '',
        ctx.date || '',
        ctx.slot || '',
        'PENDING',
        '', // notes
      ];
      // Best-effort write — appendRow swallows errors (sheets.js policy).
      await appendRow('Bookings', row);
      await sendText(wa_id, t('book.success', lang, {
        id, test: ctx.test, date: ctx.date, slot: ctx.slot,
      }));
      await clearState(wa_id);
      return;
    }

    default: {
      // Unknown step — recover by restarting the flow.
      return start(wa_id, lang, { name: ctx.name });
    }
  }
}

module.exports = {
  start,
  handle,
  POPULAR_TESTS,
  // exported for tests
  parseDdMm,
  newBookingId,
};
