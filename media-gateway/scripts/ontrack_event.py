#!/usr/bin/env python3
import json
import os
import sys
import urllib.request

def consume_agi_environment():
    while True:
        line = sys.stdin.readline()
        if not line or line in ('\n', '\r\n'):
            return

def post_json(path, payload):
    base = os.environ.get('ONTRACK_API_BASE', '').rstrip('/')
    secret = os.environ.get('ONTRACK_MEDIA_SECRET', '')
    if not base.startswith('https://') or not secret:
        raise RuntimeError('OnTrack API configuration is missing')

    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        base + path,
        data=body,
        method='POST',
        headers={
            'Authorization': 'Bearer ' + secret,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'OnTrack-Media-Gateway/1.0',
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        response.read()

def main():
    consume_agi_environment()
    state = sys.argv[1] if len(sys.argv) > 1 else ''
    pin = sys.argv[2] if len(sys.argv) > 2 else ''
    gateway_call_id = sys.argv[3] if len(sys.argv) > 3 else ''
    error = sys.argv[4] if len(sys.argv) > 4 else ''

    payload = {'state': state, 'pin': pin, 'gateway_call_id': gateway_call_id}
    if error:
        payload['error'] = error

    try:
        post_json('/api/media/gateway-event.php', payload)
    except Exception as exc:
        sys.stderr.write('OnTrack gateway event failed: %s\n' % exc)

if __name__ == '__main__':
    main()
