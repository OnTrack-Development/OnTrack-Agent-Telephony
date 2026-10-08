"""Read-only localhost bridge for ADB reverse readiness checks. No cellular audio in HTTP."""
import hmac
import json
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

class BridgeGate:
    def __init__(self, ready_provider, token=None):
        self.ready_provider = ready_provider
        self.token = token or secrets.token_urlsafe(32)
        self.httpd = None
        self.thread = None

    def start(self):
        gate = self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                authenticated = hmac.compare_digest(self.headers.get('X-OnTrack-Bridge-Token', ''), gate.token)
                if not authenticated:
                    self.send_error(403)
                    return
                if self.path != '/ready':
                    self.send_error(404)
                    return
                payload = json.dumps({'ready': bool(gate.ready_provider())}, separators=(',', ':')).encode('utf8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            def log_message(self, fmt, *args):
                return  # Do not log credentials, phone data or endpoint probes.
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
        self.thread = Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        if self.httpd:
            self.httpd.shutdown(); self.httpd.server_close()
            self.httpd = None
