/**
 * src/lang.js — Language detection + i18n strings for Indal KP Studio.
 *
 * Brand: Indal KP Studio (Indal KP | Creative Technologist & Film Maker)
 * Number: +91 9724508082
 * Website: https://indalkp.com
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
  // ---- Welcome / menu ----
  'welcome.title':       { en: 'Welcome to Indal KP Studio', hi: 'इन्दल केपी स्टूडियो में आपका स्वागत है' },
  'welcome.body':        {
    en: '_Creative Technologist & Film Maker_\n\nHow can we help bring your visual vision to life? Pick a service below.',
    hi: '_चलचित्र निर्माण एवं रचनात्मक स्वचालन_\n\nहम आपके प्रोजेक्ट में कैसे सहयोग कर सकते हैं? नीचे से सेवा चुनें।',
  },
  'welcome.text':        {
    en: '🎬 *Welcome to Indal KP Studio* / *इन्दल केपी स्टूडियो में आपका स्वागत है*\n_Creative Technologist & Film Maker_\n_(चलचित्र निर्माण एवं रचनात्मक स्वचालन)_\n\nHow can we help bring your visual vision to life? / आज हम आपके प्रोजेक्ट में कैसे सहयोग कर सकते हैं?',
    hi: '🎬 *इन्दल केपी स्टूडियो में आपका स्वागत है* / *Welcome to Indal KP Studio*\n_चलचित्र निर्माण एवं रचनात्मक स्वचालन_\n_(Creative Technologist & Film Maker)_\n\nआज हम आपके प्रोजेक्ट में कैसे सहयोग कर सकते हैं? / How can we help bring your visual vision to life?',
  },
  'menu.title.short':    { en: '📋 Select Studio Service', hi: '📋 सेवा चुनें' },
  'menu.body':           { en: 'Pick a service below to explore packages or book a project.', hi: 'पैकेज देखने या प्रोजेक्ट बुक करने के लिए नीचे से चुनें।' },
  'menu.button':         { en: 'Open Menu', hi: 'मेनू खोलें' },
  'menu.section.title':  { en: 'Studio Services', hi: 'स्टूडियो सेवाएँ' },
  'menu.book':           { en: 'Book Project', hi: 'प्रोजेक्ट बुक करें' },
  'menu.book.desc':      { en: 'Commercials, Preproduction, Automation', hi: 'विज्ञापन, प्री-प्रोडक्शन, स्वचालन' },
  'menu.status':         { en: 'Project Status', hi: 'प्रोजेक्ट स्थिति' },
  'menu.status.desc':    { en: 'Check your production status', hi: 'अपने प्रोजेक्ट की स्थिति देखें' },
  'menu.catalog':        { en: 'Packages & 50% Rates', hi: 'पैकेज एवं 50% दरें' },
  'menu.catalog.desc':   { en: 'Browse 50% inaugural launch rates', hi: '50% विशेष छूट के साथ दरें देखें' },
  'menu.info':           { en: 'Studio & Contact', hi: 'स्टूडियो एवं संपर्क' },
  'menu.info.desc':      { en: 'Hours, indalkp.com, contact', hi: 'कार्य समय, वेबसाइट, संपर्क' },
  'menu.handoff':        { en: 'Talk to Indal KP', hi: 'इंडाल केपी से बात करें' },
  'menu.handoff.desc':   { en: 'Direct creative consultation callback', hi: 'व्यक्तिगत परामर्श का अनुरोध' },

  // ---- Book flow ----
  'book.entry.body':     { en: 'Select a creative production package:', hi: 'उत्पादन पैकेज चुनें:' },
  'book.entry.common':   { en: 'Featured Packages', hi: 'प्रमुख पैकेज' },
  'book.entry.referred': { en: 'Custom Brief', hi: 'कस्टम ब्रीफ़' },
  'book.entry.type':     { en: 'Type Package Name', hi: 'पैकेज का नाम लिखें' },
  'book.list.header':    { en: 'Production Packages', hi: 'उत्पादन पैकेज' },
  'book.list.body':      { en: 'Pick a package to start your project.', hi: 'सूची से एक पैकेज चुनें।' },
  'book.list.button':    { en: 'View Packages', hi: 'पैकेज देखें' },
  'book.list.row_oncall': { en: 'Custom quote', hi: 'कस्टम दर' },
  'book.prompt.name':    { en: 'Type your project brief or package name (e.g. 60s Commercial, Preproduction, Automation).', hi: 'प्रोजेक्ट या पैकेज का नाम लिखें (जैसे 60s Commercial, Preproduction, Automation)।' },
  'book.prompt.date':    { en: 'When would you like to kick off the production? Pick a date:', hi: 'प्रोजेक्ट कब शुरू करना चाहेंगे? दिन चुनें:' },
  'book.date.today':     { en: 'Immediate Kickoff', hi: 'तुरंत शुरुआत' },
  'book.date.tomorrow':  { en: 'Tomorrow', hi: 'कल' },
  'book.date.pick':      { en: 'Pick a Date', hi: 'तारीख़ चुनें' },
  'book.prompt.date.custom': { en: 'Type kickoff date as DD/MM (e.g. 25/09).', hi: 'शुरुआती तारीख़ DD/MM में लिखें (जैसे 25/09)।' },
  'book.invalid.date':   { en: 'That date does not look right. Type DD/MM (e.g. 25/09).', hi: 'तारीख़ सही नहीं लगती। DD/MM में लिखें (जैसे 25/09)।' },
  'book.prompt.slot':    { en: 'Pick preferred discussion slot:', hi: 'चर्चा का समय चुनें:' },
  'book.slot.morning':   { en: 'Morning 10-1', hi: 'सुबह 10-1' },
  'book.slot.afternoon': { en: 'Afternoon 2-6', hi: 'दोपहर 2-6' },

  // ---- Pricing display ----
  'book.pricing.both_labs': {
    en: '{{test}}: ₹{{tp}} (50% Launch Rate)',
    hi: '{{test}}: ₹{{tp}} (50% विशेष दर)',
  },
  'book.pricing.thyrocare_only': {
    en: '{{test}}: ₹{{tp}} (50% Launch Rate)',
    hi: '{{test}}: ₹{{tp}} (50% विशेष दर)',
  },
  'book.pricing.lal_only': {
    en: '{{test}}: ₹{{lp}} (50% Launch Rate)',
    hi: '{{test}}: ₹{{lp}} (50% विशेष दर)',
  },
  'book.pricing.neither': {
    en: '{{test}}: Custom quote on consultation. Reply STAFF for callback.',
    hi: '{{test}}: कस्टम दर। कॉलबैक के लिए STAFF भेजें।',
  },

  // ---- Payment step ----
  'book.payment.prompt': {
    en: 'Total ₹{{total}} (50% Launch Rate). Pay now via UPI or after kickoff review?',
    hi: 'कुल ₹{{total}} (50% विशेष दर)। अभी UPI से भुगतान या समीक्षा के बाद?',
  },
  'book.payment.upi_text': {
    en: '💳 *Pay ₹{{total}} via UPI*\nProject Booking: {{id}}\n\nTap link to open UPI app:\n{{link}}\n\nOr long-press to copy UPI ID:\n`{{vpa}}`\n\nRecipient: *KUMAR CHANDAN PATEL* / *Indal KP*\n\nAfter paying, tap *✓ I\'ve Paid* below or send a screenshot. Production commences immediately upon verification.',
    hi: '💳 *UPI से ₹{{total}} का भुगतान*\nप्रोजेक्ट बुकिंग: {{id}}\n\nUPI ऐप खोलने के लिए दबाएँ:\n{{link}}\n\nUPI ID कॉपी करने के लिए लंबा दबाएँ:\n`{{vpa}}`\n\nRecipient दिखेगा: *KUMAR CHANDAN PATEL* / *Indal KP*\n\nभुगतान के बाद नीचे *✓ भुगतान हो गया* दबाएँ या स्क्रीनशॉट भेजें। पुष्टि होते ही निर्माण कार्य आरंभ होगा।',
  },
  'book.payment.btn_paid': {
    en: '✓ I\'ve Paid / भुगतान हो गया',
    hi: '✓ भुगतान हो गया / I\'ve Paid',
  },
  'book.payment.btn_collection': {
    en: '💵 Pay on Milestone / किस्तों में भुगतान',
    hi: '💵 किस्तों में भुगतान / Pay on Milestone',
  },
  'book.payment.thanks_paid': {
    en: 'Payment noted ✓ Studio team will verify and start your project milestone.',
    hi: 'धन्यवाद ✓ स्टूडियो टीम पुष्टि कर प्रोजेक्ट शुरू करेगी।',
  },
  'book.payment.collection_confirmed': {
    en: 'Project Registered ✓ Milestone payment of ₹{{total}} on review',
    hi: 'प्रोजेक्ट दर्ज ✓ समीक्षा पर ₹{{total}} का भुगतान',
  },

  'book.staff_call_promise': {
    en: 'Indal KP will personally review your brief and connect shortly.\n\n📞 Direct line:\n+91 9724508082\n🌐 Portfolio:\nhttps://indalkp.com',
    hi: 'इंडाल केपी व्यक्तिगत रूप से आपके ब्रीफ़ की समीक्षा कर शीघ्र संपर्क करेंगे।\n\n📞 संपर्क नंबर:\n+91 9724508082\n🌐 पोर्टफोलियो:\nhttps://indalkp.com',
  },

  // ---- Location / Brief step ----
  'book.location.prompt': {
    en: '📁 Share your project brief link or company location:\n\nWhere can we review your scripts or references?',
    hi: '📁 अपने प्रोजेक्ट ब्रीफ़ का लिंक या कंपनी विवरण साझा करें:\n\nहम आपकी स्क्रिप्ट या संदर्भ कहाँ देख सकते हैं?',
  },
  'book.location.btn_send':  { en: '📍 Send Location',     hi: '📍 लोकेशन भेजें' },
  'book.location.btn_type':  { en: '📝 Type Brief / Link', hi: '📝 ब्रीफ़ / लिंक लिखें' },
  'book.location.btn_visit': { en: '🌐 Visit indalkp.com', hi: '🌐 वेबसाइट देखें' },
  'book.location.send_instruction': {
    en: 'Send your project script link, drive folder, or company location.',
    hi: 'प्रोजेक्ट स्क्रिप्ट लिंक, ड्राइव फ़ोल्डर या कंपनी लोकेशन भेजें।',
  },
  'book.location.text_prompt': {
    en: 'Type your project brief, script outline, or reference drive link:',
    hi: 'प्रोजेक्ट ब्रीफ़, स्क्रिप्ट या संदर्भ ड्राइव लिंक लिखें:',
  },
  'book.location.visit_lab': {
    en: '🌐 *Indal KP Studio*\n_Creative Technologist & Film Maker_\n\nExplore portfolio & breakdown reels:\nhttps://indalkp.com\n\n✉️ indalkp@gmail.com\n📞 +91 9724508082',
    hi: '🌐 *इन्दल केपी स्टूडियो*\n_चलचित्र निर्माण एवं रचनात्मक स्वचालन_\n\nपोर्टफोलियो एवं ब्रेकडाउन रील्स देखें:\nhttps://indalkp.com\n\n✉️ indalkp@gmail.com\n📞 +91 9724508082',
  },
  'book.location.got_share': {
    en: '✅ Got your location/link: {{address}}',
    hi: '✅ लोकेशन / लिंक मिल गया: {{address}}',
  },
  'book.location.got_text': {
    en: '✅ Got your project brief: {{address}}',
    hi: '✅ प्रोजेक्ट ब्रीफ़ मिल गया: {{address}}',
  },

  // ---- Confirm + success ----
  'book.confirm.body':   {
    en: 'Project Booking Summary:\n{{items}}\nTotal: ₹{{total}} (50% Launch Rate)\nKickoff Date: {{date}}\nDiscussion Slot: {{slot}}\nBrief/Ref: {{address}}',
    hi: 'प्रोजेक्ट बुकिंग सारांश:\n{{items}}\nकुल: ₹{{total}} (50% विशेष दर)\nशुरुआती तारीख़: {{date}}\nसमय: {{slot}}\nब्रीफ़: {{address}}',
  },
  'book.confirm.yes':    { en: 'Confirm Booking', hi: 'कन्फ़र्म करें' },
  'book.confirm.no':     { en: 'Cancel', hi: 'रद्द करें' },
  'book.success':        {
    en: '✅ Project Booking Saved\n\nBooking ID: {{id}}\n{{items}}\nTotal: ₹{{total}} (50% Launch Rate)\nKickoff: {{date}}\nSlot: {{slot}}\nBrief: {{address}}\n\nIndal KP will personally connect to review the brief. Reply MENU to start over.',
    hi: '✅ प्रोजेक्ट बुकिंग सेव हो गई\n\nबुकिंग ID: {{id}}\n{{items}}\nकुल: ₹{{total}} (50% विशेष दर)\nतारीख़: {{date}}\nसमय: {{slot}}\nब्रीफ़: {{address}}\n\nइंडाल केपी शीघ्र संपर्क करेंगे। फिर से शुरू करने के लिए MENU भेजें।',
  },
  'book.success.with_lab': {
    en: '✅ Project Booking Saved\n\nBooking ID: {{id}}\n{{items}}\nTotal: ₹{{total}} (50% Launch Rate)\nKickoff: {{date}}\nSlot: {{slot}}\nBrief: {{address}}\n\nNext step: complete payment or confirm milestone below.',
    hi: '✅ प्रोजेक्ट बुकिंग सेव हो गई\n\nबुकिंग ID: {{id}}\n{{items}}\nकुल: ₹{{total}} (50% विशेष दर)\nतारीख़: {{date}}\nसमय: {{slot}}\nब्रीफ़: {{address}}\n\nअगला स्टेप: नीचे भुगतान पूरा करें।',
  },
  'book.cancelled':      { en: 'Booking cancelled. Reply MENU to start over.', hi: 'बुकिंग रद्द। फिर से शुरू करने के लिए MENU भेजें।' },

  // ---- Cart (multi-item) ----
  'cart.added':          {
    en: 'Added {{test}}. ₹{{price}} added. Total ₹{{total}}.',
    hi: '{{test}} जोड़ा गया। ₹{{price}} जुड़ा। कुल ₹{{total}}।',
  },
  'cart.add_more':       { en: 'Add Another Package', hi: 'और पैकेज जोड़ें' },
  'cart.proceed':        { en: 'Proceed', hi: 'आगे बढ़ें' },
  'cart.summary':        {
    en: 'Selected Packages:\n{{items}}\nTotal: ₹{{total}}',
    hi: 'चुने गए पैकेज:\n{{items}}\nकुल: ₹{{total}}',
  },

  // ---- Status flow ----
  'status.prompt':       { en: 'Type your name OR your booking ID (e.g. IKP-260918-1234).', hi: 'अपना नाम या बुकिंग ID लिखें (जैसे IKP-260918-1234)।' },
  'status.found':        {
    en: 'Project {{id}}\nPackage: {{test}}\nKickoff: {{date}} {{slot}}\nStatus: {{status}}\n\n{{note}}',
    hi: 'प्रोजेक्ट {{id}}\nपैकेज: {{test}}\nशुरुआत: {{date}} {{slot}}\nस्थिति: {{status}}\n\n{{note}}',
  },
  'status.not_found.body': { en: 'No active project booking found.', hi: 'कोई प्रोजेक्ट बुकिंग नहीं मिली।' },
  'status.book_new':     { en: 'Book New Project', hi: 'नया प्रोजेक्ट बुक करें' },
  'status.main_menu':    { en: 'Main Menu', hi: 'मुख्य मेनू' },
  'status.note.pending':   { en: 'Brief under initial review.', hi: 'ब्रीफ़ की प्रारंभिक समीक्षा जारी है।' },
  'status.note.confirmed': { en: 'Project confirmed. Preproduction commenced.', hi: 'प्रोजेक्ट कन्फ़र्म। प्री-प्रोडक्शन शुरू।' },
  'status.note.collected': { en: 'In active production pipeline.', hi: 'निर्माण कार्य सक्रिय रूप से जारी है।' },
  'status.note.ready':     { en: 'Master video renders ready for review.', hi: 'मास्टर वीडियो रेंडर समीक्षा के लिए तैयार हैं।' },
  'status.note.cancelled': { en: 'This project booking was cancelled.', hi: 'यह प्रोजेक्ट बुकिंग रद्द कर दी गई।' },

  // ---- Catalog flow ----
  'catalog.header':      { en: 'Studio Packages & Rates', hi: 'स्टूडियो पैकेज एवं दरें' },
  'catalog.body':        { en: 'Pick a category to explore 50% discounted launch rates:', hi: '50% विशेष छूट के साथ पैकेज देखने के लिए श्रेणी चुनें:' },
  'catalog.button':      { en: 'Categories', hi: 'श्रेणियां' },
  'catalog.section':     { en: 'Categories', hi: 'श्रेणियां' },
  'catalog.cat.commercial':   { en: 'Commercial Video', hi: 'कमर्शियल वीडियो' },
  'catalog.cat.preproduction': { en: 'Preproduction', hi: 'प्री-प्रोडक्शन' },
  'catalog.cat.automation':    { en: 'Creator Automation', hi: 'क्रिएटर ऑटोमेशन' },
  'catalog.cat.motion':        { en: 'Motion Reel', hi: 'मोशन रील' },
  'catalog.tests.header':     { en: 'Packages in {{category}}', hi: '{{category}} के पैकेज' },
  'catalog.tests.body':       { en: 'Pick a package for details.', hi: 'विवरण के लिए पैकेज चुनें।' },
  'catalog.tests.button':     { en: 'View', hi: 'देखें' },
  'catalog.test.detail':      {
    en: '🎬 {{name}}\nRate: ₹{{price}} (50% Launch Rate)\nScope: {{sample}}\nTurnaround: {{tat}}\n\n{{notes}}',
    hi: '🎬 {{name}}\nदर: ₹{{price}} (50% विशेष दर)\nदायरा: {{sample}}\nसमय: {{tat}}\n\n{{notes}}',
  },
  'catalog.book_this':        { en: 'Book This Package', hi: 'यह पैकेज बुक करें' },
  'catalog.back':             { en: 'Back to Menu', hi: 'मेनू पर वापस' },
  'catalog.empty':            { en: 'No packages found in this category.', hi: 'इस श्रेणी में कोई पैकेज नहीं मिला।' },

  // ---- Info flow ----
  'info.body':           {
    en: '🎬 *Indal KP Studio*\n_Indal KP — Creative Technologist & Film Maker_\n\nCrafting hybrid 2D hand-drawn animation, cinematic AI commercials, and custom preproduction pipelines. From conceptual script and storyboard to living characters and turnkey video assets.\n\nकला और तकनीक का अद्वितीय संगम — चलचित्र निर्माण एवं रचनात्मक स्वचालन।\n\n🕒 *Business Hours*\nMonday – Saturday: 09:00 – 21:00 IST\nSunday: Focused Production Sprints\n\n🌐 *Website & Portfolio*\nhttps://indalkp.com\n\n✉️ *Email*\nindalkp@gmail.com\n\n📱 *WhatsApp / Direct Line*\n+91 9724508082\n\nReply MENU anytime for services.',
    hi: '🎬 *इन्दल केपी स्टूडियो*\n_इंडाल केपी — Creative Technologist & Film Maker_\n\nकला और तकनीक का अद्वितीय संगम — 2D एनिमेशन, चलचित्र विज्ञापन (Commercials) और रचनात्मक स्वचालन (Automation)।\n\n🕒 *कार्य समय*\nसोमवार – शनिवार: 09:00 – 21:00 IST\nरविवार: प्रोडक्शन स्प्रिंट्स\n\n🌐 *वेबसाइट एवं पोर्टफोलियो*\nhttps://indalkp.com\n\n✉️ *ईमेल*\nindalkp@gmail.com\n\n📱 *व्हाट्सएप / डायरेक्ट लाइन*\n+91 9724508082\n\nमुख्य मेनू के लिए MENU भेजें।',
  },

  // ---- Handoff flow ----
  'handoff.prompt':      { en: 'Indal KP will personally connect with you for creative consultation. When works best?', hi: 'इंडाल केपी परामर्श के लिए संपर्क करेंगे। कब बात करना चाहेंगे?' },
  'handoff.now':         { en: 'ASAP / तुरंत', hi: 'तुरंत' },
  'handoff.2h':          { en: 'Within 2 hours', hi: '2 घंटे में' },
  'handoff.tomorrow':    { en: 'Tomorrow morning', hi: 'कल सुबह' },
  'handoff.success':     { en: 'Got it. Indal KP will connect with you {{when}} on this WhatsApp line.', hi: 'ठीक है। इंडाल केपी {{when}} इसी व्हाट्सएप पर संपर्क करेंगे।' },

  'common.menu_hint':    { en: 'Reply MENU to see options.', hi: 'विकल्प देखने के लिए MENU भेजें।' },
  'common.unknown':      { en: 'I did not catch that. Reply MENU to see studio services.', hi: 'समझ नहीं पाया। सेवाएं देखने के लिए MENU भेजें।' },
  'common.rate_limited': { en: 'You are sending too quickly.', hi: 'आप बहुत तेज़ी से भेज रहे हैं।' },
  'common.outside_window': { en: 'Send any message to reopen conversation.', hi: 'फिर से शुरू करने के लिए कोई संदेश भेजें।' },
  'common.cancelled':    { en: 'Cancelled. Reply MENU to start over.', hi: 'रद्द। फिर से शुरू करने के लिए MENU भेजें।' },
};

module.exports = {
  detectLang,
  t,
  fill,
  STRINGS,
};
