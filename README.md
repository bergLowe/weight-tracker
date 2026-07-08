# Weight Tracker PWA

Personal weight tracker PWA — installable on Android/iOS, backed by your own Google Sheet. No server, no database, free to host.

```
GitHub Pages (frontend) → Google Apps Script (backend) → Google Sheets (data)
```

## Features

- Log, edit, delete weight entries via a calendar picker
- Trend chart with 7D / 30D / 90D / All range filters
- Admin (read/write) and Read-only roles, enforced server-side
- Installable PWA, offline-capable app shell
- Google Sign-In — data stays in your own Sheet

Security boundary is entirely server-side: the OAuth Client ID isn't secret, but every request is verified against Google's `tokeninfo` endpoint and a hardcoded email allowlist in `backend/Code.gs` before touching the Sheet.

## Setup

1. **Sheet** — tab named `Weights`, columns `Date`, `Weight`, `UpdatedAt`.
2. **Backend** — paste `backend/Code.gs` into Extensions → Apps Script, set `CLIENT_ID` and `ALLOWED_USERS` (email → `'admin'`/`'read'`), deploy as Web App (Execute as **Me**, access **Anyone**), copy the `/exec` URL.
3. **OAuth Client** — in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a Web OAuth Client; add your local + GitHub Pages origins under Authorized JavaScript origins (bare origin, no path).
4. **Frontend config** — `cp frontend/config.example.js frontend/config.js`, fill in `CLIENT_ID`/`WEB_APP_URL` (gitignored, never committed).
5. **Deploy** — repo Settings → Pages → Source → **GitHub Actions**; add secrets `OAUTH_CLIENT_ID` and `WEB_APP_URL`; push to `main`.

## Local dev

```bash
cd frontend && python3 -m http.server 8000
```

## Gotchas

- POST requests use `Content-Type: text/plain` — Apps Script has no CORS preflight handler.
- `"UrlFetchApp" permission error` → revoke access at `myaccount.google.com/permissions`, then run any function once in the Apps Script editor to re-trigger the prompt.
- Authorized JavaScript origins are the bare origin (scheme + host) — no path, no trailing slash.
