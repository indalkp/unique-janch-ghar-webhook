# ARCHIVE — Paid template flow (NOT in main code path)

This file documents the proactive notification system the lab will turn on
**when it decides to pay for WhatsApp template messages**. Until then, this
code is intentionally **not loaded** by `index.js`. The main webhook ships
with free-form replies only — that's the entire reason the lab can run on
free tier.

## When to graduate

Move this code into `src/templates.js` and wire it in if any of the following
become true:

1. The lab wants to send report-ready notifications **outside** the 24-hour
   customer-service window (most common reason).
2. The lab wants to send appointment reminders the day before.
3. Volume crosses ~1,000 conversations/month — at scale, occasional template
   sends pay for themselves in conversion.

## How template sends differ from free-form

| Aspect              | Free-form (current)              | Template (paid)                     |
| ------------------- | -------------------------------- | ----------------------------------- |
| Window              | 24h after customer's last msg    | Anytime                             |
| Cost (India, 2026)  | ₹0                               | ~₹0.30–₹0.80 per delivery, varies   |
| Approval            | None                             | Submit each template, ~24h review   |
| Variables           | Free string                      | Numbered placeholders {{1}}, {{2}}  |
| Use cases           | Replying to inbound              | Proactive: report ready, reminders  |

## sendTemplate function (paste into src/actions.js when activating)

```js
/**
 * Send a pre-approved template message. PAID — every send is billable.
 * Only call this for proactive sends OUTSIDE the 24-hour window.
 *
 * @param {string} to              — E.164 without '+'
 * @param {string} templateName    — exact name from WhatsApp Manager
 * @param {string} languageCode    — e.g. "en" or "hi" or "en_US"
 * @param {Array<string>} variables — body variables in order, fills {{1}},{{2}}…
 * @returns {Promise<Object>}
 */
async function sendTemplate(to, templateName, languageCode, variables = []) {
  const components = variables.length > 0
    ? [{
        type: 'body',
        parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
      }]
    : [];

  return metaPost({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}
```

## 5 templates to submit to Meta for approval

Submit these in WhatsApp Manager → Message Templates → Create Template.
All five use **Utility** category (cheaper) except `lab_promotion` which
must be **Marketing**.

### 1. `report_ready_v1` (Utility, hi)

> नमस्ते {{1}}, आपकी {{2}} रिपोर्ट तैयार है।
> आप इसे यहीं डाउनलोड कर सकते हैं या REPORT लिखकर भेजें — हम भेज देंगे।
>
> — Unique Janch Ghar

Variables: `{{1}}` patient name, `{{2}}` test name.

### 2. `report_ready_v1_en` (Utility, en)

> Hi {{1}}, your {{2}} report is ready. Reply REPORT and we'll send it here.
> — Unique Janch Ghar

### 3. `appointment_reminder_v1` (Utility, hi)

> नमस्ते {{1}}, कल {{2}} को आपकी {{3}} जांच की अपॉइंटमेंट है।
> कोई बदलाव? बस इस मैसेज पर रिप्लाई करें।

Variables: name, date, test.

### 4. `home_visit_confirmed_v1` (Utility, hi)

> {{1}} जी, आपकी होम कलेक्शन की पुष्टि हो गई है।
> समय: {{2}}
> पता: {{3}}
> फ्लेबोटोमिस्ट: {{4}}

### 5. `lab_promotion_health_camp_v1` (Marketing, hi)

> नमस्ते 🙏 इस महीने Unique Janch Ghar में {{1}} जांच पर {{2}}% की छूट।
> बुक करने के लिए BOOK लिखें या कॉल करें +91 9798586981.
>
> Reply STOP to opt out.

## Submission checklist

For each template:

1. **Header** — keep optional unless you really need an image/document header
   (image headers double the per-conversation cost in some categories).
2. **Body** — every variable must have a sample value when you submit.
3. **Footer** — "Reply STOP to opt out" required for Marketing category.
4. **Buttons** — one or two quick replies max. URL buttons get rejected
   more often than they get approved unless you own the domain.
5. After submission Meta usually reviews in 1–24 hours. Most rejections are
   for category mismatch (Marketing content submitted as Utility) or for
   missing opt-out language. Re-submit with fix; no penalty for retries.

## Cost gate

Add this **before** every `sendTemplate` call when the function goes live:

```js
const monthlyTemplateBudget = 5000; // count
const sentThisMonth = await getMonthlyTemplateCount(); // implement via Sheet count
if (sentThisMonth >= monthlyTemplateBudget) {
  log.warn('template.budget.exceeded', { sentThisMonth });
  return; // do NOT send
}
```

Without a budget gate, a buggy loop can send tens of thousands of paid
messages in minutes. Don't skip this.

## When you flip the switch

1. Submit and get approval on at least `report_ready_v1` and `report_ready_v1_en`.
2. Paste `sendTemplate` from this file into `src/actions.js`.
3. Add the budget gate.
4. Add a new event somewhere in `routeEvent` or a separate trigger (e.g. a
   "report ready" message from staff in the Sheet → Apps Script → calls our
   webhook with a special payload → we send the template).
5. Update the README — flip the "Free-tier only" warning to "Hybrid mode".
