/**
 * src/flows/book.js — Creative project & production booking flow for Indal KP Studio.
 *
 * Packages:
 *   - 60s Hybrid 2D Commercial Video Package (₹37,500 / $600 USD)
 *   - Complete Preproduction & Storyboard Suite (₹17,500 / $250 USD)
 *   - Creator Content Engine & Automation Setup (₹25,000 / $375 USD)
 *   - 15s Concept Teaser & Motion Reel (₹12,500 / $175 USD)
 */

'use strict';

const { sendText, sendInteractiveList, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { appendBooking, updateBookingPayment } = require('../sheets');
const { sendBookingEmail } = require('../email');
const { sendStaffAlerts } = require('../wa-alerts');
const { bridgeGet } = require('../sheets-bridge');
const { t } = require('../lang');

const POPULAR_PACKAGES = [
  { name: '60s Hybrid 2D Commercial Video', price: 37500 },
  { name: 'Complete Preproduction & Storyboard Suite', price: 17500 },
  { name: 'Creator Content Engine & Automation Setup', price: 25000 },
  { name: '15s Concept Teaser & Motion Reel', price: 12500 },
];

const POPULAR_TESTS = POPULAR_PACKAGES; // backward compat

const UPI_VPA = '9471991032-3@ybl';
const UPI_PAYEE_NAME = 'KUMAR CHANDAN PATEL';

// ---- Catalog cache --------------------------------------------------------

const CATALOG_CACHE = { rows: null, fetchedAt: 0 };
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function loadCatalog() {
  const now = Date.now();
  if (CATALOG_CACHE.rows && (now - CATALOG_CACHE.fetchedAt) < CATALOG_TTL_MS) {
    return CATALOG_CACHE.rows;
  }
  try {
    const r = await bridgeGet('read', { sheet: 'Catalog', range: 'A2:G50' });
    const data = (r && r.data) ? r.data : [];
    CATALOG_CACHE.rows = data.map((row) => ({
      category:     row[0] || '',
      test_name:    row[1] || '',
      price:        parseInt(row[2], 10) || 0,
      deliverables: row[3] || '',
      fasting:      row[4] || '',
      tat:          row[5] || '',
      notes:        row[6] || '',
    }));
    CATALOG_CACHE.fetchedAt = now;
    return CATALOG_CACHE.rows;
  } catch (e) {
    console.warn('book.catalog.load_failed', e && e.message);
    return CATALOG_CACHE.rows || [];
  }
}

async function lookupCatalogRow(test_name) {
  if (!test_name) return null;
  const needle = String(test_name).trim().toLowerCase();
  const rows = await loadCatalog();
  return rows.find((r) => r.test_name.trim().toLowerCase() === needle) || null;
}

// ---- Helpers (booking id, dates, cart math) -------------------------------

function newBookingId() {
  const d = new Date();
  const yymmdd = String(d.getFullYear()).slice(2)
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return 'IKP-' + yymmdd + '-' + rand;
}

function parseDdMm(text) {
  const m = (text || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
  const yyyy = new Date().getFullYear();
  return String(day).padStart(2, '0') + '/' + String(mon).padStart(2, '0') + '/' + yyyy;
}

function todayLabel() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function tomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function cartTotal(cart) {
  return (cart || []).reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

function cartNamesCsv(cart) {
  return (cart || []).map((it) => it.test_name).join(', ');
}

function cartLines(cart) {
  return (cart || [])
    .map((it) => '• ' + it.test_name + ': ₹' + (Number(it.price) || 0))
    .join('\n');
}

function chosenLabSummary(cart) {
  return 'Indal KP Studio';
}

function buildUpiLink(bookingId, total) {
  const params = [
    'pa=' + encodeURIComponent(UPI_VPA),
    'pn=' + encodeURIComponent(UPI_PAYEE_NAME),
    'am=' + encodeURIComponent(String(total)),
    'tn=' + encodeURIComponent(bookingId),
    'cu=INR',
  ];
  return 'upi://pay?' + params.join('&');
}

// ---- Outbound prompt helpers ----------------------------------------------

async function promptCommonList(wa_id, lang) {
  const sections = [{
    title: t('book.list.header', lang),
    rows: POPULAR_PACKAGES.map((tt, i) => ({
      id: 'bt_' + i,
      title: tt.name.length > 24 ? tt.name.slice(0, 24) : tt.name,
      description: `₹${tt.price} (50% Launch Rate)`,
    })),
  }];
  await sendInteractiveList(
    wa_id,
    t('book.list.header', lang),
    t('book.list.body', lang),
    t('book.list.button', lang),
    sections,
  );
}

async function promptAddedAndChoice(wa_id, lang, cart, lastItem) {
  const total = cartTotal(cart);
  const body = t('cart.added', lang, {
    test: lastItem.test_name,
    price: Number(lastItem.price) || 0,
    total: total,
  });
  await sendInteractiveButtons(wa_id, body, [
    { id: 'cart_add_more', title: t('cart.add_more', lang) },
    { id: 'cart_proceed',  title: t('cart.proceed', lang) },
  ]);
}

async function promptDate(wa_id, lang) {
  await sendInteractiveButtons(wa_id, t('book.prompt.date', lang), [
    { id: 'date_today',    title: t('book.date.today', lang) },
    { id: 'date_tomorrow', title: t('book.date.tomorrow', lang) },
    { id: 'date_pick',     title: t('book.date.pick', lang) },
  ]);
}

async function promptSlot(wa_id, lang) {
  await sendInteractiveButtons(wa_id, t('book.prompt.slot', lang), [
    { id: 'slot_morning',   title: t('book.slot.morning', lang) },
    { id: 'slot_afternoon', title: t('book.slot.afternoon', lang) },
  ]);
}

async function promptLocation(wa_id, lang) {
  await sendInteractiveButtons(wa_id, t('book.location.prompt', lang), [
    { id: 'loc_send',  title: t('book.location.btn_send',  lang) },
    { id: 'loc_type',  title: t('book.location.btn_type',  lang) },
    { id: 'loc_visit', title: t('book.location.btn_visit', lang) },
  ]);
}

async function promptConfirm(wa_id, lang, ctx) {
  const total = cartTotal(ctx.cart);
  const body = t('book.confirm.body', lang, {
    items: cartLines(ctx.cart),
    total: total,
    date: ctx.date || '',
    slot: ctx.slot || '',
    address: ctx.pickup_address || '—',
  });
  await sendInteractiveButtons(wa_id, body, [
    { id: 'confirm_yes', title: t('book.confirm.yes', lang) },
    { id: 'confirm_no',  title: t('book.confirm.no', lang) },
  ]);
}

async function promptPaymentChoice(wa_id, lang, bookingId, total) {
  const upiLink = buildUpiLink(bookingId, total);
  const body = t('book.payment.upi_text', lang, {
    total, id: bookingId, vpa: UPI_VPA, link: upiLink,
  });
  await sendText(wa_id, body);
  await sendInteractiveButtons(wa_id, t('book.payment.prompt', lang, { total }), [
    { id: 'paid_upi',          title: t('book.payment.btn_paid', lang) },
    { id: 'pay_at_collection', title: t('book.payment.btn_collection', lang) },
  ]);
}

// ---- Entry ----------------------------------------------------------------

async function start(wa_id, lang, seed = {}) {
  if (seed.test) {
    const ctx = { lang, name: seed.name || '', cart: [] };
    return enterTestSelection(wa_id, lang, seed.test, ctx);
  }
  await sendInteractiveButtons(wa_id, t('book.entry.body', lang), [
    { id: 'book_common',   title: t('book.entry.common', lang) },
    { id: 'book_referred', title: t('book.entry.referred', lang) },
    { id: 'book_type',     title: t('book.entry.type', lang) },
  ]);
  await setState(wa_id, 'book', 'entry', { lang: lang, name: seed.name || '', cart: [] });
}

async function enterTestSelection(wa_id, lang, test_name, ctx) {
  const row = await lookupCatalogRow(test_name);
  let price = 0;
  let finalName = test_name;
  if (row && row.price > 0) {
    price = row.price;
    finalName = row.test_name;
  } else {
    const lower = String(test_name).toLowerCase();
    if (lower.includes('60s') || lower.includes('commercial')) {
      price = 37500;
      finalName = '60s Hybrid 2D Commercial Video';
    } else if (lower.includes('preproduction') || lower.includes('storyboard')) {
      price = 17500;
      finalName = 'Complete Preproduction & Storyboard Suite';
    } else if (lower.includes('automation') || lower.includes('engine')) {
      price = 25000;
      finalName = 'Creator Content Engine & Automation Setup';
    } else if (lower.includes('15s') || lower.includes('teaser') || lower.includes('motion')) {
      price = 12500;
      finalName = '15s Concept Teaser & Motion Reel';
    }
  }

  ctx.cart.push({ test_name: finalName, lab: 'Indal KP Studio', price });
  await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1]);
  await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
}

// ---- Main handler ---------------------------------------------------------

async function handle(wa_id, input, state, msg) {
  const lang = state.context.lang || 'en';
  const ctx = Object.assign({}, state.context);
  if (!Array.isArray(ctx.cart)) ctx.cart = [];
  const step = state.step;
  const norm = (input || '').trim().toLowerCase();

  switch (step) {
    case 'entry': {
      if (norm === 'book_common' || norm.includes('common') || norm.includes('featured')) {
        await promptCommonList(wa_id, lang);
        await setState(wa_id, 'book', 'pick_common', ctx);
        return;
      }
      await sendText(wa_id, t('book.prompt.name', lang));
      await setState(wa_id, 'book', 'type_name', ctx);
      return;
    }

    case 'pick_common': {
      const match = norm.match(/^bt_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const pkg = POPULAR_PACKAGES[idx];
        if (pkg) {
          return enterTestSelection(wa_id, lang, pkg.name, ctx);
        }
      }
      return enterTestSelection(wa_id, lang, input, ctx);
    }

    case 'type_name': {
      return enterTestSelection(wa_id, lang, input, ctx);
    }

    case 'awaiting_more_or_proceed': {
      if (norm === 'cart_add_more' || norm.includes('add')) {
        await promptCommonList(wa_id, lang);
        await setState(wa_id, 'book', 'pick_common', ctx);
        return;
      }
      if (norm === 'cart_proceed' || norm.includes('proceed')) {
        await promptDate(wa_id, lang);
        await setState(wa_id, 'book', 'pick_date', ctx);
        return;
      }
      await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1] || { test_name: 'Package', price: 0 });
      return;
    }

    case 'pick_date': {
      if (norm === 'date_today') ctx.date = todayLabel();
      else if (norm === 'date_tomorrow') ctx.date = tomorrowLabel();
      else if (norm === 'date_pick') {
        await sendText(wa_id, t('book.prompt.date.custom', lang));
        await setState(wa_id, 'book', 'custom_date', ctx);
        return;
      } else {
        const parsed = parseDdMm(input);
        if (!parsed) {
          await promptDate(wa_id, lang);
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
      await promptLocation(wa_id, lang);
      await setState(wa_id, 'book', 'awaiting_location', ctx);
      return;
    }

    case 'awaiting_location': {
      if (msg && msg.type === 'location' && msg.location) {
        const loc = msg.location;
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        const label = (loc.name && String(loc.name).trim())
          || (loc.address && String(loc.address).trim())
          || ('Live location: ' + lat.toFixed(4) + ',' + lng.toFixed(4));
        ctx.pickup_address = label;
        ctx.maps_link = 'https://maps.google.com/?q=' + lat + ',' + lng;
        await sendText(wa_id, t('book.location.got_share', lang, { address: label }));
        await promptConfirm(wa_id, lang, ctx);
        await setState(wa_id, 'book', 'confirm', ctx);
        return;
      }
      if (norm === 'loc_send') {
        await sendText(wa_id, t('book.location.send_instruction', lang));
        await setState(wa_id, 'book', 'awaiting_location', ctx);
        return;
      }
      if (norm === 'loc_type') {
        await sendText(wa_id, t('book.location.text_prompt', lang));
        await setState(wa_id, 'book', 'awaiting_address_text', ctx);
        return;
      }
      if (norm === 'loc_visit') {
        ctx.pickup_address = 'https://indalkp.com';
        ctx.maps_link = 'https://indalkp.com';
        await sendText(wa_id, t('book.location.visit_lab', lang));
        await promptConfirm(wa_id, lang, ctx);
        await setState(wa_id, 'book', 'confirm', ctx);
        return;
      }
      await promptLocation(wa_id, lang);
      return;
    }

    case 'awaiting_address_text': {
      const text = (input || '').trim();
      if (!text) {
        await sendText(wa_id, t('book.location.text_prompt', lang));
        return;
      }
      ctx.pickup_address = text;
      ctx.maps_link = '';
      await sendText(wa_id, t('book.location.got_text', lang, { address: text }));
      await promptConfirm(wa_id, lang, ctx);
      await setState(wa_id, 'book', 'confirm', ctx);
      return;
    }

    case 'confirm': {
      if (norm === 'confirm_no' || norm.startsWith('cancel')) {
        await sendText(wa_id, t('book.cancelled', lang));
        await clearState(wa_id);
        return;
      }
      const id = newBookingId();
      const tests = cartNamesCsv(ctx.cart);
      const total = cartTotal(ctx.cart);
      const chosen_lab = 'Indal KP Studio';

      await appendBooking({
        booking_id: id,
        timestamp: new Date().toISOString(),
        wa_id: wa_id,
        customer_name: ctx.name || '',
        tests: tests,
        date: ctx.date || '',
        slot: ctx.slot || '',
        status: 'PENDING',
        notes: '',
        total: total,
        pickup_address: ctx.pickup_address || '',
        maps_link: ctx.maps_link || '',
        chosen_lab: chosen_lab,
        payment_method: 'UPI_PENDING',
        payment_ref: '',
      });

      const bookingPayload = {
        booking_id: id,
        customer_name: ctx.name || '',
        wa_id: wa_id,
        test_summary: tests,
        total_price: total,
        date: ctx.date || '',
        slot: ctx.slot || '',
        pickup_address: ctx.pickup_address || '',
        maps_link: ctx.maps_link || '',
        payment_method: 'UPI_PENDING',
        chosen_lab: chosen_lab,
      };
      sendBookingEmail(bookingPayload).catch((e) => console.error('email.threw', e && e.message));
      sendStaffAlerts(bookingPayload).catch((e) => console.error('wa.alerts.threw', e && e.message));

      await sendText(wa_id, t('book.success.with_lab', lang, {
        id: id,
        items: cartLines(ctx.cart),
        total: total,
        date: ctx.date,
        slot: ctx.slot,
        address: ctx.pickup_address || '—',
        chosen_lab: chosen_lab,
      }));
      await sendText(wa_id, t('book.staff_call_promise', lang));
      ctx.booking_id = id;
      ctx.total = total;
      await promptPaymentChoice(wa_id, lang, id, total);
      await setState(wa_id, 'book', 'awaiting_payment_choice', ctx);
      return;
    }

    case 'awaiting_payment_choice':
    case 'awaiting_payment_proof': {
      if (msg && msg.type === 'image' && msg.image && msg.image.id) {
        await updateBookingPayment(ctx.booking_id, 'UPI_CLAIMED', msg.image.id);
        await sendText(wa_id, t('book.payment.thanks_paid', lang));
        await clearState(wa_id);
        return;
      }
      if (norm === 'paid_upi') {
        await updateBookingPayment(ctx.booking_id, 'UPI_CLAIMED', '');
        await sendText(wa_id, t('book.payment.thanks_paid', lang));
        await clearState(wa_id);
        return;
      }
      if (norm === 'pay_at_collection') {
        await updateBookingPayment(ctx.booking_id, 'MILESTONE_COLLECTION', '');
        await sendText(wa_id, t('book.payment.collection_confirmed', lang, { total: ctx.total }));
        await clearState(wa_id);
        return;
      }
      await promptPaymentChoice(wa_id, lang, ctx.booking_id, ctx.total);
      return;
    }

    default: {
      return start(wa_id, lang, { name: ctx.name });
    }
  }
}

module.exports = {
  start,
  handle,
  POPULAR_PACKAGES,
  POPULAR_TESTS,
  parseDdMm,
  newBookingId,
  cartTotal,
  cartNamesCsv,
  cartLines,
  loadCatalog,
  lookupCatalogRow,
  chosenLabSummary,
  buildUpiLink,
  UPI_VPA,
};
