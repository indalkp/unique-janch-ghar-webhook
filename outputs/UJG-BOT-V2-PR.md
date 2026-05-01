# PR — UJG WhatsApp Bot v2 (feat/bot-v2-flows)

**Branch:** `feat/bot-v2-flows`
**Base:** `main` (commit `1bcbc6a`)
**Repo:** https://github.com/indalkp/unique-janch-ghar-webhook

## Summary

Adds five customer-facing conversational flows on top of the existing v1
keyword webhook. v1 keyword path is preserved (untouched `keywords.js` and
`responses/` files) so a roll-back is just a `git revert` away.

| Flow      | What it does                                                          |
| --------- | --------------------------------------------------------------------- |
| `menu`    | Top-level WhatsApp list — five rows mapping to the four other flows   |
| `book`    | entry → test selection → date → slot → confirm → write to `Bookings`  |
| `status`  | Look up a booking by ID or by `(wa_id + name fuzzy)` in `Bookings`    |
| `catalog` | Categories → tests (with prices) → detail → optional book pre-fill   |
| `info`    | Static hours / address / phone in chosen language                     |
| `handoff` | Three-button callback time picker → write to `Handoff` tab            |

Plus:

- `src/state.js` — per-customer state in a `ConvoState` Sheet tab (30 s read cache)
- `src/lang.js` — Devanagari-based language detection + bilingual string dictionary
- `src/actions.js` — extended with `sendInteractiveList` and `sendInteractiveButtons`
- `src/router.js` — rewritten: rate-limit (10/60 s) → lang → state pull → dispatch
- `src/catalog-data.js` — 30-test seed for the Catalog tab
- `scripts/init-sheet-tabs.js` — idempotent tab creator + Catalog seeder

## Files changed / added

| File                              | Status   | Lines |
| --------------------------------- | -------- | -----:|
| `src/state.js`                    | NEW      |  ~205 |
| `src/lang.js`                     | NEW      |  ~135 |
| `src/actions.js`                  | EDIT     |  ~205 |
| `src/router.js`                   | REWRITE  |  ~210 |
| `src/catalog-data.js`             | NEW      |   ~75 |
| `src/flows/menu.js`               | NEW      |   ~50 |
| `src/flows/book.js`               | NEW      |  ~245 |
| `src/flows/status.js`             | NEW      |  ~120 |
| `src/flows/catalog.js`            | NEW      |  ~165 |
| `src/flows/info.js`               | NEW      |   ~25 |
| `src/flows/handoff.js`            | NEW      |   ~55 |
| `scripts/init-sheet-tabs.js`      | NEW      |  ~135 |
| `README.md`                       | EDIT     | +50   |

(Approximate; exact counts in the diff.)

## New Sheet tabs

`scripts/init-sheet-tabs.js` is **idempotent**: existing tabs are not touched,
and Catalog is only seeded if its data area is empty. Run before the first
v2 deploy:

```bash
SHEET_ID=<your-sheet-id> node scripts/init-sheet-tabs.js
```

| Tab        | Header columns                                                                                |
| ---------- | --------------------------------------------------------------------------------------------- |
| Bookings   | booking_id · timestamp · wa_id · customer_name · test · date · slot · status · notes          |
| Catalog    | category · test_name · price_inr · sample_required · fasting_hours · turnaround_hours · notes |
| ConvoState | wa_id · current_flow · current_step · context_json · updated_at                               |
| Handoff    | timestamp · wa_id · customer_name · preferred_callback_time · status · notes                  |

After seeding, **edit Catalog prices** on the Sheet — the seed values are
placeholders. Don't re-run the seed; subsequent runs skip it automatically.

## Deploy steps (after merge to main)

```bash
# 1. Pull main locally (or in Cloud Shell)
git checkout main
git pull origin main

# 2. (one-time) seed Sheet tabs — needs SHEET_ID env + ADC auth
SHEET_ID=<your-sheet-id> node scripts/init-sheet-tabs.js

# 3. Deploy from the repo root
gcloud functions deploy whatsappWebhook \
  --gen2 \
  --region=asia-south1 \
  --source=. \
  --max-instances=10 \
  --memory=256Mi \
  --timeout=60s \
  --project=unique-janch-ghar
```

The deploy command keeps the same `--entry-point=whatsappWebhook`, runtime
(node 20), and trigger as v1 — no Meta-side webhook reconfiguration needed.

## Test plan

### Synthetic (offline, no Meta calls)

8 sample webhook POST bodies in `outputs/UJG-BOT-V2-TEST-PAYLOADS.md` cover:

1. First-ever message → menu shows
2. `menu` keyword reset
3. Click `book` row → entry buttons
4. Common tests → date today → slot → confirm → booking row written
5. Status lookup by booking ID (found path)
6. Status lookup by name (not found path → buttons)
7. Catalog → category → test detail → book pre-filled
8. Handoff → "Within 2 hours" → row written

Each payload includes a one-liner `openssl` command to compute the correct
`x-hub-signature-256` header for local POSTing against `functions-framework`.

### Real WhatsApp tests (after deploy)

From your registered test phone:

| Step  | Send             | Expect                                         |
| ----- | ---------------- | ---------------------------------------------- |
| 1     | `Hi`             | List menu (5 rows)                             |
| 2     | tap "Book Test"  | 3 buttons (Common / Doctor / Type)             |
| 3     | tap "Common"     | List of 10 popular tests                       |
| 4     | pick "CBC"       | Date buttons                                   |
| 5     | tap "Today"      | Slot buttons                                   |
| 6     | tap "Morning"    | Summary + Confirm/Cancel                       |
| 7     | tap "Confirm"    | "✅ Booked" with `UJG-…` ID; row in Bookings   |
| 8     | `menu`           | List menu                                      |
| 9     | tap "Pricing"    | Categories                                     |
| 10    | pick "Hematology"| Tests with prices                              |

Switch to Hindi (e.g. `नमस्ते`) — same flow should respond in Hindi.

## Roll-back

```bash
git revert <merge-sha> && git push origin main
gcloud functions deploy whatsappWebhook --gen2 --region=asia-south1 --source=. --project=unique-janch-ghar
```

Sheet tabs created by the init script can stay — they are inert without
the v2 code.

## Constraints honoured

- Free tier only — `--max-instances=10`, `--memory=256Mi`, no template sends.
- Sheet caches: 30 s ConvoState, 5 min Catalog.
- Per-`wa_id` rate limit: 10 messages / 60 s.
- 24h-window guard wired in router (currently always-true; tighten later).
- All v1 paths (keyword auto-reply, after-hours short-circuit) preserved.

## Known follow-ups

- Wire `logOutbound` to flow sends so every bot message hits the Outbound tab.
- Replace info placeholders in `src/lang.js` (`info.body`) with real phone /
  address strings — currently `+91-XXXXXXXXXX`.
- Tighten 24h-window check using `Customers.last_seen` (currently always passes).
- Consider moving rate-limit state to a tiny Sheet-backed store if multi-
  instance accuracy becomes a concern (today: per-instance only).
