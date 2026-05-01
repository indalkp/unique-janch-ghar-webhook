/**
 * src/lang.js — Language detection + i18n strings.
 *
 * Strategy:
 *   detectLang(text) returns 'hi' if any Devanagari character (range ऀ-ॿ)
 *   appears in the text, else 'en'. Single-character heuristic — works for
 *   our customer base (mostly Hindi or English; Hinglish typed in Latin
 *   script is treated as English, which is fine because all our prompts
 *   are bilingual at the UI level anyway).
 *
 *   t(key, lang, vars) returns the localized string. Missing keys return the
 *   key itself (so we surface gaps instead of crashing).
 *
 * Conventions:
 *   - Every key has BOTH 'hi' and 'en' values. PRs that add a string to one
 *     language must add the other.
 *   - {{var}} placeholders are substituted via simple regex.
 *   - Emojis are encoded directly (utf-8 source).
 */

'use strict';

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Detect language from raw inbound text.
 * @param {string} text
 * @returns {'hi'|'en'}
 */
function detectLang(text) {
  if (typeof text !== 'string') return 'en';
  return DEVANAGARI.test(text) ? 'hi' : 'en';
}

/**
 * Substitute {{var}} placeholders. Missing -> empty string.
 * @param {string} template
 * @param {Record<string,string>} vars
 * @returns {string}
 */
