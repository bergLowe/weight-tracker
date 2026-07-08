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

Once all of the above checks out, we'll move to Phase 3 (frontend shell).

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
