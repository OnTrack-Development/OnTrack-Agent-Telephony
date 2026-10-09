# WHMCS Android Distribution

Main branch contains the website source for the WHMCS Android APK distribution.
Signed release: WHMCS v0.2.6 (Android versionCode 7).
APK: web/downloads/WHMCS-v0.2.6-ARM64-release-signed.apk
Manifest: web/downloads/latest.json (verified SHA-256).
Public site target: https://agent.ontrackegy.com

Application source and ticket improvements: branch ontrack-command-native.
Legacy telephony application and its server source are not included in main.
No new backups are created.

DEPLOYMENT STATUS: The main branch is a hosting-ready site tree, NOT a verified deployment to agent.ontrackegy.com.
An authenticated cPanel/SFTP/SSH deploy is still necessary; GitHub repository changes do not delete files in the live document root.
