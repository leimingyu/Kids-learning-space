#!/usr/bin/env python3
"""Local save tests. All files live in temporary directories; HTTP uses loopback.
Run: python3 tools/test_kls_server.py
"""
import hashlib
import http.client
import io
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kls_server', os.path.join(HERE, 'kls_server.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def envelope(mark=1):
    return {'type': 'kls.backup', 'version': 1, 'hubVersion': 2,
            'exportedAt': '2026-10-08T12:00:00.000Z',
            'exportedBy': 'Kids Learning Space',
            'hub': {'version': 2, 'activeProfileId': 'p_a', 'profiles': {
                'p_a': {'id': 'p_a', 'displayName': 'Ana', 'avatar': '\U0001f98a',
                        'games': {'word-problem-adventure': {
                            'stickers': ['first-quest'], 'levels': {'g2-1': {'stars': 3}}}}}}},
            'games': {'word-problem-adventure': {'p_a': {
                'wordProblemAdventure_v1': json.dumps({'quest': mark}),
                'wordProblemAdventure_wrongs_v1': '[]'}},
                'old-game': {'p_deleted': '{"legacy":true}'}}}


class IsolatedFiles(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='kls-server-test-')
        self.old_root, self.old_saves = mod.ROOT, mod.SAVES_DIR
        mod.ROOT = self.temp.name
        mod.SAVES_DIR = os.path.join(self.temp.name, 'saved_status')
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.restore_paths)

    def restore_paths(self):
        mod.ROOT, mod.SAVES_DIR = self.old_root, self.old_saves

    def read_latest(self):
        with open(os.path.join(mod.ROOT, 'kls-backup-latest.json'), 'rb') as fh:
            return fh.read()

    def assert_no_temps(self):
        for _, _, names in os.walk(mod.ROOT):
            self.assertFalse(any(n.endswith('.tmp') for n in names), names)


class ValidationTests(IsolatedFiles):
    def test_v1_single_multi_base_unknown_orphans_and_opaque_json(self):
        env = envelope()
        env['games']['unknown-game'] = {'p_deleted': 'null', 'p_other': '[1,2]'}
        self.assertIs(mod._validate_envelope(env), env)
        minimal = {'type': 'kls.backup', 'version': 1, 'hub': None, 'games': {}}
        self.assertIs(mod._validate_envelope(minimal), minimal)
        env['version'], env['hubVersion'], env['hub']['version'] = 1.0, 2.0, 2.0
        self.assertIs(mod._validate_envelope(env), env)

    def test_invalid_structure_changes_no_files(self):
        cases = []
        for field, bad in [('type', 'wrong'), ('version', True), ('version', 2),
                           ('hubVersion', 3), ('exportedAt', 1), ('hub', []), ('games', [])]:
            env = envelope(); env[field] = bad; cases.append(env)
        env = envelope(); del env['hub']; cases.append(env)
        env = envelope(); env['hub']['version'] = 1; cases.append(env)
        env = envelope(); env['hub']['profiles'] = []; cases.append(env)
        env = envelope(); env['hub']['activeProfileId'] = 'absent'; cases.append(env)
        env = envelope(); env['hub']['profiles']['p_a']['id'] = 'p_b'; cases.append(env)
        env = envelope(); env['hub']['profiles']['p_a']['displayName'] = None; cases.append(env)
        env = envelope(); env['hub']['profiles']['p_a']['games'] = []; cases.append(env)
        env = envelope(); env['games']['word-problem-adventure']['p_a'] = {}; cases.append(env)
        env = envelope(); env['games']['word-problem-adventure']['p_a'] = 'broken JSON'; cases.append(env)
        env = envelope(); env['games']['word-problem-adventure']['p_a'] = {'base': 5}; cases.append(env)
        env = envelope(); env['games']['constructor'] = {}; cases.append(env)
        env = envelope(); env['games']['word-problem-adventure']['__proto__'] = '{}'; cases.append(env)
        for env in cases:
            with self.subTest(env=env):
                with self.assertRaises(ValueError):
                    mod._save_envelope(env)
                self.assertEqual(os.listdir(mod.ROOT), [])

    def test_non_json_numbers_and_duplicate_keys_rejected(self):
        for raw in ('{"x":NaN}', '{"x":Infinity}', '{"x":1e999}', '{"x":1,"x":2}'):
            with self.assertRaises(ValueError):
                mod._parse_json(raw)
        env = envelope(); env['games']['old-game']['p_deleted'] = '{"x":NaN}'
        with self.assertRaises(ValueError):
            mod._validate_envelope(env)


