# Production persistence (Render + PostgreSQL)

## Why accounts and invites vanished

The app previously stored **all relational data** (admins, password hashes, invite tokens, assignments, narrations) in a **SQLite file** at `{DATA_DIR}/app.db` (default `./data/app.db`) on the Render web service filesystem.

Render Free (and any service without a persistent disk) uses an **ephemeral filesystem**. Every redeploy, restart, or idle spin-down **deletes** that SQLite file. Invitation URLs still pointed at `/invite/<token>`, but the `invites` row no longer existed — so links looked “broken.”

Google Drive backup helped for Free-tier recovery but was not a substitute for a real database.

## What production uses now

| Environment | Database |
| --- | --- |
| Local (no `DATABASE_URL`) | SQLite under `DATA_DIR` |
| Production / Render | **PostgreSQL** via `DATABASE_URL` (required) |

Production **will not** silently fall back to SQLite. If `DATABASE_URL` is missing on Render, the app fails closed with a clear error.

Media files (videos/audio) can still live on local disk + Google Drive sync. Metadata and invite tokens live in Postgres.

## Schema migrations

Migrations run automatically on startup via `ensureDbReady()` (`CREATE TABLE IF NOT EXISTS` + additive columns). Safe for existing data — no `DROP`.

## Health check

`GET /api/health` returns:

```json
{ "ok": true, "database": "PostgreSQL (persistent)", "backend": "postgres", "counts": { ... } }
```

Never exposes credentials.

## Manual Render setup (existing service)

1. Open [Render Dashboard](https://dashboard.render.com) → your workspace.
2. **New** → **PostgreSQL**.
3. Name: `surgical-operative-note-lab-db` (or any name).
4. Plan: Free is fine to start (note Free DBs expire; upgrade later for research longevity).
5. Create the database and wait until it is available.
6. Open web service `surgical-operative-note-lab` → **Environment**.
7. Add / confirm:
   - `DATABASE_URL` = connection string from the Postgres **Connections** panel (Internal Database URL preferred).
   - `AUTH_SECRET` = keep the **existing** value (do not regenerate, or all sessions invalidate — accounts still persist).
8. Push / deploy the latest `main` commit that includes the Postgres persistence changes.
9. Confirm start command is: `node scripts/check-prod-db.mjs && npm run start` (set in `render.yaml`).
10. Open `https://surgical-operative-note-lab.onrender.com/api/health` and confirm `"backend":"postgres"`.
11. Sign up / log in as admin again (ephemeral SQLite data from before Postgres is gone unless you still have a Drive `snl-app.db` backup to migrate manually).
12. Create a test invite, copy the URL, redeploy, reopen the **same** URL — it must still work.

### Critical env vars

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | Required on Render. From linked Postgres. |
| `AUTH_SECRET` | Required. Set once; never rotate casually. |

The Blueprint no longer auto-generates `AUTH_SECRET` (`sync: false`) so an existing secret is not accidentally replaced.

## Optional: migrate old SQLite from Drive

If you still have `snl-app.db` in Google Drive from before this change:

1. Download the file locally.
2. Set `DATABASE_URL` to your Render **External** Postgres URL (with SSL).
3. Run:

```bash
DATABASE_URL='postgresql://...' SQLITE_PATH=./snl-app.db node scripts/migrate-sqlite-to-postgres.mjs
```

The script inserts missing rows only — it never overwrites existing Postgres records. The app does **not** auto-import Drive SQLite into Postgres on startup.
