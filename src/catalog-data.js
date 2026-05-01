/**
 * src/catalog-data.js — Seed data for the Catalog Sheet tab.
 *
 * Hardcoded list of 30 common pathology tests. This file is the source of
 * truth ONLY for the initial seed via scripts/init-sheet-tabs.js. After
 * seeding, the Sheet itself is the source of truth — runtime code reads
 * from the Catalog tab (with 5-min in-memory cache), not from this file.
 *
 * Prices are placeholder ₹ — lab staff are expected to replace these with
 * the actual rate card after seeding (see PR description).
 *
 * Schema matches the Catalog tab columns:
 *   category | test_name | price_inr | sample_required | fasting_hours |
 *   turnaround_hours | notes
 */

'use strict';

/** @typedef {{
 *   category: string,
 *   test_name: string,
 *   price_inr: number,
 *   sample_required: string,
 *   fasting_hours: number,
 *   turnaround_hours: number,
 *   notes: string
 * }} CatalogRow
 */

/** @type {Array<CatalogRow>} */
const CATALOG = [
  // ---- Hematology ----
  { category: 'Hematology', test_name: 'CBC (Complete Blood Count)', price_inr: 300, sample_required: 'Blood (EDTA)', fasting_hours: 0, turnaround_hours: 6,  notes: 'Same-day report' },
  { category: 'Hematology', test_name: 'ESR',                         price_inr: 150, sample_required: 'Blood (EDTA)', fasting_hours: 0, turnaround_hours: 6,  notes: 'Same-day report' },
  { category: 'Hematology', test_name: 'Peripheral Smear',            price_inr: 250, sample_required: 'Blood (EDTA)', fasting_hours: 0, turnaround_hours: 12, notes: '' },
  { category: 'Hematology', test_name: 'Reticulocyte Count',          price_inr: 350, sample_required: 'Blood (EDTA)', fasting_hours: 0, turnaround_hours: 24, notes: '' },

  // ---- Biochemistry ----
  { category: 'Biochemistry', test_name: 'LFT (Liver Function Test)', price_inr: 600, sample_required: 'Serum',  fasting_hours: 8,  turnaround_hours: 12, notes: 'Fasting recommended' },
  { category: 'Biochemistry', test_name: 'KFT (Kidney Function Test)', price_inr: 600, sample_required: 'Serum', fasting_hours: 0,  turnaround_hours: 12, notes: '' },
  { category: 'Biochemistry', test_name: 'Lipid Profile',             price_inr: 700, sample_required: 'Serum',  fasting_hours: 12, turnaround_hours: 12, notes: 'Fasting required (12h)' },
  { category: 'Biochemistry', test_name: 'Liver + Lipid Combo',       price_inr: 1100, sample_required: 'Serum', fasting_hours: 12, turnaround_hours: 12, notes: 'Fasting required' },
  { category: 'Biochemistry', test_name: 'Electrolytes (Na/K/Cl)',    price_inr: 400, sample_required: 'Serum',  fasting_hours: 0,  turnaround_hours: 6,  notes: '' },
  { category: 'Biochemistry', test_name: 'Uric Acid',                 price_inr: 200, sample_required: 'Serum',  fasting_hours: 0,  turnaround_hours: 6,  notes: '' },

  // ---- Hormones ----
  { category: 'Hormones', test_name: 'TSH',                price_inr: 350, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: '' },
  { category: 'Hormones', test_name: 'Free T3 / Free T4',  price_inr: 600, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: '' },
  { category: 'Hormones', test_name: 'Thyroid Profile (T3/T4/TSH)', price_inr: 800, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: '' },
  { category: 'Hormones', test_name: 'Cortisol (Morning)', price_inr: 700, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: 'Morning sample only' },

  // ---- Diabetes ----
  { category: 'Diabetes', test_name: 'Blood Sugar Fasting',      price_inr: 100, sample_required: 'Blood (Fluoride)', fasting_hours: 8,  turnaround_hours: 4,  notes: 'Fasting required' },
  { category: 'Diabetes', test_name: 'Blood Sugar Post-Prandial', price_inr: 100, sample_required: 'Blood (Fluoride)', fasting_hours: 0,  turnaround_hours: 4,  notes: '2h after meal' },
  { category: 'Diabetes', test_name: 'HbA1c',                    price_inr: 500, sample_required: 'Blood (EDTA)',     fasting_hours: 0,  turnaround_hours: 12, notes: '' },
  { category: 'Diabetes', test_name: 'GTT (Glucose Tolerance)',  price_inr: 600, sample_required: 'Blood (Fluoride)', fasting_hours: 8,  turnaround_hours: 12, notes: '3-sample test' },

  // ---- Vitamins ----
  { category: 'Vitamins', test_name: 'Vitamin D',  price_inr: 1200, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 48, notes: '' },
  { category: 'Vitamins', test_name: 'Vitamin B12', price_inr: 900, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 48, notes: '' },
  { category: 'Vitamins', test_name: 'Iron Studies', price_inr: 700, sample_required: 'Serum', fasting_hours: 8, turnaround_hours: 24, notes: 'Fasting recommended' },
  { category: 'Vitamins', test_name: 'Ferritin',     price_inr: 600, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: '' },

  // ---- Urinalysis ----
  { category: 'Urinalysis', test_name: 'Urine Routine & Microscopy (R/M)', price_inr: 150, sample_required: 'Urine (mid-stream)', fasting_hours: 0, turnaround_hours: 6,  notes: '' },
  { category: 'Urinalysis', test_name: 'Urine Culture',                    price_inr: 500, sample_required: 'Urine (sterile)',    fasting_hours: 0, turnaround_hours: 72, notes: '3-day culture' },
  { category: 'Urinalysis', test_name: 'Urine Pregnancy Test',             price_inr: 100, sample_required: 'Urine',              fasting_hours: 0, turnaround_hours: 1,  notes: '' },

  // ---- Microbiology ----
  { category: 'Microbiology', test_name: 'Stool Routine',     price_inr: 200, sample_required: 'Stool', fasting_hours: 0, turnaround_hours: 12, notes: '' },
  { category: 'Microbiology', test_name: 'Blood Culture',     price_inr: 800, sample_required: 'Blood', fasting_hours: 0, turnaround_hours: 72, notes: '' },
  { category: 'Microbiology', test_name: 'Throat Swab Culture', price_inr: 500, sample_required: 'Throat swab', fasting_hours: 0, turnaround_hours: 48, notes: '' },

  // ---- Special ----
  { category: 'Special Tests', test_name: 'CRP (C-Reactive Protein)', price_inr: 400, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 12, notes: '' },
  { category: 'Special Tests', test_name: 'Dengue NS1 Antigen',       price_inr: 700, sample_required: 'Serum', fasting_hours: 0, turnaround_hours: 24, notes: '' },
];

module.exports = { CATALOG };
