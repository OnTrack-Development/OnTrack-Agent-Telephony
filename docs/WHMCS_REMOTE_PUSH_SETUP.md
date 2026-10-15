# WHMCS background push (independent Companion v0.2.0)

## Implemented
- FCM HTTP v1 to Android com.ontrackdevelopment.command on ontrack-whmcs-push.
- Ticket creation/customer replies, new clients, checkout orders, new and paid invoices.
- Independent read-only incoming WhatsApp message polling with a baseline on first run (no historic alert flood).
- One event key per real event, encrypted WHMCS device token storage, per-device deduplication, retry queue and 30-minute stale expiry.
- Restricted one-time WHMCS admin pairing and ticket department permissions; no WHMCS API secrets or Meta tokens sent.
- Android open-ticket/open-record and WhatsApp conversation deep links; no synthetic "N updates" messages.

## Required production activation (not automatically deployed)
1. Deploy the independent companion/modules/addons/ontrack_mobile_admin folder into WHMCS modules/addons/ontrack_mobile_admin and open/activate it under WHMCS Addon Modules. Do not modify the stable whatsapp_notifications module or TelegramNotify.
2. Create a least-privileged Firebase service account for existing ontrack-whmcs-push project; save its JSON outside public_html, owned by server user and readable only by WHMCS/cron. NEVER upload JSON to GitHub or APK.
3. Define this constant in your private WHMCS configuration.php, using your actual external path:
   define('ONTRACK_MOBILE_FCM_SERVICE_ACCOUNT_PATH', '/home/ACCOUNT/private/ontrack-fcm-service-account.json');
4. Schedule the CLI worker once per minute under the WHMCS account, adjusting its real PHP/WHMCS paths:
   * * * * * /usr/bin/php -q /path/to/whmcs/modules/addons/ontrack_mobile_admin/cron.php >/dev/null 2>&1
   Native AfterCronJob processing is a fallback, not a substitute for the once-per-minute worker.
5. Generate a one-use pairing code in the addon admin page, then Android app → Settings → Notifications → enter code → "تفعيل جميع إشعارات WHMCS". Grant Android notifications and inspect server FCM status.
6. Close the app normally and send a NEW ticket, inbound WhatsApp message, client registration, and order. Validate FCM delivery and destination opening. The local test button is NOT an end-to-end remote push test.

## Boundaries
- This commit only changes source; does not deploy WHMCS code, install secrets, schedule server cron, or prove live remote delivery.
- TelegramNotify's prior WhatsApp push integration is independent. Avoid enabling both WhatsApp senders for the same device if duplicate messages are unwanted.
- Full WhatsApp message previews are intentionally hidden on lock screens; push includes contact and event type.
- Telegram chat alerts require verified TelegramNotify event schema, which is not in this repository; no guessed database queries have been added.
- If ticket department cannot be verified, do not send it. Normal Android background notifications are supported; Force Stop, OEM battery optimizations, network problems, or FCM delivery issues may block/delay them.
