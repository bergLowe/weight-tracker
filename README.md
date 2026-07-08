# Weight Tracker PWA

Personal weight tracking PWA. Architecture: GitHub Pages (static frontend) → Google Apps Script Web App (backend) → Google Sheets (data store). See project history/plan for full details.

## Sheet structure

Tab named `Weights`:

| Column | Meaning |
| --- | --- |
| A `Date` | Date-typed cell (any display format, e.g. `DD/MM/YYYY`) |
| B `Weight` | Number, kg |
| C `UpdatedAt` | Timestamp, set automatically by the script on add/update |

One row per date (adding on an existing date overwrites it).

## Phase 1 — Backend plumbing, no auth

`backend/Code.gs` is the reference copy of the Apps Script source. To deploy:

1. Open your existing Google Sheet (the one with the `Weights` tab).
2. Extensions → Apps Script.
3. Delete the default `Code.gs` contents and paste in `backend/Code.gs` from this repo.
4. Save.
5. Deploy → New deployment → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web App URL (ends in `/exec`).

### Test commands

Replace `URL` with your deployed Web App URL.

List existing entries:
```bash
curl "URL?action=list"
```

Add/update an entry (upsert by date):
```bash
curl -L -X POST "URL" -H "Content-Type: application/json" \
  -d '{"action":"add","date":"2026-07-07","weight":90.0}'
```

Update the same date again (should overwrite, not duplicate):
```bash
curl -L -X POST "URL" -H "Content-Type: application/json" \
  -d '{"action":"update","date":"2026-07-07","weight":89.8}'
```

Delete it:
```bash
curl -L -X POST "URL" -H "Content-Type: application/json" \
  -d '{"action":"delete","date":"2026-07-07"}'
```

