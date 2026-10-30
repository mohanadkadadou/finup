# Test plan and results

Executed on 2026-10-30 on macOS, Node 24, PostgreSQL 16. Nothing below is claimed unless listed under **Executed**.

## Executed

| Check                                          | Command / method                                                                                                                                          | Result                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Backend unit + integration tests               | `npm test` (vitest, 5 files)                                                                                                                              | **49 passed, 0 failed**                                  |
| Type check, server and web                     | `npm run typecheck`                                                                                                                                       | passed                                                   |
| Lint                                           | `npm run lint`                                                                                                                                            | passed (0 errors, 0 warnings)                            |
| Format                                         | `npm run format:check`                                                                                                                                    | passed after `prettier --write`                          |
| Migrations from an empty database, then re-run | `npm run migrate` against a scratch DB                                                                                                                    | applied once, second run "already up to date", 10 tables |
| Production web build                           | `npm run build`                                                                                                                                           | passed                                                   |
| Browser run (built-in browser, dev servers)    | register → upload CSV → fix an invalid row → import → dashboard; demo data; create camera goal; assistant question; Connected accounts page; 375px layout | worked; found and fixed 3 defects (below)                |

Test coverage by file:

- `money.test.ts`: separators, sign conventions, float traps, ambiguity flag, explicit separator, rounding, zero/three-decimal currencies, spreadsheet numerics, mixed-currency refusal.
- `dates.test.ts`: formats, impossible dates, ambiguity, column order inference.
- `goals.test.ts`: goal rounding up, achieved/expired/same-month, affordability grades; summaries, boundaries, per-currency isolation, estimate excludes latest month, recurring detection.
- `api.test.ts`: auth; Turkish debit/credit CSV end to end with exact totals; signed amounts + invalid rows; balance-based direction inference and flagging; manual mapping incl. headerless file; ambiguous dates blocked until confirmed; row edits; invalid-row fix auto-includes; duplicate re-upload; identical rows in one file; mixed currencies; XLSX; text PDF; scanned PDF → `OCR_REQUIRED`; unsupported/oversized/empty/corrupt uploads; injection-style text stored inertly; category edit updates analytics; goal plan; assistant with and without data/no key; export and account deletion; bank not-configured; demo lifecycle; **cross-user isolation** for imports, transactions, goals, budgets, accounts, AI context; forged session cookie.
- `assistant.test.ts`: grounding check, mocked model: grounded answer accepted, invented number / malformed JSON / HTTP error fall back, raw descriptions not sent, key only in header.

Defects found by running the app and fixed: (1) fixing an invalid row left it excluded from the import; (2) single-month estimate text claimed the latest month was excluded; (3) layout overflowed horizontally on mobile. A fourth, found by tests: Turkish keywords failed because JS `\b` is ASCII-only.

## Not executed (planned)

- Any real bank statement (CSV/XLSX/PDF) from a real institution.
- The LLM path against the real Anthropic API; prompt-injection testing against a live model.
- Live Open Banking flows (no provider).
- OCR (not implemented).
- Browser end-to-end tests of editing a category, export/delete in the UI, XLSX/PDF upload through the UI, keyboard-only navigation.
- Accessibility audit (contrast measurements, screen reader), cross-browser, performance with 20,000-row files.
- Dependency vulnerability remediation (`npm audit` reports 11 findings).
