/**
 * src/flows/book.js — "Book Test" flow with multi-test cart, sample-pickup
 * location capture, and lab-aware pricing + UPI payment (v3.0).
 *
 * v3.0 architectural pivot:
 *   UJG no longer "runs the test". UJG is a *facilitator* — every test in the
 *   cart is shipped either to Thyrocare or Lal PathLabs. The flow now:
 *     1. After test pick → look up Catalog row → if BOTH labs offer the test,
 *        ask "Which lab?" with [Thyrocare ₹X] [Lal PathLabs ₹Y].
 *     2. If only one lab offers it → auto-select that lab, no prompt.
 *     3. If NEITHER lists a price → say "Price on call. Reply STAFF."
 *     4. Cart entry shape becomes {test_name, lab, price}.
 *     5. After cart confirm → write Bookings row with chosen_lab populated
 *        + payment_method=UPI_PENDING, then send UPI deep link + buttons:
 *        [✓ I've Paid] [💵 Pay at Collection]
 *     6. Customer reply ("I've Paid" or screenshot) → UPI_CLAIMED.
 *
 * Step machine (v3.0):
 *   entry                        buttons [Common tests, Doctor referred, Type test name]
 *   pick_common                  list with 10 popular tests
 *   type_name                    free-text "what test?"
 *   pick_lab                     buttons [Thyrocare ₹X] [Lal PathLabs ₹Y]   ← NEW
 *   awaiting_more_or_proceed     buttons [Add Another, Proceed]
 *   pick_date                    buttons [Today, Tomorrow, Pick a date]
 *   custom_date                  free-text DD/MM
 *   pick_slot                    buttons [Morning 7-10, Afternoon 10-12]
 *   awaiting_location            buttons [Send Location, Type Address, Visit Lab]
 *   awaiting_address_text        free-text — full pickup address
 *   confirm                      buttons [Confirm, Cancel]
 *   awaiting_payment_choice      buttons [I've Paid] [Pay at Collection]    ← NEW
 *   awaiting_payment_proof       (optional) listens for image/text confirmation
 *   done                         row already written; UPI status updated
 *
 * Catalog tab schema this flow reads (cols A–J):
 *   A=category, B=test_name, C=thyrocare_test_name, D=thyrocare_price,
 *   E=lalpathlabs_test_name, F=lalpathlabs_price, G=sample_required,
 *   H=fasting_hours, I=turnaround_hours, J=notes
 *
 * Catalog rows are cached in-process for 5 minutes.
 *
 * State context shape (v3.0):
 *   { lang, name,
 *     cart: [{test_name, lab, price}],
 *     date, slot,
 *     pickup_address?, maps_link?,
 *     _pending_test?: {test_name, thyrocare_price, lal_price, ...}, // during pick_lab
 *     booking_id?, total? }                                          // during awaiting_payment_*
 */

'use strict';

