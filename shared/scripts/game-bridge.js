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
 * Parent validates the iframe slug before applying, so games cannot write
 * to one another's records.
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

  window.KLS = window.KLS || {};
  window.KLS.bridge = {
    isEmbedded() { return embedded; },
    played() { post('played'); },
    session(level, stats) { post('session', { level: level || 'session', stats: stats || {} }); },
    stars(level, n) { post('awardStars', { level: level, stars: n }); },
    sticker(stickerId) { post('awardSticker', { stickerId: stickerId }); },
    celebrate() { post('celebrate'); },
    onVisible: onVisible,
  };
})();
