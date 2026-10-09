# WHMCS Android & GitHub-pull website

The WHMCS Android app is published from the same existing OnTrack-Development/OnTrack-Agent-Telephony repository.

## Current version
- WHMCS v0.2.7, Android versionCode 8
- Android app source: branch `ontrack-command-native`
- Website source: `main/web/`
- Download website: https://agent.ontrackegy.com/
- Release: https://github.com/OnTrack-Development/OnTrack-Agent-Telephony/releases/tag/whmcs-v0.2.7-29

## Website deployment — restored from the original AI Phone project
The shared hosting site **pulls from the public GitHub repository itself**. This is the same architecture as the original AI Phone server's `web/app/site_updater.php`.

One-time initialization on an existing hosting installation that lacks the updater:
1. Upload the release asset `WHMCS-Server-v0.2.7-GitHub-AutoSync.zip` into the live subdomain document root and extract it (preserve existing unrelated files).
2. Open `https://agent.ontrackegy.com/update.php` to see the updater status. The site automatically checks the public repository on subsequent GET visits. No separate deployment credentials or tokens are embedded in the project.

After first installation, website traffic to `index.php` or `api/app/latest.php` schedules a server-side check approximately every three minutes, after sending the response. When `main` changes, the site downloads the public repo ZIP at a pinned commit SHA and deploys the `web/` tree. It validates the WHMCS app ID and APK SHA-256 before deployment, preserves local state, and writes `downloads/latest.json` last. Failed attempts retry at a later poll. No data or unrelated hosting files are deleted.

The first bootstrap upload is unavoidable when the installed site does not yet contain a GitHub-pull updater. Simply pushing GitHub cannot execute new PHP code on a server where that updater is absent.

### Production checks
- `https://agent.ontrackegy.com/update.php` (updater entrypoint)
- `https://agent.ontrackegy.com/api/app/latest.php` (installed app version)
- `https://agent.ontrackegy.com/downloads/WHMCS-v0.2.7-ARM64-release-signed.apk`

The app checks updates against the live server endpoint. The GitHub release and server APK must always agree.
