/*
 * KLS Game Bridge — optional helper for games embedded in the hub iframe.
 *
 * When NOT embedded (game opened directly), every method is a silent no-op,
 * so the game still works standalone. When embedded, the bridge:
 *   - adds the `kls-embedded` class to <body>
 *   - exposes window.KLS.bridge with progress-event helpers
 *   - provides onVisible(selector, cb) for hooking session-end screens
 *
 * Messages posted to the parent:
 *   { type: 'kls:progress', event: 'played'                              }
 *   { type: 'kls:progress', event: 'session',      level, stats          }
 *   { type: 'kls:progress', event: 'awardStars',   level, stars          }
 *   { type: 'kls:progress', event: 'awardSticker', stickerId             }
 *   { type: 'kls:progress', event: 'saveState',    state                 }
 *   { type: 'kls:progress', event: 'clearState'                          }
 *   { type: 'kls:progress', event: 'resetProgress'                       }
 *     → hub clears its own per-game record for this slug under the active
 *       profile (stars/levels/stickers/lastPlayedAt). Use sparingly — this
 *       is for an explicit "start over" affordance, not auto-saves.
 * Every progress message carries the bound slug, profileId, and sessionId.
 * The parent validates those plus the sending iframe before persisting.
 *
 * The parent may also send messages TO the game:
 *   { type: 'kls:hub', event: 'requestState', requestId, profileId, sessionId }
 *     → synchronously flush game storage and reply with saveState(currentBlob).
 *       The bridge attaches requestId and any reported storage failures.
 *   { type: 'kls:hub', event: 'resumeState', state: <blob> }
 *     → parent's reply to a freshly-loaded game that has saved state,
 *       once the user has opted to resume on the hub side.
 *   { type: 'kls:hub', event: 'setProfile', profileId: <string> }
 *     → tells the game which profile is currently active in the hub. Games
 *       MUST use this id to scope their own localStorage so each profile
 *       has its own progress. When opened standalone (no hub) the bridge
 *       returns null from getProfileId() and games should fall back to
 *       an un-scoped legacy key.
 *   { type: 'kls:hub', event: 'goHome' }
 *     → kid clicked the chrome bar's "🏠 Home" button. Game should navigate
 *       to its own welcome/home screen (NOT exit the iframe — that's what
 *       the "← Hub" button does). Game subscribes via
 *       `bridge.onHubMessage('goHome', cb)`. Games that don't subscribe
 *       silently no-op — fix that game's code, not the bridge.
 */
