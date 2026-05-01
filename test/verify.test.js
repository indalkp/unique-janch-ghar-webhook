/**
 * test/verify.test.js — HMAC signature verification tests.
 * Run with: node --test test/verify.test.js
 */

'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { verifySignature } = require('../src/verify');

const APP_SECRET = 'test_app_secret_value_xyz';

/** Helper: build a valid signature header for given body. */
function sign(body) {
  const hmac = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return `sha256=${hmac}`;
}

test('valid signature returns true', () => {
  const body = Buffer.from('{"hello":"world"}');
  const header = sign(body);
  assert.strictEqual(verifySignature(body, header, APP_SECRET), true);
});

test('tampered body returns false', () => {
  const body = Buffer.from('{"hello":"world"}');
  const header = sign(body);
  const tampered = Buffer.from('{"hello":"WORLD"}');
  assert.strictEqual(verifySignature(tampered, header, APP_SECRET), false);
});

test('wrong secret returns false', () => {
  const body = Buffer.from('{"x":1}');
  const header = sign(body);
  assert.strictEqual(verifySignature(body, header, 'different_secret'), false);
});

test('missing header returns false', () => {
  const body = Buffer.from('{}');
  assert.strictEqual(verifySignature(body, undefined, APP_SECRET), false);
});

test('header without sha256= prefix returns false', () => {
  const body = Buffer.from('{}');
  const hmac = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  assert.strictEqual(verifySignature(body, hmac, APP_SECRET), false); // no prefix
});

test('mismatched length returns false (no throw)', () => {
  const body = Buffer.from('{}');
  assert.strictEqual(verifySignature(body, 'sha256=abcd', APP_SECRET), false);
});

test('works with string body (not just Buffer)', () => {
  const body = '{"a":"b"}';
  const header = sign(body);
  assert.strictEqual(verifySignature(body, header, APP_SECRET), true);
});

test('empty body still verifiable', () => {
  const body = Buffer.from('');
  const header = sign(body);
  assert.strictEqual(verifySignature(body, header, APP_SECRET), true);
});
