#!/usr/bin/env python3
"""
Kids Learning Space — local save server.

Serves the app statically AND writes the save history into the app's own folder,
so autosave and the "Save to folder now" button land real files on disk with no
browser folder-picker and no permission grants. Works in any browser.

Run:  python3 tools/kls_server.py [port]     (default 8000)

Endpoints (same-origin, localhost only):
  GET  /__kls_ping__   → {"kls": true, "folder": "<name>", "count": <N>}
      lets the page detect it is running under this server.
  POST /__kls_save__   ← a kls.backup envelope (JSON) → writes:
      <app folder>/kls-backup-latest.json
      <app folder>/saves/kls-save-<YYYYMMDD-HHmmss>.json   (newest 30 kept)
      → {"ok": true, "file": "saves/…", "count": <N>}

Security: binds to 127.0.0.1 only. The write endpoint accepts only a valid
`kls.backup` JSON envelope, caps the body size, and writes fixed server-chosen
filenames (no path from the client is ever used), so there is no path traversal.
"""
import sys
import os
import json
import re
import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# The app folder is the parent of this tools/ directory.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVES_DIR = os.path.join(ROOT, 'saves')
HISTORY_KEEP = 30
MAX_BODY = 8 * 1024 * 1024  # 8 MB — a backup envelope is tens of KB
PING_PATH = '/__kls_ping__'
SAVE_PATH = '/__kls_save__'
HISTORY_RE = re.compile(r'^kls-save-\d{8}-\d{6}\.json$')


def _history_count():
    if not os.path.isdir(SAVES_DIR):
        return 0
    return len([f for f in os.listdir(SAVES_DIR) if HISTORY_RE.match(f)])


def _prune_history():
    if not os.path.isdir(SAVES_DIR):
        return 0
    files = sorted(f for f in os.listdir(SAVES_DIR) if HISTORY_RE.match(f))
    for old in files[:-HISTORY_KEEP] if len(files) > HISTORY_KEEP else []:
        try:
            os.remove(os.path.join(SAVES_DIR, old))
        except OSError:
            pass
    return _history_count()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?', 1)[0] == PING_PATH:
            self._send_json(200, {'kls': True, 'folder': os.path.basename(ROOT), 'count': _history_count()})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?', 1)[0] != SAVE_PATH:
            self._send_json(404, {'ok': False, 'error': 'not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
        except (TypeError, ValueError):
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send_json(400, {'ok': False, 'error': 'bad content length'})
            return
        raw = self.rfile.read(length)
        try:
            envelope = json.loads(raw)
            if not isinstance(envelope, dict) or envelope.get('type') != 'kls.backup':
                raise ValueError('not a kls.backup envelope')
        except Exception as exc:  # noqa: BLE001 — report any parse/validate failure
            self._send_json(400, {'ok': False, 'error': 'invalid backup: %s' % exc})
            return
        text = json.dumps(envelope, indent=2)
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        name = 'kls-save-%s.json' % stamp
        try:
            os.makedirs(SAVES_DIR, exist_ok=True)
            with open(os.path.join(ROOT, 'kls-backup-latest.json'), 'w', encoding='utf-8') as fh:
                fh.write(text)
            with open(os.path.join(SAVES_DIR, name), 'w', encoding='utf-8') as fh:
                fh.write(text)
        except OSError as exc:
            self._send_json(500, {'ok': False, 'error': str(exc)})
            return
        self._send_json(200, {'ok': True, 'file': 'saves/%s' % name, 'count': _prune_history()})

    def log_message(self, *args):
        pass  # keep the launcher window quiet


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    httpd = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('Kids Learning Space running at http://localhost:%d  (close this window / Ctrl-C to stop)' % port)
    print('Saves are written into: %s' % ROOT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
