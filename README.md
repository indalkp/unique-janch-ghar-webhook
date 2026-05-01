# Unique Janch Ghar — WhatsApp Webhook

WhatsApp Business Cloud API webhook for **Unique Janch Ghar** (diagnostic lab).
Receives customer messages, replies with keyword-driven free-form text, and
logs every interaction to a Google Sheet that lab staff use as their dashboard.

Runs on **Google Cloud Functions Gen 2** in **asia-south1**. Free-tier strict —
no paid template sends in the main flow. Template logic is parked in
[ARCHIVE.md](./ARCHIVE.md) for the day the lab decides to go paid.

---

## Lab info

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Lab name         | Unique Janch Ghar                                                                      |
| WhatsApp / phone | +91 9798586981                                                                         |
| Address          | Near RX India Pharma, opp. Sub-Divisional Hospital, Nalanda, Rajgir, Bihar 803116      |
| GCP account      | hitechrajgir@gmail.com (deploy from this account; billing must be enabled before deploy) |

---

## Architecture

```
                                                   ┌─────────────────────┐
  ┌─────────┐    inbound     ┌──────┐    https     │  GCF Gen 2          │
  │ Patient │ ─────────────▶ │ Meta │ ────────────▶│  (asia-south1)      │
  │ WhatsApp│                │ WABA │              │                     │
  └─────────┘ ◀────────────  └──────┘ ◀────────────│  whatsappWebhook    │
                outbound                           │   ├─ verify HMAC    │
                                                   │   ├─ keyword match  │
                                                   │   ├─ free-form send │
                                                   │   └─ Sheet append   │
                                                   └──────┬──────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │  Google Sheet            │
                                            │  ├─ Inbound  ├─ Outbound │
                                            │  ├─ Status   ├─ Customers│
                                            └──────────┬───────────────┘
                                                       │  read
                                                       ▼
                                            ┌──────────────────────────┐
                                            │  Lab staff dashboard     │
                                            │  (filter by keyword,     │
                                            │  reply manually inside   │
                                            │  WhatsApp Manager)       │
                                            └──────────────────────────┘
```

Flow: `WhatsApp → Meta → GCF → Sheet`. Lab staff `→ Sheet (read)`.

---

## v2 — Conversational Flows (feature branch `feat/bot-v2-flows`)

v2 replaces the keyword-only auto-reply with five customer-facing flows
built on WhatsApp **list** and **reply-button** messages. Implementation
lives on `feat/bot-v2-flows`; merge + deploy notes live in
`outputs/UJG-BOT-V2-PR.md` (the PR description).

```
inbound msg
   │
   ▼
router.js
   ├─ rate-limit (10/60s, in-memory per instance)
   ├─ detectLang (Devanagari → 'hi', else 'en')
   ├─ getState(wa_id) ──► ConvoState tab (30 s read cache)
   ├─ if 'menu' / idle → showMenu()
   └─ else → flow.handle(input, state)
                │
                ├─ flows/menu.js     (top-level list)
                ├─ flows/book.js     (entry → test → date → slot → confirm)
                ├─ flows/status.js   (lookup by ID or name in Bookings)
                ├─ flows/catalog.js  (categories → tests → detail → book)
                ├─ flows/info.js     (static hours/address)
                └─ flows/handoff.js  (callback request → Handoff tab)
```

**New Sheet tabs (created by `scripts/init-sheet-tabs.js`):**

| Tab        | Purpose                                | Columns                                                                                       |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bookings   | Each test booking from the Book flow   | booking_id · timestamp · wa_id · customer_name · test · date · slot · status · notes          |
| Catalog    | Test catalogue (price, sample, TAT)    | category · test_name · price_inr · sample_required · fasting_hours · turnaround_hours · notes |
| ConvoState | Per-customer conversation state        | wa_id · current_flow · current_step · context_json · updated_at                               |
| Handoff    | Callback requests from Handoff flow    | timestamp · wa_id · customer_name · preferred_callback_time · status · notes                  |

**i18n:** all customer-visible strings in `src/lang.js`, both `hi` and `en`.

**Caches:** ConvoState reads 30 s; Catalog reads 5 min — bounded API calls.

---

## What the webhook does

| Customer says                 | Webhook replies with                         |
| ----------------------------- | -------------------------------------------- |
| `report` / `रिपोर्ट` / `rport`| Asks for patient name + date + bill no.      |
| `book` / `बुकिंग` / `appointment` | Asks for patient + test + slot           |
| `home` / `होम कलेक्शन`        | Home-collection booking flow                  |
| `price` / `रेट` / `कीमत`      | Asks which test, promises rate in 10 min     |
| `hi` / `menu` / `नमस्ते`      | Greeting + interactive list (5 options)      |
| Anything else                 | Polite "didn't understand" + menu            |
| Anything between 21:00 – 08:00 IST | After-hours auto-reply                  |

