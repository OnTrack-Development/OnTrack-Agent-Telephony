# WHMCS Mobile Companion v0.2.1 — independent WHMCS Push + WhatsApp

Installable server-side WHMCS addon: modules/addons/ontrack_mobile_admin.
Does NOT modify the production whatsapp_notifications module, its Meta webhook,
TelegramNotify or any WHMCS core file.

## Installation and upgrade
1. Download the WHMCS-Mobile-Companion-v0.2.1.zip release.
2. Back up your existing WHMCS installation and extract the ZIP into the actual
   WHMCS root on services.ontrackegy.com. NOT the APK website.
3. Under System Settings → Addon Modules, activate the independent addon and
   grant access only to authorized administrators. For an upgrade, OPEN its
   addon admin screen at least once; schema upgrade creates the new push tables.
4. Generate a one-use administrator pairing code from the addon screen. In the
   Android WHMCS app, open Settings → Notifications, enter this 12-char code,
   and tap "تفعيل جميع إشعارات WHMCS". Pairing codes expire in five minutes;
   device sessions expire in 30 days and can be revoked.

## FCM required for real background delivery
1. Create a restricted Firebase service account for project ontrack-whmcs-push
   in the Firebase / Google Cloud console. Store its JSON on the WHMCS server
   OUTSIDE public_html/document root, with permissions only for the server user.
   Do not commit any service-account credential or paste it into chat.
2. Define the private constant in WHMCS configuration.php using your real path:
   define('ONTRACK_MOBILE_FCM_SERVICE_ACCOUNT_PATH', '/home/ACCOUNT/private/ontrack-fcm-service-account.json');
3. Enable PHP cURL, OpenSSL, mbstring and WHMCS encrypt/decrypt helpers.
4. Schedule the installed worker once per minute:
   * * * * * /usr/bin/php -q /path/to/whmcs/modules/addons/ontrack_mobile_admin/cron.php >/dev/null 2>&1
   Existing WHMCS AfterCronJob hook also sends queued events, but may be slower.
5. Verify app push server status reports configured/registered, then test a
   fresh event while app is fully closed. A local notification test alone
   does NOT validate background Firebase delivery.

## What is sent
- TicketOpen, TicketOpenAdmin, TicketUserReply
- ClientAdd, AfterShoppingCartCheckout, InvoiceCreated, InvoicePaid
- New inbound WhatsApp messages from existing module tables, read-only,
  using message ID cursor and first-run baseline (no old-message flood).
- Each real event has its own title, one deduplication key, a target WHMCS
  section/record, and limited retries. No "40 new notifications" summaries.
- Ticket alerts are restricted to authorized staff support departments.
  The notification never includes a full WhatsApp message preview.

The old TelegramNotify-based WhatsApp FCM registration is independent. New
all-events FCM enrollment de-registers legacy WhatsApp push where possible
to prevent duplicate WhatsApp banners. Do not provision both simultaneously.

Telegram chat notifications are not supported by this addon because an
authenticated Telegram event contract is not bundled here; do not guess
TelegramNotify database internals.

## WHMCS companion bridge (HTTPS POST + one-use pairing)
POST /modules/addons/ontrack_mobile_admin/bridge.php
Body: {"operation":"pair","payload":{"code":"A1B2C3D4E5F6","deviceLabel":"WHMCS Android Push"}}
With Authorization: Bearer <paired token>, supported operations include:
- push.register: device_id and FCM token, encrypted by WHMCS before storage
- push.status: configured/registered booleans without revealing credentials
- push.unregister: removes associated device enrollment
- whatsapp.read / whatsapp.get / whatsapp.send under their own access scopes
- logout: revokes paired administrator session

Original WhatsApp send logic is delegated unchanged to WhatsApp_ChatService.
Meta credentials and WHMCS admin passwords must never be supplied to bridge.

## Deployment truth
The release package is available on GitHub, but the WHMCS server and Firebase
private credentials are not deployed automatically by creating a Git commit.
Source code and build success are not proof of live delivery. Only a closed-app
end-to-end test after production setup confirms it.

## Production routing fix (Android 0.3.42 / Companion 0.2.1)
The live services.ontrackegy.com host returned HTTP 403 for direct `modules/addons/ontrack_mobile_admin/bridge.php` requests. New Android enrollment uses the official WHMCS addon route `index.php?m=ontrack_mobile_admin&route=mobile_push` instead. Deploy and activate this Companion version on the real WHMCS server **before** registering FCM in Android. The API remains protected by the one-time administrator pairing code and authenticated device bearer session. Re-save the active addon configuration to ensure WHMCS detects new hooks. First inbound WhatsApp cursor is established at addon activation; start cron **before** testing fresh incoming messages. Set the private FCM service account and confirm worker and device status in the addon administration screen.
