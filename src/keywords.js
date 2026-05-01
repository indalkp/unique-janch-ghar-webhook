/**
 * src/keywords.js — Map customer text -> action keyword.
 *
 * Customers type in Hindi, English, Hinglish, often with typos. We normalize
 * the input (lowercase, trim, strip punctuation) and check each keyword's
 * variation list. For Latin tokens of length 4+, we also do a Levenshtein
 * fuzzy match (capped to floor(min_len/2)) so "rport" still routes to REPORT.
 *
 * Returns the canonical keyword (REPORT, BOOK, HOME, PRICE, MENU) or null.
 */

'use strict';

/** @typedef {'REPORT'|'BOOK'|'HOME'|'PRICE'|'MENU'} Keyword */

/** @type {Record<Keyword, string[]>} */
const KEYWORDS = {
  REPORT: ['report', 'reports', 'रिपोर्ट', 'रेपोर्ट', 'rport', 'rpt', 'रिपॉर्ट'],
  BOOK: ['book', 'booking', 'बुक', 'बुकिंग', 'appointment', 'apointment', 'बुक करें'],
  HOME: ['home', 'home collection', 'होम', 'होम कलेक्शन', 'होम विजिट', 'home visit'],
  PRICE: ['price', 'rate', 'rates', 'रेट', 'कीमत', 'दाम', 'cost', 'charges'],
  MENU: [
    'menu', 'मेनू', 'help', 'मदद', 'सहायता', 'hi', 'hello', 'नमस्ते',
    'namaste', 'hey', 'start', 'शुरू', 'options', 'list',
  ],
};

// Devanagari range — used to skip fuzzy matching for Hindi (typo distance is
// not meaningful at the character level for an unfamiliar script).
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Strip punctuation, collapse whitespace, lowercase. Keep Devanagari intact.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[!?.,;:'"()\[\]{}<>@#$%^&*_+=|\\/`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Iterative Levenshtein distance.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Fuzzy match: returns true if `word` is within capped distance of any variation.
 * Skipped for Devanagari and short words/variations (<4 chars).
 *
 * @param {string} word
 * @param {string[]} variations
 * @param {number} maxDistance
 * @returns {boolean}
 */
function fuzzyMatchesAny(word, variations, maxDistance) {
  if (word.length < 4) return false;
  if (DEVANAGARI.test(word)) return false;
  for (const v of variations) {
    if (v.length < 4 || DEVANAGARI.test(v)) continue;
    const cap = Math.min(maxDistance, Math.floor(Math.min(word.length, v.length) / 2));
    if (levenshtein(word, v) <= cap) return true;
  }
  return false;
}

/**
 * Resolve a customer message to a canonical keyword, or null if none.
 *
 * Strategy:
 *   1. Normalize text.
 *   2. For each keyword in priority order, exact-substring against any variation.
 *   3. Then fuzzy-match Latin tokens.
 *   4. First keyword whose pass succeeds wins.
 *
 * Priority: REPORT > BOOK > HOME > PRICE > MENU.
 *
 * @param {string} text
 * @returns {Keyword|null}
 */
function keywordToAction(text) {
  const norm = normalize(text);
  if (!norm) return null;

  const order = /** @type {Keyword[]} */ (['REPORT', 'BOOK', 'HOME', 'PRICE', 'MENU']);
  const tokens = norm.split(' ');

  // Pass 1: exact substring across all keywords.
  for (const kw of order) {
    const variations = KEYWORDS[kw].map((v) => v.toLowerCase());
    for (const v of variations) {
      if (norm.includes(v)) return kw;
    }
  }

  // Pass 2: fuzzy on tokens.
  for (const kw of order) {
    const variations = KEYWORDS[kw].map((v) => v.toLowerCase());
    for (const tok of tokens) {
      if (fuzzyMatchesAny(tok, variations, 2)) return kw;
    }
  }

  return null;
}

module.exports = {
  KEYWORDS,
  keywordToAction,
  normalize,
  levenshtein,
};
