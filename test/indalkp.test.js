/**
 * test/indalkp.test.js — Tests for Indal KP Studio WhatsApp Bot adaptation.
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.META_PHONE_NUMBER_ID = 'default_pnid_123';
process.env.META_ACCESS_TOKEN = 'mock_token';
process.env.SHEET_ID = 'mock_sheet_id';

const test = require('node:test');
const assert = require('node:assert');

const { t, detectLang } = require('../src/lang');
const { withPnid, pnidStorage } = require('../src/actions');
const { newBookingId, cartTotal, buildUpiLink, POPULAR_PACKAGES } = require('../src/flows/book');
const { CATEGORIES } = require('../src/flows/catalog');
const { CATALOG } = require('../src/catalog-data');

test('lang dictionary contains Indal KP Studio welcome message', () => {
  const enWelcome = t('welcome.text', 'en');
  const hiWelcome = t('welcome.text', 'hi');
  assert.match(enWelcome, /Indal KP Studio/);
  assert.match(enWelcome, /Creative Technologist/);
  assert.match(hiWelcome, /इन्दल केपी स्टूडियो/);
});

test('lang detects devanagari hindi correctly', () => {
  assert.strictEqual(detectLang('नमस्ते मुझे वीडियो बनवाना है'), 'hi');
  assert.strictEqual(detectLang('Hello I need a commercial video'), 'en');
});

test('newBookingId returns IKP prefix', () => {
  const id = newBookingId();
  assert.match(id, /^IKP-\d{6}-\d{4}$/);
});

test('catalog seed contains 4 packages with 50% launch prices', () => {
  assert.strictEqual(CATALOG.length, 4);
  const comm = CATALOG.find((c) => c.category === 'Commercial Video');
  assert.ok(comm);
  assert.strictEqual(comm.price_inr, 37500);

  const preprod = CATALOG.find((c) => c.category === 'Preproduction');
  assert.ok(preprod);
  assert.strictEqual(preprod.price_inr, 17500);

  const auto = CATALOG.find((c) => c.category === 'Creator Automation');
  assert.ok(auto);
  assert.strictEqual(auto.price_inr, 25000);

  const motion = CATALOG.find((c) => c.category === 'Motion Reel');
  assert.ok(motion);
  assert.strictEqual(motion.price_inr, 12500);
});

test('categories in catalog flow match 4 creative categories', () => {
  assert.strictEqual(CATEGORIES.length, 4);
  assert.strictEqual(CATEGORIES[0].key, 'Commercial Video');
  assert.strictEqual(CATEGORIES[1].key, 'Preproduction');
  assert.strictEqual(CATEGORIES[2].key, 'Creator Automation');
  assert.strictEqual(CATEGORIES[3].key, 'Motion Reel');
});

test('withPnid correctly stores and propagates incoming PNID in async context', async () => {
  await withPnid('9724508082_pnid_test', async () => {
    const store = pnidStorage.getStore();
    assert.strictEqual(store.pnid, '9724508082_pnid_test');
  });

  // outside context, store should be empty or undefined
  const outsideStore = pnidStorage.getStore();
  assert.ok(!outsideStore || !outsideStore.pnid);
});

test('buildUpiLink generates correct parameters', () => {
  const link = buildUpiLink('IKP-260918-1234', 37500);
  assert.match(link, /^upi:\/\/pay\?/);
  assert.match(link, /am=37500/);
  assert.match(link, /tn=IKP-260918-1234/);
  assert.match(link, /cu=INR/);
});
