/*
 * Kids Learning Space — Backup & Restore.
 *
 * Implements the spec in BACKUP_RESTORE.md. Exports a single JSON envelope
 * with hub progress (kls.progress.v2) AND every game's profile-scoped state
 * (e.g. wordProblemAdventure_v1__<pid>). Restore is staged and recoverable.
 *
 * Public API: window.KLS.backup = {
 *   exportToFile(),
 *   importFromFile(file),
 *   getLastExportedAt(),
 *   BACKUP_VERSION
 * }
 */
(function () {
  const BACKUP_VERSION = 1;
  const HUB_KEY = 'kls.progress.v2';
  const HUB_LEGACY_KEY = 'kls.progress.v1';
  const LAST_EXPORT_KEY = 'kls.backup.lastExportedAt';
  const RESTORE_JOURNAL_KEY = 'kls.restore.journal.v1';
  const RESTORE_LEASE_MS = 5000;
  const OWNER_ID = 'restore-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const statusListeners = new Set();
  const health = { snapshotState: 'unknown', snapshotError: null, diskState: 'unknown', diskError: null, lastDiskAt: null };
  let restoreQueue = Promise.resolve();

  function notifyStatus() {
    statusListeners.forEach(function (fn) { try { fn(Object.assign({}, health)); } catch (e) { console.error(e); } });
  }
  function snapshotFailure(error) {
    const message = error && error.message ? error.message : String(error);
    const changed = health.snapshotState !== 'error' || health.snapshotError !== message;
    health.snapshotState = 'error'; health.snapshotError = message;
    if (changed) notifyStatus();
  }
  function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeMap(map, label) {
    if (!isRecord(map)) throw new Error(label + ' must be an object.');
    if (Object.keys(map).some(function (k) { return ['__proto__', 'constructor', 'prototype'].includes(k); })) {
      throw new Error(label + ' contains an invalid key.');
    }
  }
  function parseGameJSON(raw) {
    if (typeof raw !== 'string') throw new Error('A game save is missing its JSON text.');
    const value = JSON.parse(raw);
    function finite(v) {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('A game save contains an invalid number.');
      if (v && typeof v === 'object') Object.values(v).forEach(finite);
    }
    finite(value);
    return value;
  }

  function gamesRegistry() {
    return (window.KLS && window.KLS.GAMES) || [];
  }

  function gamesWithStorage() {
    return gamesRegistry().filter((g) => {
      if (Array.isArray(g.storageBase)) return g.storageBase.length > 0;
      return !!g.storageBase;
    });
  }

  /** Normalize a GAMES entry's storageBase into a non-empty array of bases. */
  function basesOf(g) {
    if (Array.isArray(g.storageBase)) return g.storageBase.slice();
    return g.storageBase ? [g.storageBase] : [];
  }

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function timestampForFilename() {
    const d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Persist FileSystemHandle objects in IndexedDB so the Save As dialog can
  // default to the user's project folder across sessions. FileSystemHandle
  // is structured-cloneable, so it survives a round-trip through IDB. We
  // use the directory handle as `startIn` (a hint only — no read/write),
  // which the spec does not gate on a permission grant.
  // ──────────────────────────────────────────────────────────────────────
  const IDB_NAME = 'kls-backup';
  const IDB_STORE = 'handles';
  const IDB_SNAP_STORE = 'snapshots';
  const IDB_VERSION = 2;
  const IDB_KEY_FILE = 'lastFileHandle';
  const IDB_KEY_DIR  = 'lastDirHandle';
  // localStorage flag so we don't pester the user with the "set up your
  // backup folder" prompt every time they hit Save.
  const DIR_SETUP_OFFERED_KEY = 'kls.backup.dirSetupOffered';

  function openHandleDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IDB')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        if (!db.objectStoreNames.contains(IDB_SNAP_STORE)) db.createObjectStore(IDB_SNAP_STORE, { keyPath: 'ts' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('Browser backup history is busy in another tab. Close the older game tab and retry.')); };
    });
  }

  async function idbGet(key) {
    try {
      const db = await openHandleDB();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { return null; }
  }

  async function idbPut(key, value) {
    try {
      const db = await openHandleDB();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { /* best-effort */ }
  }

  async function idbDelete(key) {
    try {
      const db = await openHandleDB();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { /* best-effort */ }
  }

  // ── Snapshot store ops (all best-effort; never throw to callers) ────────
  function snapshotsAvailable() { return typeof indexedDB !== 'undefined'; }

  async function putSnapshot(record) {
    const db = await openHandleDB();
    await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readwrite');
        const store = tx.objectStore(IDB_SNAP_STORE);
        if (typeof store.add === 'function') store.add(record);
        else store.put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Snapshot transaction was aborted.')); };
    });
  }

  /** List metadata only (ts, label, summary) — envelopes are heavy. */
  async function listSnapshots() {
    try {
      const db = await openHandleDB();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readonly');
        const req = tx.objectStore(IDB_SNAP_STORE).getAll();
        req.onsuccess = function () {
          const list = (req.result || []).map(function (r) {
            return { ts: r.ts, label: r.label || null, summary: r.summary || null };
          });
          list.sort(function (a, b) { return new Date(b.ts).getTime() - new Date(a.ts).getTime(); });
          resolve(list);
        };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { snapshotFailure(e); return []; }
  }

  async function getSnapshot(ts) {
    try {
      const db = await openHandleDB();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readonly');
        const req = tx.objectStore(IDB_SNAP_STORE).get(ts);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { return null; }
  }

  async function deleteSnapshots(tsArray) {
    if (!tsArray || !tsArray.length) return;
    try {
      const db = await openHandleDB();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readwrite');
        const store = tx.objectStore(IDB_SNAP_STORE);
        tsArray.forEach(function (ts) { store.delete(ts); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { /* best-effort */ }
  }

  const getLastFileHandle = () => idbGet(IDB_KEY_FILE);
  const saveLastFileHandle = (h) => idbPut(IDB_KEY_FILE, h);
  const getLastDirHandle  = () => idbGet(IDB_KEY_DIR);
  const saveLastDirHandle = (h) => idbPut(IDB_KEY_DIR, h);
  const clearLastDirHandle = () => idbDelete(IDB_KEY_DIR);

  /**
   * First-save UX: if we have no stored directory handle, offer to capture
   * one via showDirectoryPicker. Subsequent saves use the stored handle as
   * `startIn` so the picker opens in the project folder by default.
   *
   * Pestering protection: we record `DIR_SETUP_OFFERED_KEY` after the first
   * confirm so we only auto-prompt once. The "Choose backup folder" button
   * in the UI can re-trigger this flow on demand.
   */
  async function maybeOfferDirSetup() {
    if (typeof window.showDirectoryPicker !== 'function') return null;
    const existing = await getLastDirHandle();
    if (existing) return existing;

    let offered = false;
    try { offered = localStorage.getItem(DIR_SETUP_OFFERED_KEY) === '1'; } catch (e) { /* ignore */ }
    if (offered) return null;

    const proceed = window.confirm(
      'Set up your backup folder?\n\n' +
      'Pick the folder containing index.html. The Save dialog will then ' +
      'default to that folder every time you back up.\n\n' +
      "Click OK to pick now, or Cancel to choose manually each save " +
      "(you can set this up later via the 'Choose backup folder' button)."
    );
    try { localStorage.setItem(DIR_SETUP_OFFERED_KEY, '1'); } catch (e) { /* ignore */ }
    if (!proceed) return null;
    return pickBackupFolder();
  }

  /** Explicit "Choose backup folder" entry point used by UI buttons. */
  async function pickBackupFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('This browser does not support choosing a backup folder. Use Chrome or Edge over http://localhost.');
    }
    try {
      const dh = await window.showDirectoryPicker({ id: 'kls-backup-dir' });
      await saveLastDirHandle(dh);
      return dh;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  }

  /**
   * Save `text` to a file. Prefers window.showSaveFilePicker (Chrome/Edge
   * desktop over http/https — lets the user navigate to the project folder).
   * Falls back to an anchor-triggered download (Safari/Firefox/file://) which
   * lands in the browser's configured Downloads folder.
   *
   * The picker is biased toward the last-used directory via two hints:
   *   - `id: 'kls-backup'` — the browser maintains a per-id directory memory.
   *   - `startIn: <previous file handle>` — the picker opens in the directory
   *     containing that file. Survives across sessions via IndexedDB.
   *
   * Returns 'saved' | 'cancelled'. SecurityError (e.g. picker blocked on
   * file://) silently falls through to the download path.
   */
  async function saveText(filename, text) {
    if (typeof window.showSaveFilePicker === 'function') {
      // First-save: invite the user to pick their project folder so the
      // dialog defaults there. If they decline (or it's already set), we
      // fall back to whatever directory hint we have (last file handle).
      const dirHandle = await maybeOfferDirSetup();
      const fileHandle = !dirHandle ? await getLastFileHandle() : null;

      const opts = {
        suggestedName: filename,
        id: 'kls-backup',
        types: [{
          description: 'Kids Learning Space backup',
          accept: { 'application/json': ['.json'] },
        }],
      };
      if (dirHandle)  opts.startIn = dirHandle;
      else if (fileHandle) opts.startIn = fileHandle;

      try {
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        // Remember where the user saved so next time the dialog opens here.
        saveLastFileHandle(handle);
        return 'saved';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // If startIn was rejected (stale handle, permission denied, etc.),
        // clear it and retry once without it before falling through to the
        // download path.
        const startInFailed = e && (e.name === 'NotAllowedError' || e.name === 'TypeError' || e.name === 'NotFoundError');
        if (opts.startIn && startInFailed) {
          if (dirHandle) clearLastDirHandle();
          try {
            delete opts.startIn;
            const handle = await window.showSaveFilePicker(opts);
            const writable = await handle.createWritable();
            await writable.write(text);
            await writable.close();
            saveLastFileHandle(handle);
            return 'saved';
          } catch (e2) {
            if (e2 && e2.name === 'AbortError') return 'cancelled';
          }
        }
        // SecurityError / any other failure → fall through.
      }
    }
    downloadText(filename, text);
    return 'saved';
  }

  /** Find all localStorage keys matching `<base>__*` for a given base. */
  function discoverProfileKeys(base) {
    const out = {};
    const prefix = base + '__';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const pid = k.slice(prefix.length);
      const raw = localStorage.getItem(k);
      if (raw != null) out[pid] = raw;
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Export
  // ──────────────────────────────────────────────────────────────────────
  function buildEnvelope() {
    const rawHub = localStorage.getItem(HUB_KEY);
    const hub = rawHub == null ? null : JSON.parse(rawHub);
    const games = {};
    gamesWithStorage().forEach(function (g) {
      const bases = basesOf(g);
      if (bases.length === 1) {
        // Single-base: keep the legacy { [pid]: rawJsonString } shape so old
        // backup readers still understand new exports.
        const keys = discoverProfileKeys(bases[0]);
        if (Object.keys(keys).length > 0) games[g.slug] = keys;
        return;
      }
      // Multi-base: { [pid]: { [base]: rawJsonString } }. A pid only appears
      // if at least one base has data for it.
      const perPid = {};
      bases.forEach(function (base) {
        const keys = discoverProfileKeys(base);
        Object.keys(keys).forEach(function (pid) {
          if (!perPid[pid]) perPid[pid] = {};
          perPid[pid][base] = keys[pid];
        });
      });
      if (Object.keys(perPid).length > 0) games[g.slug] = perPid;
    });
    return {
      type: 'kls.backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: 'Kids Learning Space',
      hubVersion: (hub && hub.version) || 2,
      hub: hub || null,
      games: games,
    };
  }

  async function exportToFile() {
    const envelope = buildEnvelope();
    validate(envelope);
    if (!envelope.hub && Object.keys(envelope.games).length === 0) {
      const ok = window.confirm("There's nothing to back up yet. Save an empty backup anyway?");
      if (!ok) return false;
    }
    const filename = 'kls-backup-' + timestampForFilename() + '.json';
    const text = JSON.stringify(envelope, null, 2);
    const result = await saveText(filename, text);
    if (result !== 'saved') return false;
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
    return true;
  }

  /**
   * "Save my game" for the pure double-click (file://) case: download the full
   * backup as saved_status/kls-save-<stamp>.json. In Chrome/Edge this creates a
   * `saved_status` subfolder in Downloads; other browsers flatten the name.
   * Always uses the plain download path (no Save-As picker) so it works on
   * file:// and needs no folder grant. Returns true if a file was produced.
   */
  function saveToDownload() {
    const envelope = buildEnvelope();
    validate(envelope);
    if (envelopeIsEmpty(envelope)) {
      const ok = window.confirm("There's nothing to save yet. Save an empty file anyway?");
      if (!ok) return false;
    }
    const text = JSON.stringify(envelope, null, 2);
    downloadText(savedStatusDownloadName(new Date()), text);
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
    return true;
  }

  /** Ensure we hold readwrite permission on a persisted directory handle,
   *  re-requesting it (needs a user gesture — a Save click provides one). */
  async function ensureRWPermission(handle) {
    try {
      if (!handle) return false;
      if (await verifyRWPermission(handle)) return true;
      if (typeof handle.requestPermission === 'function') {
        return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
      }
      return false;
    } catch (e) { return false; }
  }

  /**
   * "Save my game" — write the profile + status into a `saved_status` folder
   * using the best mechanism the browser allows, falling back to a download so
   * a save is ALWAYS produced. Must be called from a user gesture (the Save
   * button) so the folder picker/permission prompt is allowed.
   *
   * Order: local save-server (launcher) → File System Access folder (picked
   * once, then remembered — works wherever the browser permits the picker,
   * including a double-clicked file:// page in browsers that allow it) →
   * download (always works). Returns { mode:'server'|'folder'|'download'|'cancelled', name? }.
   */
  function saveMyGame() { return enqueueDiskWrite(saveMyGameNow); }
  async function saveMyGameNow() {
    const envelope = buildEnvelope();
    validate(envelope);
    diskRevision(envelope);
    if (envelopeIsEmpty(envelope)) {
      const ok = window.confirm("There's nothing to save yet. Save anyway?");
      if (!ok) return { mode: 'cancelled' };
    }
    // 1. Local save server (if the launcher is running) — writes into the app
    //    folder automatically.
    try {
      if (await detectSaveServer()) {
        await postSaveToServer(envelope);
        noteMirrored(envelope);
        return { mode: 'server' };
      }
    } catch (e) { /* fall through */ }
    // 2. File System Access: write into a `saved_status` subfolder of a folder
    //    the user picks once (then remembered). No launcher, no server.
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        let dh = await getLastDirHandle();
        if (!(await ensureRWPermission(dh))) dh = null;
        if (!dh) dh = await connectBackupFolder(); // prompts the pick, persists the handle
        if (dh) {
          await writeHistoryToFolder(dh, envelope, new Date());
          noteMirrored(envelope);
          return { mode: 'folder', name: dh.name || 'your folder' };
        }
        // User cancelled the pick → fall through to a download so the save still happens.
      } catch (e) {
        // Picker unavailable/blocked in this context (some browsers block it on
        // file://) → fall through to the download so nothing is lost.
      }
    }
    // 3. Download fallback (always works, incl. plain file://).
    downloadText(savedStatusDownloadName(new Date()), JSON.stringify(envelope, null, 2));
    health.diskState = 'download-requested'; notifyStatus();
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
    return { mode: 'download' };
  }

  function getLastExportedAt() {
    try { return localStorage.getItem(LAST_EXPORT_KEY) || null; } catch (e) { return null; }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Import (REPLACE-only)
  // ──────────────────────────────────────────────────────────────────────

  function validate(envelope) {
    if (!isRecord(envelope)) {
      throw new Error("Couldn't read this file. Is it the JSON backup we exported?");
    }
    if (envelope.type !== 'kls.backup') {
      throw new Error("This file doesn't look like a Kids Learning Space backup.");
    }
    if (Number.isInteger(envelope.version) && envelope.version > BACKUP_VERSION) {
      throw new Error('This backup was made on a newer version. Please update the app first.');
    }
    if (envelope.version !== BACKUP_VERSION) throw new Error('This backup version is not supported.');
    if (envelope.hubVersion != null && envelope.hubVersion !== 2) throw new Error('This hub version is not supported. Update the app first.');
    for (const field of ['exportedAt', 'exportedBy']) {
      if (envelope[field] != null && typeof envelope[field] !== 'string') throw new Error('Backup ' + field + ' is malformed.');
    }
    if (envelope.hub != null) {
      const hub = envelope.hub;
      if (!isRecord(hub) || hub.version !== 2) throw new Error('Backup hub version is not supported. Update the app first.');
      safeMap(hub.profiles, 'Backup profiles');
      if (hub.activeProfileId != null && (typeof hub.activeProfileId !== 'string' || !Object.hasOwn(hub.profiles, hub.activeProfileId))) {
        throw new Error('Backup active profile does not exist.');
      }
      Object.entries(hub.profiles).forEach(function ([id, p]) {
        if (!isRecord(p) || p.id !== id || typeof p.displayName !== 'string' || typeof p.avatar !== 'string') {
          throw new Error('A backup profile is malformed.');
        }
        safeMap(p.games, 'Profile games');
        Object.values(p.games).forEach(function (g) {
          if (!isRecord(g)) throw new Error('A hub game record is malformed.');
          if (g.stickers != null && (!Array.isArray(g.stickers) || g.stickers.some(function (s) { return typeof s !== 'string'; }))) {
            throw new Error('A sticker list is malformed.');
          }
          if (g.levels != null) {
            safeMap(g.levels, 'Game levels');
            Object.values(g.levels).forEach(function (lv) {
              if (!isRecord(lv)) throw new Error('A game level is malformed.');
              if (lv.stars != null && (!Number.isInteger(lv.stars) || lv.stars < 0 || lv.stars > 3)) throw new Error('A star count is malformed.');
              for (const name of ['questionsAnswered', 'accuracy']) {
                if (lv[name] != null && (typeof lv[name] !== 'number' || !Number.isFinite(lv[name]) || lv[name] < 0)) throw new Error('Game statistics are malformed.');
              }
            });
          }
        });
      });
    }
    if (envelope.games != null) {
      safeMap(envelope.games, 'Backup games');
      Object.values(envelope.games).forEach(function (perProfile) {
        safeMap(perProfile, 'Game profiles');
        Object.values(perProfile).forEach(function (payload) {
          if (typeof payload === 'string') { parseGameJSON(payload); return; }
          safeMap(payload, 'Game storage');
          if (!Object.keys(payload).length) throw new Error('A game payload is empty.');
          Object.values(payload).forEach(parseGameJSON);
        });
      });
    }
    return true;
  }

  /** Collect every key this app owns so we can wipe them in one pass. */
  function collectAppKeys() {
    const keys = [];
    const prefixes = [];
    gamesWithStorage().forEach(function (g) {
      basesOf(g).forEach(function (b) { prefixes.push(b + '__'); });
    });
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === HUB_KEY || k === HUB_LEGACY_KEY) { keys.push(k); continue; }
      if (prefixes.some((p) => k.startsWith(p))) { keys.push(k); continue; }
    }
    return keys;
  }

  function valuesFromEnvelope(envelope) {
    const values = Object.create(null);
    if (envelope.hub) {
      values[HUB_KEY] = JSON.stringify(envelope.hub);
    }
    const gameBySlug = Object.create(null);
    gamesWithStorage().forEach(function (g) { gameBySlug[g.slug] = g; });
    Object.keys(envelope.games || {}).forEach(function (slug) {
      const g = gameBySlug[slug];
      if (!g) {
        // Slug not in this build — silently skip per spec.
        console.info('[KLS backup] skipping unknown game slug:', slug);
        return;
      }
      const bases = basesOf(g);
      const allowedBases = new Set(bases);
      const defaultBase = bases[0];
      const perProfile = envelope.games[slug] || {};
      Object.keys(perProfile).forEach(function (pid) {
        const payload = perProfile[pid];
        if (typeof payload === 'string') {
          // Legacy single-base shape — write under this game's first base.
          values[defaultBase + '__' + pid] = payload;
          return;
        }
        if (payload && typeof payload === 'object') {
          // Multi-base shape: { [base]: rawJsonString }.
          Object.keys(payload).forEach(function (base) {
            if (!allowedBases.has(base)) {
              console.info('[KLS backup] skipping unknown base for', slug, base);
              return;
            }
            const raw = payload[base];
            if (typeof raw !== 'string') {
              console.info('[KLS backup] skipping non-string payload', slug, base, pid);
              return;
            }
            values[base + '__' + pid] = raw;
          });
          return;
        }
        console.info('[KLS backup] skipping bad payload for', slug, pid);
      });
    });
    return values;
  }

  /**
   * Read a File, parse, validate. On any error, throws — caller has not yet
   * modified state. On success, returns the validated envelope.
   */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      if (file && file.size > 8 * 1024 * 1024) { reject(new Error('This backup is too large to import (maximum 8 MB).')); return; }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error("Couldn't read this file.")); };
      reader.onload = function () {
        try {
          const envelope = JSON.parse(reader.result);
          validate(envelope);
          resolve(envelope);
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsText(file);
    });
  }

  function isOwnedProgressKey(key) {
    return key === HUB_KEY || key === HUB_LEGACY_KEY || gamesWithStorage().some(function (g) {
      return basesOf(g).some(function (base) { return key.startsWith(base + '__'); });
    });
  }
  function captureOwnedValues() {
    const values = Object.create(null);
    collectAppKeys().forEach(function (key) { values[key] = localStorage.getItem(key); });
    return values;
  }
  function checkValueMap(values) {
    if (!isRecord(values) || Object.entries(values).some(function ([key, value]) {
      return !isOwnedProgressKey(key) || typeof value !== 'string';
    })) throw new Error('Restore recovery data is invalid. Keep the browser data and contact a grown-up.');
  }
  function readJournal() {
    const raw = localStorage.getItem(RESTORE_JOURNAL_KEY);
    if (!raw) return null;
    const journal = JSON.parse(raw);
    if (!isRecord(journal) || journal.version !== 1 || !['prepared', 'committed'].includes(journal.phase)
        || typeof journal.ownerId !== 'string' || !Number.isFinite(journal.createdAt)) {
      throw new Error('Restore recovery data could not be read. Do not clear browser data.');
    }
    checkValueMap(journal.before); checkValueMap(journal.after);
    return journal;
  }
  function assertRestoreOwner(allowCommitted) {
    const journal = readJournal();
    if (!journal || (!allowCommitted && journal.phase !== 'prepared') || journal.ownerId !== OWNER_ID) {
      throw new Error('Another tab changed the restore. Reload before trying again.');
    }
  }
  function applyValues(values, verifyOwner) {
    checkValueMap(values);
    collectAppKeys().forEach(function (key) {
      if (verifyOwner) assertRestoreOwner();
      if (!Object.hasOwn(values, key)) localStorage.removeItem(key);
    });
    Object.entries(values).forEach(function ([key, value]) {
      if (verifyOwner) assertRestoreOwner();
      localStorage.setItem(key, value);
    });
    const actual = captureOwnedValues();
    if (Object.keys(actual).length !== Object.keys(values).length
        || Object.entries(values).some(function ([key, value]) { return actual[key] !== value; })) {
      throw new Error('The browser did not retain all restored progress.');
    }
  }
  function refreshProgressCache() {
    if (window.KLS.progress && window.KLS.progress.invalidateCache) window.KLS.progress.invalidateCache();
  }
  function recoverInterruptedRestore() {
    const journal = readJournal();
    if (!journal || journal.phase === 'committed') return false;
    if (journal.ownerId !== OWNER_ID && Date.now() - journal.createdAt < RESTORE_LEASE_MS) {
      throw new Error('Another restore may still be finishing. Wait a few seconds, then choose Retry.');
    }
    // Claim the abandoned journal before touching values; other game writers
    // see the prepared flag and stop until recovery completes.
    journal.ownerId = OWNER_ID; journal.createdAt = Date.now();
    localStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
    applyValues(journal.before, true);
    localStorage.removeItem(RESTORE_JOURNAL_KEY);
    refreshProgressCache();
    return true;
  }
  function getLastRestoreInfo() {
    const journal = readJournal();
    return journal && journal.phase === 'committed'
      ? { undoAvailable: true, at: journal.committedAt, kind: journal.kind || 'restore' }
      : { undoAvailable: false };
  }
  function commitRestore(values, kind) {
    recoverInterruptedRestore();
    const journal = { version: 1, phase: 'prepared', ownerId: OWNER_ID, createdAt: Date.now(),
      kind: kind || 'restore', before: captureOwnedValues(), after: values };
    const staged = JSON.stringify(journal);
    // Mandatory safety copy: if quota/permissions prevent it, no progress
    // keys have changed. It also supplies Undo on browsers without IndexedDB.
    try { localStorage.setItem(RESTORE_JOURNAL_KEY, staged); }
    catch (e) { throw new Error('The browser could not keep the safety copy. Restore cancelled; progress is unchanged. ' + e.message); }
    if (localStorage.getItem(RESTORE_JOURNAL_KEY) !== staged) throw new Error('The browser could not retain the safety copy. Restore was cancelled.');
    try {
      applyValues(values, true);
      assertRestoreOwner();
      journal.phase = 'committed'; journal.committedAt = new Date().toISOString();
      const committed = JSON.stringify(journal);
      localStorage.setItem(RESTORE_JOURNAL_KEY, committed);
      if (localStorage.getItem(RESTORE_JOURNAL_KEY) !== committed) throw new Error('Restore could not be confirmed.');
    } catch (error) {
      try {
        assertRestoreOwner(true);
        journal.phase = 'prepared';
        localStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
        // Free replacement keys before putting the old values back. The
        // journal remains intact if permissions or quota also block recovery.
        collectAppKeys().forEach(function (key) { localStorage.removeItem(key); });
        applyValues(journal.before, true);
        localStorage.removeItem(RESTORE_JOURNAL_KEY);
        refreshProgressCache();
      } catch (recoveryError) {
        try {
          const retained = readJournal();
          if (retained && retained.phase === 'committed' && retained.ownerId === OWNER_ID) {
            const confirmedFailure = new Error('Restore confirmation stopped. The replacement was written completely and previous progress is retained. Reload, then use Undo last restore to return to it. ' + recoveryError.message);
            confirmedFailure.undoAvailable = true;
            throw confirmedFailure;
          }
        } catch (readError) { if (readError.undoAvailable) throw readError; }
        const failure = new Error('Restore stopped. Your previous progress is kept in the recovery copy. Reload to recover it. ' + recoveryError.message);
        failure.recoveryRequired = true;
        if (window.KLS.hub && window.KLS.hub.enterRecovery) window.KLS.hub.enterRecovery(failure);
        throw failure;
      }
      throw new Error('Restore was not completed. Your previous progress was restored. ' + error.message);
    }
    refreshProgressCache();
    notifyStatus();
    location.hash = ''; location.reload();
  }
  function queueRestore(action) {
    const run = function () {
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return navigator.locks.request('kls-restore', action);
      }
      return action();
    };
    const result = restoreQueue.then(run);
    restoreQueue = result.catch(function () {});
    return result;
  }
  async function stopGameForRestore() {
    const chrome = window.KLS.chrome;
    if (chrome && chrome.flushSession) {
      const result = await chrome.flushSession();
      if (result && !result.ok) throw new Error(result.error || 'The current game could not be saved. Restore cancelled.');
    }
    if (chrome && chrome.detachSession) chrome.detachSession();
  }
  async function restoreFromEnvelope(envelope) {
    validate(envelope);
    const values = valuesFromEnvelope(envelope);
    return queueRestore(async function () {
      await stopGameForRestore();
      // An extra timeline entry is useful, but the mandatory journal is the
      // safety guarantee. Snapshot failure can never remove that guarantee.
      let timer;
      await Promise.race([
        takeSnapshotNow({ label: 'Before restore', mirror: false }),
        new Promise(function (resolve) {
          timer = setTimeout(function () { snapshotFailure(new Error('Browser history did not respond; the restore safety copy uses the local journal.')); resolve(false); }, 2000);
        }),
      ]).finally(function () { clearTimeout(timer); });
      commitRestore(values, 'restore');
    });
  }
  async function undoLastRestore() {
    return queueRestore(async function () {
      const journal = readJournal();
      if (!journal || journal.phase !== 'committed') throw new Error('There is no completed restore to undo.');
      const values = journal.before;
      const kind = journal.kind === 'undo' ? 'restore' : 'undo';
      await stopGameForRestore();
      commitRestore(values, kind);
    });
  }
  function prepareEnvelope(envelope) {
    validate(envelope);
    const known = new Set(gamesWithStorage().map(function (g) { return g.slug; }));
    const warnings = Object.keys(envelope.games || {}).filter(function (slug) { return !known.has(slug); })
      .map(function (slug) { return 'This app does not include ' + slug + '; its saved data will be skipped.'; });
    return { envelope, summary: summarizeEnvelope(envelope), warnings };
  }
  function prepareImport(file) {
    return parseFile(file).then(prepareEnvelope);
  }

  /**
   * Two-step destructive restore from a file. Caller is responsible for the
   * preview and explicit replacement confirmation BEFORE invoking this.
   */
  function importFromFile(file) {
    return parseFile(file).then(function (envelope) {
      return restoreFromEnvelope(envelope);
    });
  }

  /**
   * Undoable timeline restore: first snapshot the CURRENT state as
   * "Before restore" (awaited so it survives the reload), then REPLACE with
   * the chosen snapshot's envelope.
   */
  async function restoreSnapshot(ts) {
    const record = await getSnapshot(ts);
    if (!record || !record.envelope) throw new Error("That moment couldn't be found.");
    validate(record.envelope); // defensive; snapshots are our own envelopes
    return restoreFromEnvelope(record.envelope);
  }

  async function getSnapshotsMeta() { return listSnapshots(); }
  async function getLastSnapshotAt() {
    const list = await listSnapshots();
    return list.length ? list[0].ts : null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Phase 2 — optional backup-folder mirror (Chrome/Edge only)
  // ──────────────────────────────────────────────────────────────────────
  const LAST_MIRROR_KEY = 'kls.backup.lastMirrorAt';
  const FOLDER_RECONNECT_KEY = 'kls.backup.folderNeedsReconnect';
  const MIRROR_THROTTLE_MS = 3 * 60 * 1000;  // ≤ 1 folder write / 3 min (autosave)
  const MIRROR_HISTORY_KEEP = 30;            // newest N history files kept in saves/
  const SAVES_SUBDIR = 'saved_status';

  /** 'YYYYMMDD-HHmmss' local timestamp for a save-history filename. */
  function stampForFilename(d) {
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function historyFilename(d) { return 'kls-save-' + stampForFilename(d) + '.json'; }
  function isHistoryFile(name) { return /^kls-save-\d{8}-\d{6}(?:-\d{3,6}-[a-zA-Z0-9-]+)?\.json$/.test(name); }
  /** Download name that lands in a `saved_status` folder (Chrome creates the
   *  subfolder under Downloads; other browsers flatten it to the basename). */
  function savedStatusDownloadName(d) { return SAVES_SUBDIR + '/' + historyFilename(d); }

  /** Of the kls-save-*.json names, return the oldest beyond `keep` to delete. */
  function selectHistoryToPrune(names, keep) {
    const pattern = /^kls-save-(\d{8}-\d{6})(?:-(\d{3,6})-([a-zA-Z0-9-]+))?\.json$/;
    const hist = names.filter(function (n) { return pattern.test(n); });
    function sortKey(n) {
      const match = n.match(pattern);
      return match[1] + '-' + (match[2] || '000000').padEnd(6, '0') + '-' + (match[3] || '');
    }
    hist.sort(function (a, b) { return sortKey(a).localeCompare(sortKey(b)); });
    const excess = hist.length - keep;
    return excess > 0 ? hist.slice(0, excess) : [];
  }

  async function verifyRWPermission(handle) {
    try {
      if (!handle || typeof handle.queryPermission !== 'function') return false;
      const q = await handle.queryPermission({ mode: 'readwrite' });
      return q === 'granted';
    } catch (e) { return false; }
  }

  /** Explicit connect: pick a folder with write access and remember it. */
  async function connectBackupFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('This browser can’t keep backup files in a folder. Use Chrome or Edge.');
    }
    try {
      const dh = await window.showDirectoryPicker({ id: 'kls-backup-dir', mode: 'readwrite' });
      // Ensure we actually hold write permission (some flows grant read only).
      if (typeof dh.requestPermission === 'function') {
        await dh.requestPermission({ mode: 'readwrite' });
      }
      await saveLastDirHandle(dh);
      try { localStorage.removeItem(FOLDER_RECONNECT_KEY); } catch (e) { /* ignore */ }
      return dh;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  }

  async function getFolderStatus() {
    const supported = typeof window.showDirectoryPicker === 'function';
    const dh = await getLastDirHandle();
    let needsReconnect = false;
    try { needsReconnect = localStorage.getItem(FOLDER_RECONNECT_KEY) === '1'; } catch (e) { /* ignore */ }
    let lastMirrorAt = null;
    try { lastMirrorAt = localStorage.getItem(LAST_MIRROR_KEY) || null; } catch (e) { /* ignore */ }
    let historyCount = 0;
    if (dh) {
      try {
        const saves = await dh.getDirectoryHandle(SAVES_SUBDIR, { create: false });
        for await (const entry of saves.entries()) {
          if (entry[1].kind === 'file' && /^kls-save-.*\.json$/.test(entry[0])) historyCount++;
        }
      } catch (e) { /* no saves dir yet, or permission not granted */ }
    }
    return {
      supported: supported,
      connected: !!dh,
      name: dh ? (dh.name || 'backup folder') : null,
      needsReconnect: needsReconnect,
      lastMirrorAt: lastMirrorAt,
      historyCount: historyCount,
    };
  }

  async function writeFileInDir(dh, name, text) {
    const fh = await dh.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(text); await w.close(); }
    catch (e) { if (w.abort) { try { await w.abort(); } catch (abortError) { /* keep original error */ } } throw e; }
  }

  async function pruneHistory(savesDir) {
    const names = [];
    try {
      for await (const entry of savesDir.entries()) {
        if (entry[1].kind === 'file') names.push(entry[0]);
      }
    } catch (e) { return; }
    const toDelete = selectHistoryToPrune(names, MIRROR_HISTORY_KEEP);
    for (let i = 0; i < toDelete.length; i++) {
      try { await savesDir.removeEntry(toDelete[i]); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Write the newest envelope into the connected folder: kls-backup-latest.json
   * at the root, plus a versioned saves/kls-save-<stamp>.json history file
   * (pruned to MIRROR_HISTORY_KEEP). Takes the dir handle + date as arguments so
   * it is testable against a mock filesystem. Returns the history filename.
   */
  let folderHistorySequence = 0;
  async function writeHistoryToFolder(dh, envelope, date) {
    const text = JSON.stringify(envelope, null, 2);
    const saves = await dh.getDirectoryHandle(SAVES_SUBDIR, { create: true });
    const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2);
    const suffix = String(date.getMilliseconds()).padStart(3, '0') + '-' + nonce + (++folderHistorySequence).toString(36);
    const name = 'kls-save-' + stampForFilename(date) + '-' + suffix + '.json';
    try {
      await writeFileInDir(saves, name, text);
      const handle = await saves.getFileHandle(name);
      if (handle.getFile && (await (await handle.getFile()).text()) !== text) throw new Error('The folder did not retain the complete backup.');
    } catch (e) {
      try { await saves.removeEntry(name); } catch (cleanupError) { /* no access; report the failed save */ }
      throw e;
    }
    await writeFileInDir(dh, 'kls-backup-latest.json', text);
    await pruneHistory(saves);
    return name;
  }

  function noteMirrored(envelope) {
    try {
      localStorage.setItem(LAST_MIRROR_KEY, new Date().toISOString());
      localStorage.removeItem(FOLDER_RECONNECT_KEY);
    } catch (e) { /* ignore */ }
    if (envelope) {
      lastDiskRevision = Math.max(lastDiskRevision, diskRevision(envelope));
      if (pendingMirror && diskRevision(pendingMirror) <= lastDiskRevision) {
        pendingMirror = null;
        if (mirrorTimer) { clearTimeout(mirrorTimer); mirrorTimer = null; }
      }
    }
    health.diskState = 'saved'; health.diskError = null; health.lastDiskAt = new Date().toISOString();
    notifyStatus();
  }
  function noteReconnectNeeded() {
    try { localStorage.setItem(FOLDER_RECONNECT_KEY, '1'); } catch (e) { /* ignore */ }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Local save-server bridge (tools/kls_server.py).
  //
  // When the app is served by the bundled launcher, a tiny local server writes
  // the save history straight into the app folder — no folder-picker, any
  // browser. The client just POSTs the envelope. Detection is cached.
  // ──────────────────────────────────────────────────────────────────────
  const SAVE_PING = '/__kls_ping__';
  const SAVE_POST = '/__kls_save__';
  const SAVE_BACKUPS = '/__kls_backups__';
  let _saveServer; // undefined = unprobed, true/false = cached
  let _saveServerCheckedAt = 0;

  function httpContext() {
    try { return typeof fetch === 'function' && /^https?:$/.test(location.protocol); }
    catch (e) { return false; }
  }

  async function pingSaveServer() {
    if (!httpContext()) return null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 2000) : null;
    try {
      const res = await fetch(SAVE_PING, { cache: 'no-store', signal: controller ? controller.signal : undefined });
      if (!res.ok) return null;
      const j = await res.json();
      return (j && j.kls) ? j : null;
    } catch (e) { return null; }
    finally { if (timer) clearTimeout(timer); }
  }

  async function detectSaveServer() {
    const ttl = _saveServer ? 10000 : 2000;
    if (_saveServer !== undefined && Date.now() - _saveServerCheckedAt < ttl) return _saveServer;
    _saveServer = !!(await pingSaveServer());
    _saveServerCheckedAt = Date.now();
    return _saveServer;
  }

  async function postSaveToServer(envelope) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
    try {
    const res = await fetch(SAVE_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error('save server HTTP ' + res.status);
    const j = await res.json();
    if (!j || !j.ok) throw new Error((j && j.error) || 'save server error');
    return j; // { ok, file, count }
    } finally { if (timer) clearTimeout(timer); }
  }

  async function fetchBackupJSON(path) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
    try {
      const res = await fetch(path, { cache: 'no-store', signal: controller ? controller.signal : undefined });
      if (!res.ok) throw new Error('Folder backups could not be read. Retry, or restart “Play Kids Learning Space”.');
      return await res.json();
    } finally { if (timer) clearTimeout(timer); }
  }

  /** Read-only catalog shared by Parent restore and the first-visit recovery gate. */
  async function getRestorePoints() {
    const points = [], warnings = [];
    if (await detectSaveServer()) {
      try {
        const catalog = await fetchBackupJSON(SAVE_BACKUPS);
        if (!catalog || !Array.isArray(catalog.points)) throw new Error('Restart “Play Kids Learning Space” to read folder backups.');
        catalog.points.forEach(function (p) {
          if (p && typeof p.id === 'string' && Number.isFinite(Date.parse(p.ts))) {
            points.push({ id: p.id, ts: p.ts, summary: p.summary, source: 'server' });
          }
        });
        (catalog.warnings || []).forEach(function (w) { if (typeof w === 'string') warnings.push(w); });
      } catch (e) { warnings.push(e.message); }
    } else {
      // A previously connected folder stays usable; listing never prompts.
      const dh = await getLastDirHandle();
      if (dh && !(await verifyRWPermission(dh))) {
        warnings.push('The connected backup folder needs permission. Choose a backup file, or reconnect it in Backup settings.');
      } else if (dh) {
        try {
          const dir = await dh.getDirectoryHandle(SAVES_SUBDIR);
          for await (const [name, handle] of dir.entries()) {
            if (!isHistoryFile(name) || handle.kind !== 'file') continue;
            try {
              const file = await handle.getFile();
              if (file.size > 8 * 1024 * 1024) throw new Error('Backup too large.');
              const prepared = prepareEnvelope(JSON.parse(await file.text()));
              points.push({ id: name, ts: new Date(file.lastModified).toISOString(), summary: prepared.summary, source: 'folder' });
            } catch (e) { warnings.push('A folder backup could not be read; choose another backup.'); }
          }
        } catch (e) {
          if (e.name !== 'NotFoundError') warnings.push('The backup folder could not be read. Reconnect it in Backup settings.');
        }
      }
    }
    const browser = snapshotsAvailable() ? await listSnapshots() : [];
    browser.forEach(function (p) { points.push({ id: p.ts, ts: p.ts, summary: p.summary, label: p.label, source: 'browser' }); });
    points.sort(function (a, b) { return Date.parse(b.ts) - Date.parse(a.ts); });
    return { points: points, warnings: Array.from(new Set(warnings)) };
  }

  async function prepareRestorePoint(point) {
    if (point.source === 'server') return prepareEnvelope(await fetchBackupJSON(SAVE_BACKUPS + '/' + encodeURIComponent(point.id)));
    if (point.source === 'folder') {
      if (!isHistoryFile(point.id)) throw new Error('This backup could not be found.');
      const dh = await getLastDirHandle();
      if (!dh || !(await verifyRWPermission(dh))) throw new Error('Reconnect the backup folder in Backup settings.');
      const dir = await dh.getDirectoryHandle(SAVES_SUBDIR);
      return prepareImport(await (await dir.getFileHandle(point.id)).getFile());
    }
    if (point.source !== 'browser') throw new Error('Unknown backup location.');
    const record = await getSnapshot(point.id);
    if (!record) throw new Error('This backup is no longer available. Choose another backup.');
    return prepareEnvelope(record.envelope);
  }

  async function checkStartupRecovery() {
    // Check raw storage before progress.read() can migrate or create a profile.
    const existing = readJSON(HUB_KEY), legacy = readJSON(HUB_LEGACY_KEY);
    if ((legacy && legacy.version === 1) || [existing].some(function (hub) {
      return hub && hub.profiles && Object.keys(hub.profiles).length > 0;
    })) return null;
    const result = await getRestorePoints();
    return result.points.length || result.warnings.length ? result : null;
  }

  /**
   * Write the newest envelope to disk after an autosave snapshot. Throttled to
   * ≤ 1 write / 3 min unless `force` (pagehide). Prefers the local save server
   * (writes into the app folder automatically); falls back to the File System
   * Access folder mirror when a folder was picked. Silent on any failure.
   */
  let mirrorQueue = Promise.resolve();
  let pendingMirror = null;
  let mirrorTimer = null;
  const diskRevisions = new WeakMap();
  let nextDiskRevision = 0;
  let lastDiskRevision = 0;
  function diskRevision(envelope) {
    if (!diskRevisions.has(envelope)) diskRevisions.set(envelope, ++nextDiskRevision);
    return diskRevisions.get(envelope);
  }
  function enqueueDiskWrite(action) {
    const next = mirrorQueue.then(action);
    mirrorQueue = next.catch(function () {});
    return next;
  }
  function mirrorAfterSnapshot(envelope, force) {
    diskRevision(envelope);
    pendingMirror = envelope;
    return enqueueDiskWrite(function () { return mirrorEnvelope(envelope, force); });
  }
  async function mirrorEnvelope(envelope, force) {
    if (envelopeIsEmpty(envelope)) return;
    try { validate(envelope); }
    catch (e) { health.diskState = 'error'; health.diskError = 'Progress could not be backed up: ' + e.message; notifyStatus(); return; }
    if (diskRevision(envelope) < lastDiskRevision) return;
    if (!force) {
      try {
        const last = localStorage.getItem(LAST_MIRROR_KEY);
        const remaining = last ? MIRROR_THROTTLE_MS - (Date.now() - new Date(last).getTime()) : 0;
        if (remaining > 0) {
          health.diskState = 'pending';
          if (mirrorTimer) clearTimeout(mirrorTimer);
          mirrorTimer = setTimeout(function () {
            mirrorTimer = null;
            if (pendingMirror) mirrorAfterSnapshot(pendingMirror, true);
          }, Math.min(remaining, MIRROR_THROTTLE_MS));
          notifyStatus(); return;
        }
      } catch (e) { /* ignore */ }
    }
    // Preferred: the local save server writes into the app folder for us.
    if (await detectSaveServer()) {
      try { await postSaveToServer(envelope); noteMirrored(envelope); return; }
      catch (e) { _saveServer = false; _saveServerCheckedAt = Date.now(); health.diskError = e.message; }
    }
    // Fallback: File System Access folder mirror (Chrome/Edge, user-picked).
    const dh = await getLastDirHandle();
    if (!dh) { if (health.diskError) health.diskState = 'error'; else health.diskState = 'unconnected'; notifyStatus(); return; }
    const ok = await verifyRWPermission(dh);
    if (!ok) { noteReconnectNeeded(); health.diskState = 'error'; health.diskError = 'Reconnect the backup folder to continue backing up.'; notifyStatus(); return; }
    try { await writeHistoryToFolder(dh, envelope, new Date()); noteMirrored(envelope); }
    catch (e) { noteReconnectNeeded(); health.diskState = 'error'; health.diskError = e.message; notifyStatus(); }
  }

  /**
   * Manual "Save to folder now": force an immediate write, bypassing the
   * autosave throttle. Uses the save server if present, else the picked folder.
   * Throws a friendly error the UI can surface.
   */
  function saveHistoryNow() { return enqueueDiskWrite(saveHistoryNowImmediate); }
  async function saveHistoryNowImmediate() {
    const envelope = buildEnvelope();
    validate(envelope); diskRevision(envelope);
    if (envelopeIsEmpty(envelope)) throw new Error('There’s nothing to save yet.');
    if (await detectSaveServer()) {
      try {
        const j = await postSaveToServer(envelope);
        noteMirrored(envelope); return j;
      } catch (e) { _saveServer = false; _saveServerCheckedAt = Date.now(); health.diskError = e.message; }
    }
    const dh = await getLastDirHandle();
    if (!dh) throw new Error('No save folder yet. Launch the app with the launcher (local server), or click “Choose folder…” in Chrome/Edge.');
    const ok = await verifyRWPermission(dh);
    if (!ok) { noteReconnectNeeded(); throw new Error('The folder lost write permission. Click “Reconnect folder…”.'); }
    await writeHistoryToFolder(dh, envelope, new Date());
    noteMirrored(envelope);
    return { ok: true };
  }

  /**
   * Unified "where do saves go?" status for the Parent page.
   *  { mode:'server', folder, count }      — local save server (automatic)
   *  { mode:'folder', ...folderStatus }    — File System Access picked folder
   *  { mode:'none' }                       — file:// / Safari / Firefox, no server
   */
  async function getSaveTargetStatus() {
    // Use the cached probe (one ping per session); only re-ping for a fresh
    // count when the server is actually present, so the no-server path never
    // spams the console with 404 probes.
    if (await detectSaveServer()) {
      const ping = await pingSaveServer();
      if (ping) return { mode: 'server', folder: ping.folder || null, count: ping.count || 0, lastSavedAt: ping.lastSavedAt || null };
    }
    const folder = await getFolderStatus();
    if (folder.supported) { const out = { mode: 'folder' }; for (const k in folder) out[k] = folder[k]; return out; }
    return { mode: 'none' };
  }

  /** Has the user set up (or been offered) a backup folder yet? */
  async function hasBackupFolder() {
    return !!(await getLastDirHandle());
  }

  /** True iff this browser can support the "default to project folder" flow. */
  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === 'function';
  }

  // ──────────────────────────────────────────────────────────────────────
  // Auto-snapshot scheduler
  // ──────────────────────────────────────────────────────────────────────
  const SNAPSHOT_DEBOUNCE_MS = 10000;
  let snapTimer = null;
  let snapWiredUp = false;
  let snapshotQueue = Promise.resolve();
  let lastSnapshotMs = 0;

  function envelopeIsEmpty(env) {
    return !env.hub && Object.keys(env.games || {}).length === 0;
  }

  function scheduleSnapshot() {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(function () {
      snapTimer = null; takeSnapshotNow({ mirror: false });
      try { mirrorAfterSnapshot(buildEnvelope(), false); }
      catch (e) { health.diskState = 'error'; health.diskError = e.message; notifyStatus(); }
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  function takeSnapshotNow(opts) {
    const next = snapshotQueue.then(function () { return createSnapshot(opts || {}); });
    snapshotQueue = next.catch(function () {});
    return next;
  }
  async function createSnapshot(opts) {
    if (!snapshotsAvailable()) { health.snapshotState = 'unavailable'; return false; }
    try {
    if (readJournal() && readJournal().phase === 'prepared') return false;
    const label = (opts && opts.label) || null;
    const envelope = buildEnvelope();
    validate(envelope);
    if (envelopeIsEmpty(envelope) && !label) return false; // nothing to back up
    // Dedupe against the newest existing snapshot (unless this is a labelled
    // safety snapshot, which we always want to keep).
    if (!label) {
      const newest = (await listSnapshots())[0];
      if (newest) {
        const full = await getSnapshot(newest.ts);
        if (full && envelopePayloadEqual(full.envelope, envelope)) return false;
      }
    }
    const newestAt = (await listSnapshots())[0];
    lastSnapshotMs = Math.max(Date.now(), lastSnapshotMs + 1, newestAt ? new Date(newestAt.ts).getTime() + 1 : 0);
    const record = {
      ts: new Date(lastSnapshotMs).toISOString(),
      label: label,
      envelope: envelope,
      summary: summarizeEnvelope(envelope),
    };
    await putSnapshot(record);
    health.snapshotState = 'ready'; health.snapshotError = null;
    // Retention thinning.
    const all = await listSnapshots();
    const toDelete = thinSnapshots(all, Date.now());
    if (toDelete.length) await deleteSnapshots(toDelete);
    // Phase 2 mirror (defined in the folder-mirror section; guarded no-op
    // until then). Function declarations hoist, so this is safe to reference.
    if (opts.mirror !== false && typeof mirrorAfterSnapshot === 'function') { mirrorAfterSnapshot(envelope, false); }
    notifyStatus();
    return true;
    } catch (e) { snapshotFailure(e); return false; }
  }
  async function getBackupHealth() {
    if (!snapshotsAvailable()) health.snapshotState = 'unavailable';
    else if (health.snapshotState === 'unknown') {
      try { await openHandleDB(); health.snapshotState = 'ready'; health.snapshotError = null; }
      catch (e) { snapshotFailure(e); }
    }
    const moments = snapshotsAvailable() ? await listSnapshots() : [];
    if (!health.lastDiskAt) { try { health.lastDiskAt = localStorage.getItem(LAST_MIRROR_KEY); } catch (e) { /* no status storage */ } }
    return Object.assign({}, health, { lastSnapshotAt: moments.length ? moments[0].ts : null,
      momentCount: moments.length, restore: getLastRestoreInfo() });
  }

  /** Is `key` owned by this app (hub key or a registered game base)? */
  function isAppKey(key) {
    if (key.startsWith('kls.')) return true;
    return gamesWithStorage().some(function (g) {
      return basesOf(g).some(function (b) { return key.startsWith(b + '__'); });
    });
  }

  function initSnapshots() {
    if (snapWiredUp) return;
    snapWiredUp = true;
    if (!snapshotsAvailable()) health.snapshotState = 'unavailable';
    // Trigger 1: hub progress writes.
    try {
      if (window.KLS && window.KLS.progress && window.KLS.progress.subscribe) {
        window.KLS.progress.subscribe(function () { scheduleSnapshot(); });
      }
    } catch (e) { /* ignore */ }
    // Trigger 2: same-origin game iframes writing their profile-scoped keys
    // (storage events fire on the parent window for iframe writes).
    try {
      window.addEventListener('storage', function (ev) {
        if (ev.key === null || (typeof ev.key === 'string' && isAppKey(ev.key))) scheduleSnapshot();
      });
    } catch (e) { /* ignore */ }
    // Trigger 3: final catch-all when the tab is going away.
    function flushOnExit() {
      if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
      takeSnapshotNow({ mirror: false });
      const env = buildEnvelope();
      // A fetch may not finish during unload; sendBeacon to the save server is
      // the reliable exit write. Falls back to the normal mirror path.
      if (_saveServer === true && !envelopeIsEmpty(env)
          && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try { if (navigator.sendBeacon(SAVE_POST, new Blob([JSON.stringify(env)], { type: 'application/json' }))) return; }
        catch (e) { /* fall through */ }
      }
      mirrorAfterSnapshot(env, true);
    }
    try { window.addEventListener('pagehide', flushOnExit); } catch (e) { /* ignore */ }
    try {
      window.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushOnExit();
      });
    } catch (e) { /* ignore */ }
    // Catch-up: ensure a snapshot exists for progress earned before wiring.
    scheduleSnapshot();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Snapshot pure helpers (unit-tested in tests/smoke-backup-snapshots.mjs)
  // ──────────────────────────────────────────────────────────────────────

  /** Per-profile ⭐/🏆 rollup straight from an envelope's hub blob. The hub
   *  blob stores `profiles` as an object map keyed by id (kls.progress.v2);
   *  we also tolerate an array in case an older/hand-made envelope uses one. */
  function summarizeEnvelope(envelope) {
    const hub = envelope && envelope.hub;
    const raw = hub && hub.profiles;
    const profiles = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.keys(raw).map(function (k) { return raw[k]; }) : []);
    let totalStars = 0, totalStickers = 0;
    const out = profiles.map(function (p) {
      let stars = 0, stickers = 0;
      const games = (p && p.games) || {};
      Object.keys(games).forEach(function (slug) {
        const g = games[slug] || {};
        stickers += ((g.stickers || []).length);
        const levels = g.levels || {};
        Object.keys(levels).forEach(function (lv) { stars += (levels[lv].stars || 0); });
      });
      totalStars += stars; totalStickers += stickers;
      return { id: p.id, name: p.displayName || 'Friend', avatar: p.avatar || '🦊', stars: stars, stickers: stickers };
    });
    return { profiles: out, totalStars: totalStars, totalStickers: totalStickers };
  }

  /** Payload equality for dedupe — ignores volatile envelope metadata. */
  function envelopePayloadEqual(a, b) {
    if (!a || !b) return a === b;
    try {
      return JSON.stringify({ hub: a.hub, games: a.games }) === JSON.stringify({ hub: b.hub, games: b.games });
    } catch (e) { return false; }
  }

  function startOfLocalDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function localDayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function localMonthKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1); }

  /**
   * Time-Machine thinning. Input: records [{ts:ISO,...}] (any order).
   * Output: array of ts strings to DELETE. Keeps: all < 24h; last-of-day for
   * 24h–30d; last-of-month beyond; hard cap 60 (oldest surplus removed).
   * The single newest record is never deleted.
   */
  function thinSnapshots(records, now) {
    const HOUR = 3600 * 1000, DAY = 24 * HOUR;
    const sorted = records.slice().sort(function (a, b) {
      return new Date(a.ts).getTime() - new Date(b.ts).getTime();
    }); // ascending (oldest first)
    if (sorted.length === 0) return [];
    const newestTs = sorted[sorted.length - 1].ts;
    const keep = new Set();
    const lastByDay = {}, lastByMonth = {};
    sorted.forEach(function (r) {
      const t = new Date(r.ts).getTime();
      const age = now - t;
      if (age < DAY) { keep.add(r.ts); return; }
      if (age < 30 * DAY) { lastByDay[localDayKey(t)] = r.ts; return; }
      lastByMonth[localMonthKey(t)] = r.ts;
    });
    Object.keys(lastByDay).forEach(function (k) { keep.add(lastByDay[k]); });
    Object.keys(lastByMonth).forEach(function (k) { keep.add(lastByMonth[k]); });
    keep.add(newestTs);
    // Hard cap 60: keep the 60 newest of the survivors.
    const survivors = sorted.filter(function (r) { return keep.has(r.ts); });
    if (survivors.length > 60) {
      const capped = survivors.slice(survivors.length - 60); // newest 60
      const cappedSet = new Set(capped.map(function (r) { return r.ts; }));
      survivors.forEach(function (r) { if (!cappedSet.has(r.ts)) keep.delete(r.ts); });
    }
    return sorted.filter(function (r) { return !keep.has(r.ts); }).map(function (r) { return r.ts; });
  }

  /** Bucket records into Today / Yesterday / This week / Older (newest-first). */
  function groupSnapshotsByPeriod(records, now) {
    const DAY = 24 * 3600 * 1000;
    const todayStart = startOfLocalDay(now);
    const yesterdayStart = todayStart - DAY;
    const weekStart = todayStart - 6 * DAY; // last 7 calendar days incl today
    const out = { today: [], yesterday: [], thisWeek: [], older: [] };
    records.slice().sort(function (a, b) {
      return new Date(b.ts).getTime() - new Date(a.ts).getTime(); // newest-first
    }).forEach(function (r) {
      const t = new Date(r.ts).getTime();
      if (t >= todayStart) out.today.push(r);
      else if (t >= yesterdayStart) out.yesterday.push(r);
      else if (t >= weekStart) out.thisWeek.push(r);
      else out.older.push(r);
    });
    return out;
  }

  window.KLS = window.KLS || {};
  window.KLS.backup = {
    exportToFile: exportToFile,
    saveToDownload: saveToDownload,
    saveMyGame: saveMyGame,
    importFromFile: importFromFile,
    getLastExportedAt: getLastExportedAt,
    pickBackupFolder: pickBackupFolder,
    hasBackupFolder: hasBackupFolder,
    supportsDirectoryPicker: supportsDirectoryPicker,
    BACKUP_VERSION: BACKUP_VERSION,
    prepareImport: prepareImport,
    restoreFromEnvelope: restoreFromEnvelope,
    recoverInterruptedRestore: recoverInterruptedRestore,
    undoLastRestore: undoLastRestore,
    getLastRestoreInfo: getLastRestoreInfo,
    getBackupHealth: getBackupHealth,
    subscribeStatus: function (fn) { statusListeners.add(fn); return function () { statusListeners.delete(fn); }; },
    initSnapshots: initSnapshots,
    takeSnapshotNow: takeSnapshotNow,
    restoreSnapshot: restoreSnapshot,
    getSnapshotsMeta: getSnapshotsMeta,
    getLastSnapshotAt: getLastSnapshotAt,
    snapshotsAvailable: snapshotsAvailable,
    connectBackupFolder: connectBackupFolder,
    getFolderStatus: getFolderStatus,
    getSaveTargetStatus: getSaveTargetStatus,
    getRestorePoints: getRestorePoints,
    prepareRestorePoint: prepareRestorePoint,
    checkStartupRecovery: checkStartupRecovery,
    saveHistoryNow: saveHistoryNow,
    _internals: {
      summarizeEnvelope: summarizeEnvelope,
      envelopePayloadEqual: envelopePayloadEqual,
      thinSnapshots: thinSnapshots,
      groupSnapshotsByPeriod: groupSnapshotsByPeriod,
      buildEnvelope: buildEnvelope,
      stampForFilename: stampForFilename,
      historyFilename: historyFilename,
      savedStatusDownloadName: savedStatusDownloadName,
      selectHistoryToPrune: selectHistoryToPrune,
      writeHistoryToFolder: writeHistoryToFolder,
    },
  };
})();
