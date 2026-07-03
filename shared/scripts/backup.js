/*
 * Kids Learning Space — Backup & Restore.
 *
 * Implements the spec in BACKUP_RESTORE.md. Exports a single JSON envelope
 * with hub progress (kls.progress.v2) AND every game's profile-scoped state
 * (e.g. wordProblemAdventure_v1__<pid>). Restore is REPLACE-only: wipe-then-write.
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
  const IDB_KEY_FILE = 'lastFileHandle';
  const IDB_KEY_DIR  = 'lastDirHandle';
  // localStorage flag so we don't pester the user with the "set up your
  // backup folder" prompt every time they hit Save.
  const DIR_SETUP_OFFERED_KEY = 'kls.backup.dirSetupOffered';

  function openHandleDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IDB')); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
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
    const hub = readJSON(HUB_KEY);
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

  function getLastExportedAt() {
    try { return localStorage.getItem(LAST_EXPORT_KEY) || null; } catch (e) { return null; }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Import (REPLACE-only)
  // ──────────────────────────────────────────────────────────────────────

  function validate(envelope) {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error("Couldn't read this file. Is it the JSON backup we exported?");
    }
    if (envelope.type !== 'kls.backup') {
      throw new Error("This file doesn't look like a Kids Learning Space backup.");
    }
    if (typeof envelope.version !== 'number') {
      throw new Error('Backup is missing a version field.');
    }
    if (envelope.version > BACKUP_VERSION) {
      throw new Error('This backup was made on a newer version. Please update the app first.');
    }
    // Older versions: register migrations in BACKUP_MIGRATIONS when introduced.
    if (envelope.hub != null) {
      if (typeof envelope.hub !== 'object') throw new Error('Backup hub data is malformed.');
      if (typeof envelope.hub.version !== 'number') throw new Error('Backup hub is missing a version.');
    }
    if (envelope.games != null && typeof envelope.games !== 'object') {
      throw new Error('Backup games data is malformed.');
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
      if (k.startsWith('kls.')) { keys.push(k); continue; }
      if (prefixes.some((p) => k.startsWith(p))) { keys.push(k); continue; }
    }
    return keys;
  }

  function wipeAppKeys() {
    const keys = collectAppKeys();
    keys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }

  function writeFromEnvelope(envelope) {
    if (envelope.hub) {
      localStorage.setItem(HUB_KEY, JSON.stringify(envelope.hub));
    }
    const gameBySlug = {};
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
          localStorage.setItem(defaultBase + '__' + pid, payload);
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
            localStorage.setItem(base + '__' + pid, raw);
          });
          return;
        }
        console.info('[KLS backup] skipping bad payload for', slug, pid);
      });
    });
    // Note when this restore happened so the nudge banner stays quiet.
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
  }

  /**
   * Read a File, parse, validate. On any error, throws — caller has not yet
   * modified state. On success, returns the validated envelope.
   */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
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

  /**
   * Two-step destructive restore. Caller is responsible for the
   * type-REPLACE confirmation BEFORE invoking this. After success, the page
   * reloads so every iframe re-reads state from scratch.
   */
  function importFromFile(file) {
    return parseFile(file).then(function (envelope) {
      // All validation has passed — only now do we touch state.
      wipeAppKeys();
      writeFromEnvelope(envelope);
      // Force a full reload so iframes/games re-read state and the active
      // profile id is re-pushed via chrome.pushProfileToIframe.
      location.hash = '';
      location.reload();
    });
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
  // Snapshot pure helpers (unit-tested in tests/smoke-backup-snapshots.mjs)
  // ──────────────────────────────────────────────────────────────────────

  /** Per-profile ⭐/🏆 rollup straight from an envelope's hub blob. */
  function summarizeEnvelope(envelope) {
    const hub = envelope && envelope.hub;
    const profiles = (hub && Array.isArray(hub.profiles)) ? hub.profiles : [];
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
    importFromFile: importFromFile,
    getLastExportedAt: getLastExportedAt,
    pickBackupFolder: pickBackupFolder,
    hasBackupFolder: hasBackupFolder,
    supportsDirectoryPicker: supportsDirectoryPicker,
    BACKUP_VERSION: BACKUP_VERSION,
    _internals: {
      summarizeEnvelope: summarizeEnvelope,
      envelopePayloadEqual: envelopePayloadEqual,
      thinSnapshots: thinSnapshots,
      groupSnapshotsByPeriod: groupSnapshotsByPeriod,
      buildEnvelope: buildEnvelope,
    },
  };
})();
