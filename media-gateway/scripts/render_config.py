#!/usr/bin/env python3
import os
from pathlib import Path

required = [
    'SIP_TRUNK_HOST',
    'SIP_TRUNK_USERNAME',
    'SIP_TRUNK_PASSWORD',
    'SIP_TRUNK_DID',
    'ONTRACK_API_BASE',
    'ONTRACK_MEDIA_SECRET',
]

missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit('Missing required environment variables: ' + ', '.join(missing))

host = os.environ['SIP_TRUNK_HOST'].strip()
port = os.environ.get('SIP_TRUNK_PORT', '5060').strip()
username = os.environ['SIP_TRUNK_USERNAME'].strip()
password = os.environ['SIP_TRUNK_PASSWORD']
did = os.environ['SIP_TRUNK_DID'].strip()
match = os.environ.get('SIP_TRUNK_MATCH', host).strip()
allow = os.environ.get('SIP_ALLOW', 'ulaw,alaw').strip()
contact_user = os.environ.get('SIP_CONTACT_USER', username).strip()

pjsip = f'''[global]
type=global
user_agent=OnTrack-Media-Gateway

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

[trunk-auth]
type=auth
auth_type=userpass
username={username}
password={password}

[trunk-aor]
type=aor
contact=sip:{host}:{port}
qualify_frequency=30

[trunk-endpoint]
type=endpoint
transport=transport-udp
context=from-provider
disallow=all
allow={allow}
outbound_auth=trunk-auth
aors=trunk-aor
from_user={did}
from_domain={host}
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[trunk-identify]
type=identify
endpoint=trunk-endpoint
match={match}

[trunk-registration]
type=registration
transport=transport-udp
outbound_auth=trunk-auth
server_uri=sip:{host}:{port}
client_uri=sip:{username}@{host}
contact_user={contact_user}
retry_interval=30
forbidden_retry_interval=120
expiration=300
'''

Path('/etc/asterisk/pjsip.conf').write_text(pjsip, encoding='utf-8')
