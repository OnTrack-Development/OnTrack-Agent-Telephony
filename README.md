# WHMCS Native Android App

Current source: **v0.3.5, Android build 16**. Application ID remains `com.ontrackdevelopment.command` for upgrades using the existing release signature.

- Native React Native screens. No WebView, iframe or external-browser WhatsApp inbox.
- WHMCS core operations use the existing `includes/api.php` API and server-side API permissions.
- WhatsApp conversations, history, unread counts and confirmed text replies use the existing `whatsapp_notifications/ajax.php` routes and the module's own CSRF protection and 24-hour reply window.
- Ticket custom fields are read from the authenticated admin ticket page. The return-to-AI button invokes the existing ticket hook with a fresh ticket/admin-bound nonce.
- AI agent and queue monitoring use the existing `ai_support_agent/admin_snapshot.php` endpoint.
- New tickets use `OpenTicket`, with verified client identity or explicitly entered guest name/email, department and priority.
- Existing client profiles, services, invoices, domains and order screens are retained.

## Admin session

Open WhatsApp or the ticket admin controls and sign in using the employee's existing WHMCS login. Enter the real admin-directory name if it differs from `admin`. A supported OTP challenge is completed inside the native app. CAPTCHA and unsupported login forms stop with an error rather than bypassing authentication.

The native HTTP adapter keeps its own HTTPS/same-origin, per-account cookie jar in memory. It does not import browser cookies, disable TLS validation, expose provider credentials, or write cookies to disk. Logging out clears the jar. Module CSRF tokens remain in memory and are refreshed after authentication changes.

**No WHMCS upload, new addon, core change, WhatsApp-module edit or webhook change is needed.** The older `companion/` experiment is not used by the application or this release.

## Build and publish

Source branch: `ontrack-command-native`. Website source: `main/web/`. GitHub Actions builds and signs the ARM64 APK with the existing encrypted release key. The existing staging workflow publishes the verified APK and manifest to `main`; the installed website pulls updates from GitHub. Download site: https://agent.ontrackegy.com/.

`cd mobile && npm ci && npm run typecheck`

Tests cover ticket queues and replies, client ownership, directories, native module integration, session authentication/expiry, CSRF, same-origin route restrictions, and both literal/dynamic Expo NDK templates. An Android bundle export and native prebuild are additional local checks. A built APK and live server verification are separate gates, not implied by source completion.

## Current limits

Native WhatsApp sends text and displays message/media metadata. Opening/downloading attachments, voice-message playback and media upload are not implemented in this release. The native admin adapter requires a compatible WHMCS login form and existing employee access; module integrations have mock-contract coverage and still require a signed-in live device check.
