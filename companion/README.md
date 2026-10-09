# WHMCS Mobile Companion — independent addon

This is the production *server side* of the WHMCS Android WhatsApp inbox.

It is a separate WHMCS addon at `modules/addons/ontrack_mobile_admin`. The proven
`modules/addons/whatsapp_notifications` addon and its Meta/Telegram
`webhook.php` are **never edited**, and their Meta access credentials are never
returned to Android or stored in this repository.

## Install once

1. Download the generated `WHMCS-Mobile-Companion-v0.1.0.zip` from the
   GitHub Actions release or build artifact. This archive already contains
   `modules/addons/ontrack_mobile_admin/ontrack_mobile_admin.php` and
   `modules/addons/ontrack_mobile_admin/bridge.php`.
2. Extract it in the **WHMCS root** at `services.ontrackegy.com`, **not**
   the separate `agent.ontrackegy.com` APK download site.
3. In WHMCS admin, open **System Settings → Addon Modules** and activate
   **OnTrack WHMCS Mobile Companion**. Limit addon access to authorized staff
   roles. Activation creates 3 new addon-owned tables; it never changes
   existing WhatsApp tables.
4. Open **Addons → OnTrack WHMCS Mobile Companion** in a real WHMCS
   administrator session, generate a one-use pairing code (expires after
   five minutes), open WhatsApp in WHMCS Android, enter the code, and pair.
5. Mobile token is held only in Android SecureStore and expires after 30 days.
   Revoke a device from the WHMCS addon admin screen at any time.

A *Meta webhook verify token* is **not** a mobile administrator password. Do not
paste Graph API tokens, Meta webhook tokens, or WHMCS API credentials into the
mobile companion. Pairing codes are random, short lived, single use, hashed
server-side, and rate limited by IP. Mobile session tokens are random
cryptographically secure values, and stored only as SHA-256 hashes in WHMCS.

## API contract

`POST https://services.ontrackegy.com/modules/addons/ontrack_mobile_admin/bridge.php`

```json
{"operation":"pair","payload":{"code":"12-HEX-DIGITS","deviceLabel":"WHMCS Android"}}
```

Returns `token`, `adminName`, `expiresAt`, `scopes`. For all subsequent
calls, send `Authorization: Bearer <token>` and one of:

- `whatsapp.read` to list recent conversations (max 40).
- `whatsapp.get` with `payload.conversation_id` to read 80 recent messages.
- `whatsapp.send` with `conversation_id` and `text` to request one text send.
- `logout` to revoke the current mobile token.

Requests require HTTPS and a live session associated with a real WHMCS admin
account. Inbox data are read directly from the **stable module's existing**
`mod_whatsapp_conversations` and `mod_whatsapp_chat_messages` tables, with
schema checks (no blind field guesses). Sends go through the **original**
`WhatsApp_ChatService::sendText` with the original `SettingsCache`, enforce
the 24-hour text reply window, and never retry an unknown provider outcome.

For unsupported schema or an unavailable original ChatService the companion
returns an explicit error, not fabricated chats or messages. If the installed
stable WhatsApp module exposes a different send signature or table schema,
audit it first and update **this companion only**, not the stable addon.

## Deployment

The APK download site can auto-pull from GitHub, but the WHMCS *backend* uses a
separate document root. **The first installation of this addon on WHMCS cannot
happen by pushing a GitHub commit to the APK download website.** Install the
companion once in the WHMCS root; subsequent releases must likewise be deployed
to that WHMCS folder through its own authorized update mechanism.