Every inbound message is appended to the **Inbound** tab. Every outbound is
appended to **Outbound**. Delivery / read receipts go to **Status**. Each
unique sender shows up in **Customers**.

---

## Setup

### 1. Clone

```bash
git clone https://github.com/indalkp/unique-janch-ghar-webhook.git
cd unique-janch-ghar-webhook
npm install
```

### 2. Configure environment

```bash
cp .env.example .env                    # for local testing
cp .env.yaml.example .env.yaml          # for gcloud deploy
```

Fill both with the same values from `.env.example`. **Never commit either.**

### Required env vars

| Variable                | Where to find it                                          |
| ----------------------- | --------------------------------------------------------- |
| `META_VERIFY_TOKEN`     | You pick. Any long random string. Paste same value in Meta dashboard. |
| `META_APP_SECRET`       | developers.facebook.com → App → Settings → Basic → "Show" |
| `META_ACCESS_TOKEN`     | WhatsApp Manager → API Setup. Use a **System User permanent** token in production. |
| `META_PHONE_NUMBER_ID`  | WhatsApp Manager → API Setup → "Phone number ID"          |
| `SHEET_ID`              | The long string between `/d/` and `/edit` in your Sheet URL |

### Optional env vars

`GRAPH_API_VERSION` (default `v18.0`) · `TZ` (default `Asia/Kolkata`) ·
`AFTERHOURS_START` (default `21`) · `AFTERHOURS_END` (default `8`) ·
`LAB_NAME` (default `Unique Janch Ghar`).

---

## Local test

```bash
npm test
```

Runs the Node native test runner — covers HMAC signature verification and
keyword routing. No network calls, no real secrets needed.

To run the webhook locally against real Meta payloads, install
`functions-framework` (already a dep) and run:

```bash
npm start
# Webhook now listening on http://localhost:8080
```

