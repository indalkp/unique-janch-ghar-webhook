/**
 * src/lang.js  Language detection + i18n strings.
 *
 * Strategy:
 *   detectLang(text) returns 'hi' if any Devanagari character (range -)
 *   appears in the text, else 'en'.
 *
 *   t(key, lang, vars) returns the localized string. Missing keys return the
 *   key itself (so we surface gaps instead of crashing).
 */

'use strict';

const DEVANAGARI = /[-]/;

function detectLang(text) {
  if (typeof text !== 'string') return 'en';
  return DEVANAGARI.test(text) ? 'hi' : 'en';
}

function fill(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

function t(key, lang, vars = {}) {
  const dict = STRINGS[key];
  if (!dict) return key;
  const tpl = dict[lang] || dict.en || key;
  return fill(tpl, vars);
}

const STRINGS = {
  // ---- Welcome / menu ----
  'welcome.title':       { en: 'Welcome to *Unique Janch Ghar* _(formerly Hi-tech Patho Lab Rajgir)_ ', hi: '*  * _( -   )_     ' },
  'welcome.body':        {
    en: 'How can we help you today? Pick an option below.',
    hi: '      ?    ',
  },
  'menu.button':         { en: 'Open Menu', hi: ' ' },
  'menu.section.title':  { en: 'Services', hi: '' },
  'menu.book':           { en: 'Book Test', hi: '  ' },
  'menu.book.desc':      { en: 'Book a pathology test', hi: '   ' },
  'menu.status':         { en: 'Check Report Status', hi: '  ' },
  'menu.status.desc':    { en: 'Find your booking by name or ID', hi: '    ID  ' },
  'menu.catalog':        { en: 'Pricing & Tests', hi: '   ' },
  'menu.catalog.desc':   { en: 'Browse tests by category', hi: '    ' },
  'menu.info':           { en: 'Hours & Directions', hi: '  ' },
  'menu.info.desc':      { en: 'Lab hours, phone, address', hi: '  , , ' },
  'menu.handoff':        { en: 'Talk to Staff', hi: '   ' },
  'menu.handoff.desc':   { en: 'Request a callback', hi: '    ' },

  // ---- Book flow ----
  'book.entry.body':     { en: 'How would you like to choose your test?', hi: '    ?' },
  'book.entry.common':   { en: 'Common Tests', hi: ' ' },
  'book.entry.referred': { en: 'Doctor Referred', hi: ' ' },
  'book.entry.type':     { en: 'Type Test Name', hi: '   ' },
  'book.list.header':    { en: 'Common Tests', hi: ' ' },
  'book.list.body':      { en: 'Pick a test from the list.', hi: '    ' },
  'book.list.button':    { en: 'View Tests', hi: ' ' },
  'book.prompt.name':    { en: 'Type the test name (e.g. CBC, LFT, Lipid Profile).', hi: '    ( CBC, LFT,  )' },
  'book.prompt.date':    { en: 'When would you like to come? Pick a day:', hi: '   ?   :' },
  'book.date.today':     { en: 'Today', hi: '' },
  'book.date.tomorrow':  { en: 'Tomorrow', hi: '' },
  'book.date.pick':      { en: 'Pick a Date', hi: ' ' },
  'book.prompt.date.custom': { en: 'Type the date as DD/MM (e.g. 12/05).', hi: ' DD/MM   ( 12/05)' },
  'book.invalid.date':   { en: 'That date does not look right. Type DD/MM (e.g. 12/05).', hi: '    DD/MM   ( 12/05)' },
  'book.prompt.slot':    { en: 'Pick a time slot:', hi: ' :' },
  'book.slot.morning':   { en: 'Morning 7-10', hi: ' 7-10' },
  'book.slot.afternoon': { en: 'Afternoon 10-12', hi: ' 10-12' },
  'book.confirm.body':   {
    en: 'Booking summary:\n{{items}}\nTotal: {{total}}\nDate: {{date}}\nSlot: {{slot}}',
    hi: ' :\n{{items}}\n: {{total}}\n: {{date}}\n: {{slot}}',
  },
  'book.confirm.yes':    { en: 'Confirm', hi: ' ' },
  'book.confirm.no':     { en: 'Cancel', hi: ' ' },
  'book.success':        {
    en: ' Booking saved \n\nBooking ID: {{id}}\n{{items}}\nTotal: {{total}}\nDate: {{date}}\nSlot: {{slot}}\n\nOur team will call you to confirm. Reply MENU to start over.',
    hi: '     \n\n ID: {{id}}\n{{items}}\n: {{total}}\n: {{date}}\n: {{slot}}\n\n       MENU ',
  },
  'book.cancelled':      { en: 'Booking cancelled. Reply MENU to start over.', hi: '     MENU ' },

  // ---- Cart (multi-test, v2.1) ----
  'cart.added':          {
    en: 'Added  {{test}}. {{price}} added to cart. Total {{total}}.',
    hi: '  {{test}}. {{price}}   {{total}}',
  },
  'cart.add_more':       { en: ' Add Another', hi: '   ' },
  'cart.proceed':        { en: ' Proceed', hi: '  ' },
  'cart.summary':        {
    en: 'Cart:\n{{items}}\nTotal: {{total}}',
    hi: ':\n{{items}}\n: {{total}}',
  },

  'status.prompt':       { en: 'Type your name OR your booking ID (e.g. UJG-1234).', hi: '    ID ' },
  'status.found':        {
    en: ' Booking {{id}}\nTest: {{test}}\nDate: {{date}} {{slot}}\nStatus: {{status}}\n\n{{note}}',
    hi: '  {{id}}\n: {{test}}\n: {{date}} {{slot}}\n: {{status}}\n\n{{note}}',
  },
  'status.not_found.body': { en: 'No booking found.', hi: '   ' },
  'status.book_new':     { en: 'Book New', hi: ' ' },
  'status.main_menu':    { en: 'Main Menu', hi: ' ' },
  'status.note.pending':   { en: 'Sample not yet collected.', hi: '    ' },
  'status.note.confirmed': { en: 'Booking confirmed.', hi: '   ' },
  'status.note.collected': { en: 'Sample collected. Report processing.', hi: '    ' },
  'status.note.ready':     { en: 'Report is ready.', hi: '  ' },
  'status.note.cancelled': { en: 'This booking was cancelled.', hi: '      ' },

  'catalog.header':      { en: 'Pricing & Tests', hi: '  ' },
  'catalog.body':        { en: 'Pick a category.', hi: '  ' },
  'catalog.button':      { en: 'Categories', hi: '' },
  'catalog.section':     { en: 'Categories', hi: '' },
  'catalog.cat.hematology':   { en: 'Hematology', hi: '' },
  'catalog.cat.biochemistry': { en: 'Biochemistry', hi: ' ' },
  'catalog.cat.hormones':     { en: 'Hormones', hi: '' },
  'catalog.cat.diabetes':     { en: 'Diabetes', hi: '' },
  'catalog.cat.vitamins':     { en: 'Vitamins', hi: '' },
  'catalog.cat.urinalysis':   { en: 'Urinalysis', hi: ' ' },
  'catalog.cat.microbiology': { en: 'Microbiology', hi: '  ' },
  'catalog.cat.special':      { en: 'Special Tests', hi: ' ' },
  'catalog.tests.header':     { en: 'Tests in {{category}}', hi: '{{category}}  ' },
  'catalog.tests.body':       { en: 'Pick a test for details.', hi: '   ' },
  'catalog.tests.button':     { en: 'View', hi: '' },
  'catalog.test.detail':      {
    en: ' {{name}}\nPrice: {{price}}\nSample: {{sample}}\nFasting: {{fasting}}\nReport in: {{tat}}\n\n{{notes}}',
    hi: ' {{name}}\n: {{price}}\n: {{sample}}\n : {{fasting}}\n: {{tat}}\n\n{{notes}}',
  },
  'catalog.book_this':        { en: 'Book This Test', hi: '   ' },
  'catalog.back':             { en: 'Back to Menu', hi: '  ' },
  'catalog.empty':            { en: 'No tests found.', hi: '   ' },

  'info.body':           {
    en: ' Unique Janch Ghar (formerly Hi-tech Patho Lab Rajgir)\n\n Hours\nMon-Sat 7AM-9PM\nSun 7AM-12PM\n\n Phone\n+91 9798586981\n\n Address\nNear RX India Pharma, opp. Sub-Divisional Hospital,\nRajgir, Nalanda, Bihar 803116\n\nReply MENU for the main menu.',
    hi: '    ( -   )\n\n \n-:  7 -  9\n:  8 -  12\n\n \n+91 9798586981\n\n \nRX India Pharma  , -   ,\n, ,  803116\n\nMENU ',
  },

  'handoff.prompt':      { en: 'Our staff will call you back. When works best?', hi: '     ?' },
  'handoff.now':         { en: 'Now', hi: '' },
  'handoff.2h':          { en: 'Within 2 hours', hi: '2  ' },
  'handoff.tomorrow':    { en: 'Tomorrow morning', hi: ' ' },
  'handoff.success':     { en: ' Got it. We will call you {{when}}.', hi: '   {{when}}  ' },

  'common.menu_hint':    { en: 'Reply MENU to see options.', hi: 'MENU ' },
  'common.unknown':      { en: 'I did not catch that. Reply MENU.', hi: '   MENU ' },
  'common.rate_limited': { en: 'You are sending too quickly.', hi: '    ' },
  'common.outside_window': { en: 'Send any message to reopen.', hi: '       ' },
  'common.cancelled':    { en: 'Cancelled. Reply MENU.', hi: ' MENU ' },
};

module.exports = {
  detectLang: detectLang,
  t: t,
  fill: fill,
  STRINGS: STRINGS,
};
