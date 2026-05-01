/**
 * src/flows/catalog.js — "Pricing & Tests" flow.
 *
 * Step machine:
 *   pick_category  → list of categories
 *   pick_test      → list of tests in the chosen category (with prices)
 *   show_test      → detail text + buttons [Book this test, Back to menu]
 *
 * Catalog is read from the Catalog Sheet tab and cached in-memory for 5 min.
 * The first runtime read after deploy will hit Sheets; subsequent calls
 * within 5 min are free.
 */

'use strict';

const { sendText, sendInteractiveList, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { config } = require('../config');
const { log } = require('../logger');
const { t } = require('../lang');
const { start: startBook } = require('./book');
const { showMenu } = require('./menu');

const CACHE_TTL_MS = 5 * 60 * 1000;
let catalogCache = { data: null, expires: 0 };

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
 * Read the Catalog tab and build:
 *   { byCategory: Map<category, Array<row>>, byKey: Map<key, row> }
 *   row shape: { category, test_name, price_inr, sample, fasting, tat, notes, key }
 *
 * Cached 5 min.
 */
async function readCatalog() {
  if (catalogCache.data && catalogCache.expires > Date.now()) {
    return catalogCache.data;
  }

  let rows = [];
  try {
    const sheets = await getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: 'Catalog!A2:G',
    });
    rows = res.data.values || [];
  } catch (err) {
    log.error('catalog.read.failed', { error: err.message });
    rows = [];
  }

  const byCategory = new Map();
  const byKey = new Map();
  rows.forEach((r, i) => {
    const test = {
      category: r[0] || '',
      test_name: r[1] || '',
      price_inr: r[2] || '',
      sample: r[3] || '',
      fasting: r[4] || '',
      tat: r[5] || '',
      notes: r[6] || '',
      key: `t_${i}`,
    };
    if (!test.category || !test.test_name) return;
    if (!byCategory.has(test.category)) byCategory.set(test.category, []);
    byCategory.get(test.category).push(test);
    byKey.set(test.key, test);
  });

  catalogCache = { data: { byCategory, byKey }, expires: Date.now() + CACHE_TTL_MS };
  return catalogCache.data;
}

/**
 * The 8 categories shown in the first list. We always show the same 8 even
 * if some are empty in the Sheet — staff get a hint that they need to seed.
 */
const CATEGORIES = [
  { id: 'cat_hematology',   key: 'Hematology',    label: 'catalog.cat.hematology' },
  { id: 'cat_biochemistry', key: 'Biochemistry',  label: 'catalog.cat.biochemistry' },
  { id: 'cat_hormones',     key: 'Hormones',      label: 'catalog.cat.hormones' },
  { id: 'cat_diabetes',     key: 'Diabetes',      label: 'catalog.cat.diabetes' },
  { id: 'cat_vitamins',     key: 'Vitamins',      label: 'catalog.cat.vitamins' },
  { id: 'cat_urinalysis',   key: 'Urinalysis',    label: 'catalog.cat.urinalysis' },
  { id: 'cat_microbiology', key: 'Microbiology',  label: 'catalog.cat.microbiology' },
  { id: 'cat_special',      key: 'Special Tests', label: 'catalog.cat.special' },
];

async function start(wa_id, lang) {
  const sections = [{
    title: t('catalog.section', lang),
    rows: CATEGORIES.map((c) => ({ id: c.id, title: t(c.label, lang) })),
  }];
  await sendInteractiveList(
    wa_id,
    t('catalog.header', lang),
    t('catalog.body', lang),
    t('catalog.button', lang),
    sections,
  );
  await setState(wa_id, 'catalog', 'pick_category', { lang });
}

async function handle(wa_id, input, state) {
  const lang = state.context.lang || 'en';
  const ctx = { ...state.context };
  const step = state.step;
  const norm = (input || '').trim().toLowerCase();

  switch (step) {
    case 'pick_category': {
      const cat = CATEGORIES.find((c) => c.id === norm);
      if (!cat) {
        // Customer typed something instead of picking — bounce back to menu.
        return showMenu(wa_id, lang);
      }
      const { byCategory } = await readCatalog();
      const tests = byCategory.get(cat.key) || [];
      if (tests.length === 0) {
        await sendText(wa_id, t('catalog.empty', lang));
        return showMenu(wa_id, lang);
      }
      // WhatsApp lists cap at 10 rows per section, 10 total. Slice defensively.
      const rows = tests.slice(0, 10).map((tst) => ({
        id: tst.key,
        title: tst.test_name.length > 24 ? tst.test_name.slice(0, 24) : tst.test_name,
        description: `₹${tst.price_inr} · ${tst.tat || ''}h`,
      }));
      await sendInteractiveList(
        wa_id,
        t('catalog.tests.header', lang, { category: t(cat.label, lang) }),
        t('catalog.tests.body', lang),
        t('catalog.tests.button', lang),
        [{ title: t(cat.label, lang), rows }],
      );
      ctx.category = cat.key;
      await setState(wa_id, 'catalog', 'pick_test', ctx);
      return;
    }

    case 'pick_test': {
      const { byKey } = await readCatalog();
      const tst = byKey.get(norm);
      if (!tst) {
        return showMenu(wa_id, lang);
      }
      await sendText(wa_id, t('catalog.test.detail', lang, {
        name: tst.test_name,
        price: tst.price_inr,
        sample: tst.sample,
        fasting: tst.fasting,
        tat: `${tst.tat}h`,
        notes: tst.notes,
      }));
      await sendInteractiveButtons(wa_id, ' ', [
        { id: 'cat_book',  title: t('catalog.book_this', lang) },
        { id: 'cat_back',  title: t('catalog.back', lang) },
      ]);
      ctx.test_name = tst.test_name;
      await setState(wa_id, 'catalog', 'show_test', ctx);
      return;
    }

    case 'show_test': {
      if (norm === 'cat_book' || norm.includes('book')) {
        // Hand off to book flow with test pre-selected.
        return startBook(wa_id, lang, { test: ctx.test_name });
      }
      return showMenu(wa_id, lang);
    }

    default:
      return start(wa_id, lang);
  }
}

module.exports = { start, handle, CATEGORIES, readCatalog };
