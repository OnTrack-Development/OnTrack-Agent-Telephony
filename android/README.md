# OnTrack AI Phone Bridge — Android POC v0.1.0

First Android edge connector for `agent.ontrackegy.com`.

## Implemented
- Pair device with 6-digit dashboard pairing code.
- Store server-issued device bearer token locally.
- Request Default Dialer role.
- `InCallService` incoming/outgoing call detection.
- Foreground heartbeat + job polling.
- Outbound `place_ai_call` jobs dial through the phone's SIM using `TelecomManager.placeCall`.
- Report outbound states to `/api/device/call-update.php`.
- Report inbound ringing/answered/ended events to `/api/device/incoming-event.php`.
- HTTPS-only server configuration.

## Deliberately not enabled in v0.1
- Automatic answering.
- Carrier conference / AI bridge leg.
- Raw cellular audio capture (not available to normal third-party apps).

The next build enables conference experiments after v0.1 proves device registration, default-dialer behavior, call detection and SIM-originated dialing on the target Egyptian carrier/device.

## Build
Requires Java 17+, Android SDK 35 and Gradle 8.9+.

```bash
gradle :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

Repository: `OnTrack-Development/OnTrack-Agent-Telephony`
