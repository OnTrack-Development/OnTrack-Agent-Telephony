# WHMCS Android hosting replacement — NO BACKUP
This Git branch contains **only** the WHMCS mobile download/update site. It does not include the old OnTrack AI Phone server.

Public hosting target: https://agent.ontrackegy.com
Update metadata: https://agent.ontrackegy.com/api/app/latest.php
Latest Android APK: https://agent.ontrackegy.com/downloads/WHMCS-v0.2.5-ARM64-release-signed.apk

After the v0.2.5 signed APK has been staged, replace the complete live document root with the `web/` directory contents. This is a destructive removal of all old telephony server PHP files, databases, call logs, old APKs, user configurations, and miscellaneous storage as explicitly requested. **Do not back up** them.

SECURITY: The GitHub connector writes repository files, but cannot deploy to cPanel or erase the live document root. A real authenticated cPanel/SSH/SFTP deployment is required, and the live site must be probed afterward before claiming completion. Never expose secrets or backups through a public web path. Keep the legacy Android Java package ID unchanged so upgrades work, even though the visible app name is WHMCS.

The site manifest must be deployed in the same cutover as the matching APK. The installer verifies downloaded SHA256, and Android requires its normal user confirmation for installation.
