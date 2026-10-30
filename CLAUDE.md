@AGENTS.md

## Claude notes

- Dev: `npm run dev` (API :4000, web :5173). Phone on LAN: `npm run dev:lan`.
- Migrations are forward-only in `backend/migrations/`; add a new numbered file, never edit applied ones.
- Do not add a real email/bank provider or secrets without the owner's say-so; mailer is console-only by design.
