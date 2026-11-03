/* Profile-scoped, synchronous persistence for Logic Detectives.
 * Two localStorage keys are committed with verification and best-effort rollback.
 * A failed save remains in this document's memory for an explicit flush retry.
 */
(function (root) {
  'use strict';
  const MAIN_BASE = 'logicDetectives_v1';
  const WRONGS_BASE = 'logicDetectives_wrongs_v1';
  const JOURNAL_KEY = 'kls.restore.journal.v1';
  const REPORT_KEY = 'logic-detectives';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function freshMain() {
    return { version: 1, grade: 2, cases: {}, completed: {}, mastery: {}, badges: [], lastRun: null };
  }
  function mainValue(value) {
    if (!record(value) || value.version !== 1) throw new Error('unsupported-main');
    if (own(value, 'grade') && value.grade !== 2 && value.grade !== 3) throw new Error('invalid-main');
    for (const key of ['cases', 'completed', 'mastery']) if (own(value, key) && !record(value[key])) throw new Error('invalid-main');
    if (own(value, 'badges') && !Array.isArray(value.badges)) throw new Error('invalid-main');
    if (own(value, 'lastRun') && value.lastRun !== null && !record(value.lastRun)) throw new Error('invalid-main');
    // Spread retains additive JSON fields, including an own __proto__ property.
    return { ...freshMain(), ...value };
  }
  function wrongsValue(value) {
    if (!record(value) || Object.values(value).some(item => !record(item))) throw new Error('invalid-wrongs');
    return value;
  }
  const readMain = raw => raw === null ? freshMain() : mainValue(JSON.parse(raw));
  const readWrongs = raw => raw === null ? {} : wrongsValue(JSON.parse(raw));

  function create(options) {
    options = options || {};
    const storage = options.storage;
    const bridge = options.bridge || null;
    const pending = new Map();
    const errors = new Map();
    const protectedScopes = new Set();

    function embedded() {
      try {
        if (bridge && typeof bridge.isEmbedded === 'function') return !!bridge.isEmbedded();
        return !!root.parent && root.parent !== root;
      } catch (_) { return true; }
    }
    function identity() {
      if (!embedded()) return { scope: 'standalone', main: MAIN_BASE, wrongs: WRONGS_BASE };
      try {
        const id = bridge && typeof bridge.getProfileId === 'function' && bridge.getProfileId();
        if (typeof id !== 'string' || !id) return null;
        if (typeof bridge.getSessionId === 'function' && !bridge.getSessionId()) return null;
        return { scope: 'profile:' + id, main: MAIN_BASE + '__' + id, wrongs: WRONGS_BASE + '__' + id };
      } catch (_) { return null; }
    }
    function ready() { return identity() !== null; }
    function keys() {
      const id = identity();
      return id ? { main: id.main, wrongs: id.wrongs } : { main: null, wrongs: null };
    }
    function waiting() { return { ok: false, error: 'Waiting for your profile before saving progress.' }; }
    function notifyError(id, message) {
      const changed = errors.get(id.scope) !== message;
      errors.set(id.scope, message);
      if (changed) {
        try { if (bridge && typeof bridge.reportStorageError === 'function') bridge.reportStorageError(message, REPORT_KEY); } catch (_) {}
        try { if (typeof options.onError === 'function') options.onError(message); } catch (_) {}
      }
      return { ok: false, error: message };
    }
    function recovered(id) {
      const hadError = errors.delete(id.scope);
      if (hadError) {
        try { if (bridge && typeof bridge.clearStorageError === 'function') bridge.clearStorageError(REPORT_KEY); } catch (_) {}
        try { if (typeof options.onRecovered === 'function') options.onRecovered(); } catch (_) {}
      }
      return { ok: true };
    }
    function status() {
      const id = identity();
      if (!id) return waiting();
      const error = errors.get(id.scope);
      return error ? { ok: false, error } : { ok: true };
    }
    function canWrite() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw new Error('storage-unavailable');
      const journal = storage.getItem(JOURNAL_KEY);
      if (journal !== null) {
        let parsed;
        try { parsed = JSON.parse(journal); } catch (_) { throw new Error('restore-needs-recovery'); }
        if (!record(parsed)) throw new Error('restore-needs-recovery');
        if (parsed.phase === 'prepared') throw new Error('restore-in-progress');
      }
      if (bridge && typeof bridge.assertCanWrite === 'function' && bridge.assertCanWrite() === false) throw new Error('session-not-writable');
    }
    function writeGuardFailure(id, error) {
      const message = error && error.message;
      return notifyError(id, message === 'restore-in-progress' || message === 'restore-needs-recovery'
        ? 'A progress restore is in progress or needs recovery. Your game is waiting to save safely.'
        : 'Progress could not be saved in this browser. Keep this tab open and try saving again.');
    }
    function load() {
      const id = identity();
      if (!id) return { main: freshMain(), wrongs: {} };
      const buffered = pending.get(id.scope);
      if (buffered && !protectedScopes.has(id.scope)) return { main: readMain(buffered.main), wrongs: readWrongs(buffered.wrongs) };
      let mainRaw, wrongsRaw;
      try {
        mainRaw = storage.getItem(id.main); wrongsRaw = storage.getItem(id.wrongs);
      } catch (_) {
        protectedScopes.add(id.scope);
        notifyError(id, 'Saved progress could not be read in this browser. Your saved data was kept. Keep this tab open and try again.');
        return { main: freshMain(), wrongs: {} };
      }
      let main = freshMain(), wrongs = {}, invalid = false;
      try { main = readMain(mainRaw); } catch (_) { invalid = true; }
      try { wrongs = readWrongs(wrongsRaw); } catch (_) { invalid = true; }
      if (invalid) {
        protectedScopes.add(id.scope);
        notifyError(id, 'Saved Logic Detectives data could not be understood. It has been kept unchanged. Restore a backup or explicitly reset this game to start fresh.');
      } else {
        if (protectedScopes.has(id.scope)) pending.delete(id.scope);
        protectedScopes.delete(id.scope);
        if (!pending.has(id.scope)) recovered(id);
      }
      return { main: clone(main), wrongs: clone(wrongs) };
    }
    function restoreValue(key, raw) {
      if (raw === null) storage.removeItem(key); else storage.setItem(key, raw);
    }
    function commit(id, snapshot, removing) {
      if (protectedScopes.has(id.scope) && !removing) return notifyError(id, 'Saved Logic Detectives data is protected. Restore a backup or explicitly reset this game before saving new progress.');
      try { canWrite(); } catch (error) { return writeGuardFailure(id, error); }
      let before;
      try { before = { main: storage.getItem(id.main), wrongs: storage.getItem(id.wrongs) }; }
      catch (_) { return notifyError(id, 'The current save could not be read safely. Keep this tab open and try saving again.'); }
      if (!removing) {
        try { readMain(before.main); readWrongs(before.wrongs); }
        catch (_) {
          protectedScopes.add(id.scope);
          return notifyError(id, 'Saved Logic Detectives data could not be understood. It has been kept unchanged. Restore a backup or explicitly reset this game to start fresh.');
        }
      }
      const touched = [];
      try {
        for (const field of ['main', 'wrongs']) {
          if (before[field] === snapshot[field]) continue;
          touched.push(field);
          restoreValue(id[field], snapshot[field]);
        }
        if (storage.getItem(id.main) !== snapshot.main || storage.getItem(id.wrongs) !== snapshot.wrongs) throw new Error('readback-failed');
      } catch (_) {
        let rollbackFailed = false;
        for (const field of touched.reverse()) {
          try { restoreValue(id[field], before[field]); }
          catch (_) { rollbackFailed = true; }
        }
        if (!rollbackFailed) {
          try { rollbackFailed = storage.getItem(id.main) !== before.main || storage.getItem(id.wrongs) !== before.wrongs; }
          catch (_) { rollbackFailed = true; }
        }
        return notifyError(id, rollbackFailed
          ? 'Progress could not be saved completely. A pending copy is kept in this tab. Keep it open and try saving again.'
          : 'Progress could not be saved. The previous save was restored. Keep this tab open and try saving again.');
      }
      pending.delete(id.scope); protectedScopes.delete(id.scope);
      return recovered(id);
    }
    function write(main, wrongs) {
      const id = identity();
      if (!id) return waiting();
      if (protectedScopes.has(id.scope)) return notifyError(id, 'Saved Logic Detectives data is protected. Load it successfully, restore a backup, or explicitly reset this game before saving new progress.');
      let snapshot;
      try {
        snapshot = { main: JSON.stringify(mainValue(main)), wrongs: JSON.stringify(wrongsValue(wrongs)) };
        // Validate the actual JSON representation, not just the supplied objects.
        readMain(snapshot.main); readWrongs(snapshot.wrongs);
      } catch (_) { return notifyError(id, 'This progress could not be prepared for saving. Your previous save was kept.'); }
      pending.set(id.scope, snapshot);
      return commit(id, snapshot, false);
    }
    function flush(main, wrongs) {
      if (arguments.length) return write(main, wrongs);
      const id = identity();
      if (!id) return waiting();
      const snapshot = pending.get(id.scope);
      return snapshot ? commit(id, snapshot, false) : status();
    }
    function reset() {
      const id = identity();
      if (!id) return waiting();
      const previousPending = pending.get(id.scope);
      const result = commit(id, { main: null, wrongs: null }, true);
      if (!result.ok && previousPending) pending.set(id.scope, previousPending);
      return result;
    }
    return Object.freeze({ ready, load, write, flush, reset, keys, status });
  }
  root.LogicDetectivesStore = Object.freeze({ create, freshMain, MAIN_BASE, WRONGS_BASE });
})(window);
