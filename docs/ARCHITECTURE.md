# Architecture (as built)

## Stack

React + TypeScript (Vite) · Node.js + Express + TypeScript · PostgreSQL via `pg` · zod validation · vitest + supertest.

## Server modules (`backend/src`)

| Module                                   | Responsibility                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `auth.ts`, `routes/auth.ts`              | scrypt hashing, session cookie, `requireAuth`                                  |
| `import/readers.ts`, `import/pdf.ts`     | CSV/XLSX/PDF → grid of cells (PDF via pdfjs-dist, no eval)                     |
| `import/normalize.ts`                    | header/column guessing, row staging, direction inference, duplicate keys       |
| `money.ts`, `dates.ts`                   | integer minor-unit parsing/formatting, date parsing/order inference            |
| `categorize.ts`                          | keyword categorization (Unicode-aware boundaries)                              |
| `analytics.ts`                           | summaries, trends, recurring detection, monthly net estimate (pure functions)  |
| `goals.ts`                               | deterministic goal plan + affordability (pure)                                 |
| `ai/assistant.ts`, `routes/assistant.ts` | fact builder, deterministic fallback, optional Anthropic call, grounding check |
| `banks/provider.ts`, `routes/banks.ts`   | provider interface, empty registry, status                                     |
| `routes/*`                               | HTTP layer; `app.ts` has helmet, JSON limits, central error handler            |
| `migrate.ts`, `migrations/`              | forward-only SQL migrations                                                    |

## Import flow

```mermaid
sequenceDiagram
  participant U as User (browser)
  participant API
  participant DB as Postgres
  U->>API: POST /api/imports (file)
  API->>API: detect type, read grid, guess mapping
  alt columns recognised
    API->>DB: batch(review) + staged_rows
    API-->>U: rows, counts, notes
  else not recognised
    API->>DB: batch(needs_mapping) + grid
    API-->>U: preview + suggested mapping
    U->>API: POST /imports/:id/mapping
    API->>DB: re-stage rows
  end
  U->>API: PATCH /imports/:id/rows/:rowId (edits)
  U->>API: POST /imports/:id/commit
  API->>DB: INSERT transactions ON CONFLICT DO NOTHING
  API-->>U: imported / skipped / flagged counts
```

## Assistant flow

Question → load **only the caller's** transactions/goals → `buildFacts` (deterministic, all arithmetic here) → if no API key or no data: return deterministic text; otherwise send aggregates + question to the model, require `{"answer": ...}`, reject any number not present in the supplied facts, fall back on any failure. Evidence rows always come from the backend, not the model.

## ERD

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ accounts : owns
  users ||--o{ import_batches : uploads
  users ||--o{ transactions : owns
  users ||--o{ goals : sets
  users ||--o{ budgets : sets
  users ||--o{ bank_connections : links
  accounts ||--o{ import_batches : receives
  accounts ||--o{ transactions : holds
  import_batches ||--o{ staged_rows : stages
  import_batches ||--o{ transactions : produces
  users { uuid id PK
    text email UK
    text password_hash }
  accounts { uuid id PK
    text name
    char currency
    text source }
  import_batches { uuid id PK
    text file_type
    text status
    jsonb grid
    jsonb mapping }
  staged_rows { uuid id PK
    int row_ref
    jsonb raw
    date booked_on
    bigint amount_minor
    text status
    bool include }
  transactions { uuid id PK
    date booked_on
    bigint amount_minor
    char currency
    text category
    text dedupe_key UK
    bool is_demo }
  goals { uuid id PK
    bigint target_minor
    bigint current_minor
    date deadline }
  budgets { uuid id PK
    text category
    bigint limit_minor }
  bank_connections { uuid id PK
    text provider
    text status
    text token_ciphertext }
```

## Key decisions

- `amount_minor` is a signed BIGINT; read back as a JS number with a safe-integer guard.
- Dedupe key = hash(account, date, amount, currency, normalized description, occurrence index) so legitimate repeats in one file survive but re-uploads are caught.
- The parsed grid is stored on the batch so a column mapping can be re-applied without keeping the uploaded file.
- "Today" can be pinned with `FINUP_TODAY` for deterministic tests.
