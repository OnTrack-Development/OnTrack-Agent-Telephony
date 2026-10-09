# WHMCS website cutover (STAGED, not deployed)
This branch prepares `agent.ontrackegy.com` (old telephony/control-plane host) for a first-party
Android download and update channel. This is NOT `OnTrack-voice` and does not touch its repository.
Site update API: https://agent.ontrackegy.com/api/app/latest.php
APK: https://agent.ontrackegy.com/downloads/OnTrack-Command-v0.2.3-ARM64-release-signed.apk

Deploy requires authorized access to cPanel/SFTP or the existing admin website updater.
The old PHP site updater copies new files but **does not delete removed files**.
Do NOT claim telephony APIs or live SQLite data are removed just by moving Git branches.
Before replacing the live site, back up runtime `storage/app.sqlite*`, `config/local.php`,
and any call recordings/uploads. Confirm host storage can serve >27MB files without redirects.
Only after a successful live download and update manifest probe should old telephony routes
and server-side data be retired. Protected old data must not be made publicly downloadable.

The Android app v0.2.3 still polls GitHub; a follow-up release must change its updater
to the website after the new endpoint is verified live.
