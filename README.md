# Surgical Narration Lab

Research MVP for uploading surgical videos and recording narrations (synchronized voiceover or post-video dictation). Inspired by the *workflow* of surgical voiceover tools — not a visual or branding copy of any existing product.

> **Privacy:** Do not upload identifiable patient information unless your institution has reviewed, approved, and secured the deployment. This free-tier-oriented MVP is **not** HIPAA-compliant.

## Technology choices

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router) + TypeScript + React |
| UI | Tailwind CSS |
| Auth (MVP) | Email/password with signed HTTP-only cookies (`jose` + `bcryptjs`) |
| Database (MVP) | SQLite via `better-sqlite3` under `./data` |
| Media storage (MVP) | Local object-style paths under `./data/storage` served through an authenticated `/api/media` proxy |
| Recording | Browser `MediaRecorder` API |
| Production path | Supabase SQL + storage scripts included for Postgres/auth/storage migration |

Local mode is intentional so the full upload → record → save → replay loop works without cloud credentials. For production on Render (or similar), do **not** rely on ephemeral disk — migrate DB/media to Supabase (or another durable Postgres + object store).

## Important files

- `src/app/` — pages (home, login, signup, dashboard, upload, narration workspace, playback)
- `src/components/NarrationWorkspace.tsx` — recording UI, countdown, levels, sync playback
- `src/app/api/` — auth, videos, narrations, authenticated media proxy
- `src/lib/db.ts` — SQLite schema + queries (`profiles`, `videos`, `narrations`)
- `src/lib/storage.ts` — private file storage helpers
- `supabase/schema.sql` — Postgres/RLS schema for Supabase
- `supabase/storage.sql` — storage bucket notes
- `scripts/smoke-test.mjs` — end-to-end API workflow test

## Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_NAME` | Display name (easy to rebrand) |
| `AUTH_SECRET` | Secret for signing session cookies |
| `STORAGE_BACKEND` | `local` (default MVP) |
| `DATA_DIR` | Where SQLite + media files live (default `./data`) |
| `NEXT_PUBLIC_SUPABASE_*` | Optional — for future Supabase-backed deploy |

## Local setup

Requirements: Node.js 20+ (tested with 22).

```bash
cd surgical-narration-lab
npm install
cp .env.example .env.local
# edit AUTH_SECRET to a long random string
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Create an account (first user becomes **admin**).
2. Upload an MP4/WebM/MOV video with title + procedure type.
3. Open the video, choose a narration mode, allow the microphone, record, preview, save draft or submit.
4. Reload and open **Playback** to confirm the narration persists.

### Smoke test (API workflow)

With the dev server running in another terminal:

```bash
npm run smoke
```

This signs up a disposable user, uploads a tiny WebM fixture, saves a narration, and fetches media through the authenticated proxy.

## Deploy

### Option A — Render (web service) + local-compatible build

1. Push this repo to GitHub.
2. Create a **Web Service** on [Render](https://render.com).
3. Build: `npm install && npm run build`
4. Start: `npm run start`
5. Set env vars from `.env.example` (`AUTH_SECRET` required).
6. **Limitation:** Render’s free filesystem is ephemeral. Uploaded media and SQLite will be lost on redeploy/restart unless you attach a persistent disk **or** migrate to Supabase storage + Postgres.

For anything beyond demos, use Option B.

### Option B — Render app + Supabase (recommended for persistence)

1. Create a free [Supabase](https://supabase.com) project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create private buckets `surgical-videos` and `narration-audio` (see `supabase/storage.sql`).
4. Deploy the Next.js app on Render with Supabase env vars.
5. Wire the app to Supabase Auth/DB/Storage (schema is ready; the running MVP currently uses local mode — swap storage/auth adapters before production use with durable media).

### Institutional / PHI use

Before handling protected health information:

- Complete security review, BAAs, encryption, retention, and access-control requirements.
- Do not treat free Render/Supabase tiers as HIPAA-compliant by default.
- Prefer private buckets, short-lived signed URLs, audit logging, and institutional SSO as required by your compliance office.

## Roles

`profiles.role` supports `admin` and `narrator`. MVP: every authenticated user can upload and narrate. First registered user is marked admin for convenience.

## Limitations (current MVP)

- Local disk + SQLite by default (great for demos; not durable on freemium PaaS without a disk or Supabase).
- No email password-reset / invitations yet.
- No automatic speech-to-text, waveform UI, or CSV export.
- MOV playback depends on the browser.
- Synchronized playback uses a simple `video_start_timestamp` + dual play (video muted + narration audio).

## License

Provided as a research starter template. Adapt naming and policies for your institution.
