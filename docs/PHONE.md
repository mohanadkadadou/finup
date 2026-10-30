# Opening FinUp on a phone

FinUp is an installable PWA (manifest, icons, bottom tab bar, standalone mode).

## 1. Same Wi-Fi, for a quick test

```bash
npm run dev:lan      # prints http://<your-LAN-IP>:5173
```

Open that address in Safari/Chrome on the phone. This is plain HTTP, so use it only on a trusted network with demo data.

## 2. Proper way: a public HTTPS URL

Install needs HTTPS for the real "app" experience and for Secure cookies.

- **Hosted (recommended):** deploy `deploy/Dockerfile` to a container host (Render, Fly.io, Railway) with a managed PostgreSQL. Set `DATABASE_URL`, `APP_URL=https://your-domain`, `COOKIE_SECURE=true`. Run the build command `npm ci && npm run build`, start command `npm run start -w backend`.
- **From your laptop, temporarily:** `npm run build && npm run start -w backend`, then expose port 4000 with a tunnel (`cloudflared tunnel --url http://localhost:4000`) and set `COOKIE_SECURE=true`, `APP_URL=<tunnel url>`.

## 3. Install to the home screen

- **iPhone:** Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → menu → **Install app**.

It then opens full screen without browser chrome.
