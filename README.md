# OnTrack Agent Telephony

POC for connecting an Android SIM line to the OnTrack AI telephony control plane without customer-side GSM hardware.

## Repository layout

- `web/` — dashboard + API for `https://agent.ontrackegy.com`
- `android/` — OnTrack AI Phone Bridge source
- `dist/OnTrack-AI-Phone-Bridge-v0.1.0.apk` — current installable POC APK
- `.github/workflows/deploy-web.yml` — automatic web deployment
- `.github/workflows/build-android.yml` — Android APK build

## Current POC flow

Dashboard → device pairing → Android foreground bridge → incoming call events / outbound jobs → SIM call state → dashboard.

The AI carrier-conference/media leg is intentionally the next milestone after this transport layer is verified on the target Android phone and Egyptian carrier.

## GitHub deployment secrets

Add these under **Settings → Secrets and variables → Actions**:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASS`
- `FTP_REMOTE_DIR` — usually `/public_html` (or `/` if the FTP account is already jailed to public_html)
- `APP_ADMIN_PASSWORD`
- `APP_BASE_URL` — `https://agent.ontrackegy.com`

No production password is committed to this public repository. `config/local.php` is generated only inside the deployment runner and uploaded to the server.
