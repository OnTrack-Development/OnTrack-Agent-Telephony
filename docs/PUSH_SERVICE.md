# OnTrack WHMCS Push Gateway

Hosting: https://agent.ontrackegy.com/api/push/
Firebase project: ontrack-whmcs-push
Android package: com.ontrackdevelopment.command

## Security-first deployment state

This gateway is DISABLED by default until private server configuration is installed. Adding its code to the site does NOT activate background push and does NOT silently enroll any employee.

- GET /api/push/health.php is a non-sensitive readiness indicator.
- POST /api/push/event.php accepts HMAC-signed WHMCS events only.
- POST /api/push/enroll.php requires one-time signed pairing proof from an authenticated WHMCS administrator.
- POST /api/push/revoke.php removes a device after proving its private revocation token.
- app/push_worker.php sends through Firebase HTTP v1 with server-only OAuth and is CLI-only.
- integrations/whmcs/includes/hooks/ontrack_push_notifications.php is an OPTIONAL standalone WHMCS event sender. Do not change the existing WhatsApp addon.

## Installation without changing Firebase / Android identity

1. Create a private directory OUTSIDE all web document roots, mode 0700. Copy the example file web/app/push-config.example.php to a PHP config there. Set environment variable ONTRACK_PUSH_CONFIG to its absolute path for PHP. Keep this private config out of GitHub and chat.
2. Use a unique tenant ID and random per-installation HMAC secret for each WHMCS company. Example secure secret generation in PHP: bin2hex(random_bytes(32)).
3. Generate a stable token encryption key using base64_encode(random_bytes(32)) in PHP. Store in the private config. Rotating it without a migration invalidates existing enrolled tokens.
4. From the existing ontrack-whmcs-push Firebase project, provision a server-only service account with only FCM messaging rights. Store the downloaded service-account JSON in the private directory and set its absolute path in config. NEVER commit or share private_key, token credentials or client API secrets.
5. Ensure PHP 8.2+ with pdo_sqlite, sodium, openssl and curl extensions. Create a writable private database directory. Cron can call /usr/bin/php /ABSOLUTE/PATH/web/app/push_worker.php every minute. On shared-host cron, worst-case notification latency can exceed 60 seconds; subsecond push requires an event-triggered sender or an always-on queue worker.
6. Configure each company's separate local WHMCS hook with the matching tenant ID and HMAC secret, install the standalone sender into that company's includes/hooks directory. It listens to TicketOpen, TicketOpenAdmin, ClientAdd and AfterShoppingCartCheckout. Only type and record ID are transmitted.
7. Implement and approve a WHMCS admin-authenticated pairing issuer that produces a one-time, short-lived signed statement with {v:1, tenant, staff, iat, exp, jti}. Signing is hex(HMAC_SHA256(base64url(JSON), tenant_secret)). Pairing MUST NOT trust a self-claimed staff identity. The issuer and mobile registration flow are not active yet.
8. Enroll device FCM tokens only after WHMCS staff authorization, encrypt at rest on the server, keep the revocation secret in Android SecureStore, revoke on logout and disable devices when staff access is revoked. Restrict staff to allowed notification categories.
9. Verify locked-device notification and tap-to-record, checking that the signed-in app account matches the WHMCS installation and has permission to view the record.

## Tenant isolation and endpoint stability

Incoming webhook authentication is HMAC plus timestamp, with per-tenant replay prevention. Pairing is single-use and expires quickly. Devices are keyed by the verified tenant and staff ID. When queuing, each event is delivered ONLY to registered devices for the same tenant, never to request-specified arbitrary FCM addresses. No WHMCS admin password is sent to the central gateway.

A future push.ontrackegy.com service can reuse the exact same Firebase project and Android package. Keep the current agent.ontrackegy.com/api/push endpoint online behind a verified HTTPS reverse proxy during the migration. Do not blindly redirect signed POSTs to unknown destinations.

CURRENT LIMIT: This repository contains the safe server gateway, queue, worker, optional event sender and isolated tests only. It is not a fully activated push service until server configuration and WHMCS admin pairing are completed. No Firebase or WHMCS secrets are stored here.
