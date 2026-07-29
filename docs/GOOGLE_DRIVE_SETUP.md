# Google Drive sync setup (audio + JSON only)

The app can sync **narration audio** and **JSON metadata** into your Drive folder
(e.g. **Surgical Vision**). **Video files are not uploaded to Drive.**

You must create Google Cloud credentials yourself (I cannot log into your Google
account). Do **not** share your Google password.

## 1. Create a Google Cloud service account

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Google Drive API**  
   APIs & Services → Library → search “Google Drive API” → Enable
4. APIs & Services → **Credentials** → **Create credentials** → **Service account**
5. Name it e.g. `surgical-narration-lab`
6. Open the service account → **Keys** → **Add key** → **Create new key** → **JSON**
7. Download the JSON file and keep it private

## 2. Share your Drive folder

1. In Google Drive, open the folder **Surgical Vision**
2. Click **Share**
3. Paste the service account email from the JSON (`client_email`, looks like  
   `something@project.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Copy the **folder ID** from the browser URL:

```text
https://drive.google.com/drive/folders/<<<<<<<< FOLDER_ID >>>>>>>>
```

## 3. Add secrets to the app

### Local (`.env.local`)

```bash
GOOGLE_DRIVE_SYNC=true
GOOGLE_DRIVE_FOLDER_ID=paste_folder_id_here
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=/absolute/path/to/service-account.json
```

Or paste the whole JSON as one line:

```bash
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### Render

In the service **Environment** tab, add:

| Key | Value |
| --- | --- |
| `GOOGLE_DRIVE_SYNC` | `true` |
| `GOOGLE_DRIVE_FOLDER_ID` | your folder ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | full JSON key contents (one line is fine) |

Then redeploy.

## 4. What gets synced

After a video is uploaded (metadata only) or a narration is saved:

- `manifest.json` — full map of videos → narrations
- `video-<id>.json` — per-video metadata
- `narration-<id>.json` — per-recording metadata
- `narration-<id>.webm` (or other audio ext) — the audio file

## 5. Verify

1. Save a narration on the site
2. Refresh the **Surgical Vision** Drive folder
3. Confirm new JSON/audio files appear
4. Check Render/server logs if nothing appears (`[google-drive] sync failed`)

## Security reminder

- Never commit the service account JSON to GitHub
- Rotate the key if it was ever pasted into chat
- Change your Google password if you previously shared it in plain text
