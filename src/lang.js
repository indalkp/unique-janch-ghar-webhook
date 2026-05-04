/**
 * src/lang.js — Language detection + i18n strings (v3.2.1).
 *
 * v3.2.1 hotfix:
 *   - book.payment.upi_text — payee name updated to "KUMAR CHANDAN PATEL"
 *     (the actual name customers see in their UPI app, since the VPA is
 *     bound to a personal number-linked account, not the lab name).
 *   - book.prompt.date — neutral, collection-friendly wording.
 *   - book.staff_call_promise — NEW separate text message sent after the
 *     booking summary, includes tap-to-call phone number.
 *
 * v3.0 additions (lab-aware pricing + UPI payment):
 *   - book.pricing.both_labs / .thyrocare_only / .lal_only / .neither
 *   - book.pick_lab.prompt + btn_thyrocare + btn_lal
 *   - book.payment.prompt + .upi_text + .btn_paid + .btn_collection
 *     + .thanks_paid + .collection_confirmed
 *   - book.success.with_lab — confirmation that includes chosen_lab line
 *   - book.list.row_desc    — description shown on each row in pick_common
 *
 * v2.2 carryover:
 *   - welcome.text / menu.title.short / menu.body
 *   - book.location.* — sample-pickup location prompt + handlers
 *   - book.confirm.body / book.success — pickup_address line in summary
 */

'use strict';

