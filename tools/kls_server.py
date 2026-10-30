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
      <app folder>/saved_status/kls-save-<YYYYMMDD-HHmmss>-<microseconds>-<uuid>.json
      (newest 30 kept; old seconds-only history files are still recognized)
      → {"ok": true, "file": "saved_status/…", "count": <N>}

Security: binds to 127.0.0.1 only. The write endpoint accepts only a valid
`kls.backup` JSON envelope, caps the body size, and writes fixed server-chosen
filenames (no path from the client is ever used), so there is no path traversal.
"""
import datetime
import errno
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import threading
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import urlopen

# The app folder is the parent of this tools/ directory.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVES_DIR = os.path.join(ROOT, 'saved_status')
HISTORY_KEEP = 30
MAX_BODY = 8 * 1024 * 1024  # 8 MB — a backup envelope is tens of KB
PING_PATH = '/__kls_ping__'
SAVE_PATH = '/__kls_save__'
BACKUPS_PATH = '/__kls_backups__'
HISTORY_RE = re.compile(r'^kls-save-(\d{8}-\d{6})(?:-(\d{3}|\d{6})-([0-9a-z]{1,64}))?\.json$')
SAVE_LOCK = threading.RLock()
UNSAFE_KEYS = {'__proto__', 'prototype', 'constructor'}


def _object_pairs(pairs):
    """Reject duplicate keys instead of silently replacing backup data."""
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError('duplicate JSON key: ' + key)
        out[key] = value
    return out


def _reject_constant(value):
    raise ValueError('invalid JSON number: ' + value)


def _parse_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError('JSON number is outside the supported range')
    return number


def _parse_json(raw):
    return json.loads(raw, object_pairs_hook=_object_pairs,
                      parse_constant=_reject_constant, parse_float=_parse_float)


def _is_version(value, expected):
    # JSON/JavaScript has a single numeric type: the literal 1.0 is also v1.
    return type(value) in (int, float) and value == expected


def _map(value, field):
    if not isinstance(value, dict):
        raise ValueError(field + ' must be an object')
    for key in value:
        if not isinstance(key, str) or not key or key in UNSAFE_KEYS:
            raise ValueError(field + ' has an unsafe or empty key')
    return value


def _validate_envelope(envelope):
    """Validate v1 structure while preserving opaque game JSON.

    Unknown slugs/storage bases and orphan profile IDs remain portable. Device
    updates and deleting a hub profile can leave registered storage behind.
    """
    _map(envelope, 'backup')
    if envelope.get('type') != 'kls.backup':
        raise ValueError('not a kls.backup envelope')
    if not _is_version(envelope.get('version'), 1):
        raise ValueError('unsupported backup version (expected 1)')
    for field in ('exportedAt', 'exportedBy'):
        if field in envelope and not isinstance(envelope[field], str):
            raise ValueError(field + ' must be a string')
    if 'hubVersion' in envelope:
        if not _is_version(envelope['hubVersion'], 2):
            raise ValueError('unsupported hubVersion (expected 2)')
    if 'hub' not in envelope:
        raise ValueError('backup is missing hub data')
    hub = envelope['hub']
    if hub is not None:
        _map(hub, 'hub')
        if not _is_version(hub.get('version'), 2):
            raise ValueError('unsupported hub version (expected 2)')
        profiles = _map(hub.get('profiles'), 'hub.profiles')
        if 'activeProfileId' not in hub:
            raise ValueError('hub is missing activeProfileId')
        active = hub['activeProfileId']
        if active is not None and (not isinstance(active, str) or active not in profiles):
            raise ValueError('activeProfileId must identify an included profile')
        for pid, profile in profiles.items():
            _map(profile, 'profile ' + pid)
            if profile.get('id') != pid:
                raise ValueError('profile id does not match its key')
            for field in ('displayName', 'avatar'):
                if not isinstance(profile.get(field), str):
                    raise ValueError('profile ' + field + ' must be a string')
            for field in ('createdAt', 'lastActiveAt'):
                if field in profile and not isinstance(profile[field], str):
                    raise ValueError('profile ' + field + ' must be a string')
            for slug, game in _map(profile.get('games'), 'profile.games').items():
                _map(game, 'hub game ' + slug)
                if 'stickers' in game and (not isinstance(game['stickers'], list)
                        or any(not isinstance(s, str) for s in game['stickers'])):
                    raise ValueError('hub stickers must be an array of strings')
                if 'levels' in game:
                    for level in _map(game['levels'], 'hub game levels').values():
                        _map(level, 'hub level')
    games = _map(envelope.get('games'), 'games')
    for slug, per_profile in games.items():
        for pid, payload in _map(per_profile, 'game ' + slug).items():
            if isinstance(payload, str):
                _parse_json(payload)
            else:
                bases = _map(payload, 'game payload for ' + pid)
                if not bases:
                    raise ValueError('game storage map must not be empty')
                for raw in bases.values():
                    if not isinstance(raw, str):
                        raise ValueError('game storage must contain raw JSON strings')
                    _parse_json(raw)
    return envelope


def _history_names():
    if not os.path.isdir(SAVES_DIR):
        return []
    files = [f for f in os.listdir(SAVES_DIR)
             if HISTORY_RE.fullmatch(f) and os.path.isfile(os.path.join(SAVES_DIR, f))]
    def sort_key(name):
        match = HISTORY_RE.fullmatch(name)
        # Browser folder saves use milliseconds; server saves use microseconds.
        return (match[1], (match[2] or '').ljust(6, '0'), match[3] or '')
    return sorted(files, key=sort_key)


def _history_count():
    with SAVE_LOCK:
        return len(_history_names())


def _prune_history():
    with SAVE_LOCK:
        files = _history_names()
        for old in files[:-HISTORY_KEEP] if len(files) > HISTORY_KEEP else []:
            try:
                os.remove(os.path.join(SAVES_DIR, old))
            except OSError:
                pass
        return _history_count()


def _sync_directory(path):
    # Windows does not expose directory fsync through Python. On supporting
    # systems, commit the directory entry as well as the already-fsynced file.
    if os.name == 'nt':
        return
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        try:
            os.fsync(fd)
        except OSError as exc:
            if exc.errno not in (errno.EINVAL, errno.ENOTSUP):
                raise
    finally:
        os.close(fd)


def _stage_file(directory, data):
    fd, name = tempfile.mkstemp(prefix='.kls-save-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        return name
    except BaseException:
        try:
            os.unlink(name)
        except OSError:
            pass
        raise


def _publish_history(staged, destination):
    """Publish a complete file without replacing an existing history entry."""
    if os.name == 'nt':
        # Windows rename fails if destination exists; it never overwrites it.
        os.rename(staged, destination)
    else:
        # POSIX rename would overwrite an existing entry; hard-link publication
        # is atomic and fails on a collision instead.
        os.link(staged, destination)
        os.unlink(staged)


def _save_envelope(envelope):
    _validate_envelope(envelope)
    # Escape Unicode, including any lone surrogate from older avatar truncation,
    # so valid browser exports always remain encodable and round-trip exactly.
    data = (json.dumps(envelope, ensure_ascii=True, indent=2, allow_nan=False)
            + '\n').encode('utf-8')
    with SAVE_LOCK:
        os.makedirs(SAVES_DIR, exist_ok=True)
        now = datetime.datetime.now(datetime.timezone.utc)
        # Local wall time preserves ordering with previous filename formats;
        # microseconds plus a UUID prevent same-second and cross-process reuse.
        stamp = now.astimezone().strftime('%Y%m%d-%H%M%S-%f')
        name = 'kls-save-%s-%s.json' % (stamp, uuid.uuid4().hex)
        history_temp = latest_temp = None
        try:
            history_temp = _stage_file(SAVES_DIR, data)
            _publish_history(history_temp, os.path.join(SAVES_DIR, name))
            history_temp = None
            _sync_directory(SAVES_DIR)
            # Commit history first. If latest replacement fails, the last
            # complete latest survives and the new history remains recoverable.
            latest_temp = _stage_file(ROOT, data)
            os.replace(latest_temp, os.path.join(ROOT, 'kls-backup-latest.json'))
            latest_temp = None
            _sync_directory(ROOT)
            count = _prune_history()
        finally:
            for path in (history_temp, latest_temp):
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass
        return {'ok': True, 'file': 'saved_status/' + name, 'count': count,
                'savedAt': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'digest': hashlib.sha256(data).hexdigest()}


def _read_backup(name):
    # Only fixed latest / recognized history IDs, never a client-provided path.
    if name == 'latest':
        path = os.path.join(ROOT, 'kls-backup-latest.json')
    elif HISTORY_RE.fullmatch(name):
        path = os.path.join(SAVES_DIR, name)
    else:
        raise ValueError('unrecognized backup')
    if os.path.islink(path):
        raise ValueError('backup must be a regular file')
    with open(path, 'rb') as fh:
        raw = fh.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        raise ValueError('backup exceeds 8 MB')
    return _validate_envelope(_parse_json(raw)), os.path.getmtime(path)


def _backup_catalog():
    points, warnings, seen = [], [], set()
    with SAVE_LOCK:
        names = list(reversed(_history_names()))
        if os.path.isfile(os.path.join(ROOT, 'kls-backup-latest.json')):
            # Prefer immutable history IDs over the mutable latest alias, so
            # an automatic write cannot change a selected restore point.
            names.append('latest')
        for name in names:
            try:
                env, modified = _read_backup(name)
                payload = json.dumps({'hub': env['hub'], 'games': env['games']},
                                     sort_keys=True, ensure_ascii=True)
                digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                profiles = []
                for profile in (env['hub'] or {}).get('profiles', {}).values():
                    stars = sum(level.get('stars', 0)
                                for game in profile['games'].values()
                                for level in game.get('levels', {}).values()
                                if type(level.get('stars', 0)) in (int, float))
                    stickers = sum(len(game.get('stickers', []))
                                   for game in profile['games'].values())
                    profiles.append({'name': profile['displayName'], 'avatar': profile['avatar'],
                                     'stars': stars, 'stickers': stickers})
                ts = datetime.datetime.fromtimestamp(modified, datetime.timezone.utc).isoformat()
                points.append({'id': name, 'ts': ts, 'summary': {'profiles': profiles}})
            except (ValueError, OSError, UnicodeError, RecursionError):
                warnings.append('A folder backup could not be read; other backups are still available.')
    return {'points': sorted(points, key=lambda point: point['ts'], reverse=True),
            'warnings': list(dict.fromkeys(warnings))}


def _app_id():
    return hashlib.sha256(os.path.normcase(os.path.realpath(ROOT)).encode('utf-8')).hexdigest()


def _last_saved_at():
    try:
        modified = os.path.getmtime(os.path.join(ROOT, 'kls-backup-latest.json'))
        return datetime.datetime.fromtimestamp(modified, datetime.timezone.utc).isoformat()
    except OSError:
        return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def _check_origin(self):
        hosts = self.headers.get_all('Host', [])
        if len(hosts) != 1:
            return False
        host = hosts[0].lower()
        port = self.server.server_address[1]
        allowed = {'localhost:%d' % port, '127.0.0.1:%d' % port}
        if port == 80:
            allowed.update(('localhost', '127.0.0.1'))
        if host not in allowed:
            return False
        origins = self.headers.get_all('Origin', [])
        if len(origins) > 1:
            return False
        origin = origins[0] if origins else None
        if origin is not None:
            try:
                parsed = urlsplit(origin)
                if (parsed.scheme != 'http' or parsed.netloc.lower() != host
                        or parsed.path or parsed.query or parsed.fragment):
                    return False
            except ValueError:
                return False
        # A missing Origin is allowed for local tools and same-origin GETs.
        # Browser cross-site requests are rejected even if Origin is omitted.
        return self.headers.get('Sec-Fetch-Site', '').lower() != 'cross-site'

    def do_GET(self):
        if not self._check_origin():
            self._send_json(403, {'ok': False, 'error': 'local same-origin requests only'})
            return
        if self.path.split('?', 1)[0] == PING_PATH:
            self._send_json(200, {'kls': True, 'appId': _app_id(), 'folder': os.path.basename(ROOT),
                                  'count': _history_count(), 'lastSavedAt': _last_saved_at()})
            return
        path = self.path.split('?', 1)[0]
        if path == BACKUPS_PATH:
            try:
                self._send_json(200, _backup_catalog())
            except OSError:
                self._send_json(500, {'error': 'Folder backups could not be checked. Please retry.'})
            return
        if path.startswith(BACKUPS_PATH + '/'):
            try:
                with SAVE_LOCK:
                    envelope, _ = _read_backup(path[len(BACKUPS_PATH) + 1:])
                self._send_json(200, envelope)
            except FileNotFoundError:
                self._send_json(404, {'error': 'This backup is no longer available. Choose another backup.'})
            except (ValueError, OSError, UnicodeError, RecursionError):
                self._send_json(400, {'error': 'This backup could not be read. Choose another backup.'})
            return
        super().do_GET()

    def do_POST(self):
        if not self._check_origin():
            self._send_json(403, {'ok': False, 'error': 'local same-origin requests only'})
            return
        if self.path.split('?', 1)[0] != SAVE_PATH:
            self._send_json(404, {'ok': False, 'error': 'not found'})
            return
        # JSON Blob sendBeacon supplies application/json too. Reject simple
        # cross-site form/text writes instead of relying on loopback binding.
        types = self.headers.get_all('Content-Type', [])
        content_type = types[0].split(';', 1)[0].strip().lower() if len(types) == 1 else ''
        if content_type != 'application/json':
            self._send_json(415, {'ok': False, 'error': 'application/json required'})
            return
        lengths = self.headers.get_all('Content-Length', [])
        try:
            length = int(lengths[0]) if len(lengths) == 1 else 0
        except (TypeError, ValueError):
            length = 0
        if self.headers.get('Transfer-Encoding') or length <= 0:
            self._send_json(400, {'ok': False, 'error': 'bad content length'})
            return
        if length > MAX_BODY:
            self._send_json(413, {'ok': False, 'error': 'backup exceeds 8 MB'})
            return
        try:
            self.connection.settimeout(10)
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError('incomplete request body')
            envelope = _validate_envelope(_parse_json(raw))
        except (ValueError, UnicodeError, RecursionError, OSError) as exc:
            self._send_json(400, {'ok': False, 'error': 'invalid backup: %s' % exc})
            return
        try:
            result = _save_envelope(envelope)
        except OSError as exc:
            self._send_json(500, {'ok': False, 'error': 'save failed: %s' % exc})
            return
        self._send_json(200, result)

    def log_message(self, *args):
        pass  # keep the launcher window quiet


def main():
    port = 8000
    args = [arg for arg in sys.argv[1:] if arg != '--open']
    if args:
        try:
            port = int(args[0])
        except ValueError:
            pass
    url = 'http://localhost:%d/index.html' % port
    try:
        httpd = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    except OSError:
        # Repeated launcher clicks reuse this folder's server, preserving the
        # same browser origin. Never open an unrelated service on that port.
        if '--open' in sys.argv:
            try:
                with urlopen('http://127.0.0.1:%d%s' % (port, PING_PATH), timeout=2) as response:
                    ping = json.load(response)
                if ping.get('appId') == _app_id():
                    webbrowser.open(url)
                    return
            except (OSError, ValueError):
                pass
        print('Could not start Kids Learning Space on port %d. Close the other app using this port and try again.' % port)
        return
    if '--open' in sys.argv:
        webbrowser.open(url)
    print('Kids Learning Space running at http://localhost:%d  (close this window / Ctrl-C to stop)' % port)
    print('Saves are written into: %s' % ROOT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