**What to check:**
- `list` returns `{"ok":true,"data":[...]}` with your existing 16 rows, each as `{date: "yyyy-MM-dd", weight: <number>, updatedAt: ...}` (dates converted from whatever display format to `yyyy-MM-dd`).
- `add` on a *new* date appends a row to the Sheet; `list` afterwards includes it.
- `update`/`add` on the *same* date overwrites the row (Sheet shouldn't gain a duplicate row), and `UpdatedAt` (col C) changes.
- `delete` removes the row; a subsequent `list` no longer includes it, and deleting again returns `{"ok":false,"error":"No entry found..."}`.
- Malformed input, e.g. `curl -X POST "URL" -d '{"action":"add","date":"bad","weight":90}'`, returns `{"ok":false,"error":"..."}` — not an HTTP error page.
- Note: curl needs `-L` on POST because Apps Script responds with a redirect before the final JSON.

Phase 1 confirmed working ✅ (2026-07-07).

## Phase 2 — Auth (token verification + email allowlist)

`Code.gs` now requires a valid Google ID token on every request (`list`, `add`, `update`, `delete`).

**Before deploying**, edit the two placeholders at the top of `backend/Code.gs` *after pasting it into the Apps Script editor* — do not commit real values to this repo:

```js
var CLIENT_ID = 'REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
var ALLOWED_EMAILS = ['REPLACE_WITH_YOUR_EMAIL@example.com'];
```

- `CLIENT_ID`: your OAuth Client ID from Google Cloud Console (the one already authorized for your GitHub Pages + localhost origins).
- `ALLOWED_EMAILS`: the exact Google account email(s) allowed to use the app.

Then: Save → Deploy → **Manage deployments** → edit your existing deployment → New version → Deploy (this keeps the same `/exec` URL).

### Getting a real ID token to test with

Easiest option — a throwaway local HTML file (not part of this repo, don't commit it) that loads GIS with your real Client ID and logs the token to the console:

```html
<script src="https://accounts.google.com/gsi/client"></script>
<div id="g_id_onload"
     data-client_id="YOUR_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleToken"></div>
<div class="g_id_signin"></div>
<script>
  function handleToken(response) { console.log(response.credential); }
</script>
```
Open it via `http://localhost:PORT/...` (must match an authorized origin), sign in, copy the logged token.

### Test commands

Replace `URL` with your Web App URL and `TOKEN` with the token you copied.

```bash
# 1. No token — should be rejected
curl "URL?action=list"

# 2. Garbage/expired token — should be rejected
curl "URL?action=list&token=not-a-real-token"
# rejected for free — fails the local JWT-shape check (no dots), never
# reaches Google's tokeninfo endpoint

# 3. Valid token, correct email — should succeed
curl "URL?action=list&token=TOKEN"

curl -L -X POST "URL" -H "Content-Type: application/json" \
  -d '{"action":"add","date":"2026-07-07","weight":90.0,"token":"TOKEN"}'
```

For the "wrong email" case: temporarily set `ALLOWED_EMAILS` to `['someone-else@example.com']`, redeploy, retry request 3 above (should now be rejected), then set it back to your real email and redeploy again.

**What to check:**
- Case 1 & 2 → `{"ok":false,"error":"Missing or malformed token"}`, Sheet untouched.
- Wrong-email case → `{"ok":false,"error":"Not authorized"}`, Sheet untouched.
- Case 3 (valid token, correct email) → succeeds exactly like Phase 1.
- Token more than ~1 hour old (GIS ID tokens expire in ~1hr) → `{"ok":false,"error":"Token expired"}`.
- A well-formed-but-fake token (three base64url-looking segments, e.g. `abc.def.ghi`) → passes the local shape check, then gets rejected by the real tokeninfo call → `{"ok":false,"error":"Invalid token"}`.

### Defense-in-depth: cheap checks before the expensive call

`verifyToken_` validates the token's shape locally (non-empty, under 4096 chars, three base64url segments separated by dots — the structural shape of a JWT) *before* calling `UrlFetchApp.fetch` against Google's `tokeninfo` endpoint. Garbage input (empty, wrong type, no dots, absurdly long) is rejected for free without ever making the network call. This matters both for cost/quota (Apps Script's `UrlFetchApp` has a daily call quota shared across the whole script) and as a shallow defense layer: cheap local checks (format, presence, size) go first, and only input that survives all of them reaches the expensive, authoritative check. No single layer is meant to be sufficient on its own — the shape check doesn't verify anything cryptographically, it just filters out obviously-invalid input cheaply so the real verification isn't wasted on noise.

Phase 2 confirmed working ✅ (2026-07-08).

**Added in Phase 5:** every auth failure above now also carries `"code":"auth"` in the response (e.g. `{"ok":false,"error":"Token expired","code":"auth"}`), so the frontend can reliably tell "your session is over, log out" apart from an ordinary failed request without string-matching the `error` text. Purely additive — the `error` messages themselves are unchanged.

## Phase 3 — Frontend shell (no auth, no backend calls)

`frontend/index.html` + `frontend/style.css` + `frontend/app.js` now implement every screen in the online/offline flow (see the design artifacts shared earlier) as real, working UI — still with no auth and no backend calls (that's Phase 4/5). All three screens exist in the DOM simultaneously and are switched with `hidden`:

- **Login screen** (`#screen-login`) — Google sign-in button (inert for now) + an offline-banner variant.
- **Attempting silent sign-in** (`#screen-silent`) — spinner-only loading state.
- **Main app** (`#screen-app`) — entry form with a custom calendar date picker, an interactive Chart.js trend chart (gridlines, 7D/30D/90D/All range filter, hover crosshair + tooltip), and the history table. Offline banner, disabled form/table controls, and the "Reconnect to add or edit entries" note are all built, just not yet wired to a real connectivity signal.

Since there's no auth yet, screens are switched manually for now via two console helpers (temporary — Phase 4 will drive this for real):
```js
showScreen('login' | 'silent' | 'app')
setOffline(true | false)   // toggles both offline banners + disables form/table controls
```

**Calendar**: click the date field to open a real month-grid picker — today is ringed, the selected day is filled, days you've already logged would show a small dot (via an `entryDates` Set, empty until Phase 5 populates it from real data), future dates are disabled, and prev/next-month days are clickable to navigate. All computed live from the real date, not hardcoded.

**Chart**: still shows no data (empty axes) until Phase 5, but the chrome is fully built — y-axis gridlines, x-axis labels, range-filter pills (functional now, just filtering an empty array), and a hover tooltip + dashed crosshair line, styled to match the app.

Two implementation notes, in case you spot either while poking at the console:
- The chart is built **lazily**, the first time `showScreen('app')` runs — Chart.js lays out against the canvas's rendered size, and building it while hidden behind another screen (`display:none`) gave it a broken layout that didn't self-correct later.
- Chart **animation is disabled**. Animating the axis scale itself (0 categories → N, e.g. on first load or an empty→populated range-filter change) left point pixel positions transiently desynced from `chartArea` in a way a reasonable wait didn't resolve — it broke hover hit-testing. Not worth chasing for a dataset this small.

### Run it locally

```bash
cd frontend
python3 -m http.server 8000
```
Open `http://localhost:8000` in a browser.

**What to check:**
- Page loads with no console errors (Chart.js loads from CDN — needs internet access). Default screen is the login screen.
- `setOffline(true)` in the console shows the offline banner + disables the date field, weight input, Save button, and every row's edit/delete buttons in the main app (`showScreen('app')` first). `setOffline(false)` reverses all of it. (The login screen's offline banner is real now — see Phase 4 below — so toggle it by actually disconnecting, not with this helper.)
- `showScreen('app')`: click the date field — a calendar opens with today ringed/selected, future dates greyed out and unclickable, and prev/next-month navigation working. Pick a past day and confirm the trigger label updates and the calendar closes.
- In the console: `const c = Chart.getChart('weight-chart'); c.data.labels = ['2026-06-01','2026-07-08']; c.data.datasets[0].data = [88, 90.5]; c.update();` then hover the chart — a dashed crosshair and a tooltip (date + kg, bold) should track the nearest point.
- Layout is usable and uncramped at both a phone width (~390px) and a desktop width.
- Toggle your OS/browser dark mode and confirm every screen follows it — including the calendar and chart.

Phase 3 confirmed working ✅ (2026-07-08).

## Phase 4 — Frontend auth (Google Identity Services)

Real GIS sign-in, still with **no backend calls** — the token is obtained and decoded client-side only, never sent anywhere yet (that's Phase 5).

**Before testing**, copy `frontend/config.example.js` to `frontend/config.js` (gitignored — never committed, not even as a placeholder) and fill in your real Client ID:
```bash
cp frontend/config.example.js frontend/config.js
# then edit config.js with your real Client ID
```

**What changed:**
- The custom-styled sign-in button was replaced with Google's own rendered button (`google.accounts.id.renderButton`). This is a deliberate change from the earlier design mockup — a hand-styled button would have to fall back to `google.accounts.id.prompt()` on click, which is subject to a cooldown after repeated dismissals and can silently do nothing; `renderButton` always works regardless of that cooldown, so it's the more reliable choice for an explicit "click to sign in" affordance. The exact pixel styling is Google's, not ours (configured close to our design: outline theme, rectangular, "Sign in with Google" text).
- On load, if online: shows the silent-sign-in screen and calls `google.accounts.id.prompt()` (with `auto_select: true`) — if you have an active Google session and previously consented, you'll be signed in with zero clicks. If not (or it's on cooldown), it falls back to the login screen automatically — that's expected, not an error.
- On load, if offline: skips the silent attempt entirely and shows the login screen with its (now real, connectivity-driven) offline banner. The banner also updates live if you toggle your connection while sitting on the login screen.
- A successful sign-in (silent or manual) logs the raw ID token and its decoded claims to the console — **temporary, for this phase's testing only** — populates the header (avatar initial + email, truncates on narrow screens) from the token's own claims, and shows the main app screen. Nothing is verified against the backend yet; that's Phase 5.
- Logout clears the in-memory token, calls `google.accounts.id.disableAutoSelect()` (so the next load doesn't immediately silently re-sign you in), and returns to the login screen.

### Test steps

1. Open `http://localhost:8000` with your real Client ID in `config.js`, and make sure your Google Cloud OAuth consent screen's **Authorized JavaScript origins** includes `http://localhost:8000` (should already be set up per the original project brief).
2. **First load**: you should either get signed in silently (if you have an active Google session) or land on the login screen with a working "Sign in with Google" button.
3. Click it, complete the Google sign-in flow. Check the console: you should see the raw ID token logged, followed by its decoded claims (your email, name, expiry).
4. Confirm the header shows your avatar initial and email, and the app screen is showing.
5. Click **Log out** — you should land back on the login screen.
6. Reload the page — with an active Google session, you should get signed in silently again (no click) within about a second; the silent-sign-in screen should flash briefly first.
7. Turn off your network (devtools → Network → Offline, or actually disconnect), then reload — you should land straight on the login screen with the offline banner, no silent-sign-in attempt, and clicking the sign-in area does nothing harmful (Google's button itself will show its own error state, since the GIS script won't have loaded).
8. Reconnect — the offline banner should clear on its own without reloading.

Phase 4 confirmed working ✅ (2026-07-08) — silent sign-in / offline fallback debugging deferred; may remove the auto-login feature later if it doesn't hold up.

## Phase 5 — Frontend/backend integration

Add/list/update/delete now hit the real Apps Script backend. The temporary token console-logging from Phase 4 is gone — the token is only ever used in real requests now.

**Before testing**, add `WEB_APP_URL` to your local `frontend/config.js` (see `config.example.js`) — your deployed Apps Script Web App URL, ending in `/exec`.

**What changed:**
- `apiGet`/`apiPost` wrap `fetch`, always sending the token (`?token=` for GET, a `token` field in the JSON body for POST). POST requests use `Content-Type: text/plain` on purpose — Apps Script has no `doOptions` handler, so `application/json` would trigger a CORS preflight and fail outright; Apps Script reads `e.postData.contents` regardless of the declared content type.
- Signing in now actually verifies the token: `handleCredentialResponse` calls `loadInitialData()`, which shows the app screen and calls the real `list` endpoint (with the sync bar visible while it's in flight). A `code:"auth"` response anywhere — initial verify, or a later add/update/delete — forces a real logout with "Your session ended, please sign in again," per the design doc.
- History table, chart, and the calendar's entry-dots all render from the real fetched data. Table rows sort newest-first; edit prefills the date (via the calendar) and weight and lets Save do the rest (the backend upserts by date, so add/edit are the same call); delete asks for confirmation, then re-fetches.
- Save disables the button and shows "Saving…" / "Saved." / an inline error; delete failures use a plain `alert()` — both intentionally minimal, no custom toast/modal system for a single-user app.
- Dates round-trip through a local-midnight parser (`parseISODateLocal`), not `new Date(iso)` — the latter parses as UTC and can land on the wrong calendar day near timezone boundaries. Same class of bug the backend already avoided; the frontend needed the same care.

**Not in this phase:** offline data caching (localStorage) and the real offline-read-only main-app experience — `setOffline()` is still a manual QA toggle. That lands in Phase 6 alongside the service worker, since both are about what the app can do without a network.

### Test steps

1. Fill in `WEB_APP_URL` in `frontend/config.js`, sign in.
2. Confirm your real Sheet rows appear in the history table (newest first) and on the chart, and that days with entries show a dot on the calendar.
3. Add an entry for a date you don't have yet — check it appears in the table/chart/calendar, and in the Sheet itself.
4. Click **Edit** (✎) on a row — confirm the date and weight prefill correctly — change the weight and Save. Confirm it updated in place (no duplicate row), both in the app and the Sheet.
5. Click **Delete** (✕) on a row, confirm the dialog, confirm it's gone from the table/chart/calendar and the Sheet.
6. Try saving with an invalid/empty weight — confirm the inline "Enter a valid weight" message, and that nothing is sent (check the Network tab).
7. To test the forced-logout path: in the console, `authToken = 'garbage'; refreshData();` — should immediately log you out to the login screen with "Your session ended, please sign in again."

Once this checks out, we'll move to Phase 6 (PWA: manifest, service worker, offline install/caching).

## Deploying to GitHub Pages (`.github/workflows/deploy.yml`)

Set up ahead of Phase 7, since the Client ID handling needed deciding now rather than retrofitting later.

GitHub Pages serves static files straight from the repo — there's no server-side templating, so `frontend/config.js` (gitignored, holds the real Client ID and Web App URL) has to be generated at deploy time instead of committed. The workflow does that: on every push to `main`, it builds `frontend/config.js` from `frontend/config.example.js` with both values substituted in from GitHub Actions secrets, then publishes `frontend/` via GitHub's official Pages actions. Neither value ever appears in git history on any branch.

**One-time setup (do this before the workflow will succeed):**
1. Repo → **Settings → Pages → Build and deployment → Source** → set to **GitHub Actions** (not "Deploy from a branch").
2. Repo → **Settings → Secrets and variables → Actions → New repository secret** → add two:
   - `OAUTH_CLIENT_ID` = your real Client ID (the full string, e.g. `xxxxx.apps.googleusercontent.com`)
   - `WEB_APP_URL` = your deployed Apps Script Web App URL (ends in `/exec`). Not sensitive on its own — it's gated by the token + allowlist check server-side — but handled the same way for consistency.
3. Make sure your OAuth Client's **Authorized JavaScript origins** (Google Cloud Console) includes your GitHub Pages URL once you know it (`https://<username>.github.io` or your custom domain).

The workflow only triggers on pushes to `main` (or manually via the **Run workflow** button in the Actions tab) — it won't run yet since this branch's work lands there via PR. Once merged, every push to `main` redeploys automatically.

## Troubleshooting

### `You do not have permission to call UrlFetchApp.fetch. Required permissions: .../auth/script.external_request`

Happens after adding the Phase 2 auth code, when the Apps Script project's authorized scopes are stale (e.g. it was originally authorized back in Phase 1, before any code called `UrlFetchApp`). Redeploying alone does not always trigger Google to re-prompt for the new scope, and running a function manually can silently "complete" without showing the authorization dialog if the grant looks up-to-date to Apps Script even though it isn't.

**Fix — revoke and re-authorize:**
1. Go to `myaccount.google.com/permissions` (Google Account → Security → "Third-party apps & services").
2. Find the Apps Script project (e.g. **weight-tracker**) and remove/revoke its access.
3. Back in the Apps Script editor, select `doGet` from the function dropdown and click **Run**.
4. This time it should show **Authorization required** → **Review permissions** → your account → **Advanced** → **Go to weight-tracker (unsafe)** → **Allow**. If nothing appears, check the browser address bar for a blocked-popup icon.
5. Retry the request.

**If that still doesn't prompt:** the project's scopes may be manually pinned. Gear icon → **Project Settings** → enable **"Show 'appsscript.json' manifest file in editor"**. Open `appsscript.json` — if it has an `oauthScopes` array, Apps Script has stopped auto-detecting scopes for this project; add the missing scope by hand:
```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.external_request"
]
```
Save, then repeat the revoke-and-run steps above.
