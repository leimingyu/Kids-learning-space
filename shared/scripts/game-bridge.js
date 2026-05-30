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
 * Parent validates the iframe slug before applying, so games cannot write
 * to one another's records.
 *
 * The parent may also send messages TO the game:
 *   { type: 'kls:hub', event: 'requestState' }
 *     → game should immediately reply with bridge.saveState(currentBlob)
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

  function addEmbeddedClass() {
    if (document.body) document.body.classList.add('kls-embedded');
  }
  if (embedded) {
    if (document.body) addEmbeddedClass();
    else document.addEventListener('DOMContentLoaded', addEmbeddedClass);
  }

  function post(event, payload) {
    if (!embedded) return;
    try {
      window.parent.postMessage(
        Object.assign({ type: 'kls:progress', event: event }, payload || {}),
        '*'
      );
    } catch (e) {
      // ignore — game shouldn't break if parent is gone
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
  }

  // Active profile id — populated when the hub sends a `setProfile` message.
  // Games should call getProfileId() to scope their localStorage. Null when
  // running standalone (no hub) or before the hub's first push arrives.
  let _profileId = null;
  const _profileReadyCbs = [];

  function setProfileFromHub(id) {
    if (typeof id !== 'string' || !id) return;
    const changed = _profileId !== id;
    _profileId = id;
    if (changed) {
      // Drain ready-callbacks; they each run at most once.
      const queued = _profileReadyCbs.splice(0, _profileReadyCbs.length);
      queued.forEach(function (cb) {
        try { cb(id); } catch (e) { console.error('[KLS bridge]', e); }
      });
    }
  }

  if (embedded) {
    window.addEventListener('message', function (ev) {
      const data = ev.data;
      if (!data || data.type !== 'kls:hub') return;
      // Intercept setProfile here so the bridge always has a fresh value
      // regardless of game-side handlers.
      if (data.event === 'setProfile') setProfileFromHub(data.profileId);
      const fns = hubHandlers[data.event] || [];
      fns.forEach(function (fn) { try { fn(data); } catch (e) { console.error('[KLS bridge]', e); } });
    });
  }

  /** Synchronously returns the active profile id, or null. */
  function getProfileId() { return _profileId; }

  /** Fire cb(profileId) the first time the hub announces a profile.
   *  Fires immediately if a profile is already known. */
  function onProfileReady(cb) {
    if (_profileId) { try { cb(_profileId); } catch (e) { console.error('[KLS bridge]', e); } return; }
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
    saveState(blob) { post('saveState', { state: blob == null ? null : blob }); },
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
    /** cb fires once when the profile id becomes known. */
    onProfileReady: onProfileReady,
  };
})();
