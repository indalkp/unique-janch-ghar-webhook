/**
 * src/config.js — Environment variable loader + validator.
 *
 * Reads every secret/setting we need from process.env at cold-start time
 * and fails fast if anything is missing. Better to crash on deploy than
 * to crash 30 minutes later on the first real customer message.
 *
 * Required env vars (set via .env.yaml on `gcloud functions deploy`):
 *   META_VERIFY_TOKEN     — string you pick; must match what you paste into
 *                           the Meta Webhook Configuration page.
 *   META_APP_SECRET       — App Dashboard → Settings → Basic → App Secret.
 *                           Used to verify x-hub-signature-256 on every POST.
 *   META_ACCESS_TOKEN     — System User permanent token (preferred) or the
 *                           24-hour test token. Used to call graph.facebook.com.
 *   META_PHONE_NUMBER_ID  — WhatsApp Manager → API Setup → Phone Number ID.
 *   SHEET_ID              — Google Sheet ID (the long string in the URL).
 *
 * Optional:
 *   GRAPH_API_VERSION     — defaults to v18.0
 *   TZ                    — defaults to Asia/Kolkata
 *   AFTERHOURS_START      — 24h hour when "after-hours" reply kicks in (default 21)
 *   AFTERHOURS_END        — 24h hour when normal flow resumes (default 8)
 *   LAB_NAME              — display name in messages (default "Unique Janch Ghar")
 */

'use strict';

/**
 * @typedef {Object} Config
 * @property {string} META_VERIFY_TOKEN
 * @property {string} META_APP_SECRET
 * @property {string} META_ACCESS_TOKEN
 * @property {string} META_PHONE_NUMBER_ID
 * @property {string} SHEET_ID
 * @property {string} GRAPH_API_VERSION
 * @property {string} TZ
 * @property {number} AFTERHOURS_START
 * @property {number} AFTERHOURS_END
 * @property {string} LAB_NAME
 */

const REQUIRED = [
  'META_VERIFY_TOKEN',
  'META_APP_SECRET',
  'META_ACCESS_TOKEN',
  'META_PHONE_NUMBER_ID',
  'SHEET_ID',
];

/** @returns {Config} */
function load() {
  const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === '');
  if (missing.length > 0) {
    // This throws at module load, which means GCF marks the deploy as failed.
    // That's the goal — surface the problem at deploy time.
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return {
    META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID,
    SHEET_ID: process.env.SHEET_ID,
    GRAPH_API_VERSION: process.env.GRAPH_API_VERSION || 'v18.0',
    TZ: process.env.TZ || 'Asia/Kolkata',
    AFTERHOURS_START: parseInt(process.env.AFTERHOURS_START || '21', 10),
    AFTERHOURS_END: parseInt(process.env.AFTERHOURS_END || '8', 10),
    LAB_NAME: process.env.LAB_NAME || 'Unique Janch Ghar',
  };
}

// In test mode we let tests set their own env. We only validate on real load.
const config = process.env.NODE_ENV === 'test' ? /** @type {Config} */ ({}) : load();

module.exports = { config, load };
