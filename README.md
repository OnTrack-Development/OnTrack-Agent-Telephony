# OnTrack Agent Telephony

POC for connecting an Android SIM line to the OnTrack AI telephony control plane without customer-side GSM hardware.

## Repository layout

- `web/` — dashboard + API for `https://agent.ontrackegy.com`
- `web/update.php` — shared-hosting GitHub Bridge updater
- `android/` — OnTrack AI Phone Bridge source
- `dist/OnTrack-AI-Phone-Bridge-v0.1.0.apk` — current installable POC APK
- `.github/workflows/build-android.yml` — Android APK build

## Shared-hosting deployment

This project follows the same simple deployment pattern used for the OnTrack Voice demo: the hosting-side updater pulls the public GitHub repository directly.

One-time setup:

1. Upload `web/update.php` to the subdomain `public_html/update.php`.
2. Open `https://agent.ontrackegy.com/update.php`.
3. Set the dashboard password and updater password.
4. Press **Update from GitHub**.

Every later deployment is:

`Push main → open update.php → Update from GitHub`

The updater downloads the repository, deploys only `web/`, and preserves:

- `config/local.php`
- `storage/app.sqlite`
- SQLite WAL/SHM files

No FTP credentials or GitHub deployment secrets are required because the repository is public.

## Current POC flow

Dashboard → device pairing → Android foreground bridge → incoming call events / outbound jobs → SIM call state → dashboard.

The AI carrier-conference/media leg is intentionally the next milestone after this transport layer is verified on the target Android phone and Egyptian carrier.