function fill(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

/**
 * Look up a localized string.
 * @param {string} key
 * @param {'hi'|'en'} lang
 * @param {Record<string,string>} [vars]
 * @returns {string}
 */
function t(key, lang, vars = {}) {
  const dict = STRINGS[key];
  if (!dict) return key;
  const tpl = dict[lang] || dict.en || key;
  return fill(tpl, vars);
}

// ---------------------------------------------------------------------------
// String dictionary. Keep grouped by flow so adding new copy stays sane.
// ---------------------------------------------------------------------------

/** @type {Record<string,{en:string,hi:string}>} */
const STRINGS = {
  // ---- Welcome / menu ----
  'welcome.title':       { en: 'Welcome to Unique Janch Ghar 🩺', hi: 'यूनिक जाँच घर में आपका स्वागत है 🩺' },
  'welcome.body':        {
    en: 'How can we help you today? Pick an option below.',
    hi: 'हम आपकी कैसे सहायता कर सकते हैं? नीचे एक विकल्प चुनें।',
  },
  'menu.button':         { en: 'Open Menu', hi: 'मेनू खोलें' },
  'menu.section.title':  { en: 'Services', hi: 'सेवाएं' },
  'menu.book':           { en: 'Book Test', hi: 'जाँच बुक करें' },
  'menu.book.desc':      { en: 'Book a pathology test', hi: 'पैथोलॉजी टेस्ट बुक करें' },
  'menu.status':         { en: 'Check Report Status', hi: 'रिपोर्ट स्थिति देखें' },
  'menu.status.desc':    { en: 'Find your booking by name or ID', hi: 'अपनी बुकिंग नाम या ID से खोजें' },
  'menu.catalog':        { en: 'Pricing & Tests', hi: 'कीमत और जाँच सूची' },
  'menu.catalog.desc':   { en: 'Browse tests by category', hi: 'श्रेणी के अनुसार जाँच देखें' },
  'menu.info':           { en: 'Hours & Directions', hi: 'समय और पता' },
  'menu.info.desc':      { en: 'Lab hours, phone, address', hi: 'लैब का समय, फ़ोन, पता' },
  'menu.handoff':        { en: 'Talk to Staff', hi: 'स्टाफ़ से बात करें' },
  'menu.handoff.desc':   { en: 'Request a callback', hi: 'कॉलबैक के लिए अनुरोध करें' },

  // ---- Book flow ----
  'book.entry.body':     { en: 'How would you like to choose your test?', hi: 'आप जाँच कैसे चुनना चाहेंगे?' },
  'book.entry.common':   { en: 'Common Tests', hi: 'सामान्य जाँच' },
  'book.entry.referred': { en: 'Doctor Referred', hi: 'डॉक्टर रेफर' },
  'book.entry.type':     { en: 'Type Test Name', hi: 'जाँच का नाम लिखें' },
  'book.list.header':    { en: 'Common Tests', hi: 'सामान्य जाँच' },
  'book.list.body':      { en: 'Pick a test from the list.', hi: 'सूची से एक जाँच चुनें।' },
  'book.list.button':    { en: 'View Tests', hi: 'जाँच देखें' },
  'book.prompt.name':    { en: 'Type the test name (e.g. CBC, LFT, Lipid Profile).', hi: 'जाँच का नाम लिखें (जैसे CBC, LFT, लिपिड प्रोफाइल)।' },
  'book.prompt.date':    { en: 'When would you like to come? Pick a day:', hi: 'आप कब आना चाहेंगे? एक दिन चुनें:' },
  'book.date.today':     { en: 'Today', hi: 'आज' },
  'book.date.tomorrow':  { en: 'Tomorrow', hi: 'कल' },
  'book.date.pick':      { en: 'Pick a Date', hi: 'तारीख चुनें' },
  'book.prompt.date.custom': { en: 'Type the date as DD/MM (e.g. 12/05).', hi: 'तारीख DD/MM में लिखें (जैसे 12/05)।' },
  'book.invalid.date':   { en: 'That date doesn’t look right. Type DD/MM (e.g. 12/05).', hi: 'तारीख ठीक नहीं लगती। DD/MM में लिखें (जैसे 12/05)।' },
  'book.prompt.slot':    { en: 'Pick a time slot:', hi: 'समय चुनें:' },
  'book.slot.morning':   { en: 'Morning 7–10', hi: 'सुबह 7–10' },
  'book.slot.afternoon': { en: 'Afternoon 10–12', hi: 'दोपहर 10–12' },
  'book.confirm.body':   {
    en: 'Please confirm:\n• Test: {{test}}\n• Date: {{date}}\n• Slot: {{slot}}',
    hi: 'कृपया पुष्टि करें:\n• जाँच: {{test}}\n• तारीख: {{date}}\n• समय: {{slot}}',
  },
  'book.confirm.yes':    { en: 'Confirm', hi: 'पुष्टि करें' },
  'book.confirm.no':     { en: 'Cancel', hi: 'रद्द करें' },
  'book.success':        {
    en: '✅ Booked!\n\nBooking ID: {{id}}\nTest: {{test}}\nDate: {{date}}\nSlot: {{slot}}\n\nOur team will call you to confirm. Reply MENU to start over.',
    hi: '✅ बुक हो गया!\n\nबुकिंग ID: {{id}}\nजाँच: {{test}}\nतारीख: {{date}}\nसमय: {{slot}}\n\nहमारी टीम पुष्टि के लिए कॉल करेगी। फिर से शुरू करने के लिए MENU भेजें।',
  },
  'book.cancelled':      { en: 'Booking cancelled. Reply MENU to start over.', hi: 'बुकिंग रद्द कर दी गई। फिर से शुरू करने के लिए MENU भेजें।' },

  // ---- Status flow ----
  'status.prompt':       { en: 'Type your name OR your booking ID (e.g. UJG-1234).', hi: 'अपना नाम या बुकिंग ID लिखें (जैसे UJG-1234)।' },
  'status.found':        {
    en: '📋 Booking {{id}}\nTest: {{test}}\nDate: {{date}} {{slot}}\nStatus: {{status}}\n\n{{note}}',
    hi: '📋 बुकिंग {{id}}\nजाँच: {{test}}\nतारीख: {{date}} {{slot}}\nस्थिति: {{status}}\n\n{{note}}',
  },
  'status.not_found.body': { en: 'No booking found. Would you like to:', hi: 'कोई बुकिंग नहीं मिली। आप क्या करना चाहेंगे?' },
  'status.book_new':     { en: 'Book New', hi: 'नई बुकिंग' },
  'status.main_menu':    { en: 'Main Menu', hi: 'मुख्य मेनू' },
  'status.note.pending':   { en: 'Sample not yet collected.', hi: 'सैंपल अभी नहीं लिया गया।' },
  'status.note.confirmed': { en: 'Booking confirmed. Please come at your slot.', hi: 'बुकिंग पुष्टि हो गई। अपने समय पर आएं।' },
  'status.note.collected': { en: 'Sample collected. Report processing.', hi: 'सैंपल लिया जा चुका है। रिपोर्ट तैयार हो रही है।' },
  'status.note.ready':     { en: 'Report is ready. Please collect from the lab.', hi: 'रिपोर्ट तैयार है। कृपया लैब से ले जाएं।' },
  'status.note.cancelled': { en: 'This booking was cancelled.', hi: 'यह बुकिंग रद्द कर दी गई थी।' },

  // ---- Catalog flow ----
  'catalog.header':      { en: 'Pricing & Tests', hi: 'कीमत और जाँच' },
  'catalog.body':        { en: 'Pick a category to view tests and prices.', hi: 'जाँच और कीमत देखने के लिए एक श्रेणी चुनें।' },
  'catalog.button':      { en: 'Categories', hi: 'श्रेणियाँ' },
  'catalog.section':     { en: 'Categories', hi: 'श्रेणियाँ' },
  'catalog.cat.hematology':   { en: 'Hematology', hi: 'हीमेटोलॉजी' },
  'catalog.cat.biochemistry': { en: 'Biochemistry', hi: 'जैव रसायन' },
  'catalog.cat.hormones':     { en: 'Hormones', hi: 'हार्मोन' },
  'catalog.cat.diabetes':     { en: 'Diabetes', hi: 'मधुमेह' },
  'catalog.cat.vitamins':     { en: 'Vitamins', hi: 'विटामिन' },
  'catalog.cat.urinalysis':   { en: 'Urinalysis', hi: 'मूत्र जाँच' },
  'catalog.cat.microbiology': { en: 'Microbiology', hi: 'सूक्ष्म जीव विज्ञान' },
  'catalog.cat.special':      { en: 'Special Tests', hi: 'विशेष जाँच' },
  'catalog.tests.header':     { en: 'Tests in {{category}}', hi: '{{category}} की जाँच' },
  'catalog.tests.body':       { en: 'Pick a test for details.', hi: 'विवरण के लिए एक जाँच चुनें।' },
  'catalog.tests.button':     { en: 'View', hi: 'देखें' },
  'catalog.test.detail':      {
    en: '🧪 {{name}}\nPrice: ₹{{price}}\nSample: {{sample}}\nFasting: {{fasting}}\nReport in: {{tat}}\n\n{{notes}}',
    hi: '🧪 {{name}}\nकीमत: ₹{{price}}\nसैंपल: {{sample}}\nखाली पेट: {{fasting}}\nरिपोर्ट: {{tat}}\n\n{{notes}}',
  },
  'catalog.book_this':        { en: 'Book This Test', hi: 'यह जाँच बुक करें' },
  'catalog.back':             { en: 'Back to Menu', hi: 'मेनू पर वापस' },
  'catalog.empty':            { en: 'No tests found in this category yet.', hi: 'इस श्रेणी में अभी कोई जाँच नहीं है।' },

  // ---- Info flow ----
  'info.body':           {
    en: '🏥 Unique Janch Ghar\n\n⏰ Hours\nMon–Sat 7AM–9PM\nSun 7AM–12PM\n\n📞 Phone\n+91 9798586981\n\n📍 Address\nNear RX India Pharma, opp. Sub-Divisional Hospital,\nRajgir, Nalanda, Bihar 803116\n\n🌐 startling-fairy-6a1334.netlify.app\n\nReply MENU for the main menu.',
    hi: '🏥 यूनिक जाँच घर\n\n⏰ समय\nसोम–शनि: सुबह 7:00 – रात 9:00\nरवि: सुबह 8:00 – दोपहर 12:00\n\n📞 फ़ोन\n+91 9798586981\n\n📍 पता\nRX India Pharma के पास, सब-डिविज़नल हॉस्पिटल के सामने,\nरजगीर, नालंदा, बिहार 803116\n\n🌐 startling-fairy-6a1334.netlify.app\n\nमुख्य मेनू के लिए MENU भेजें।',
  },

  // ---- Handoff flow ----
  'handoff.prompt':      { en: 'Our staff will call you back. When works best?', hi: 'हमारी टीम आपको कॉल करेगी। कब सही रहेगा?' },
  'handoff.now':         { en: 'Now', hi: 'अभी' },
  'handoff.2h':          { en: 'Within 2 hours', hi: '2 घंटे में' },
  'handoff.tomorrow':    { en: 'Tomorrow morning', hi: 'कल सुबह' },
  'handoff.success':     { en: '✅ Got it. We will call you {{when}}. Reply MENU anytime.', hi: '✅ ठीक है। हम आपको {{when}} कॉल करेंगे। कभी भी MENU भेजें।' },

  // ---- Common / errors ----
  'common.menu_hint':    { en: 'Reply MENU to see options.', hi: 'विकल्प देखने के लिए MENU भेजें।' },
  'common.unknown':      { en: 'I didn’t catch that. Reply MENU to see options.', hi: 'मुझे समझ नहीं आया। विकल्प देखने के लिए MENU भेजें।' },
  'common.rate_limited': { en: 'You’re sending too quickly. Please wait a minute.', hi: 'आप बहुत जल्दी भेज रहे हैं। कृपया एक मिनट रुकें।' },
  'common.outside_window': { en: 'Send any message to reopen the chat.', hi: 'चैट फिर से खोलने के लिए कोई भी संदेश भेजें।' },
  'common.cancelled':    { en: 'Cancelled. Reply MENU to start over.', hi: 'रद्द कर दिया गया। फिर से शुरू करने के लिए MENU भेजें।' },
};

module.exports = {
  detectLang,
  t,
  fill,
  STRINGS,
};
