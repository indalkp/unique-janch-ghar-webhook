/**
 * src/flows/status.js — "Check Report Status" flow.
 *
 * Step machine:
 *   prompt   → ask for name OR booking ID
 *   lookup   → search Bookings tab by booking_id (exact) OR (wa_id + name fuzzy)
 *              found    → send status text + clear
 *              missing  → buttons [Book new, Main menu]
 */

'use strict';

const { sendText, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { config } = require('../config');
const { log } = require('../logger');
const { t } = require('../lang');
const { start: startBook } = require('./book');
const { showMenu } = require('./menu');

let _sheetsClient = null;
async function getClient() {
  if (_sheetsClient) return _sheetsClient;
  // eslint-disable-next-line global-require
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

/**
 * Tiny case-insensitive contains-match. Good enough for "Indal" vs "indal kp".
 */
function nameMatches(needle, hay) {
  if (!needle || !hay) return false;
  const n = needle.toLowerCase().trim();
  const h = hay.toLowerCase().trim();
  if (!n || !h) return false;
  return h.includes(n) || n.includes(h);
}

/**
 * Fetch all Bookings rows. Bookings is small enough that a full scan beats
 * a per-query API hit; if it grows past ~5k rows, swap to a Sheet query.
 */
async function readBookings() {
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: 'Bookings!A2:I',
    });
    return res.data.values || [];
  } catch (err) {
    log.error('status.read.failed', { error: err.message });
    return [];
  }
}

/**
 * Find a booking by ID first, then by (wa_id + name fuzzy). Returns the row
 * (array, in column order) or null.
 *
 * Bookings tab columns:
 *   booking_id | timestamp | wa_id | customer_name | test | date | slot | status | notes
 */
async function findBooking(query, wa_id) {
  const rows = await readBookings();
  const q = (query || '').trim();
  // Pass 1: exact booking_id match.
  for (const r of rows) {
    if ((r[0] || '').toLowerCase() === q.toLowerCase()) return r;
  }
  // Pass 2: same wa_id + name fuzzy.
  for (const r of rows) {
    if (r[2] === wa_id && nameMatches(q, r[3])) return r;
  }
  return null;
}

/**
 * Map a stored status (PENDING/CONFIRMED/COLLECTED/READY/CANCELLED) to a
 * localized note. Falls back to generic text for unknown statuses.
 */
function noteForStatus(status, lang) {
  const key = `status.note.${(status || '').toLowerCase()}`;
  const note = t(key, lang);
  // If t() returned the key itself (no match), use a neutral fallback.
  return note === key ? '' : note;
}

async function start(wa_id, lang) {
  await sendText(wa_id, t('status.prompt', lang));
  await setState(wa_id, 'status', 'prompt', { lang });
}

async function handle(wa_id, input, state) {
  const lang = state.context.lang || 'en';
  const step = state.step;
  const norm = (input || '').trim().toLowerCase();

  switch (step) {
    case 'prompt': {
      const found = await findBooking(input, wa_id);
      if (found) {
        const [id, , , , test, date, slot, status] = found;
        await sendText(wa_id, t('status.found', lang, {
          id, test, date, slot, status,
          note: noteForStatus(status, lang),
        }));
        await clearState(wa_id);
        return;
      }
      await sendInteractiveButtons(wa_id, t('status.not_found.body', lang), [
        { id: 'status_book_new',  title: t('status.book_new', lang) },
        { id: 'status_main_menu', title: t('status.main_menu', lang) },
      ]);
      await setState(wa_id, 'status', 'not_found', { lang });
      return;
    }

    case 'not_found': {
      if (norm === 'status_book_new' || norm.includes('book')) {
        return startBook(wa_id, lang);
      }
      // Default: bounce to menu.
      return showMenu(wa_id, lang);
    }

    default:
      return start(wa_id, lang);
  }
}

module.exports = { start, handle, findBooking, nameMatches };