(function () {
  const embedded = (function () {
    try { return window.parent && window.parent !== window; }
    catch { return true; }
  })();
  let _profileId = null;
  let _sessionId = null;
  let _suspended = false;
  let _requestId = null;
  let _requestReplied = false;
  let _documentReady = document.readyState !== 'loading' && document.readyState !== 'interactive';
  let _profileMessage = null;
  let _profileDispatched = false;
  const storageErrors = new Map();
  const pathMatch = (window.location && window.location.pathname || '').match(/\/games\/([^/]+)\//);
  let _slug = pathMatch ? pathMatch[1] : null;

  function addEmbeddedClass() {
    if (document.body) document.body.classList.add('kls-embedded');
  }
  if (embedded) {
    if (document.body) addEmbeddedClass();
    else document.addEventListener('DOMContentLoaded', addEmbeddedClass);
  }

  function post(event, payload) {
    if (!embedded || _suspended) return false;
    if (event !== 'bridgeReady' && (!_profileId || !_sessionId)) return false;
    try {
      window.parent.postMessage(
        Object.assign({}, payload || {}, {
          type: 'kls:progress', event: event,
          slug: _slug, profileId: _profileId, sessionId: _sessionId,
        }),
        '*'
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hasAttribute && el.hasAttribute('hidden')) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }

  /**
   * Fire `cb` each time the element matching `selector` transitions from
   * hidden to visible. Works with hidden-attribute, class toggles, and
   * inline style changes — covers the patterns all four KLS games use.
   */
  function onVisible(selector, cb) {
    let prev = false;
    function check() {
      const el = document.querySelector(selector);
      const v = isVisible(el);
      if (v && !prev) {
        try { cb(); } catch (e) { console.error('[KLS bridge]', e); }
      }
      prev = v;
    }
    function start() {
      check();
      const obs = new MutationObserver(check);
      obs.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'class', 'style'],
        childList: true,
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Hub → game message dispatch
  // ──────────────────────────────────────────────────────────────────────
  const hubHandlers = {};
  function onHubMessage(event, fn) {
    if (!hubHandlers[event]) hubHandlers[event] = [];
    hubHandlers[event].push(fn);
    return function () { hubHandlers[event] = hubHandlers[event].filter(function (cb) { return cb !== fn; }); };
  }

  // Active profile id — populated when the hub sends a `setProfile` message.
  // Games should call getProfileId() to scope their localStorage. Null when
  // running standalone (no hub) or before the hub's first push arrives.
  const _profileReadyCbs = [];

  function setProfileFromHub(id) {
    if (typeof id !== 'string' || !id) return;
    _profileId = id;
  }

  function finishProfileBinding() {
    if (!_documentReady || !_profileId || !_sessionId || _suspended) return;
    if (!_profileDispatched) {
      _profileDispatched = true;
      const queued = _profileReadyCbs.splice(0, _profileReadyCbs.length);
      queued.forEach(function (cb) {
        try { cb(_profileId); } catch (e) { console.error('[KLS bridge]', e); }
      });
      (hubHandlers.setProfile || []).forEach(function (fn) {
        try { fn(_profileMessage); } catch (e) { console.error('[KLS bridge]', e); }
      });
    }
    post('profileReady');
  }

  if (embedded) {
    window.addEventListener('message', function (ev) {
      const data = ev.data;
      if (ev.source !== window.parent || !data || data.type !== 'kls:hub') return;
      if (data.event === 'setProfile') {
        if (typeof data.sessionId !== 'string' || !data.sessionId || typeof data.profileId !== 'string' || !data.profileId) return;
        if (_slug && data.slug !== _slug) return;
        // One iframe document belongs to one profile/session. A slow old
        // document cannot adopt the identity of its replacement.
        if (_sessionId && (_sessionId !== data.sessionId || _profileId !== data.profileId)) return;
        if (_sessionId) { finishProfileBinding(); return; }
        _slug = data.slug;
        _sessionId = data.sessionId;
        _profileMessage = data;
        setProfileFromHub(data.profileId);
        finishProfileBinding();
        return;
      } else if (!_documentReady || !_profileDispatched || !_sessionId || data.sessionId !== _sessionId || data.profileId !== _profileId || data.slug !== _slug || _suspended) {
        return;
      }
      if (data.event === 'suspendSession') _suspended = true;
      const fns = hubHandlers[data.event] || [];
      const priorRequest = _requestId;
      if (data.event === 'requestState') { _requestId = data.requestId; _requestReplied = false; }
      fns.forEach(function (fn) {
        try { fn(data); }
        catch (e) {
          console.error('[KLS bridge]', e);
          if (data.event === 'requestState') saveState(null, { ok: false, error: e && e.message || 'Could not capture this game.' });
        }
      });
      if (data.event === 'requestState') {
        if (!fns.length) saveState(null, { ok: false, error: 'This game has no checkpoint handler.' });
        _requestId = priorRequest;
      }
    });
  }

  function getStorageError() {
    return Array.from(storageErrors.values()).join(' ');
  }
  function reportStorageError(error, key) {
    const message = error && error.message ? error.message : String(error || 'Browser storage is unavailable.');
    storageErrors.set(key || 'game', message);
    post('storageError', { error: getStorageError() });
  }
  function clearStorageError(key) {
    storageErrors.delete(key || 'game');
    post('storageRecovered', { error: getStorageError() });
  }
  function assertCanWrite() {
    const raw = localStorage.getItem('kls.restore.journal.v1');
    if (raw && JSON.parse(raw).phase === 'prepared') throw new Error('A restore is in progress. Wait and try again.');
    if (embedded && (!_profileId || !_sessionId || _suspended)) throw new Error('This game session is not ready to save.');
    return true;
  }
  function saveState(blob, result) {
    result = result || {};
    const requestId = result.requestId || _requestId;
    if (requestId && _requestReplied && requestId === _requestId) return false;
    const error = result.error || getStorageError();
    if (requestId === _requestId) _requestReplied = true;
    return post('saveState', {
      state: blob == null ? null : blob,
      requestId: requestId || null,
      ok: result.ok !== false && !error,
      error: error || null,
    });
  }

  /** Optional standard checkpoint adapter; a thrown capture is a failed Save. */
  function registerCheckpoint(capture) {
    return onHubMessage('requestState', function () { saveState(capture()); });
  }

  /** Synchronously returns the active profile id, or null. */
  function getProfileId() { return _profileId; }

  /** Fire cb(profileId) the first time the hub announces a profile.
   *  Fires immediately if a profile is already known. */
  function onProfileReady(cb) {
    if (_profileId && _profileDispatched) { try { cb(_profileId); } catch (e) { console.error('[KLS bridge]', e); } return; }
    _profileReadyCbs.push(cb);
  }

  window.KLS = window.KLS || {};
  window.KLS.bridge = {
    isEmbedded() { return embedded; },
    played() { post('played'); },
    session(level, stats) { post('session', { level: level || 'session', stats: stats || {} }); },
    stars(level, n) { post('awardStars', { level: level, stars: n }); },
    sticker(stickerId) { post('awardSticker', { stickerId: stickerId }); },
    celebrate() { post('celebrate'); },
    /** Persist an opaque per-game state blob on the hub. */
    saveState: saveState,
    registerCheckpoint: registerCheckpoint,
    reportStorageError: reportStorageError,
    clearStorageError: clearStorageError,
    getStorageError: getStorageError,
    assertCanWrite: assertCanWrite,
    /** Drop the saved blob (e.g. when the game's own "start over" is confirmed). */
    clearState() { post('clearState'); },
    /** Tell the hub to wipe its own per-game record for this slug under the
     *  active profile. Pairs with the game clearing its own localStorage. */
    resetProgress() { post('resetProgress'); },
    /** Subscribe to hub-→game messages: 'requestState', 'resumeState', 'setProfile'. */
    onHubMessage: onHubMessage,
    onVisible: onVisible,
    /** Profile id for the currently active hub profile, or null if standalone. */
    getProfileId: getProfileId,
    getSessionId() { return _sessionId; },
    /** cb fires once when the profile id becomes known. */
    onProfileReady: onProfileReady,
  };
  // External game scripts may still be loading when the bridge is evaluated.
  // Resume and Save may be delivered only after their handlers exist.
  function documentReady() {
    _documentReady = true;
    if (embedded) { post('bridgeReady'); finishProfileBinding(); }
  }
  if (_documentReady) documentReady();
  else document.addEventListener('DOMContentLoaded', documentReady, { once: true });
})();
