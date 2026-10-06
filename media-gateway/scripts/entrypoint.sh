#!/bin/sh
set -eu

python3 /opt/ontrack/scripts/render_config.py

cp /opt/ontrack/config/extensions.conf /etc/asterisk/extensions.conf
cp /opt/ontrack/config/rtp.conf /etc/asterisk/rtp.conf
cp /opt/ontrack/config/http.conf /etc/asterisk/http.conf

cp /opt/ontrack/scripts/ontrack_event.py /var/lib/asterisk/agi-bin/ontrack_event.py
cp /opt/ontrack/scripts/ontrack_upload.py /var/lib/asterisk/agi-bin/ontrack_upload.py
chmod 0755 /var/lib/asterisk/agi-bin/ontrack_*.py

mkdir -p /var/spool/asterisk/monitor
chown -R asterisk:asterisk /var/spool/asterisk/monitor /var/lib/asterisk/agi-bin

exec /usr/sbin/asterisk -f -U asterisk -G asterisk -vvv
