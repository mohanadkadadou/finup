# AGENTS.md

Guidance for AI coding agents working in this repo.

- Monorepo (npm workspaces): `backend/` (Express + TS + PostgreSQL), `frontend/` (Vite + React + TS), `docs/`, `deploy/`.
- Money is **signed integer minor units** + currency; never use floats, never sum mixed currencies.
- Analytics, goals, insights and the planner are deterministic pure functions; the assistant may only use figures from them (see `backend/src/ai/assistant.ts`, `numbersGrounded`).
- API sentences stay English; Arabic lives in `frontend/src/ar.ts` (English text is the key) and `serverText.ts`.
- Never fabricate data, bank status or savings guarantees. Say "estimate" where it is one.
- Before finishing run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`.
- Tests need PostgreSQL (`finup_test`). Add a test with every backend behaviour change.
