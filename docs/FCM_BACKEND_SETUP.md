# Firebase FCM / TelegramNotify backend prerequisites

The Android app includes the Firebase **client** config for project `ontrack-whmcs-push` and package `com.ontrackdevelopment.command`, and can register the native device push token through the existing TelegramNotify `register_push` operation.

**Remote push is NOT operational just because the device Firebase test or the local notification test succeeds.** These are independent checks.

To activate server delivery, an authorized WHMCS operator must:

1. Provision a minimally privileged Firebase service account for the existing project from the Google Cloud/Firebase administrative console. Never commit the service account JSON or send it through chat, GitHub, or an APK.
2. Configure the private credentials using the **existing deployed TelegramNotify module's supported server-side configuration** (outside public web paths), not in the app or the stable `whatsapp_notifications` addon. Validate its `push_status` reports `configured: true`.
3. Ensure the WHMCS cron and the deployed TelegramNotify notification-sender worker are enabled and healthy. Check that the registered device belongs to the signed-in and authorized staff member; revoke tokens on logout.
4. On Android Settings → WHMCS → Notifications, allow notifications; in-app Settings, first check FCM server status, then register background WhatsApp notifications. Send an authorized test WhatsApp message while WHMCS app is fully closed. Confirm an **FCM-delivered** notification, not a local/polling one.
5. Tickets, clients and orders currently have **foreground polling notifications only**. To support remote push for these, implement backend WHMCS event hooks, staff authorization/tenant isolation, secure device enrollment and FCM HTTP v1 sends; the existing WhatsApp enrollment alone must not be presented as WHMCS-wide push.

A missing service account or disabled worker cannot be fixed by rebuilding the APK. Changes to `whatsapp_notifications` and its webhooks are strictly out of scope.
