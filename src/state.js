/**
 * src/state.js — Per-customer conversation state.
 *
 * State lives in a Sheet tab named "ConvoState" with columns:
 *   wa_id | current_flow | current_step | context_json | updated_at
 *
 * We keep state in the Sheet (not in memory) because Cloud Functions Gen 2
 * scales to multiple instances — anything kept on the heap is lost the
 * moment a different instance handles the customer's next message.
 *
 * To keep API calls cheap we cache reads in-memory for 30 seconds. A 30 s
 * miss-window is fine for a chat bot — customers don't double-tap that fast,
 * and any stale read is corrected by the very next setState() write.
 *
 * Public API:
 *   getState(wa_id)                              -> {flow, step, context}
 *   setState(wa_id, flow, step, context)         -> upsert + cache update
 *   clearState(wa_id)                            -> set flow=idle
 *   recordRateLimit(wa_id)                       -> push timestamp into window
 *   isRateLimited(wa_id, max=20, windowMs=60000) -> boolean
 */

'use strict';

const { config } = require('./config');
const { log } = require('./logger');

const TAB = 'ConvoState';
const READ_TTL_MS = 30 * 1000;

// In-memory caches. Survive only within a single Cloud Function instance —
// fine: stale reads are corrected on the next write.
const stateCache = new Map();        // wa_id -> { state, expires }
const rateLimitWindows = new Map();  // wa_id -> [timestamp, ...]

// Sheets client lazy-init. Independent of src/sheets.js so this module can
// be unit-tested without pulling the full sheets module.
let _sheetsClient = null;
async function getClient() {
  if (_sheetsClient) return _sheetsClient;
  // eslint-disable-next-line global-require
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

/**
 * Read every row from ConvoState. The tab is small (one row per active
 * customer) so a full read is cheaper than a per-cell query.
 * @returns {Promise<{rows: Array<Array<string>>, header: Array<string>}>}
 */
async function readAll() {
  const sheets = await getClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: `${TAB}!A1:E`,
    });
    const values = res.data.values || [];
    const header = values[0] || ['wa_id', 'current_flow', 'current_step', 'context_json', 'updated_at'];
    return { header, rows: values.slice(1) };
  } catch (err) {
    log.error('state.read.failed', { error: err.message });
    return { header: [], rows: [] };
  }
}

/**
 * Find a row index (1-based, including header) for a wa_id. Returns -1 if absent.
 * @param {string} wa_id
 * @returns {Promise<{rowIndex:number, row:Array<string>|null}>}
 */
async function findRow(wa_id) {
  const { rows } = await readAll();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === wa_id) {
      // +2 because Sheet rows are 1-indexed and row 1 is the header.
      return { rowIndex: i + 2, row: rows[i] };
    }
  }
  return { rowIndex: -1, row: null };
}

/**
 * Pull state from cache (if fresh) or Sheet.
 * Returns the default idle state if the wa_id has never been seen.
 *
 * @param {string} wa_id
 * @returns {Promise<{flow:string, step:string|null, context:Object}>}
 */
async function getState(wa_id) {
  const cached = stateCache.get(wa_id);
  if (cached && cached.expires > Date.now()) {
    return cached.state;
  }

  const { row } = await findRow(wa_id);
  let state;
  if (!row) {
    state = { flow: 'idle', step: null, context: {} };
  } else {
    let context = {};
    try {
      context = row[3] ? JSON.parse(row[3]) : {};
    } catch (err) {
      // Bad JSON in the Sheet — log + recover so a single bad cell can't brick
      // the customer's entire conversation.
      log.warn('state.context_parse_failed', { wa_id, error: err.message });
    }
    state = {
      flow: row[1] || 'idle',
      step: row[2] || null,
      context,
    };
  }

  stateCache.set(wa_id, { state, expires: Date.now() + READ_TTL_MS });
  return state;
}

/**
 * Upsert state for a wa_id. Updates cache immediately so the next read
 * within 30 s sees the new value (no stale flow on rapid follow-ups).
 *
 * @param {string} wa_id
 * @param {string} flow
 * @param {string|null} step
 * @param {Object} context
 */
async function setState(wa_id, flow, step, context = {}) {
  const sheets = await getClient();
  const updatedAt = new Date().toISOString();
  const contextJson = JSON.stringify(context || {});
  const newRow = [wa_id, flow, step || '', contextJson, updatedAt];

  try {
    const { rowIndex } = await findRow(wa_id);
    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: config.SHEET_ID,
        range: `${TAB}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRow] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.SHEET_ID,
        range: `${TAB}!A${rowIndex}:E${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });
    }
    log.info('state.set.ok', { wa_id, flow, step });
  } catch (err) {
    log.error('state.set.failed', { wa_id, error: err.message });
    // Do not rethrow — Sheet hiccup must never break the customer reply.
  }

  stateCache.set(wa_id, {
    state: { flow, step, context: context || {} },
    expires: Date.now() + READ_TTL_MS,
  });
}

/**
 * Reset the conversation back to the menu.
 * @param {string} wa_id
 */
async function clearState(wa_id) {
  return setState(wa_id, 'idle', null, {});
}

/**
 * Sliding-window rate-limit recorder. Pushes the current timestamp onto the
 * customer's window and trims anything older than `windowMs`.
 *
 * @param {string} wa_id
 * @param {number} [windowMs]
 */
function recordRateLimit(wa_id, windowMs = 60 * 1000) {
  const now = Date.now();
  const arr = rateLimitWindows.get(wa_id) || [];
  const fresh = arr.filter((t) => now - t < windowMs);
  fresh.push(now);
  rateLimitWindows.set(wa_id, fresh);
}

/**
 * Check whether the customer has exceeded the rate limit.
 * Default: 10 messages per 60 seconds.
 *
 * @param {string} wa_id
 * @param {number} [max]
 * @param {number} [windowMs]
 * @returns {boolean}
 */
function isRateLimited(wa_id, max = 20, windowMs = 60 * 1000) {
  const arr = rateLimitWindows.get(wa_id) || [];
  const now = Date.now();
  const fresh = arr.filter((t) => now - t < windowMs);
  rateLimitWindows.set(wa_id, fresh);
  return fresh.length >= max;
}

module.exports = {
  getState,
  setState,
  clearState,
  recordRateLimit,
  isRateLimited,
  _stateCache: stateCache,
  _rateLimitWindows: rateLimitWindows,
};
