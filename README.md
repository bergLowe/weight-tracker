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

Once all of the above checks out against your real Sheet, we'll move to Phase 2 (auth).
