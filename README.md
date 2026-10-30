# FinUp

AI-assisted personal finance: upload a bank statement (PDF, CSV, XLSX), review what was extracted, confirm it, and get dashboards, savings-goal plans and a grounded assistant built only from **your confirmed transactions**.

> Status: working foundation (P0–P2 implemented and tested, P3 bank sync is an honest "not configured" boundary, P4 partially). See [Known limitations](#known-limitations) before relying on it with real money decisions.

## What works today

| Area                                                                                | State                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Statement upload (CSV, XLSX, text PDF) → review → confirm → dashboard               | Implemented, tested                                                                                                                |
| Column auto-detection + manual mapping, date/decimal/currency/debit-credit handling | Implemented, tested                                                                                                                |
| Duplicate detection, invalid/flagged rows, editable review table                    | Implemented, tested                                                                                                                |
| Dashboard, transactions, analytics, budgets                                         | Implemented                                                                                                                        |
| Savings goals with deterministic plan and estimated affordability                   | Implemented, tested                                                                                                                |
| Assistant                                                                           | Deterministic rules-based answers work without any key. LLM path (Anthropic) is implemented but **never run against the real API** |
| Bank connection (Open Banking)                                                      | **Not implemented.** Adapter interface + honest "Not configured" state only                                                        |
| Scanned-PDF OCR                                                                     | **Not implemented.** Returns a clear `OCR_REQUIRED` error, never fabricates rows                                                   |
| Export / delete account, demo data with clear label                                 | Implemented, tested                                                                                                                |

## Prerequisites

- Node.js 20+ (developed on 24)
- PostgreSQL 14+ (developed on 16) running locally. Docker is not required.

## Setup

```bash
npm install
createdb finup
createdb finup_test      # used by the test suite
cp .env.example .env     # optional: defaults already point at local Postgres
npm run migrate          # also runs automatically when the API starts
npm run seed:demo        # optional: demo user demo@finup.local / demo-finup-123 (local dev only)
```

## Run

```bash
npm run dev              # API on :4000, web on http://localhost:5173
```

Register a new account in the UI (or sign in with the seeded demo user), then use **Import** or **Load sample demo data**.

## Check

```bash
npm run typecheck
npm run lint
npm run format:check
npm test                 # vitest, uses the finup_test database (NODE_ENV=test)
npm run build            # production web build
```

## Environment variables

See [.env.example](.env.example). Nothing is required for local use.

| Variable                                 | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `TEST_DATABASE_URL`      | Postgres connection strings                                                                  |
| `PORT`, `MAX_UPLOAD_MB`, `COOKIE_SECURE` | API port, upload limit (default 10), set `true` behind HTTPS                                 |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`   | Optional. Enables the LLM path of the assistant. Unset = deterministic fallback              |
| `BANK_PROVIDER*`                         | Placeholders for a future provider adapter. Setting them today does **not** enable bank sync |

## Bank connections: what is true

There is no universal bank API. A live connection needs: a provider that covers your country and banks, approved credentials, a consent/redirect flow, token storage, sync and end-to-end verification. None of that exists here. What exists:

- `backend/src/banks/provider.ts`: the `BankProvider` interface an adapter must implement and a registry that is intentionally empty.
- `GET /api/banks/status` reports `configured: false` with the reason; `POST /api/banks/connect` returns `409 BANK_NOT_CONFIGURED`.
- A `bank_connections` table whose token column is never returned to clients. Token encryption is **not** implemented yet.
- Finup never scrapes bank sites and never asks for bank passwords.

### Turkey (target market)

Findings from public sources, checked 2026-10-30 (verify with the CBRT/BKM before acting, some sources disagree on details such as capital requirements):

- Open banking for payments is regulated by Law No. 6493 and CBRT regulations; account-information services are a **licensed activity**: a company needs a CBRT operating permit and BKM technical certification.
- Banks expose account information through BKM's **GEÇİT** gateway (live since December 2022; kart bilgi/hareket scope extended March 2026). Third parties integrate once with GEÇİT, not per bank, but only after licensing and certification.
- So a live Turkish connection is a **business/legal step before it is a coding step**. Realistic routes: (A) obtain the licence and certification yourself (months, capital and compliance obligations); (B) integrate through an already-licensed account-information provider under a contract (provider, pricing and API not yet chosen); (C) keep statement upload as the supported path and add per-bank statement profiles for Turkish banks.

Nothing in this repository talks to GEÇİT or any provider. The adapter interface is ready for route A or B once credentials exist.

## Documentation

- [docs/SETUP.md](docs/SETUP.md), [docs/PHONE.md](docs/PHONE.md) (open on a phone / install as app), [docs/DEMO.md](docs/DEMO.md), [docs/DATABASE.md](docs/DATABASE.md), [docs/USER_STORIES.md](docs/USER_STORIES.md)
- [docs/SRS.md](docs/SRS.md): requirements and user stories
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, flows, ERD (Mermaid)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md): what was executed vs what is only planned
- [docs/openapi.yaml](docs/openapi.yaml): API description (hand-written; verify against code before relying on it)

## Known limitations

Honest list, roughly by priority:

1. **Real bank statements are untested.** All fixtures are synthetic. PDF parsing is heuristic (one transaction per line starting with a date, ending with 1–2 amounts); real layouts will need tuning and review rows must always be checked.
2. **No OCR, no live bank sync, LLM path unverified** (see above).
3. **Dependency audit not remediated.** `npm audit` reports 11 findings (including `zod` < 4.6.6 high, `tinypool` critical in test tooling, `react-router`, `uuid`, `esbuild`). Not fixed in this pass.
4. **Security hardening is partial.** Passwords use scrypt, sessions are random server-side tokens in an httpOnly SameSite=Lax cookie, all queries are scoped by user id, rate limits cover auth and assistant only. Missing: CSRF tokens beyond SameSite, email verification, password reset, audit log, bank-token encryption, account lockout.
5. **Pending imports are not resumable.** A review batch lives in the database but the UI only holds the current one; reloading the page loses the pointer (abandoned batches stay in `review`).
6. **Categorization is keyword rules** (English/Turkish). It is a starting point; users can correct categories.
7. **No currency conversion.** Currencies are always reported separately, by design, until rates with timestamps are added.
8. **Demo data mixes with real data** if you import real rows in the same account of the same user; it is labelled and removable.
9. **Budgets** are monthly limits per category and currency, shown for the current month only. **No recurring-goal contributions tracking**: "saved so far" is entered manually.
10. **UI is English only**, with no formal accessibility audit (focus states, labels and contrast were considered, not measured).
11. **Scale:** analytics load a user's transactions in memory; fine for personal use, not for very large histories.

## Prioritized next steps

1. Pick country/banks and implement one verified provider adapter (consent, callback, sync, dedupe, revoke, encrypted tokens).
2. Run against real statements from the target banks and harden the PDF/CSV profiles.
3. Resolve the dependency audit; add CSRF tokens and password reset/verification.
4. Add OCR for scanned PDFs (with review, never silent).
5. Verify the LLM path with a real key and add prompt-injection regression tests against the live model.
6. Accessibility audit and browser end-to-end tests.

## Insights, purchase planner, Arabic and phone install

- **Insights** (`GET /api/insights`): who you paid most (month / all time), spend by category, spend by weekday, costliest days, and rule-based waste-reduction tips. All figures come from `backend/src/insights.ts`; tip "savings" are fixed what-if cuts, not forecasts.
- **Purchase planner** (`POST /api/purchase-plan`): reuses the goal maths, compares the monthly amount with estimated net cash flow, and shows the effect of trimming 20% of flexible categories. Can be saved as a savings goal.
- **Arabic (RTL) and English**: switch in the sidebar, the More tab or Settings. UI strings live in `frontend/src/ar.ts` (English text is the key). Server sentences stay English in the API; the web app maps known ones to Arabic in `frontend/src/serverText.ts` and shows unknown ones unchanged.
- **Phone**: `npm run dev:lan`, open `http://<mac-ip>:5173` in Safari, then Share → Add to Home Screen. A web manifest, icons and a bottom tab bar make it open like an app. Plain HTTP on a home network only; real hosting needs HTTPS.

## Account recovery

- **Forgot password**: `POST /api/auth/forgot` always answers `202` the same way (no account discovery). A single-use link valid for 1 hour is emailed; `POST /api/auth/reset` sets the new password, signs out every session and marks the email verified.
- **Change password** (signed in): `POST /api/auth/change-password` needs the current password and signs out other devices.
- **Email verification**: a link valid for 24 hours is sent at sign-up (`POST /api/auth/verify`, resend via `/api/auth/verify/request`). Verification does not block using the app.
- Tokens are random, stored only as SHA-256 hashes, single-use and replaced by newer requests.
- **Email via Resend** (`backend/src/mailer.ts`): set `RESEND_API_KEY` and `MAIL_FROM` (see `.env.example`). Without a key, development prints emails to the console and production sends nothing. The default sender `onboarding@resend.dev` only delivers to the Resend account owner; verify a domain in Resend before real users sign up.
- **Sign-in codes**: when a key is set (or `LOGIN_CODES=true`), password login returns `202` and emails a 6-digit code (10 minutes, 5 attempts, single use); `POST /api/auth/login/verify` creates the session.
- **Emailed report**: `POST /api/reports/email` sends the month summary to the signed-in user's own address only (Settings → Email me the report).
