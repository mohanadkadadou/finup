# Software Requirements Specification (as built)

Scope: what the code in this repository actually does. Items marked **Not built** are requirements from the product brief that are not implemented.

## 1. Actors

- **User**: signs up with email + password, owns all data in their account.
- **System**: API + Postgres + optional Anthropic API.

## 2. Functional requirements

| ID    | Requirement                                                                                                                                                                                 | Status                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR-1  | Register, sign in, sign out; passwords hashed with scrypt; server-side sessions                                                                                                             | Built                          |
| FR-2  | Upload CSV/XLSX/PDF with a size limit and clear errors (unsupported type, too large, empty, corrupt, scanned PDF)                                                                           | Built                          |
| FR-3  | Detect header row and date/description/amount/debit/credit/balance/currency/type columns; manual mapping when uncertain, including "no header"                                              | Built                          |
| FR-4  | Normalize amounts to signed integer minor units; parse European/US separators, parentheses, trailing minus, Dr/Cr; infer direction from running balance only when provable                  | Built                          |
| FR-5  | Keep source row reference and original cells per staged row                                                                                                                                 | Built                          |
| FR-6  | Review table: edit date, description, amount, direction, currency, category; include/exclude; flagged rows need review or explicit "import as is"                                           | Built                          |
| FR-7  | Duplicate detection against previously imported rows; identical rows inside one file are kept                                                                                               | Built                          |
| FR-8  | Show imported / skipped (duplicate, invalid, excluded) / flagged counts after commit                                                                                                        | Built                          |
| FR-9  | Analytics only from confirmed transactions, per currency, never mixing currencies                                                                                                           | Built                          |
| FR-10 | Dashboard, transactions list with search/filter/pagination/category edit/delete, analytics, budgets                                                                                         | Built                          |
| FR-11 | Savings goal: monthly = ceil(max(0, target − current) / max(1, months to deadline)); states achieved / on schedule / expired; affordability vs estimated net cash flow labelled as estimate | Built                          |
| FR-12 | Assistant answers from the user's own aggregates with evidence (period, currency, actual/estimated); works with no API key                                                                  | Built (LLM path unverified)    |
| FR-13 | Bank provider adapter interface + honest "Not configured" state                                                                                                                             | Built (interface only)         |
| FR-14 | Live Open Banking consent, callback, sync, revoke                                                                                                                                           | **Not built**                  |
| FR-15 | OCR for scanned PDFs                                                                                                                                                                        | **Not built** (explicit error) |
| FR-16 | Export all data (JSON); delete account with every owned row                                                                                                                                 | Built                          |
| FR-17 | Demo data clearly labelled, loadable once, clearable                                                                                                                                        | Built                          |

## 3. Non-functional requirements

- **Money correctness:** integer minor units end to end; no float arithmetic for parsing, summing or goals. Totals computed in `analytics.ts` / `goals.ts`, never by an LLM.
- **Authorization:** every data query includes the session's user id; foreign ids return 404.
- **Untrusted input:** statement text is stored and rendered as inert text (React escaping); PDF parsing disables script evaluation; XLSX formulas are never evaluated; LLM context contains aggregates, and model numbers are validated against supplied facts.
- **Privacy:** secrets only in env; `.env.example` has placeholders only; bank tokens never returned by the API.
- **Usability:** responsive layout (checked at desktop and 375px in a browser), focus styles, labelled controls.

## 4. User stories and acceptance (all verified by automated tests unless noted)

- **A.** As a new user I see an empty dashboard, upload a statement, review parsed rows, confirm, and see the dashboard filled. _(API tests + manual browser run)_
- **B.** As a user I ask "Where did my money go last month?" and get category totals for that month and currency, with evidence, even without an AI key. _(API test + manual browser run)_
- **C.** As a user I create "Camera, 60,000 TRY, 10,000 saved, 12 months" and see 4,166.67 TRY/month, with assumptions and an estimate-only affordability label. _(API test + manual browser run)_
- **D.** As a user I open Connected accounts and am told honestly that no provider is configured and that I can upload statements. _(API test + manual page view)_
- **E.** As a user I change a category and totals update. _(API test)_
- **F.** As a user I export my data or delete my account and all rows are removed. _(API test)_
