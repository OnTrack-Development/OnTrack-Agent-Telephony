# Verification matrix — v1.0 POC

| Check | Execution environment | Result |
|---|---|---|
| JVM policy tests (10s, human override, hangup, scheduling) | JDK 21 local | PASS (local 2026-10-09, JVM unit scenarios) |
| Windows readiness gate + auth test | Python 3.x local | PASS (local 2026-10-09, 1 unittest) |
| Python compileall | Python local | PASS (local 2026-10-09) |
| Android debug APK build | GitHub Actions Android runner | Pending remote run |
| Windows Setup build | GitHub Actions Windows runner | Pending remote run |
| Bluetooth HFP SIM RX/TX | Xiaomi + Windows hardware | Not tested |
| Gemini Live API call | Requires user-owned API key | Not tested |
| Android real incoming calls | Requires user-owned SIM phone | Not tested |
| Human AI audio takeover | Requires handoff API + real device tests | Not implemented |

Safety gate: no host claims of verified SIM audio until independent real-carrier call test confirms both directions.

Note: The Android async readiness callback now binds to the originating Call and AnswerDecision object, preventing stale readiness from acting on a later call. This source change is not hardware-tested.
