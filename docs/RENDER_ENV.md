# Render environment variables checklist

In Render → your Web Service → **Environment**, add/update these.

## Required app vars
| Key | Value |
| --- | --- |
| `AUTH_SECRET` | long random string (**keep existing**; do not regenerate every deploy) |
| `DATABASE_URL` | **Required.** Internal URL from your Render PostgreSQL database |
| `NODE_VERSION` | `22` |
| `STORAGE_BACKEND` | `local` |
| `DATA_DIR` | `./data` (media files only; accounts live in Postgres) |
| `NEXT_PUBLIC_APP_NAME` | `Surgical Operative Note Lab` |
| `NEXT_PUBLIC_APP_TAGLINE` | `Research platform for surgical operative note dictation` |
| `MAX_VIDEO_BYTES` | `2147483648` (2 GB; raise if needed) |
| `NEXT_PUBLIC_MAX_VIDEO_MB` | `2048` (must match client UI limit) |
| `ADMIN_EMAILS` | `ritaglaz@buffalo.edu,pseger@buffalo.edu` |

## Google Drive sync (audio + JSON only)
Copy these from your local `.env.local` (do not paste secrets into chat):

| Key | Notes |
| --- | --- |
| `GOOGLE_DRIVE_SYNC` | `true` |
| `GOOGLE_DRIVE_FOLDER_ID` | `1OY4j_Eft-PydQ0gf4qJ8iSEoaRwYGoGC` |
| `GOOGLE_OAUTH_CLIENT_ID` | from `.env.local` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from `.env.local` |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | from `.env.local` |

## Invite emails (optional but recommended)
| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://surgical-operative-note-lab.onrender.com` |
| `RESEND_API_KEY` | from [resend.com](https://resend.com) |
| `EMAIL_FROM` | verified sender, e.g. `Surgical Operative Note Lab <you@yourdomain.com>` |

Without Resend, admins can still create invites and **copy the link** from the Invite page.

## After saving env vars
1. **Manual Deploy** → **Deploy latest commit** (or wait for auto-deploy)
2. Open `/api/health` and confirm `"backend":"postgres"`
3. Save a narration on the live site and check the Drive folder for audio/JSON

## Required for durable logins + invites (critical)

**PostgreSQL via `DATABASE_URL` is required in production.** See [PERSISTENCE.md](./PERSISTENCE.md).

Render Free web disks are ephemeral. SQLite under `./data` loses accounts and invite tokens on every redeploy. The app will **refuse to start in production without `DATABASE_URL`** (no silent SQLite fallback).

### Setup
1. Create a Render PostgreSQL database
2. Copy its **Internal Database URL** into the web service env as `DATABASE_URL`
3. Keep a stable `AUTH_SECRET`
4. Deploy and verify `/api/health`

Google Drive sync remains for **media + JSON files**, not as the source of truth for invite tokens.
