# WHMCS Mobile

This repository's main branch contains only the self-hosted WHMCS Android download/update site.
Target virtual host: https://agent.ontrackegy.com

Application source: branch `ontrack-command-native`
Site distribution: `web/`
Signed APK: `web/downloads/WHMCS-v0.2.5-ARM64-release-signed.apk`
Update metadata: `web/api/app/latest.php`

The previous Android SIM telephony application, backend services, recording endpoints, settings,
and databases have been removed from the current main tree. No new backup was generated.

IMPORTANT: GitHub repository updates alone do not upload or delete files in a cPanel/SSH
document root. The production site must be replaced using authorized server deployment access
and then verified. The Android app's Java package identifier is intentionally kept
stable to preserve update compatibility.
