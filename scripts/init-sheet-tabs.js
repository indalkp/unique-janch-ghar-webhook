#!/usr/bin/env node
/**
 * scripts/init-sheet-tabs.js
 *
 * Idempotent: creates Bookings, Catalog, ConvoState, Handoff tabs in the
 * configured Google Sheet, writes their headers, and seeds Catalog with the
 * 30 starter tests from src/catalog-data.js.
 *
 * Run after `npm install`:
 *   SHEET_ID=<your-sheet-id> node scripts/init-sheet-tabs.js
 *
 * Auth: Application Default Credentials (ADC). Either:
 *   1. `gcloud auth application-default login` on your dev machine, OR
 *   2. Run inside Cloud Shell (already authenticated), OR
 *   3. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path.
 *
 * Whichever account you use must have Editor access to the Sheet.
 *
 * Re-runnable: existing tabs are skipped (header check only). Catalog seed
 * runs ONLY if the tab is empty — so editing prices in the Sheet is safe.
 */

'use strict';

const { google } = require('googleapis');
const { CATALOG } = require('../src/catalog-data');

const SHEET_ID = process.env.SHEET_ID;
if (!SHEET_ID) {
  console.error('Missing SHEET_ID env var. Aborting.');
  process.exit(1);
}

// Tab definitions — name + headers.
const TABS = [
  {
    name: 'Bookings',
    headers: ['booking_id', 'timestamp', 'wa_id', 'customer_name', 'test', 'date', 'slot', 'status', 'notes'],
    seed: null,
  },
  {
    name: 'Catalog',
    headers: ['category', 'test_name', 'price_inr', 'sample_required', 'fasting_hours', 'turnaround_hours', 'notes'],
    seed: () => CATALOG.map((r) => [
      r.category, r.test_name, r.price_inr, r.sample_required, r.fasting_hours, r.turnaround_hours, r.notes,
    ]),
  },
  {
    name: 'ConvoState',
    headers: ['wa_id', 'current_flow', 'current_step', 'context_json', 'updated_at'],
    seed: null,
  },
  {
    name: 'Handoff',
    headers: ['timestamp', 'wa_id', 'customer_name', 'preferred_callback_time', 'status', 'notes'],
    seed: null,
  },
];

async function getClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Pull the spreadsheet metadata and return the set of existing tab names.
 */
async function existingTabs(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return new Set((meta.data.sheets || []).map((s) => s.properties.title));
}

/**
 * Add a tab via batchUpdate. Errors are surfaced — the caller decides whether
 * to continue.
 */
async function addTab(sheets, name) {
  console.log(`+ creating tab: ${name}`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: name } } }],
    },
  });
}

/**
 * Ensure a tab has the expected header row. We always write headers when
 * creating; on existing tabs we leave them alone (staff may have customized).
 */
async function writeHeaders(sheets, name, headers) {
  console.log(`  writing headers in ${name}`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${name}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
}

/**
 * Append seed rows ONLY if the tab is empty (just the header). Avoids clobbering
 * staff edits on re-run.
 */
async function seedIfEmpty(sheets, name, rows) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A2:A2`,
  });
  if ((res.data.values || []).length > 0) {
    console.log(`  ${name}: seed skipped (tab already has data)`);
    return;
  }
  console.log(`  seeding ${rows.length} rows into ${name}`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${name}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

async function main() {
  const sheets = await getClient();
  const existing = await existingTabs(sheets);

  for (const tab of TABS) {
    const isNew = !existing.has(tab.name);
    if (isNew) {
      await addTab(sheets, tab.name);
      await writeHeaders(sheets, tab.name, tab.headers);
    } else {
      console.log(`= tab exists: ${tab.name} (headers left as-is)`);
    }
    if (tab.seed) {
      const rows = tab.seed();
      await seedIfEmpty(sheets, tab.name, rows);
    }
  }

  console.log('\nDone. Replace placeholder Catalog prices with your actual rate card.');
}

main().catch((err) => {
  console.error('init-sheet-tabs failed:', err.message);
  if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
