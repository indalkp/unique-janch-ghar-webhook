/**
 * test/router.test.js — Keyword routing tests.
 *
 * We test the pure logic in keywords.js (no Meta or Sheet calls). The router
 * itself is exercised indirectly by feeding text through keywordToAction
 * and checking the canonical keyword.
 *
 * Run with: node --test test/router.test.js
 */

'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { keywordToAction, normalize, levenshtein } = require('../src/keywords');
const { extractText } = require('../src/router');

// ---------- normalize ----------
test('normalize lowercases and trims', () => {
  assert.strictEqual(normalize('  Hello WORLD  '), 'hello world');
});

test('normalize strips punctuation', () => {
  assert.strictEqual(normalize('Hello, World!'), 'hello world');
});

test('normalize keeps Devanagari', () => {
  assert.strictEqual(normalize('  नमस्ते  '), 'नमस्ते');
});

// ---------- levenshtein ----------
test('levenshtein identical → 0', () => {
  assert.strictEqual(levenshtein('report', 'report'), 0);
});

test('levenshtein one substitution → 1', () => {
  assert.strictEqual(levenshtein('report', 'rebort'), 1);
});

test('levenshtein two ops → 2', () => {
  assert.strictEqual(levenshtein('report', 'rport'), 1); // deletion
  assert.strictEqual(levenshtein('report', 'rprt'), 2); // 2 deletions
});

// ---------- REPORT ----------
test('REPORT exact English', () => {
  assert.strictEqual(keywordToAction('report'), 'REPORT');
});

test('REPORT with surrounding text', () => {
  assert.strictEqual(keywordToAction('I want my report please'), 'REPORT');
});

test('REPORT Devanagari', () => {
  assert.strictEqual(keywordToAction('रिपोर्ट चाहिए'), 'REPORT');
});

test('REPORT typo "rport"', () => {
  assert.strictEqual(keywordToAction('rport'), 'REPORT');
});

test('REPORT typo "rpt"', () => {
  assert.strictEqual(keywordToAction('rpt'), 'REPORT');
});

// ---------- BOOK ----------
test('BOOK exact', () => {
  assert.strictEqual(keywordToAction('book'), 'BOOK');
});

test('BOOK Hindi', () => {
  assert.strictEqual(keywordToAction('बुकिंग करनी है'), 'BOOK');
});

test('BOOK appointment variant', () => {
  assert.strictEqual(keywordToAction('want to book an appointment'), 'BOOK');
});

// ---------- HOME ----------
test('HOME exact', () => {
  assert.strictEqual(keywordToAction('home collection'), 'HOME');
});

test('HOME Hindi', () => {
  assert.strictEqual(keywordToAction('होम कलेक्शन'), 'HOME');
});

// ---------- PRICE ----------
test('PRICE rate variant', () => {
  assert.strictEqual(keywordToAction('what is the rate'), 'PRICE');
});

test('PRICE Hindi कीमत', () => {
  assert.strictEqual(keywordToAction('कीमत बताओ'), 'PRICE');
});

// ---------- MENU ----------
test('MENU greeting "hi"', () => {
  assert.strictEqual(keywordToAction('hi'), 'MENU');
});

test('MENU greeting "namaste"', () => {
  assert.strictEqual(keywordToAction('namaste'), 'MENU');
});

test('MENU help', () => {
  assert.strictEqual(keywordToAction('help me please'), 'MENU');
});

// ---------- no match ----------
test('no match returns null', () => {
  assert.strictEqual(keywordToAction('quantum entanglement'), null);
});

test('empty string returns null', () => {
  assert.strictEqual(keywordToAction(''), null);
});

test('non-string returns null', () => {
  assert.strictEqual(keywordToAction(123), null);
});

// ---------- extractText (router helper) ----------
test('extractText: text message', () => {
  const fixture = require('./fixtures/meta-message-text.json');
  const msg = fixture.entry[0].changes[0].value.messages[0];
  assert.strictEqual(extractText(msg), 'report');
});

test('extractText: button reply', () => {
  const fixture = require('./fixtures/meta-message-button.json');
  const msg = fixture.entry[0].changes[0].value.messages[0];
  // Button payload OR text — fixture sets payload "BOOK"
  assert.match(extractText(msg), /BOOK|Book/);
});

test('extractText: list reply', () => {
  const fixture = require('./fixtures/meta-message-list.json');
  const msg = fixture.entry[0].changes[0].value.messages[0];
  // List reply id is REPORT
  assert.strictEqual(extractText(msg), 'REPORT');
});

test('extractText: image returns "[image]"', () => {
  const msg = { type: 'image', image: { id: '123' } };
  assert.strictEqual(extractText(msg), '[image]');
});

// ---------- end-to-end on fixtures: text → keyword ----------
test('text fixture routes to REPORT', () => {
  const fixture = require('./fixtures/meta-message-text.json');
  const msg = fixture.entry[0].changes[0].value.messages[0];
  assert.strictEqual(keywordToAction(extractText(msg)), 'REPORT');
});

test('list fixture routes to REPORT', () => {
  const fixture = require('./fixtures/meta-message-list.json');
  const msg = fixture.entry[0].changes[0].value.messages[0];
  assert.strictEqual(keywordToAction(extractText(msg)), 'REPORT');
});
