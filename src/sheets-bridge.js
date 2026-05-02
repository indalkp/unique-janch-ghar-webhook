/**
 * src/sheets-bridge.js — Helper layer that uses the existing Apps Script
 * web-app bridge for ad-hoc Sheet ops (read/find/write specific cells).
 *
 * Why a bridge instead of direct Sheets API for these helpers?
 *   - Some ops (write to specific A1 range, find row by ID then update specific
 *     cells) are awkward via raw values.append. The bridge already exposes
 *     read/write actions that match what we need.
 *   - Reuses an already-deployed bridge that has the right SA permissions.
 *
 * Env vars:
 *   BRIDGE_URL     — Apps Script web-app /exec URL.
 *   BRIDGE_SECRET  — shared secret in URL ?secret=...
 *
 * If either env var is missing, helpers gracefully no-op (return null/false)
 * so the bot still functions for non-bridge paths.
 */

'use strict';

const { log } = require('./logger');

function getBridge() {
  const url = process.env.BRIDGE_URL || '';
  const secret = process.env.BRIDGE_SECRET || '';
  const sheetId = process.env.SHEET_ID || '';
  if (!url || !secret || !sheetId) return null;
  return { url, secret, sheetId };
}

async function bridgeGet(action, params = {}) {
  const b = getBridge();
  if (!b) return null;
  const qs = new URLSearchParams({
    secret: b.secret,
    action: action,
    id: b.sheetId,
    ...params,
  });
  try {
    const r = await fetch(b.url + '?' + qs.toString());
    return await r.json();
  } catch (e) {
    log.warn('bridge.get.failed', { action, error: e.message });
    return { error: e.message };
  }
}

async function bridgePost(action, urlParams, body) {
  const b = getBridge();
  if (!b) return null;
  const qs = new URLSearchParams({
    secret: b.secret,
    action: action,
    id: b.sheetId,
    ...urlParams,
  });
  try {
    const r = await fetch(b.url + '?' + qs.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    log.warn('bridge.post.failed', { action, error: e.message });
    return { error: e.message };
  }
}

module.exports = { bridgeGet, bridgePost };