// Devanagari Unicode range U+0900..U+097F.
const DEVANAGARI = /[ऀ-ॿ]/;

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
  // ---- Welcome / menu (v2.2: split into text + list) ----
  'welcome.title':       { en: 'Welcome to Unique Janch Ghar', hi: 'Unique Janch Ghar mein aapka swagat hai' },
  'welcome.body':        {
    en: '_(formerly Hi-tech Patho Lab Rajgir)_\n\nHow can we help you today? Pick an option below.',
    hi: '_(पहले हाई-टेक पैथो लैब राजगीर)_\n\nहम आपकी कैसे मदद कर सकते हैं? नीचे से विकल्प चुनें।',
  },
  'welcome.text':        {
    en: '🩺 *Welcome to Unique Janch Ghar* / *यूनिक जाँच घर में आपका स्वागत है*\n_(formerly Hi-tech Patho Lab Rajgir)_\n_(पहले हाई-टेक पैथो लैब राजगीर)_\n\nHow can we help you today? / आज हम कैसे मदद कर सकते हैं?',
    hi: '🩺 *यूनिक जाँच घर में आपका स्वागत है* / *Welcome to Unique Janch Ghar*\n_(पहले हाई-टेक पैथो लैब राजगीर)_\n_(formerly Hi-tech Patho Lab Rajgir)_\n\nआज हम कैसे मदद कर सकते हैं? / How can we help you today?',
  },
  'menu.title.short':    { en: '📋 Choose an option', hi: '📋 विकल्प चुनें' },
  'menu.body':           { en: 'Pick a service below.', hi: 'नीचे से सेवा चुनें।' },
  'menu.button':         { en: 'Open Menu', hi: 'मेनू खोलें' },
  'menu.section.title':  { en: 'Services', hi: 'सेवाएँ' },
  'menu.book':           { en: 'Book Test', hi: 'टेस्ट बुक करें' },
  'menu.book.desc':      { en: 'Book a pathology test', hi: 'पैथोलॉजी टेस्ट बुक करें' },
  'menu.status':         { en: 'Check Report Status', hi: 'रिपोर्ट स्थिति देखें' },
  'menu.status.desc':    { en: 'Find your booking by name or ID', hi: 'नाम या ID से बुकिंग खोजें' },
  'menu.catalog':        { en: 'Pricing & Tests', hi: 'मूल्य और टेस्ट' },
  'menu.catalog.desc':   { en: 'Browse tests by category', hi: 'कैटेगरी से टेस्ट देखें' },
  'menu.info':           { en: 'Hours & Directions', hi: 'समय और पता' },
  'menu.info.desc':      { en: 'Lab hours, phone, address', hi: 'लैब का समय, फ़ोन, पता' },
  'menu.handoff':        { en: 'Talk to Staff', hi: 'स्टाफ़ से बात करें' },
  'menu.handoff.desc':   { en: 'Request a callback', hi: 'कॉलबैक का अनुरोध' },

  // ---- Book flow ----
  'book.entry.body':     { en: 'How would you like to choose your test?', hi: 'टेस्ट कैसे चुनना चाहेंगे?' },
  'book.entry.common':   { en: 'Common Tests', hi: 'सामान्य टेस्ट' },
  'book.entry.referred': { en: 'Doctor Referred', hi: 'डॉक्टर रेफ़र्ड' },
  'book.entry.type':     { en: 'Type Test Name', hi: 'टेस्ट का नाम लिखें' },
  'book.list.header':    { en: 'Common Tests', hi: 'सामान्य टेस्ट' },
  'book.list.body':      { en: 'Pick a test from the list.', hi: 'सूची से एक टेस्ट चुनें।' },
  'book.list.button':    { en: 'View Tests', hi: 'टेस्ट देखें' },
  // v3.0 — fallback row description when Catalog has no price for this test.
  'book.list.row_oncall': { en: 'Price on call', hi: 'मूल्य फ़ोन पर' },
  'book.prompt.name':    { en: 'Type the test name (e.g. CBC, LFT, Lipid Profile).', hi: 'टेस्ट का नाम लिखें (जैसे CBC, LFT, लिपिड)।' },
  // v3.2.1 — neutral, collection-friendly wording (was "When would you like
  // to come? Pick a day:" which implied the patient must come to the lab).
  'book.prompt.date':    { en: 'When should our team collect the sample? Pick a day:', hi: 'कब सैंपल लेना है? दिन चुनें:' },
  'book.date.today':     { en: 'Today', hi: 'आज' },
  'book.date.tomorrow':  { en: 'Tomorrow', hi: 'कल' },
  'book.date.pick':      { en: 'Pick a Date', hi: 'तारीख़ चुनें' },
  'book.prompt.date.custom': { en: 'Type the date as DD/MM (e.g. 12/05).', hi: 'तारीख़ DD/MM में लिखें (जैसे 12/05)।' },
  'book.invalid.date':   { en: 'That date does not look right. Type DD/MM (e.g. 12/05).', hi: 'तारीख़ सही नहीं लगती। DD/MM में लिखें (जैसे 12/05)।' },
  'book.prompt.slot':    { en: 'Pick a time slot:', hi: 'समय चुनें:' },
  'book.slot.morning':   { en: 'Morning 7-10', hi: 'सुबह 7-10' },
  'book.slot.afternoon': { en: 'Afternoon 10-12', hi: 'दोपहर 10-12' },

  // ---- v3.0 — Lab-aware pricing display ----
  'book.pricing.both_labs': {
    en: '{{test}}: Thyrocare ₹{{tp}} / Lal PathLabs ₹{{lp}}',
    hi: '{{test}}: Thyrocare ₹{{tp}} / Lal PathLabs ₹{{lp}}',
  },
  'book.pricing.thyrocare_only': {
    en: '{{test}}: Thyrocare ₹{{tp}} (Lal PathLabs doesn\'t list this)',
    hi: '{{test}}: Thyrocare ₹{{tp}} (Lal PathLabs में यह टेस्ट नहीं है)',
  },
  'book.pricing.lal_only': {
    en: '{{test}}: Lal PathLabs ₹{{lp}} (Thyrocare doesn\'t list this)',
    hi: '{{test}}: Lal PathLabs ₹{{lp}} (Thyrocare में यह टेस्ट नहीं है)',
  },
  'book.pricing.neither': {
    en: '{{test}}: Price on call. Reply STAFF for callback.',
    hi: '{{test}}: मूल्य फ़ोन पर। कॉलबैक के लिए STAFF भेजें।',
  },

  // ---- v3.0 — Lab picker step ----
  'book.pick_lab.prompt': {
    en: 'Which lab? / कौन सी लैब?',
    hi: 'कौन सी लैब? / Which lab?',
  },
  'book.pick_lab.btn_thyrocare': {
    en: 'Thyrocare ₹{{tp}}',
    hi: 'Thyrocare ₹{{tp}}',
  },
  'book.pick_lab.btn_lal': {
    en: 'Lal PathLabs ₹{{lp}}',
    hi: 'Lal PathLabs ₹{{lp}}',
  },

  // ---- v3.0 — Payment step ----
  'book.payment.prompt': {
    en: 'Total ₹{{total}}. Pay now via UPI or at collection? / कुल ₹{{total}}। अभी UPI से भुगतान या सैंपल लेने पर?',
    hi: 'कुल ₹{{total}}। अभी UPI से भुगतान या सैंपल लेने पर? / Total ₹{{total}}. Pay now via UPI or at collection?',
  },
  // v3.2.1 — payee name corrected to "KUMAR CHANDAN PATEL" (the actual name
  // customers see in their UPI app, since the VPA is bound to a personal
  // account; setting it to the lab name caused customer confusion).
  'book.payment.upi_text': {
    en: '💳 *Pay ₹{{total}} via UPI*\nBooking: {{id}}\n\nTap link to open UPI app:\n{{link}}\n\nOr long-press to copy UPI ID:\n`{{vpa}}`\n\nYou\'ll see recipient as: *KUMAR CHANDAN PATEL*\n\nAfter paying, tap *✓ I\'ve Paid* below or send a screenshot. Team verifies in 2 hours.',
    hi: '💳 *UPI से ₹{{total}} का भुगतान*\nबुकिंग: {{id}}\n\nUPI ऐप खोलने के लिए दबाएँ:\n{{link}}\n\nUPI ID कॉपी करने के लिए लंबा दबाएँ:\n`{{vpa}}`\n\nआपको receiver दिखेगा: *KUMAR CHANDAN PATEL*\n\nभुगतान के बाद नीचे *✓ भुगतान हो गया* दबाएँ या स्क्रीनशॉट भेजें। टीम 2 घंटे में पुष्टि करेगी।',
  },
  'book.payment.btn_paid': {
    en: '✓ I\'ve Paid / भुगतान हो गया',
    hi: '✓ भुगतान हो गया / I\'ve Paid',
  },
  'book.payment.btn_collection': {
    en: '💵 Pay at Collection / सैंपल पर भुगतान',
    hi: '💵 सैंपल पर भुगतान / Pay at Collection',
  },
  'book.payment.thanks_paid': {
    en: 'Got it ✓ Team verifies in 2 hours / धन्यवाद ✓ टीम 2 घंटे में पुष्टि करेगी',
    hi: 'धन्यवाद ✓ टीम 2 घंटे में पुष्टि करेगी / Got it ✓ Team verifies in 2 hours',
  },
  'book.payment.collection_confirmed': {
    en: 'Booked ✓ Pay ₹{{total}} on collection / बुकिंग पुष्टि ✓ सैंपल पर ₹{{total}} दें',
    hi: 'बुकिंग पुष्टि ✓ सैंपल पर ₹{{total}} दें / Booked ✓ Pay ₹{{total}} on collection',
  },

  // ---- v3.2.1 — Separate "staff will call" promise sent after the booking
  // summary and before the payment prompt. Includes tap-to-call number on
  // its own line (WhatsApp auto-detects and makes it tappable).
  'book.staff_call_promise': {
    en: 'Our staff will call you shortly to confirm details.\n\n📞 Need to talk now? Call us:\n+91 97985 86981',
    hi: 'हमारा स्टाफ़ जल्द कॉल करके पुष्टि करेगा।\n\n📞 अभी बात करनी है? कॉल करें:\n+91 97985 86981',
  },

  // ---- Location step (v2.2) ----
  'book.location.prompt': {
    en: '📍 Share location for sample pickup / सैंपल पिकअप के लिए लोकेशन भेजें\n\nWhere should our team come? / कहाँ आना है हमारी टीम को?',
    hi: '📍 सैंपल पिकअप के लिए लोकेशन भेजें / Share location for sample pickup\n\nकहाँ आना है हमारी टीम को? / Where should our team come?',
  },
  'book.location.btn_send':  { en: '📍 Send Location',     hi: '📍 लोकेशन भेजें' },
  'book.location.btn_type':  { en: '📝 Type Address',      hi: '📝 पता लिखें' },
  'book.location.btn_visit': { en: '🏥 Visit Lab Instead', hi: '🏥 लैब आऊँगा' },
  'book.location.send_instruction': {
    en: 'Tap the 📎 attachment icon → Location → Send your current location.\n\nनीचे 📎 आइकन दबाएँ → Location → अपनी मौजूदा लोकेशन भेजें।',
    hi: 'नीचे 📎 आइकन दबाएँ → Location → अपनी मौजूदा लोकेशन भेजें।\n\nTap the 📎 attachment icon → Location → Send your current location.',
  },
  'book.location.text_prompt': {
    en: 'Type the full address (house, area, landmarks, pincode):',
    hi: 'पूरा पता लिखें (मकान, इलाक़ा, लैंडमार्क, पिनकोड):',
  },
  'book.location.visit_lab': {
    en: '🏥 *Visit our lab*\nUnique Janch Ghar (formerly Hi-tech Patho Lab Rajgir)\nNear RX India Pharma, opp. Sub-Divisional Hospital,\nRajgir, Nalanda, Bihar 803116\n\n🕒 Mon–Sat 7AM–9PM, Sun 7AM–12PM\n📞 +91 9798586981',
    hi: '🏥 *लैब आइए*\nयूनिक जाँच घर (पहले हाई-टेक पैथो लैब राजगीर)\nRX India Pharma के पास, सब-डिविज़नल हॉस्पिटल के सामने,\nराजगीर, नालंदा, बिहार 803116\n\n🕒 सोम–शनि 7AM–9PM, रवि 7AM–12PM\n📞 +91 9798586981',
  },
  'book.location.got_share': {
    en: '✅ Got your pickup location: {{address}}',
    hi: '✅ पिकअप लोकेशन मिल गई: {{address}}',
  },
  'book.location.got_text': {
    en: '✅ Got your pickup address: {{address}}',
    hi: '✅ पिकअप पता मिल गया: {{address}}',
  },

  // ---- Confirm + success (v2.2: address line; v3.0: chosen_lab line) ----
  'book.confirm.body':   {
    en: 'Booking summary:\n{{items}}\nTotal: ₹{{total}}\nDate: {{date}}\nSlot: {{slot}}\nPickup: {{address}}',
    hi: 'बुकिंग सारांश:\n{{items}}\nकुल: ₹{{total}}\nतारीख़: {{date}}\nसमय: {{slot}}\nपिकअप: {{address}}',
  },
  'book.confirm.yes':    { en: 'Confirm', hi: 'कन्फ़र्म' },
  'book.confirm.no':     { en: 'Cancel', hi: 'रद्द' },
  'book.success':        {
    en: '✅ Booking saved\n\nBooking ID: {{id}}\n{{items}}\nTotal: ₹{{total}}\nDate: {{date}}\nSlot: {{slot}}\nPickup: {{address}}\n\nOur team will call you to confirm. Reply MENU to start over.',
    hi: '✅ बुकिंग सेव हो गई\n\nबुकिंग ID: {{id}}\n{{items}}\nकुल: ₹{{total}}\nतारीख़: {{date}}\nसमय: {{slot}}\nपिकअप: {{address}}\n\nहमारी टीम कन्फ़र्म करने के लिए कॉल करेगी। फिर से शुरू करने के लिए MENU भेजें।',
  },
  // v3.0 — confirmation that names the chosen lab so the customer sees it.
  'book.success.with_lab': {
    en: '✅ Booking saved\n\nBooking ID: {{id}}\n{{items}}\nTotal: ₹{{total}}\nDate: {{date}}\nSlot: {{slot}}\nPickup: {{address}}\nLab: {{chosen_lab}}\n\nNext step: complete payment below.',
    hi: '✅ बुकिंग सेव हो गई\n\nबुकिंग ID: {{id}}\n{{items}}\nकुल: ₹{{total}}\nतारीख़: {{date}}\nसमय: {{slot}}\nपिकअप: {{address}}\nलैब: {{chosen_lab}}\n\nअगला स्टेप: नीचे भुगतान पूरा करें।',
  },
  'book.cancelled':      { en: 'Booking cancelled. Reply MENU to start over.', hi: 'बुकिंग रद्द। फिर से शुरू करने के लिए MENU भेजें।' },

  // ---- Cart (multi-test, v2.1) ----
  'cart.added':          {
    en: 'Added {{test}}. ₹{{price}} added to cart. Total ₹{{total}}.',
    hi: '{{test}} जोड़ा गया। ₹{{price}} कार्ट में जुड़ा। कुल ₹{{total}}।',
  },
  'cart.add_more':       { en: 'Add Another', hi: 'और जोड़ें' },
  'cart.proceed':        { en: 'Proceed', hi: 'आगे बढ़ें' },
  'cart.summary':        {
    en: 'Cart:\n{{items}}\nTotal: ₹{{total}}',
    hi: 'कार्ट:\n{{items}}\nकुल: ₹{{total}}',
  },

  'status.prompt':       { en: 'Type your name OR your booking ID (e.g. UJG-1234).', hi: 'अपना नाम या बुकिंग ID लिखें (जैसे UJG-1234)।' },
  'status.found':        {
    en: 'Booking {{id}}\nTest: {{test}}\nDate: {{date}} {{slot}}\nStatus: {{status}}\n\n{{note}}',
    hi: 'बुकिंग {{id}}\nटेस्ट: {{test}}\nतारीख़: {{date}} {{slot}}\nस्थिति: {{status}}\n\n{{note}}',
  },
  'status.not_found.body': { en: 'No booking found.', hi: 'कोई बुकिंग नहीं मिली।' },
  'status.book_new':     { en: 'Book New', hi: 'नई बुकिंग' },
  'status.main_menu':    { en: 'Main Menu', hi: 'मुख्य मेनू' },
  'status.note.pending':   { en: 'Sample not yet collected.', hi: 'सैंपल अभी नहीं लिया गया।' },
  'status.note.confirmed': { en: 'Booking confirmed.', hi: 'बुकिंग कन्फ़र्म।' },
  'status.note.collected': { en: 'Sample collected. Report processing.', hi: 'सैंपल लिया गया। रिपोर्ट तैयार हो रही है।' },
  'status.note.ready':     { en: 'Report is ready.', hi: 'रिपोर्ट तैयार है।' },
  'status.note.cancelled': { en: 'This booking was cancelled.', hi: 'यह बुकिंग रद्द कर दी गई।' },

  'catalog.header':      { en: 'Pricing & Tests', hi: 'मूल्य और टेस्ट' },
  'catalog.body':        { en: 'Pick a category.', hi: 'कैटेगरी चुनें।' },
  'catalog.button':      { en: 'Categories', hi: 'कैटेगरी' },
  'catalog.section':     { en: 'Categories', hi: 'कैटेगरी' },
  'catalog.cat.hematology':   { en: 'Hematology', hi: 'हीमेटोलॉजी' },
  'catalog.cat.biochemistry': { en: 'Biochemistry', hi: 'बायोकेमिस्ट्री' },
  'catalog.cat.hormones':     { en: 'Hormones', hi: 'हॉर्मोन' },
  'catalog.cat.diabetes':     { en: 'Diabetes', hi: 'डायबिटीज़' },
  'catalog.cat.vitamins':     { en: 'Vitamins', hi: 'विटामिन' },
  'catalog.cat.urinalysis':   { en: 'Urinalysis', hi: 'यूरिन टेस्ट' },
  'catalog.cat.microbiology': { en: 'Microbiology', hi: 'माइक्रोबायोलॉजी' },
  'catalog.cat.special':      { en: 'Special Tests', hi: 'विशेष टेस्ट' },
  'catalog.tests.header':     { en: 'Tests in {{category}}', hi: '{{category}} के टेस्ट' },
  'catalog.tests.body':       { en: 'Pick a test for details.', hi: 'विवरण के लिए टेस्ट चुनें।' },
  'catalog.tests.button':     { en: 'View', hi: 'देखें' },
  'catalog.test.detail':      {
    en: '{{name}}\nPrice: ₹{{price}}\nSample: {{sample}}\nFasting: {{fasting}}\nReport in: {{tat}}\n\n{{notes}}',
    hi: '{{name}}\nमूल्य: ₹{{price}}\nसैंपल: {{sample}}\nखाली पेट: {{fasting}}\nरिपोर्ट: {{tat}}\n\n{{notes}}',
  },
  'catalog.book_this':        { en: 'Book This Test', hi: 'यह टेस्ट बुक करें' },
  'catalog.back':             { en: 'Back to Menu', hi: 'मेनू पर वापस' },
  'catalog.empty':            { en: 'No tests found.', hi: 'कोई टेस्ट नहीं मिला।' },

  'info.body':           {
    en: 'Unique Janch Ghar (formerly Hi-tech Patho Lab Rajgir)\n\n🕒 Hours\nMon–Sat 7AM–9PM\nSun 7AM–12PM\n\n📞 Phone\n+91 9798586981\n\n📍 Address\nNear RX India Pharma, opp. Sub-Divisional Hospital,\nRajgir, Nalanda, Bihar 803116\n\nReply MENU for the main menu.',
    hi: 'यूनिक जाँच घर (पहले हाई-टेक पैथो लैब राजगीर)\n\n🕒 समय\nसोम–शनि 7AM–9PM\nरवि 7AM–12PM\n\n📞 फ़ोन\n+91 9798586981\n\n📍 पता\nRX India Pharma के पास, सब-डिविज़नल हॉस्पिटल के सामने,\nराजगीर, नालंदा, बिहार 803116\n\nमुख्य मेनू के लिए MENU भेजें।',
  },

  'handoff.prompt':      { en: 'Our staff will call you back. When works best?', hi: 'हमारी टीम कॉल करेगी। कब सही रहेगा?' },
  'handoff.now':         { en: 'Now', hi: 'अभी' },
  'handoff.2h':          { en: 'Within 2 hours', hi: '2 घंटे में' },
  'handoff.tomorrow':    { en: 'Tomorrow morning', hi: 'कल सुबह' },
  'handoff.success':     { en: 'Got it. We will call you {{when}}.', hi: 'ठीक है। हम {{when}} कॉल करेंगे।' },

  'common.menu_hint':    { en: 'Reply MENU to see options.', hi: 'विकल्प देखने के लिए MENU भेजें।' },
  'common.unknown':      { en: 'I did not catch that. Reply MENU.', hi: 'समझ नहीं पाया। MENU भेजें।' },
  'common.rate_limited': { en: 'You are sending too quickly.', hi: 'आप बहुत तेज़ी से भेज रहे हैं।' },
  'common.outside_window': { en: 'Send any message to reopen.', hi: 'फिर से शुरू करने के लिए कोई संदेश भेजें।' },
  'common.cancelled':    { en: 'Cancelled. Reply MENU.', hi: 'रद्द। MENU भेजें।' },
};

module.exports = {
  detectLang: detectLang,
  t: t,
  fill: fill,
  STRINGS: STRINGS,
};
