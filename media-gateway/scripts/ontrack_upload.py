#!/usr/bin/env python3
import mimetypes
import os
import sys
import time
import uuid
import urllib.request

def consume_agi_environment():
    while True:
        line = sys.stdin.readline()
        if not line or line in ('\n', '\r\n'):
            return

def wait_for_file(path):
    previous = -1
    for _ in range(20):
        if os.path.isfile(path):
            size = os.path.getsize(path)
            if size > 44 and size == previous:
                return True
            previous = size
        time.sleep(0.25)
    return os.path.isfile(path) and os.path.getsize(path) > 44

def multipart(pin, path):
    boundary = '----OnTrack' + uuid.uuid4().hex
    name = os.path.basename(path)
    content_type = mimetypes.guess_type(name)[0] or 'audio/wav'
    parts = []
    parts.append(('--' + boundary + '\r\n' +
                  'Content-Disposition: form-data; name="pin"\r\n\r\n' +
                  pin + '\r\n').encode('utf-8'))
    parts.append(('--' + boundary + '\r\n' +
                  'Content-Disposition: form-data; name="recording"; filename="' + name + '"\r\n' +
                  'Content-Type: ' + content_type + '\r\n\r\n').encode('utf-8'))
    with open(path, 'rb') as handle:
        parts.append(handle.read())
    parts.append(('\r\n--' + boundary + '--\r\n').encode('utf-8'))
    return boundary, b''.join(parts)

def upload(pin, path):
    base = os.environ.get('ONTRACK_API_BASE', '').rstrip('/')
    secret = os.environ.get('ONTRACK_MEDIA_SECRET', '')
    if not base.startswith('https://') or not secret:
        raise RuntimeError('OnTrack API configuration is missing')

    boundary, body = multipart(pin, path)
    request = urllib.request.Request(
        base + '/api/media/upload-recording.php',
        data=body,
        method='POST',
        headers={
            'Authorization': 'Bearer ' + secret,
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
            'Content-Length': str(len(body)),
            'Accept': 'application/json',
            'User-Agent': 'OnTrack-Media-Gateway/1.0',
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        response.read()

def main():
    consume_agi_environment()
    pin = sys.argv[1] if len(sys.argv) > 1 else ''
    path = sys.argv[2] if len(sys.argv) > 2 else ''
    if not pin or not path:
        return
    try:
        if not wait_for_file(path):
            raise RuntimeError('Recording file was not finalized')
        upload(pin, path)
    except Exception as exc:
        sys.stderr.write('OnTrack recording upload failed: %s\n' % exc)

if __name__ == '__main__':
    main()