const { sendText, sendInteractiveList, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { appendBooking, updateBookingPayment } = require('../sheets');
const { sendBookingEmail } = require('../email');
const { sendStaffAlerts } = require('../wa-alerts');
const { bridgeGet } = require('../sheets-bridge');
const { t } = require('../lang');

// Top-of-list popular tests. Used as the fallback display only — actual prices
// come from the Catalog tab (per-lab) once the customer picks a row.
const POPULAR_TESTS = [
  { name: 'CBC (Complete Blood Count)' },
  { name: 'LFT (Liver Function Test)'  },
  { name: 'KFT (Kidney Function Test)' },
  { name: 'Lipid Profile'              },
  { name: 'HbA1c'                      },
  { name: 'TSH'                        },
  { name: 'Vitamin D'                  },
  { name: 'Vitamin B12'                },
  { name: 'Urine R/M'                  },
  { name: 'Blood Sugar Fasting'        },
];

// UPI PSP target — UJG's PhonePe-linked number-bound VPA.
const UPI_VPA = '9471991032-3@ybl';
const UPI_PAYEE_NAME = 'Unique Janch Ghar';

// ---- Catalog cache --------------------------------------------------------

const CATALOG_CACHE = { rows: null, fetchedAt: 0 };
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** Pull all Catalog rows via Apps Script bridge. Returns [] on failure. */
async function loadCatalog() {
  const now = Date.now();
  if (CATALOG_CACHE.rows && (now - CATALOG_CACHE.fetchedAt) < CATALOG_TTL_MS) {
    return CATALOG_CACHE.rows;
  }
  try {
    const r = await bridgeGet('read', { sheet: 'Catalog', range: 'A2:J200' });
    const data = (r && r.data) ? r.data : [];
    CATALOG_CACHE.rows = data.map((row) => ({
      category:        row[0] || '',
      test_name:       row[1] || '',
      thyrocare_name:  row[2] || '',
      thyrocare_price: parseInt(row[3], 10) || 0,
      lal_name:        row[4] || '',
      lal_price:       parseInt(row[5], 10) || 0,
      sample:          row[6] || '',
      fasting:         row[7] || '',
      tat:             row[8] || '',
      notes:           row[9] || '',
    }));
    CATALOG_CACHE.fetchedAt = now;
    return CATALOG_CACHE.rows;
  } catch (e) {
    console.warn('book.catalog.load_failed', e && e.message);
    return CATALOG_CACHE.rows || [];
  }
}

/** Find a Catalog row matching the given test name (case-insensitive). */
async function lookupCatalogRow(test_name) {
  if (!test_name) return null;
  const needle = String(test_name).trim().toLowerCase();
  const rows = await loadCatalog();
  return rows.find((r) =>
    r.test_name.trim().toLowerCase() === needle
    || r.thyrocare_name.trim().toLowerCase() === needle
    || r.lal_name.trim().toLowerCase() === needle
  ) || null;
}

// ---- Helpers (booking id, dates, cart math) -------------------------------

function newBookingId() {
  const d = new Date();
  const yymmdd = String(d.getFullYear()).slice(2)
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return 'UJG-' + yymmdd + '-' + rand;
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
  return (cart || []).map((it) => it.test_name + ' (' + (it.lab || '?') + ')').join(', ');
}

function cartLines(cart) {
  return (cart || [])
    .map((it) => ' ' + it.test_name + ' [' + (it.lab || '?') + '] ' + (Number(it.price) || 0))
    .join('\n');
}

/**
 * Decide chosen_lab summary value for the Bookings row:
 *   - all entries same lab → that lab name
 *   - mixed → "MIXED"
 *   - empty → ""
 */
function chosenLabSummary(cart) {
  if (!cart || !cart.length) return '';
  const labs = new Set(cart.map((it) => it.lab));
  if (labs.size === 1) return cart[0].lab;
  return 'MIXED';
}

/** Build the upi://pay deep link. */
function buildUpiLink(bookingId, total) {
  const params = new URLSearchParams({
    pa: UPI_VPA,
    pn: UPI_PAYEE_NAME,
    am: String(total),
    tn: 'UJG-' + bookingId,
    cu: 'INR',
  });
  return 'upi://pay?' + params.toString();
}

// ---- Outbound prompt helpers ----------------------------------------------

/**
 * v3.0 — format the per-row price hint shown in the Common Tests list.
 *   - both labs offer  → "₹180-250"  (low-high)
 *   - one lab only     → "₹250"
 *   - neither lists it → "Price on call"
 * Description field is capped at 72 chars by WhatsApp; we stay well under.
 */
function formatPriceRange(catalogRow, lang) {
  if (!catalogRow) return t('book.list.row_oncall', lang);
  const tp = catalogRow.thyrocare_price > 0 ? catalogRow.thyrocare_price : null;
  const lp = catalogRow.lal_price > 0 ? catalogRow.lal_price : null;
  if (tp && lp) {
    const lo = Math.min(tp, lp);
    const hi = Math.max(tp, lp);
    return lo === hi ? ('₹' + lo) : ('₹' + lo + '-' + hi);
  }
  if (tp) return '₹' + tp;
  if (lp) return '₹' + lp;
  return t('book.list.row_oncall', lang);
}

/**
 * v3.0 — build the Common Tests list, looking up each test in Catalog so the
 * description shows a price range. Catalog reads are cached for 5 minutes.
 */
async function promptCommonList(wa_id, lang) {
  // Pre-resolve all catalog rows in parallel before building the sections.
  const lookups = await Promise.all(
    POPULAR_TESTS.map((tt) => lookupCatalogRow(tt.name).catch(() => null))
  );
  const sections = [{
    title: t('book.list.header', lang),
    rows: POPULAR_TESTS.map((tt, i) => ({
      id: 'bt_' + i,
      title: tt.name.length > 24 ? tt.name.slice(0, 24) : tt.name,
      description: formatPriceRange(lookups[i], lang),
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

/** v3.0 — show the lab picker if both labs offer the test. */
async function promptPickLab(wa_id, lang, catalogRow) {
  const tp = catalogRow.thyrocare_price;
  const lp = catalogRow.lal_price;
  const body = t('book.pricing.both_labs', lang, {
    test: catalogRow.test_name,
    tp, lp,
  }) + '\n\n' + t('book.pick_lab.prompt', lang);
  await sendInteractiveButtons(wa_id, body, [
    { id: 'lab_thyrocare', title: t('book.pick_lab.btn_thyrocare', lang, { tp }) },
    { id: 'lab_lal',       title: t('book.pick_lab.btn_lal',       lang, { lp }) },
  ]);
}

async function promptAddedAndChoice(wa_id, lang, cart, lastItem) {
  const total = cartTotal(cart);
  const body = t('cart.added', lang, {
    test: lastItem.test_name + ' (' + (lastItem.lab || '?') + ')',
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

/** v3.0 — UPI prompt. Sends the deep link as text, plus the action buttons. */
async function promptPaymentChoice(wa_id, lang, bookingId, total) {
  const upiLink = buildUpiLink(bookingId, total);
  const body = t('book.payment.upi_text', lang, {
    total, id: bookingId, vpa: UPI_VPA, link: upiLink,
  });
  // Send the UPI link as a plain text message first (so phones recognise it).
  await sendText(wa_id, body);
  // Then the choice buttons.
  await sendInteractiveButtons(wa_id, t('book.payment.prompt', lang, { total }), [
    { id: 'paid_upi',          title: t('book.payment.btn_paid', lang) },
    { id: 'pay_at_collection', title: t('book.payment.btn_collection', lang) },
  ]);
}

// ---- Entry ----------------------------------------------------------------

async function start(wa_id, lang, seed = {}) {
  if (seed.test) {
    // Seed path used by catalogFlow → "Book This Test". We re-look up in
    // Catalog so the v3.0 pick_lab branch fires correctly.
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

/**
 * v3.0 — given a chosen test name, decide whether to ask "which lab?" or
 * auto-select. Branches:
 *   - Both labs offer → setState pick_lab, stash _pending_test, show buttons.
 *   - Only one lab    → auto-add to cart, prompt addedAndChoice.
 *   - Neither price   → send "price on call" message, leave state as entry.
 *   - No catalog row  → fall back: add at price 0, treat as Thyrocare default.
 */
async function enterTestSelection(wa_id, lang, test_name, ctx) {
  const row = await lookupCatalogRow(test_name);
  if (!row) {
    // Unknown test — keep legacy behaviour: add at 0, mark lab unknown,
    // staff will reach out manually. (Pricing flow's "neither" message.)
    await sendText(wa_id, t('book.pricing.neither', lang, { test: test_name }));
    // Add as a placeholder so cart isn't empty; staff can correct.
    ctx.cart.push({ test_name, lab: 'UNKNOWN', price: 0 });
    await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1]);
    await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
    return;
  }

  const hasThyrocare = row.thyrocare_price > 0;
  const hasLal = row.lal_price > 0;

  if (hasThyrocare && hasLal) {
    ctx._pending_test = {
      test_name: row.test_name,
      thyrocare_price: row.thyrocare_price,
      lal_price: row.lal_price,
    };
    await promptPickLab(wa_id, lang, row);
    await setState(wa_id, 'book', 'pick_lab', ctx);
    return;
  }

  if (hasThyrocare) {
    await sendText(wa_id, t('book.pricing.thyrocare_only', lang, {
      test: row.test_name, tp: row.thyrocare_price,
    }));
    ctx.cart.push({ test_name: row.test_name, lab: 'THYROCARE', price: row.thyrocare_price });
    await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1]);
    await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
    return;
  }

  if (hasLal) {
    await sendText(wa_id, t('book.pricing.lal_only', lang, {
      test: row.test_name, lp: row.lal_price,
    }));
    ctx.cart.push({ test_name: row.test_name, lab: 'LALPATHLABS', price: row.lal_price });
    await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1]);
    await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
    return;
  }

  // Neither lab lists this test.
  await sendText(wa_id, t('book.pricing.neither', lang, { test: row.test_name }));
  // Don't push anything; let user pick again.
  await promptCommonList(wa_id, lang);
  await setState(wa_id, 'book', 'pick_common', ctx);
}

// ---- Main handler ---------------------------------------------------------

/**
 * @param {string} wa_id
 * @param {string} input  — extracted text/button-id
 * @param {object} state  — { flow, step, context }
 * @param {object} [msg]  — full inbound msg (for type==='location'/'image')
 */
async function handle(wa_id, input, state, msg) {
  const lang = state.context.lang || 'en';
  const ctx = Object.assign({}, state.context);
  if (!Array.isArray(ctx.cart)) ctx.cart = [];
  const step = state.step;
  const norm = (input || '').trim().toLowerCase();

  switch (step) {
    case 'entry': {
      if (norm === 'book_common' || norm.includes('common')) {
        await promptCommonList(wa_id, lang);
        await setState(wa_id, 'book', 'pick_common', ctx);
        return;
      }
      await sendText(wa_id, t('book.prompt.name', lang));
      await setState(wa_id, 'book', 'type_name', ctx);
      return;
    }

    case 'pick_common': {
      let test_name;
      const m = norm.match(/^bt_(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        const t0 = POPULAR_TESTS[idx];
        test_name = t0 ? t0.name : input;
      } else {
        test_name = input;
      }
      return enterTestSelection(wa_id, lang, test_name, ctx);
    }

    case 'type_name': {
      const test_name = (input || '').trim();
      if (!test_name) {
        await sendText(wa_id, t('book.prompt.name', lang));
        return;
      }
      return enterTestSelection(wa_id, lang, test_name, ctx);
    }

    // v3.0 — lab picker.
    case 'pick_lab': {
      const pending = ctx._pending_test;
      if (!pending) {
        // State drift; restart cleanly.
        return start(wa_id, lang, { name: ctx.name });
      }
      let lab = null;
      let price = 0;
      if (norm === 'lab_thyrocare' || norm.startsWith('lab_thyrocare')) {
        lab = 'THYROCARE';
        price = pending.thyrocare_price;
      } else if (norm === 'lab_lal' || norm.startsWith('lab_lal')) {
        lab = 'LALPATHLABS';
        price = pending.lal_price;
      } else {
        // Re-prompt on garbled input.
        const row = await lookupCatalogRow(pending.test_name);
        if (row) await promptPickLab(wa_id, lang, row);
        return;
      }
      ctx.cart.push({ test_name: pending.test_name, lab, price });
      delete ctx._pending_test;
      await promptAddedAndChoice(wa_id, lang, ctx.cart, ctx.cart[ctx.cart.length - 1]);
      await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
      return;
    }

    case 'awaiting_more_or_proceed': {
      if (norm === 'cart_add_more' || norm.includes('add')) {
        await promptCommonList(wa_id, lang);
        await setState(wa_id, 'book', 'pick_common', ctx);
        return;
      }
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
        ctx.pickup_address = 'self-visit';
        ctx.maps_link = '';
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
      console.log(JSON.stringify({ event: 'book.confirm.input', wa_id: wa_id, buttonId: norm, raw: input }));
      if (norm === 'confirm_no' || norm.startsWith('cancel')) {
        await sendText(wa_id, t('book.cancelled', lang));
        await clearState(wa_id);
        return;
      }
      const id = newBookingId();
      const tests = cartNamesCsv(ctx.cart);
      const total = cartTotal(ctx.cart);
      const chosen_lab = chosenLabSummary(ctx.cart);

      // v3.0 — write Bookings row with chosen_lab + payment_method=UPI_PENDING.
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

      // v3.0 — instead of clearing state, advance to payment choice.
      await sendText(wa_id, t('book.success.with_lab', lang, {
        id: id,
        items: cartLines(ctx.cart),
        total: total,
        date: ctx.date,
        slot: ctx.slot,
        address: ctx.pickup_address || '—',
        chosen_lab: chosen_lab,
      }));
      ctx.booking_id = id;
      ctx.total = total;
      await promptPaymentChoice(wa_id, lang, id, total);
      await setState(wa_id, 'book', 'awaiting_payment_choice', ctx);
      return;
    }

    case 'awaiting_payment_choice':
    case 'awaiting_payment_proof': {
      // Image inbound during payment step → treat as payment screenshot.
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
        await updateBookingPayment(ctx.booking_id, 'CASH_AT_COLLECTION', '');
        await sendText(wa_id, t('book.payment.collection_confirmed', lang, { total: ctx.total }));
        await clearState(wa_id);
        return;
      }
      // Re-prompt on garbled input.
      await promptPaymentChoice(wa_id, lang, ctx.booking_id, ctx.total);
      return;
    }

    default: {
      return start(wa_id, lang, { name: ctx.name });
    }
  }
}

module.exports = {
  start: start,
  handle: handle,
  POPULAR_TESTS: POPULAR_TESTS,
  parseDdMm: parseDdMm,
  newBookingId: newBookingId,
  cartTotal: cartTotal,
  cartNamesCsv: cartNamesCsv,
  cartLines: cartLines,
  // v3.0 exports for tests
  loadCatalog: loadCatalog,
  lookupCatalogRow: lookupCatalogRow,
  chosenLabSummary: chosenLabSummary,
  buildUpiLink: buildUpiLink,
  UPI_VPA: UPI_VPA,
};
