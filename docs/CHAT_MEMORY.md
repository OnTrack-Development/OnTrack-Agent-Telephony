# Conversation handoff — 2026-10-09

User requested returning to normal chat while GitHub builds. Do not claim the APK has finished.

## Project and constraints
- WHMCS Android app: OnTrack-Development/OnTrack-Agent-Telephony
- Source branch: ontrack-command-native; website branch: main.
- Native screens only; no WebView. No new WHMCS modules or modifications to existing module/core/webhook files.
- Existing GitHub publishing and website auto-update already authorized.
- Never retrieve or reuse cPanel credentials; user requested forgetting them.

## Completed implementation
v0.3.5 / Android build 16, app ID com.ontrackdevelopment.command.
Native WhatsApp conversations/history/unread/text replies and closed reply-window handling.
Native WHMCS admin login/OTP with in-memory scoped cookies and genuine module tokens.
Ticket custom fields, actual return-to-AI hook nonce, native new-ticket form with verified client ownership.
Native AI agent/queue snapshot. Existing ticket filtering/signature/keyboard behavior retained.
Media metadata only; media viewing/upload is not implemented.
Local typecheck, regression and module-contract tests, Java route tests, Expo prebuild and Android JS export pass.
No signed-in device test against live WHMCS performed.

## Build and continuation
Implementation commit: b50055423094bb61528e77dba4e4cbb7ac5b7af4.
GitHub build run: 37986403612; job: 114009368394.
URL: https://github.com/OnTrack-Development/OnTrack-Agent-Telephony/actions/runs/37986403612
Latest observed status: in progress at debug Gradle build. Unit tests, typecheck, native prebuild, registration and NDK selection succeeded. Signing/release still pending.
Earlier run 37986115439 failed NDK selection; fixed and tested actual Expo root-plugin template with mobile/scripts/select_android_ndk.py.
Next: inspect current run; fix any actual failure, preserve existing signing key; verify signed release and automatic main-branch staging; download live APK and compare SHA256/size.
Site: https://agent.ontrackegy.com/
Manifest: https://agent.ontrackegy.com/api/app/latest.php
Last confirmed live version: v0.3.1 build 12. Do not infer it upgraded without checking.
Main staging workflow automatically follows successful build and checks live checksum.
docs/RELEASE_STATUS.md records pending release gates.
Default WHMCS /admin/ returns 404; employee must supply actual configured admin directory in native login. Do not hunt for credentials.
