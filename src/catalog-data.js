/**
 * src/catalog-data.js — Seed data for the Catalog Sheet tab (Indal KP Studio).
 *
 * All packages reflect 50% inaugural discounted launch rates.
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
  {
    category: 'Commercial Video',
    test_name: '60s Hybrid 2D Commercial Video',
    price_inr: 37500,
    sample_required: 'Concept Script & Narrative Brief',
    fasting_hours: 0,
    turnaround_hours: 336, // 14 days
    notes: '50% Inaugural Discount (Regular ₹75,000 / $600 USD). 4K master delivery (16:9 & 9:16), bespoke hand-drawn 2D character, full SFX audio landscape, and perpetual commercial rights.',
  },
  {
    category: 'Preproduction',
    test_name: 'Complete Preproduction & Storyboard Suite',
    price_inr: 17500,
    sample_required: 'Story Outline / Treatment / Script',
    fasting_hours: 0,
    turnaround_hours: 168, // 7 days
    notes: '50% Inaugural Discount (Regular ₹35,000 / $250 USD). Character model sheets (turnarounds & expressions), sequential visual storyboard, timed animatic reel with scratch audio, and color scripts.',
  },
  {
    category: 'Creator Automation',
    test_name: 'Creator Content Engine & Automation Setup',
    price_inr: 25000,
    sample_required: 'Existing Workflow & Tech Stack',
    fasting_hours: 0,
    turnaround_hours: 120, // 5 days
    notes: '50% Inaugural Discount (Regular ₹50,000 / $375 USD). Single-take pipeline setup, automated multi-branch formats (video reels, articles, audio), AI prompt blueprints, and local execution runbook.',
  },
  {
    category: 'Motion Reel',
    test_name: '15s Concept Teaser & Motion Reel',
    price_inr: 12500,
    sample_required: 'Hero Concept / Character Design',
    fasting_hours: 0,
    turnaround_hours: 72, // 3 days
    notes: '50% Inaugural Discount (Regular ₹25,000 / $175 USD). 15-second high-impact visual sequence with dynamic character movement, formatted in 4K for Reels, Shorts, and investor pitch decks.',
  },
];

module.exports = { CATALOG };