class DurabilityTests(IsolatedFiles):
    def test_acknowledges_exact_latest_and_history_bytes(self):
        env = envelope()
        result = mod._save_envelope(env)
        self.assertTrue(result['ok'])
        self.assertEqual(result['count'], 1)
        latest = self.read_latest()
        self.assertEqual(json.loads(latest), env)
        self.assertEqual(result['digest'], hashlib.sha256(latest).hexdigest())
        self.assertTrue(result['savedAt'].endswith('Z'))
        self.assertNotIn('..', result['file'])
        with open(os.path.join(mod.ROOT, result['file']), 'rb') as fh:
            self.assertEqual(fh.read(), latest)
        self.assert_no_temps()

    def test_browser_unicode_and_lone_surrogates_round_trip(self):
        env = envelope()
        env['hub']['profiles']['p_a']['avatar'] = '\ud800'
        env['games']['old-game']['p_deleted'] = '"\udfff"'
        mod._save_envelope(env)
        self.assertEqual(json.loads(self.read_latest()), env)

    def test_client_filenames_cannot_select_a_write_path(self):
        env = envelope()
        env['filename'] = '../../outside.json'
        result = mod._save_envelope(env)
        self.assertTrue(result['file'].startswith('saved_status/kls-save-'))
        self.assertEqual(sorted(os.listdir(mod.ROOT)), ['kls-backup-latest.json', 'saved_status'])

    def test_same_instant_saves_are_unique_and_immutable(self):
        real_datetime = mod.datetime.datetime
        class Frozen(real_datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 10, 8, 12, 0, 0, 123456, tzinfo=tz)
        with mock.patch.object(mod.datetime, 'datetime', Frozen):
            results = [mod._save_envelope(envelope(i)) for i in range(5)]
        self.assertEqual(len({r['file'] for r in results}), 5)
        self.assertEqual(mod._history_count(), 5)
        for i, result in enumerate(results):
            with open(os.path.join(mod.ROOT, result['file']), encoding='utf-8') as fh:
                self.assertEqual(json.load(fh), envelope(i))

    def test_history_publication_never_replaces_existing_file(self):
        os.makedirs(mod.SAVES_DIR)
        destination = os.path.join(mod.SAVES_DIR, 'existing.json')
        with open(destination, 'wb') as fh: fh.write(b'previous')
        staged = mod._stage_file(mod.SAVES_DIR, b'new')
        with self.assertRaises(FileExistsError):
            mod._publish_history(staged, destination)
        with open(destination, 'rb') as fh: self.assertEqual(fh.read(), b'previous')
        os.unlink(staged)

    def test_partial_staged_write_cannot_truncate_previous_latest(self):
        mod._save_envelope(envelope(0))
        previous = self.read_latest()
        real_fdopen = mod.os.fdopen
        class InterruptedWriter:
            def __init__(self, fd, mode): self.fh = real_fdopen(fd, mode)
            def __enter__(self): return self
            def __exit__(self, *args): self.fh.close()
            def write(self, data):
                self.fh.write(data[:len(data) // 2])
                self.fh.flush()
                raise OSError('simulated interrupted write')
        with mock.patch.object(mod.os, 'fdopen', InterruptedWriter):
            with self.assertRaisesRegex(OSError, 'interrupted'):
                mod._save_envelope(envelope(1))
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 1)
        self.assert_no_temps()

    def test_fsync_failure_leaves_previous_latest_and_history(self):
        mod._save_envelope(envelope(0))
        previous = self.read_latest()
        with mock.patch.object(mod.os, 'fsync', side_effect=OSError('disk sync failed')):
            with self.assertRaises(OSError): mod._save_envelope(envelope(1))
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 1)
        self.assert_no_temps()

    def test_partial_latest_staging_preserves_old_latest_and_new_history(self):
        mod._save_envelope(envelope(0))
        previous = self.read_latest()
        real_fdopen = mod.os.fdopen
        opens = [0]
        class InterruptedWriter:
            def __init__(self, fh): self.fh = fh
            def __enter__(self): return self
            def __exit__(self, *args): self.fh.close()
            def write(self, data):
                self.fh.write(data[:len(data) // 2])
                self.fh.flush()
                raise OSError('interrupted latest staging')
        def staging_writer(fd, mode):
            opens[0] += 1
            fh = real_fdopen(fd, mode)
            return InterruptedWriter(fh) if opens[0] == 2 else fh
        with mock.patch.object(mod.os, 'fdopen', staging_writer):
            with self.assertRaisesRegex(OSError, 'latest staging'):
                mod._save_envelope(envelope(1))
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 2)
        with open(os.path.join(mod.SAVES_DIR, mod._history_names()[-1]), encoding='utf-8') as fh:
            self.assertEqual(json.load(fh), envelope(1))
        self.assert_no_temps()

    def test_history_failure_leaves_latest_unchanged(self):
        mod._save_envelope(envelope(0))
        previous = self.read_latest()
        with mock.patch.object(mod, '_publish_history', side_effect=OSError('history failed')):
            with self.assertRaises(OSError): mod._save_envelope(envelope(1))
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 1)
        self.assert_no_temps()

    def test_latest_failure_retains_old_latest_and_new_complete_history(self):
        mod._save_envelope(envelope(0))
        previous = self.read_latest()
        with mock.patch.object(mod.os, 'replace', side_effect=OSError('latest replace failed')):
            with self.assertRaises(OSError): mod._save_envelope(envelope(1))
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 2)
        with open(os.path.join(mod.SAVES_DIR, mod._history_names()[-1]), encoding='utf-8') as fh:
            self.assertEqual(json.load(fh), envelope(1))
        self.assert_no_temps()

    def test_serializes_concurrent_writers_and_preserves_all_histories(self):
        real_stage = mod._stage_file
        guard = threading.Lock()
        active, max_active = [0], [0]
        def tracked_stage(*args):
            with guard:
                active[0] += 1; max_active[0] = max(active[0], max_active[0])
            try: return real_stage(*args)
            finally:
                with guard: active[0] -= 1
        with mock.patch.object(mod, '_stage_file', tracked_stage):
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda i: mod._save_envelope(envelope(i)), range(20)))
        self.assertEqual(max_active[0], 1)
        self.assertEqual(len({r['file'] for r in results}), 20)
        self.assertEqual(mod._history_count(), 20)
        self.assertIn(json.loads(self.read_latest()), [envelope(i) for i in range(20)])
        for i, result in enumerate(results):
            with open(os.path.join(mod.ROOT, result['file']), encoding='utf-8') as fh:
                self.assertEqual(json.load(fh), envelope(i))
        self.assert_no_temps()

    def test_mixed_old_new_history_pruning_preserves_other_files(self):
        os.makedirs(mod.SAVES_DIR)
        old_names = ['kls-save-20200101-%06d.json' % i for i in range(32)]
        for name in old_names:
            with open(os.path.join(mod.SAVES_DIR, name), 'w') as fh: fh.write('{}')
        for name in ('notes.txt', 'kls-backup-latest.json', 'kls-save-invalid.json'):
            with open(os.path.join(mod.SAVES_DIR, name), 'w') as fh: fh.write('untouched')
        os.mkdir(os.path.join(mod.SAVES_DIR, 'kls-save-20200101-999999.json'))
        self.assertEqual(mod._history_count(), 32)
        self.assertEqual(mod._prune_history(), 30)
        self.assertFalse(os.path.exists(os.path.join(mod.SAVES_DIR, old_names[0])))
        self.assertFalse(os.path.exists(os.path.join(mod.SAVES_DIR, old_names[1])))
        result = mod._save_envelope(envelope())
        self.assertEqual(result['count'], 30)
        self.assertTrue(os.path.isfile(os.path.join(mod.ROOT, result['file'])))
        for name in ('notes.txt', 'kls-backup-latest.json', 'kls-save-invalid.json'):
            with open(os.path.join(mod.SAVES_DIR, name)) as fh: self.assertEqual(fh.read(), 'untouched')

    def test_old_same_second_name_sorts_before_new_suffix(self):
        os.makedirs(mod.SAVES_DIR)
        names = ['kls-save-20261008-120000.json',
                 'kls-save-20261008-120000-000001-' + 'a' * 32 + '.json']
        for name in names:
            with open(os.path.join(mod.SAVES_DIR, name), 'w') as fh: fh.write('{}')
        self.assertEqual(mod._history_names(), names)

    def test_browser_milliseconds_and_server_microseconds_sort_together(self):
        os.makedirs(mod.SAVES_DIR)
        names = ['kls-save-20261008-120000.json',
                 'kls-save-20261008-120000-099-zbrowser.json',
                 'kls-save-20261008-120000-100000-' + 'a' * 32 + '.json',
                 'kls-save-20261008-120000-101-abrowser.json']
        for name in reversed(names):
            with open(os.path.join(mod.SAVES_DIR, name), 'w') as fh: fh.write('{}')
        self.assertEqual(mod._history_names(), names)
        self.assertEqual(mod._history_count(), 4)


