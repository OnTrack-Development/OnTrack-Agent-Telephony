# OnTrack Command — WHMCS Native Android App

React Native (Expo SDK 57) app, source v0.2.0. **No new WHMCS addon and no WebView.**

## Real API integration

WHMCS core: HTTPS POST to `/includes/api.php`. Admin or API identifier/secret authentication, SecureStore, ticket replies with manual confirmation, clients, services, invoices, orders and domains. API permissions are always enforced on the WHMCS server.

## Not yet connected

The custom WhatsApp Notifications and AI Support Agent panels currently do not execute real actions. Their existing private module routes and authentication must be verified before integration. Never assume an undocumented AJAX endpoint works as a mobile API.

## GitHub Android build

Every push to `main` runs `.github/workflows/debug-apk.yml`, builds an APK, verifies its signature, attaches it to a GitHub Actions artifact, and creates a tagged GitHub Release. A normal debug APK **is debug-signed only**. If repository secret `ANDROID_SIGNING_PASSWORD` has already been configured, the workflow restores the **existing** encrypted keystore from the `backup/telephony-server-before-command-2026-10-09` branch and attempts a persistent release-signed APK. Do not publish that password or the decoded key.

## Development

`cd mobile && npm install && npm run typecheck && npx expo prebuild --platform android`

No build/runtime success or deployment is implied by this document.
