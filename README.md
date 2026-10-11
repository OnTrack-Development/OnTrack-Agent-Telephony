# WHMCS Native Android App

Current source: **v0.3.21, Android build 32**. Application ID remains `com.ontrackdevelopment.command` for upgrades using the existing release signature.

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

## v0.3.16 management scope
Native service form supports the documented UpdateClientProduct fields and confirmed module Create/Suspend/Unsuspend/Terminate/ChangePackage commands. WHMCS enforces staff API permissions. Orders show the external order number, line items, payment status, and explicit Accept/Cancel/Fraud/Pending controls. Refund and delete remain admin-only rather than falsely claiming an API refund. Client-owned tickets open the shared ticket editor after ID/ownership checks.

Notification taps (including cold launch) can target a ticket, order, invoice, client or service by ID. This does **not** enable remote background push: Firebase/FCM credentials, device-token registration and a WHMCS event sender are still required; local polling alone cannot provide instant alerts with the app closed.

## v0.3.17 Firebase Android client enrollment

Firebase project ID: `ontrack-whmcs-push`; Android package: `com.ontrackdevelopment.command`. The Firebase Android **client** configuration is stored as `mobile/google-services.json`, referenced from `expo.android.googleServicesFile`. The file contains public app identifiers, **not** a Firebase service-account private key. GitHub Actions verifies that Expo prebuild copies it into the Android native project. Do not commit service account JSON or FCM OAuth access tokens. Restrict the Firebase API key to Firebase APIs as Google recommends.

Settings has a native FCM enrollment test that obtains the device's native FCM token, verifies it exists, and discards it without logging, displaying, or transmitting it. This intentionally does not enable background delivery. Production push requires (1) a secure service-account identity on the backend, (2) a separate authenticated device registration service for each WHMCS installation, (3) strictly isolated tenant/staff/device mapping and revocation, (4) event hooks for new tickets, orders and clients, and (5) FCM HTTP v1 sending with authorized record IDs. Do not use WHMCS API keys or Firebase client API keys as a substitute for server authentication.

## v0.3.18 UI consistency
A custom branded, accessible in-app confirmation and alert modal replaces the system-default Alert.alert on the native screens, preserving all explicit confirmation buttons including destructive operations. Themed actions and forms use consistent corners, spacing, borders and enterprise-dark surfaces; request/retry banners use one reusable Notice component. Changes are visual-only; no WHMCS permission or payment behavior is bypassed. Android device QA is still required.

## v0.3.19 animated splash and cohesive UI
The static OS splash is now a short first frame; an original React Native native-driver animated launch mark reveals the WHMCS identity, awaits only saved-session restoration, and transitions out to the main interface. Reduced-motion Android accessibility is honored, with no network dependency or fixed artificial loading delay. App routes animate subtly, and shared surface styles plus the home, navigation, directory, tickets, WhatsApp, client profile, connection and settings UI have been redesigned without replacing WHMCS authorization logic. Native Android device review is still required for visual acceptance.

FCM remote notifications remain gated on authenticated WHMCS staff enrollment and **server-only** Firebase credentials. Do not assume that client Firebase config enables background pushes.

## v0.3.20: Privacy, dashboard and launch
Device unlock is required before restoring access to WHMCS records. A mandatory device-local 6–10 digit PIN is enrolled and confirmed, stored as a salted digest in secure OS storage, with retries restricted; where supported users can unlock using the OS biometric/device prompt. Re-entering from background locks the app again. This is local session protection, not a substitute for server WHMCS login/access permissions.

Financial figures are hidden by default (including unpaid invoice totals), with an eye button to reveal. Revenue uses WHMCS GetStats's official today/month/year/all-time formatted values. Invoice face-value totals use GetInvoices(status=Unpaid), stay unavailable when the response is incomplete, and are grouped by currency rather than summing mixed currencies. These figures aren't a remaining-balance ledger when partially paid invoices exist. No fake demo numbers are substituted.

The native opening frame and in-app wordmark now share the same background, with no invented native splash logo. WhatsApp remains integrated externally via the existing WHMCS admin inbox and requires an authenticated admin session; its stable module is not modified. Device-level QA and real WhatsApp authentication checks are still needed.

## v0.3.21 biometric onboarding and WhatsApp admin auth
After the secure app PIN is confirmed, WHMCS asks once whether the operator wants to enable biometric/device authentication. Acceptance triggers an OS authentication request before the opt-in is saved; declining saves an explicit preference, with no repeated offer. Pre-existing v0.3.20 PIN users are offered this migration only after authenticating with their PIN. Once enabled, reopening WHMCS automatically opens the native biometric prompt, with an accessible fingerprint-first surface and a PIN fallback. Preferences remain encrypted locally and are never transmitted to the server. 

Native WhatsApp: WHMCS External API Identifier/Secret do not grant a browser-admin cookie/session. The app now includes an explicit in-app administrator login path for accounts connected in API Credentials mode, without storing that additional admin password; it supports administrator OTP challenges. Existing Admin Legacy reuse still works and the WhatsApp Notifications addon remains an untouched black box. A real permitted WHMCS administrator session and addon permissions remain mandatory. Browser-only sessions cannot be transplanted into the app's isolated native cookie jar. If the WHMCS installation has WAF/browser challenges, staff may still need its external browser until an approved server-side companion authentication bridge exists.
