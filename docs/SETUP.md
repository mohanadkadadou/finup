# Setup

## Local development

```bash
npm install
createdb finup && createdb finup_test
cp .env.example .env
npm run dev          # API :4000, web http://localhost:5173
npm run seed:demo    # optional demo user (local only)
```

## Checks

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

## Production-style run (one process, one URL)

```bash
npm run build
NODE_ENV=production DATABASE_URL=postgres://... npm run start -w backend
```

The backend serves `frontend/dist` and `/api` from the same origin. With Docker:

```bash
docker compose -f deploy/docker-compose.yml up --build   # http://localhost:4000
```

See [PHONE.md](PHONE.md) for opening it on a phone.