Use [ngrok](https://ngrok.com) or a similar tunnel to expose `localhost:8080`
to Meta during testing.

---

## Deploy

### Prereqs (one-time, on the GCP account `hitechrajgir@gmail.com`)

```bash
# 1. Sign in
gcloud auth login hitechrajgir@gmail.com

# 2. Pick / create the project
gcloud projects create unique-janch-ghar --name="Unique Janch Ghar"
gcloud config set project unique-janch-ghar

# 3. Link a billing account (required for Cloud Functions Gen 2,
#    even though the workload stays inside the free tier).
#    Console → Billing → Link a billing account.

# 4. Enable APIs
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sheets.googleapis.com \
  artifactregistry.googleapis.com
```

### Deploy command

One command:

```bash
gcloud functions deploy whatsappWebhook \
  --gen2 \
  --region=asia-south1 \
  --runtime=nodejs20 \
  --source=. \
  --entry-point=whatsappWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=60s \
  --env-vars-file=.env.yaml
```

If everything is right, gcloud prints a URL like
`https://whatsappwebhook-xxxx-el.a.run.app`. That's your webhook endpoint.

---

## Configure Meta

1. Go to [developers.facebook.com](https://developers.facebook.com) → your App
   → WhatsApp → **Configuration**.
2. **Callback URL**: paste the gcloud URL from above.
3. **Verify token**: paste the **same** string you put in `META_VERIFY_TOKEN`.
4. Click **Verify and Save**. Meta will GET your endpoint with a `hub.challenge`
   query param; the webhook echoes it back. If verification fails, see
   troubleshooting below.
5. Subscribe to the `messages` field at minimum. Optionally subscribe to
   `message_template_status_update`, `message_status` for delivery receipts.

---

## Grant Sheet access

The webhook authenticates to Google Sheets using the function's **default
service account** (Application Default Credentials). No JSON key file in the
repo — that's by design.

Find the service account email:

```bash
gcloud functions describe whatsappWebhook \
  --region=asia-south1 --gen2 \
  --format="value(serviceConfig.serviceAccountEmail)"
```

Output looks like `123456789012-compute@developer.gserviceaccount.com`.

Open the Google Sheet → **Share** → paste that email → role: **Editor** →
uncheck "Notify people" → Send. The webhook can now read and append.

---

## Troubleshooting

### 1. Signature verification fails (every POST returns 401)

Most common cause: wrong `META_APP_SECRET`. Pull it again from
**App Dashboard → Settings → Basic → App Secret → Show**, redeploy.

Second most common: a proxy or middleware mutated `req.rawBody`. The Functions
Framework gives you `req.rawBody` for `Content-Type: application/json` — we
use it directly. If you've added Express body parsing yourself, remove it.

### 2. Verification handshake fails (Meta won't save the webhook)

- Verify token mismatch — copy-paste the SAME string into Meta and `.env.yaml`.
- Function URL not reachable — confirm with `curl https://...?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test`. Should return `test`.
- `--allow-unauthenticated` not set — Meta can't auth with IAM tokens.

### 3. Customer messages received but no reply sent

Check Cloud Logs (see below) for `meta.send.failed`:

- **401 from Meta** — access token expired/revoked. Generate a new one,
  redeploy.
- **131047 — "More than 24 hours"** — this code path means we tried to send
  free-form outside the 24-hour window. Shouldn't happen on inbound replies.
  If you see it, the message we're replying to is older than 24 hours
  (a stale retry). Safe to ignore.
- **130472 — "User's number is part of an experiment"** — Meta's beta. Wait.

### 4. Sheet not updating

- Service account email not added to Sheet — see "Grant Sheet access" above.
- Tab name typo — tabs must be exactly `Inbound`, `Outbound`, `Status`,
  `Customers` (case-sensitive).
- Sheets API not enabled in your GCP project — run
  `gcloud services enable sheets.googleapis.com`.

### 5. 500 errors on the webhook

Check Cloud Logs:

```bash
gcloud functions logs read whatsappWebhook \
  --region=asia-south1 --gen2 --limit=50
```

Or the [Cloud Logging UI](https://console.cloud.google.com/logs). Filter:

```
resource.type="cloud_run_revision"
resource.labels.service_name="whatsappwebhook"
severity>=WARNING
```

Every error log has an `event` field (e.g. `webhook.signature.invalid`,
`meta.send.failed`, `sheet.append.failed`) — search by that.

---

## Free-tier limits

| Resource             | Free quota                                  |
| -------------------- | ------------------------------------------- |
| Cloud Functions Gen 2| 2M invocations/month, 400K GB-seconds/month |
| Outbound Cloud API   | 1,000 service conversations/month (free, since Nov 2024 model) |
| Google Sheets API    | 300 read+write requests/min                 |

A typical small lab does ~3–10 conversations/day → fits comfortably in free
tier. When the lab approaches **800 conversations/month** or wants proactive
reminders, see [ARCHIVE.md](./ARCHIVE.md) for the paid-template upgrade path.

---

## Security notes

- **Never commit `.env` or `.env.yaml`** — both are in `.gitignore`.
- Rotate `META_ACCESS_TOKEN` quarterly. Generate a fresh System User token
  before the old one is used in production.
- The HMAC signature check rejects every POST that isn't from Meta — but the
  endpoint is still public. Don't put PHI/PII in URL paths or query strings.
- Cloud Logs retain entries for 30 days by default. If lab data must not leave
  India, set the GCP project's logging region to `asia-south1`.
- The Google Sheet itself is the soft underbelly — anyone with the share link
  can read all messages. Use organization-restricted share, not link-share.

---

## Files

```
.
├── README.md
├── ARCHIVE.md                          ← Paid template flow (parked)
├── LICENSE
├── package.json
├── index.js                            ← Cloud Function entry
├── src/
│   ├── verify.js                       ← HMAC-SHA256 + timingSafeEqual
│   ├── router.js                       ← Inbound event router
│   ├── keywords.js                     ← Keyword map + fuzzy match
│   ├── actions.js                      ← Outbound senders (free-form only)
│   ├── sheets.js                       ← Google Sheets append
│   ├── config.js                       ← Env var loader
│   └── logger.js                       ← Structured logging
├── responses/
│   ├── greeting.json
│   ├── menu.json                       ← Interactive list (5 options)
│   ├── report.json
│   ├── book.json
│   ├── home.json
│   ├── price.json
│   ├── afterhours.json
│   └── fallback.json
├── test/
│   ├── verify.test.js
│   ├── router.test.js
│   └── fixtures/
│       ├── meta-message-text.json
│       ├── meta-message-button.json
│       ├── meta-message-list.json
│       └── meta-status-delivered.json
├── .github/
│   └── workflows/
│       └── deploy.yml                  ← Optional CI/CD (manual trigger)
├── .env.example
├── .env.yaml.example
├── .gitignore
└── .gcloudignore
```

---

## License

MIT — see [LICENSE](./LICENSE).
