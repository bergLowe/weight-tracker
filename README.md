# Weight Tracker PWA

A personal weight-tracking Progressive Web App — install it on your phone, log your weight against a calendar, see the trend, all backed by a Google Sheet you own. No server to run, no database to manage, free to host.

```
GitHub Pages (static frontend)
        │  HTTPS
        ▼
Google Apps Script Web App (backend)
        │
        ▼
Google Sheets (single source of truth)
```

## Features

- Add, edit, and delete entries via a calendar date picker
- Trend chart (Chart.js) with 7D / 30D / 90D / All range filters and hover tooltips
- Two access levels — **Admin** (read/write) and **Read-only** — enforced on the backend, not just hidden in the UI
- Installable as a PWA on Android and iOS; the app shell works offline
- Sign in with Google; your weight data never leaves your own Sheet

## How auth works

The OAuth Client ID isn't a secret — it's visible in any frontend JS no matter how it's stored. The real security boundary is entirely server-side: the Apps Script backend verifies every request's Google ID token against Google's `tokeninfo` endpoint, then checks the verified email against a hardcoded allowlist (with a role) before touching the Sheet. See `backend/Code.gs`.

## Setup

Reusing this for your own tracker:

### 1. Google Sheet

Create a Sheet with a tab named exactly `Weights`, columns:

| Column | Meaning |
|---|---|
| A `Date` | Date-typed cell |
| B `Weight` | Number |
| C `UpdatedAt` | Set automatically by the script |

### 2. Backend (Apps Script)

1. In the Sheet: **Extensions → Apps Script**.
2. Paste in `backend/Code.gs`.
3. Edit the constants at the top:
   ```js
   var CLIENT_ID = '...'; // your OAuth Client ID, see step 3
   var ALLOWED_USERS = {
     'you@example.com': 'admin' // add read-only users as 'read'
   };
   ```
4. **Deploy → New deployment → Web app** — Execute as **Me**, who has access **Anyone**. Copy the `/exec` URL.

### 3. Google OAuth Client

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID (Web application). Under **Authorized JavaScript origins**, add your local dev origin (e.g. `http://localhost:8000`) and your GitHub Pages origin (e.g. `https://<you>.github.io` — bare origin, no path, no trailing slash).

### 4. Frontend config

```bash
cp frontend/config.example.js frontend/config.js   # gitignored, never committed
```
Fill in your `CLIENT_ID` and `WEB_APP_URL`.

### 5. Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds `config.js` at deploy time from repo secrets, so nothing sensitive is ever committed:

1. Repo **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions** → add `OAUTH_CLIENT_ID` and `WEB_APP_URL`.
3. Push to `main` — it deploys automatically from there on.

## Local development

```bash
cd frontend && python3 -m http.server 8000
```

## Project structure

```
backend/Code.gs                Apps Script source — paste into the Apps Script editor
frontend/                      Static site, no build step
  config.example.js            Template — copy to config.js locally
  manifest.json, service-worker.js, icon/   PWA
.github/workflows/deploy.yml   Deploys frontend/ to GitHub Pages on push to main
```

## Gotchas

- **Apps Script has no `doOptions` handler** — the frontend POSTs with `Content-Type: text/plain` on purpose; `application/json` triggers a CORS preflight that fails outright.
- **"You do not have permission to call UrlFetchApp.fetch"** after changing the auth code: revoke the script's access at `myaccount.google.com/permissions`, then run any function once in the Apps Script editor to re-trigger the authorization prompt.
- **Authorized JavaScript origins** are checked as the bare origin (scheme + host) — no path, no trailing slash.
