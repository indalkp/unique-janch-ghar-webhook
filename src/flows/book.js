/**
 * src/flows/book.js — "Book Test" flow with multi-test cart + sample-pickup
 * location capture (v2.2).
 *
 * Step machine:
 *   entry                     buttons [Common tests, Doctor referred, Type test name]
 *   pick_common               list with 10 popular tests
 *   type_name                 free-text "what test?"
 *   awaiting_more_or_proceed  buttons [Add Another, Proceed] (loops back on Add)
 *   pick_date                 buttons [Today, Tomorrow, Pick a date]
 *   custom_date               free-text DD/MM
 *   pick_slot                 buttons [Morning 7-10, Afternoon 10-12]
 *   awaiting_location         buttons [Send Location, Type Address, Visit Lab]   (v2.2)
 *   awaiting_address_text     free-text — full pickup address                     (v2.2)
 *   confirm                   buttons [Confirm, Cancel]
 *   done                      write ONE Bookings row (csv tests + total + addr)
 *
 * Inbound location messages: WhatsApp delivers msg.type === 'location' with
 * { latitude, longitude, name?, address? }. Router passes the full msg as the
 * 4th arg to handle() so this flow can read it without parsing the text body.
 *
 * State context shape:
 *   { lang, name, cart: [{name, price}], date, slot,
 *     pickup_address?, maps_link? }
 */

'use strict';

const { sendText, sendInteractiveList, sendInteractiveButtons } = require('../actions');
const { setState, clearState } = require('../state');
const { appendBooking } = require('../sheets');
const { sendBookingEmail } = require('../email');
const { sendStaffAlerts } = require('../wa-alerts');
const { t } = require('../lang');

// Top-of-list popular tests with INR prices.
const POPULAR_TESTS = [
  { name: 'CBC (Complete Blood Count)', price: 250 },
  { name: 'LFT (Liver Function Test)',  price: 500 },
  { name: 'KFT (Kidney Function Test)', price: 500 },
  { name: 'Lipid Profile',              price: 500 },
  { name: 'HbA1c',                      price: 450 },
  { name: 'TSH',                        price: 350 },
  { name: 'Vitamin D',                  price: 800 },
  { name: 'Vitamin B12',                price: 700 },
  { name: 'Urine R/M',                  price: 100 },
  { name: 'Blood Sugar Fasting',        price:  50 },
];

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

// --- Cart helpers ---------------------------------------------------------

function cartTotal(cart) {
  return (cart || []).reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

function cartNamesCsv(cart) {
  return (cart || []).map((it) => it.name).join(', ');
}

function cartLines(cart) {
  return (cart || [])
    .map((it) => ' ' + it.name + ' ' + (Number(it.price) || 0))
    .join('\n');
}

// --- Outbound prompt helpers ----------------------------------------------

async function promptCommonList(wa_id, lang) {
  const sections = [{
    title: t('book.list.header', lang),
    rows: POPULAR_TESTS.map((tt, i) => ({
      id: 'bt_' + i,
      title: tt.name.length > 24 ? tt.name.slice(0, 24) : tt.name,
      description: '' + tt.price,
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
    test: lastItem.name,
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

// v2.2 — sample-pickup location prompt with 3 buttons.
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

// --- Entry ----------------------------------------------------------------

async function start(wa_id, lang, seed = {}) {
  if (seed.test) {
    const cart = [{ name: seed.test, price: Number(seed.price) || 0 }];
    await promptAddedAndChoice(wa_id, lang, cart, cart[0]);
    await setState(wa_id, 'book', 'awaiting_more_or_proceed', {
      lang: lang,
      name: seed.name || '',
      cart: cart,
    });
    return;
  }
  await sendInteractiveButtons(wa_id, t('book.entry.body', lang), [
    { id: 'book_common',   title: t('book.entry.common', lang) },
    { id: 'book_referred', title: t('book.entry.referred', lang) },
    { id: 'book_type',     title: t('book.entry.type', lang) },
  ]);
  await setState(wa_id, 'book', 'entry', { lang: lang, name: seed.name || '', cart: [] });
}

// --- Main handler ---------------------------------------------------------

/**
 * @param {string} wa_id
 * @param {string} input  — extracted text/button-id
 * @param {object} state  — { flow, step, context }
 * @param {object} [msg]  — full inbound msg (for type==='location' etc.)
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
      let item;
      const m = norm.match(/^bt_(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        const t0 = POPULAR_TESTS[idx];
        item = t0 ? { name: t0.name, price: t0.price } : { name: input, price: 0 };
      } else {
        item = { name: input, price: 0 };
      }
      ctx.cart.push(item);
      await promptAddedAndChoice(wa_id, lang, ctx.cart, item);
      await setState(wa_id, 'book', 'awaiting_more_or_proceed', ctx);
      return;
    }

    case 'type_name': {
      const item = { name: (input || '').trim(), price: 0 };
      ctx.cart.push(item);
      await promptAddedAndChoice(wa_id, lang, ctx.cart, item);
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
      // v2.2: ask for sample-pickup location BEFORE confirm.
      await promptLocation(wa_id, lang);
      await setState(wa_id, 'book', 'awaiting_location', ctx);
      return;
    }

    case 'awaiting_location': {
      // Path A continuation: live location attachment arrives.
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
        // Stay in awaiting_location — listen for inbound location-type message.
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
      // Unrecognized — re-prompt.
      await promptLocation(wa_id, lang);
      return;
    }

    case 'awaiting_address_text': {
      // Path B: free-text address. Save and move on.
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
      // Defensive log so we can see what the button actually delivers.
      console.log(JSON.stringify({ event: 'book.confirm.input', wa_id: wa_id, buttonId: norm, raw: input }));
      // Cancel ONLY when the cancel button id arrives, or when the user types 'cancel'.
      if (norm === 'confirm_no' || norm.startsWith('cancel')) {
        await sendText(wa_id, t('book.cancelled', lang));
        await clearState(wa_id);
        return;
      }
      const id = newBookingId();
      const tests = cartNamesCsv(ctx.cart);
      const total = cartTotal(ctx.cart);
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
      });
      // v2.2 — fire-and-forget Resend notification. Logs success/failure but
      // never blocks the customer reply on email failure.
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
        payment_method: '',
      };
      // Fire-and-forget Resend email + WhatsApp staff alerts. Don't block reply.
      sendBookingEmail(bookingPayload).catch((e) => console.error('email.threw', e && e.message));
      sendStaffAlerts(bookingPayload).catch((e) => console.error('wa.alerts.threw', e && e.message));
      await sendText(wa_id, t('book.success', lang, {
        id: id,
        items: cartLines(ctx.cart),
        total: total,
        date: ctx.date,
        slot: ctx.slot,
        address: ctx.pickup_address || '—',
      }));
      await clearState(wa_id);
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
};
