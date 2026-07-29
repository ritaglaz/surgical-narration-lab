# Render environment variables checklist

In Render → your Web Service → **Environment**, add/update these.

## Required app vars
| Key | Value |
| --- | --- |
| `AUTH_SECRET` | long random string (keep existing if already set) |
| `NODE_VERSION` | `22` |
| `STORAGE_BACKEND` | `local` |
| `DATA_DIR` | `./data` |
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
| `NEXT_PUBLIC_APP_URL` | `https://surgical-narration-lab.onrender.com` |
| `RESEND_API_KEY` | from [resend.com](https://resend.com) |
| `EMAIL_FROM` | verified sender, e.g. `Surgical Operative Note Lab <you@yourdomain.com>` |

Without Resend, admins can still create invites and **copy the link** from the Invite page.

## After saving env vars
1. **Manual Deploy** → **Deploy latest commit** (or wait for auto-deploy)
2. Confirm the latest GitHub commit includes Google Drive sync code
3. Save a narration on the live site and check the **Surgical Vision** Drive folder

## Important limitation
Render free disk is still ephemeral for **video files**. Drive sync backs up **audio + JSON**. For durable video storage later, use Supabase Storage.
