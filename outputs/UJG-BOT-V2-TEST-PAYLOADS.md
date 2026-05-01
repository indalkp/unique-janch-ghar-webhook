# UJG Bot v2 — Synthetic Test Payloads

8 sample inbound webhook POST bodies that exercise every flow. Use these
for **offline** verification before pointing real WhatsApp at the new code.

## How to sign + POST a payload

Meta requires every webhook POST be signed with HMAC-SHA256 over the **exact
raw body** using the **App Secret**. The webhook rejects unsigned/invalid
calls with 401.

For each payload below:

```bash
APP_SECRET='YOUR_META_APP_SECRET'
PAYLOAD='<paste the JSON body for this test>'

SIG="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $2}')"

# Local (functions-framework on :8080):
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: $SIG" \
  -d "$PAYLOAD"

# Or against the deployed function:
curl -X POST https://asia-south1-unique-janch-ghar.cloudfunctions.net/whatsappWebhook \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: $SIG" \
  -d "$PAYLOAD"
```

> The `printf '%s'` (no newline) is critical — the body bytes must match
> exactly what was hashed.

Replace `<phone-number-id>`, `<from-wa-id>`, `<msg-id>` placeholders before
posting so the Sheet rows look real.

---

## Common envelope

All payloads share this outer shape; only the `messages[0]` object varies.

```jsonc
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "919798586981", "phone_number_id": "<phone-number-id>" },
        "contacts": [{ "profile": { "name": "Test Patient" }, "wa_id": "<from-wa-id>" }],
        "messages": [ /* … message object … */ ]
      }
    }]
  }]
}
```

---

## Test 1 — First-ever message → menu

**Setup:** `<from-wa-id>` has no row in ConvoState.
**Expect:** Menu list (5 rows) sent; ConvoState row appended with
`current_flow=idle`, `current_step=awaiting_menu_pick`.

```json
{ "from": "<from-wa-id>", "id": "wamid.test1", "timestamp": "1714560000",
  "type": "text", "text": { "body": "hi" } }
```

## Test 2 — `menu` keyword reset (English)

**Setup:** ConvoState already shows the customer in the middle of `book`/`pick_slot`.
**Expect:** Menu re-shown; state resets to `idle`/`awaiting_menu_pick`.

```json
{ "from": "<from-wa-id>", "id": "wamid.test2", "timestamp": "1714560100",
  "type": "text", "text": { "body": "menu" } }
```

## Test 3 — Click "Book Test" row from menu

**Setup:** `current_flow=idle`.
**Expect:** Three buttons (Common / Doctor referred / Type test name);
state moves to `book/entry`.

```json
{ "from": "<from-wa-id>", "id": "wamid.test3", "timestamp": "1714560200",
  "type": "interactive",
  "interactive": { "type": "list_reply",
    "list_reply": { "id": "book", "title": "Book Test", "description": "Book a pathology test" } } }
```

## Test 4 — Full Book flow happy path (Common → CBC → Today → Morning → Confirm)

Send these four messages in order. Expect after #4: a `Bookings` row with
`status=PENDING`, `test=CBC (Complete Blood Count)`, today's date, and slot
`Morning 7–10`. Customer receives "✅ Booked!" with a `UJG-...` ID. State
clears to `idle`.

```json
{ "from": "<from-wa-id>", "id": "wamid.test4a", "timestamp": "1714560300",
  "type": "interactive",
  "interactive": { "type": "button_reply",
    "button_reply": { "id": "book_common", "title": "Common Tests" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test4b", "timestamp": "1714560310",
  "type": "interactive",
  "interactive": { "type": "list_reply",
    "list_reply": { "id": "bt_0", "title": "CBC (Complete Blood Count)" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test4c", "timestamp": "1714560320",
  "type": "interactive",
  "interactive": { "type": "button_reply",
    "button_reply": { "id": "date_today", "title": "Today" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test4d", "timestamp": "1714560330",
  "type": "interactive",
  "interactive": { "type": "button_reply",
    "button_reply": { "id": "slot_morning", "title": "Morning 7–10" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test4e", "timestamp": "1714560340",
  "type": "interactive",
  "interactive": { "type": "button_reply",
    "button_reply": { "id": "confirm_yes", "title": "Confirm" } } }
```

## Test 5 — Status lookup by booking ID (found)

**Setup:** Bookings has a row with `booking_id=UJG-260501-1234`,
`wa_id=<from-wa-id>`, `status=READY`.
**Expect:** Status text with the test/date/slot/status; state clears.

```json
{ "from": "<from-wa-id>", "id": "wamid.test5a", "timestamp": "1714560400",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "status", "title": "Check Report Status" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test5b", "timestamp": "1714560410",
  "type": "text", "text": { "body": "UJG-260501-1234" } }
```

## Test 6 — Status lookup, not found (Hindi)

**Setup:** No matching booking for the typed name.
**Expect:** Buttons "नई बुकिंग" / "मुख्य मेनू"; state moves to `status/not_found`.

```json
{ "from": "<from-wa-id>", "id": "wamid.test6a", "timestamp": "1714560500",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "status", "title": "रिपोर्ट स्थिति देखें" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test6b", "timestamp": "1714560510",
  "type": "text", "text": { "body": "रोहन शर्मा" } }
```

## Test 7 — Catalog → category → test detail → book pre-fill

**Setup:** Catalog seeded; `<from-wa-id>` is `idle`.
**Expect:** Category list → test list with prices → detail text with `Book this test`
button. Tapping that button enters `book` flow with the test pre-selected
(skips the Common/Type entry buttons; jumps straight to date).

```json
{ "from": "<from-wa-id>", "id": "wamid.test7a", "timestamp": "1714560600",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "catalog", "title": "Pricing & Tests" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test7b", "timestamp": "1714560610",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "cat_hematology", "title": "Hematology" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test7c", "timestamp": "1714560620",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "t_0", "title": "CBC" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test7d", "timestamp": "1714560630",
  "type": "interactive",
  "interactive": { "type": "button_reply", "button_reply": { "id": "cat_book", "title": "Book This Test" } } }
```

## Test 8 — Handoff → "Within 2 hours"

**Expect:** A row appears in the `Handoff` tab with
`preferred_callback_time=within_2_hours`, `status=PENDING`. Customer receives
the localized confirmation message; state clears.

```json
{ "from": "<from-wa-id>", "id": "wamid.test8a", "timestamp": "1714560700",
  "type": "interactive",
  "interactive": { "type": "list_reply", "list_reply": { "id": "handoff", "title": "Talk to Staff" } } }
```
```json
{ "from": "<from-wa-id>", "id": "wamid.test8b", "timestamp": "1714560710",
  "type": "interactive",
  "interactive": { "type": "button_reply", "button_reply": { "id": "handoff_2h", "title": "Within 2 hours" } } }
```

---

## What to verify after each test

- Cloud Logging shows `meta.send.ok` for outbound, no `meta.send.failed`.
- Sheet rows in `Inbound`, `Outbound`, `Customers`, plus the v2 tabs as relevant.
- ConvoState reflects the expected `current_flow` / `current_step`.
- Status webhook callbacks (Test n+1 onwards) appear in `Status` tab.