class HTTPTests(IsolatedFiles):
    def setUp(self):
        super().setUp()
        self.server = mod.ThreadingHTTPServer(('127.0.0.1', 0), mod.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]
        self.host = '127.0.0.1:%d' % self.port
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(5)

    def request(self, method='POST', body=None, headers=None, path=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        options = {'Host': self.host, 'Content-Type': 'application/json',
                   'Origin': 'http://' + self.host, 'Sec-Fetch-Site': 'same-origin'}
        options.update(headers or {})
        options = {k: v for k, v in options.items() if v is not None}
        if body is None and method == 'POST': body = json.dumps(envelope()).encode()
        try:
            conn.request(method, path or (mod.SAVE_PATH if method == 'POST' else mod.PING_PATH), body, options)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally: conn.close()

    def test_same_origin_json_beacon_and_charset_and_missing_origin(self):
        for options in ({}, {'Content-Type': 'application/json; charset=UTF-8'},
                        {'Origin': None, 'Sec-Fetch-Site': None}):
            status, result = self.request(headers=options)
            self.assertEqual(status, 200, result)
            self.assertTrue(result['ok'])
        status, ping = self.request('GET')
        self.assertEqual(status, 200)
        self.assertEqual(ping['count'], 3)
        self.assertTrue(ping['kls'])

    def test_cross_origin_null_origin_host_rebinding_and_wrong_port_rejected(self):
        for options in ({'Origin': 'https://unrelated.example'}, {'Origin': 'null'},
                        {'Origin': 'http://127.0.0.1:1'}, {'Host': 'unrelated.example'},
                        {'Host': 'localhost:1'}, {'Origin': None, 'Sec-Fetch-Site': 'cross-site'}):
            # Reject at headers before sending a body; this also avoids a
            # Windows TCP reset when a server closes an unread request early.
            status, _ = self.request(body=b'', headers=options)
            self.assertEqual(status, 403, options)
        self.assertEqual(os.listdir(mod.ROOT), [])
        status, _ = self.request('GET', headers={'Host': 'unrelated.example'})
        self.assertEqual(status, 403)

    def test_localhost_host_and_origin_accepted(self):
        host = 'localhost:%d' % self.port
        status, result = self.request(headers={'Host': host, 'Origin': 'http://' + host})
        self.assertEqual(status, 200, result)

    def test_catalog_and_restore_reads_are_read_only_and_deduplicate_latest(self):
        first = mod._save_envelope(envelope(1))
        second = mod._save_envelope(envelope(2))
        before = self.read_latest()
        status, catalog = self.request('GET', path=mod.BACKUPS_PATH)
        self.assertEqual(status, 200)
        self.assertEqual(len(catalog['points']), 2)
        self.assertNotIn('latest', [point['id'] for point in catalog['points']])
        self.assertEqual(catalog['warnings'], [])
        self.assertEqual(catalog['points'][0]['summary']['profiles'][0],
                         {'name': 'Ana', 'avatar': '\U0001f98a', 'stars': 3, 'stickers': 1})
        for name, expected in [('latest', envelope(2)),
                               (os.path.basename(first['file']), envelope(1)),
                               (os.path.basename(second['file']), envelope(2))]:
            status, restored = self.request('GET', path=mod.BACKUPS_PATH + '/' + name)
            self.assertEqual(status, 200)
            self.assertEqual(restored, expected)
        self.assertEqual(self.read_latest(), before)
        self.assertEqual(mod._history_count(), 2)
        status, ping = self.request('GET')
        self.assertEqual(ping['appId'], mod._app_id())
        self.assertTrue(ping['lastSavedAt'])

    def test_catalog_recovers_history_when_latest_is_corrupt_and_skips_bad_files(self):
        saved = mod._save_envelope(envelope())
        with open(os.path.join(mod.ROOT, 'kls-backup-latest.json'), 'w') as fh:
            fh.write('truncated')
        status, catalog = self.request('GET', path=mod.BACKUPS_PATH)
        self.assertEqual(status, 200)
        self.assertEqual([p['id'] for p in catalog['points']], [os.path.basename(saved['file'])])
        self.assertTrue(catalog['warnings'])
        self.assertEqual(self.request('GET', path=mod.BACKUPS_PATH + '/latest')[0], 400)

    def test_read_ids_reject_paths_and_cross_origin_requests(self):
        for name in ('../index.html', '%2e%2e%2findex.html', 'notes.json', 'latest/extra', 'C:%5csecret'):
            self.assertEqual(self.request('GET', path=mod.BACKUPS_PATH + '/' + name)[0], 400)
        self.assertEqual(self.request('GET', path=mod.BACKUPS_PATH + '/latest')[0], 404)
        for path in (mod.BACKUPS_PATH, mod.BACKUPS_PATH + '/latest'):
            self.assertEqual(self.request('GET', path=path, headers={'Origin': 'https://unrelated.example'})[0], 403)
        self.assertEqual(os.listdir(mod.ROOT), [])

    def test_legacy_history_filename_and_large_backup_handling(self):
        os.makedirs(mod.SAVES_DIR)
        name = 'kls-save-20260101-120000.json'
        with open(os.path.join(mod.SAVES_DIR, name), 'w') as fh:
            json.dump(envelope(), fh)
        self.assertEqual(self.request('GET', path=mod.BACKUPS_PATH + '/' + name), (200, envelope()))
        with mock.patch.object(mod, 'MAX_BODY', 10):
            self.assertEqual(self.request('GET', path=mod.BACKUPS_PATH + '/' + name)[0], 400)
            _, catalog = self.request('GET', path=mod.BACKUPS_PATH)
            self.assertFalse(catalog['points'])
            self.assertTrue(catalog['warnings'])

    def test_plain_text_form_and_missing_content_type_rejected(self):
        for content in ('text/plain', 'application/x-www-form-urlencoded', None):
            self.assertEqual(self.request(body=b'', headers={'Content-Type': content})[0], 415)
        self.assertEqual(os.listdir(mod.ROOT), [])

    def test_bad_envelopes_and_json_make_no_disk_changes(self):
        for raw in (b'{"type":"kls.backup"}', b'[]', b'{', b'{"type":"kls.backup","type":"wrong"}'):
            self.assertEqual(self.request(body=raw)[0], 400)
        self.assertEqual(os.listdir(mod.ROOT), [])

    def test_request_size_and_transfer_encoding_rejected(self):
        self.assertEqual(self.request(body=b'', headers={'Content-Length': '0'})[0], 400)
        self.assertEqual(self.request(body=b'', headers={'Content-Length': str(mod.MAX_BODY + 1)})[0], 413)
        self.assertEqual(self.request(body=b'', headers={'Transfer-Encoding': 'chunked'})[0], 400)
        self.assertEqual(os.listdir(mod.ROOT), [])

    def test_duplicate_headers_and_truncated_body_rejected(self):
        for duplicate in ('Host', 'Origin', 'Content-Type', 'Content-Length'):
            conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
            try:
                conn.putrequest('POST', mod.SAVE_PATH, skip_host=True)
                body = json.dumps(envelope()).encode()
                headers = {'Host': self.host, 'Origin': 'http://' + self.host,
                           'Content-Type': 'application/json', 'Content-Length': str(len(body))}
                for name, value in headers.items():
                    conn.putheader(name, value)
                    if name == duplicate: conn.putheader(name, value)
                conn.endheaders()
                response = conn.getresponse()
                expected = 403 if duplicate in ('Host', 'Origin') else 415 if duplicate == 'Content-Type' else 400
                self.assertEqual(response.status, expected, duplicate)
                response.read()
            finally: conn.close()
        # A short read is simulated at the handler boundary: Windows may reset
        # a deliberately half-closed test socket before its response is readable.
        handler = mod.Handler.__new__(mod.Handler)
        handler.headers = Message()
        for name, value in {'Host': self.host, 'Origin': 'http://' + self.host,
                            'Content-Type': 'application/json', 'Content-Length': '20'}.items():
            handler.headers[name] = value
        handler.server, handler.path = self.server, mod.SAVE_PATH
        handler.connection = mock.Mock()
        handler.rfile = io.BytesIO(b'{}')
        handler._send_json = mock.Mock()
        handler.do_POST()
        self.assertEqual(handler._send_json.call_args.args[0], 400)
        self.assertEqual(os.listdir(mod.ROOT), [])

    def test_http_disk_failure_keeps_previous_latest_and_recoverable_history(self):
        self.assertEqual(self.request()[0], 200)
        previous = self.read_latest()
        with mock.patch.object(mod.os, 'replace', side_effect=OSError('simulated latest failure')):
            status, result = self.request(body=json.dumps(envelope(2)).encode())
        self.assertEqual(status, 500)
        self.assertFalse(result['ok'])
        self.assertEqual(self.read_latest(), previous)
        self.assertEqual(mod._history_count(), 2)
        self.assert_no_temps()


class LauncherTests(IsolatedFiles):
    def test_browser_opens_after_bind_and_before_serving(self):
        order = []
        server = mock.Mock()
        def bind(*args): order.append('bound'); return server
        def serve(): order.append('serve'); raise KeyboardInterrupt()
        server.serve_forever.side_effect = serve
        with mock.patch.object(mod.sys, 'argv', ['kls_server.py', '8000', '--open']), \
                mock.patch.object(mod, 'ThreadingHTTPServer', side_effect=bind), \
                mock.patch.object(mod.webbrowser, 'open', side_effect=lambda url: order.append(url)), \
                mock.patch('sys.stdout', new_callable=io.StringIO):
            mod.main()
        self.assertEqual(order, ['bound', 'http://localhost:8000/index.html', 'serve'])
        server.server_close.assert_called_once()

    def test_reuses_only_this_folders_server(self):
        for same_app in (True, False):
            ping = {'kls': True, 'appId': mod._app_id() if same_app else 'another-app'}
            response = io.BytesIO(json.dumps(ping).encode())
            with mock.patch.object(mod.sys, 'argv', ['kls_server.py', '8000', '--open']), \
                    mock.patch.object(mod, 'ThreadingHTTPServer', side_effect=OSError('port busy')), \
                    mock.patch.object(mod, 'urlopen', return_value=response), \
                    mock.patch.object(mod.webbrowser, 'open') as opened, \
                    mock.patch('sys.stdout', new_callable=io.StringIO):
                mod.main()
                self.assertEqual(opened.call_count, int(same_app))


if __name__ == '__main__':
    unittest.main(verbosity=2)
