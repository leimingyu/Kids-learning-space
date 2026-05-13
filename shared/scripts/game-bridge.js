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
 * Parent validates the iframe slug before applying, so games cannot write
 * to one another's records.
 *
 * The parent may also send messages TO the game:
 *   { type: 'kls:hub', event: 'requestState' }
 *     → game should immediately reply with bridge.saveState(currentBlob)
 *   { type: 'kls:hub', event: 'resumeState', state: <blob> }
 *     → parent's reply to a freshly-loaded game that has saved state,
 *       once the user has opted to resume on the hub side.
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
  if (embedded) {
    window.addEventListener('message', function (ev) {
      const data = ev.data;
      if (!data || data.type !== 'kls:hub') return;
      const fns = hubHandlers[data.event] || [];
      fns.forEach(function (fn) { try { fn(data); } catch (e) { console.error('[KLS bridge]', e); } });
    });
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
    /** Subscribe to hub-→game messages: 'requestState', 'resumeState'. */
    onHubMessage: onHubMessage,
    onVisible: onVisible,
  };
})();
