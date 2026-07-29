# Render environment variables checklist

In Render → your Web Service → **Environment**, add/update these.

## Required app vars
| Key | Value |
| --- | --- |
| `AUTH_SECRET` | long random string (keep existing if already set) |
| `NODE_VERSION` | `22` |
| `STORAGE_BACKEND` | `local` |
| `DATA_DIR` | `./data` (must live on a **persistent disk** on Render — see below) |
| `NEXT_PUBLIC_APP_NAME` | `Surgical Operative Note Lab` |
| `NEXT_PUBLIC_APP_TAGLINE` | `Research platform for surgical operative note dictation` |
| `MAX_VIDEO_BYTES` | `314572800` |
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
2. Confirm the latest GitHub commit includes Google Drive sync code
3. Save a narration on the live site and check the **Surgical Vision** Drive folder

## Required for durable logins + videos (critical)

Render **Free** web services wipe the local filesystem whenever the service sleeps or redeploys. That deletes local SQLite and uploads.

### Option A — Google Drive backup (works on Free)

With `GOOGLE_DRIVE_SYNC=true` and OAuth folder vars set, the app now:

1. Backs up **SQLite** (`snl-app.db`) after signups, invites, uploads, and narrations
2. Backs up **video files** (not only JSON metadata)
3. Restores the database and missing media files when the server starts again

Keep Drive credentials configured on Render. After the first successful signup/upload you should see `snl-app.db` and `video-…` files in the Drive folder.

### Option B — Persistent disk (most reliable, paid)

Upgrade the web service to **Starter** (~$7/mo) and attach a disk:

1. Render → service → **Settings** → instance type **Starter**
2. Render → service → **Disks** → mount path `/opt/render/project/src/data`, size **5 GB**
3. Keep `DATA_DIR=./data`

You can use A and B together.
