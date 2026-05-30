(function () {
  const { qs, el } = window.KLS.util;
  const progress = window.KLS.progress;

  const validSlugs = new Set();
  let unsubscribe = null;
  let totalsStarsEl = null;
  let totalsStickersEl = null;

  function render() {
    const root = qs('#chrome-root');
    if (!root) return;
    root.innerHTML = '';

    const snap = progress.get();
    const profile = snap.profile;
    const totals = snap.totals;

    totalsStarsEl = el('span', { class: 'chrome__stat', title: 'Total stars' }, '⭐ ', String(totals.stars));
    totalsStickersEl = el('span', { class: 'chrome__stat', title: 'Stickers earned' }, '🏆 ', String(totals.stickers));

    const backBtn = el('button', {
      class: 'chrome__back',
      type: 'button',
      'aria-label': 'Save and return to hub',
      title: 'Saves first, then returns to the game menu',
      onclick: saveAndLeave,
    }, '← Hub');

    // "🏠 Home" — return to the current game's own welcome/home screen WITHOUT
    // leaving the iframe. Sends a `goHome` postMessage; the game's bridge
    // handler navigates internally. See ARCHITECTURE.md / game-bridge.js for
    // the contract. Games that don't subscribe to `goHome` will see no
    // effect (no-op fallback); fixing them belongs to that game's code, not
    // here.
    const homeBtn = el('button', {
      class: 'chrome__home',
      type: 'button',
      'aria-label': 'Return to this game’s home screen',
      title: 'Back to this game’s home (stay in the game)',
      onclick: goGameHome,
    }, '🏠 Home');

    const saveBtn = el('button', {
      class: 'chrome__save',
      type: 'button',
      'aria-label': 'Save my progress and keep playing',
      title: 'Save your progress (keep playing)',
      onclick: saveNow,
    }, '💾 Save');

    const profileBtn = profile
      ? el('button', {
          class: 'chrome__profile chrome__profile--btn',
          type: 'button',
          'aria-label': 'Switch profile (' + profile.displayName + ')',
          onclick: function () { location.hash = '#/profiles'; },
        },
          el('span', { class: 'chrome__avatar', 'aria-hidden': 'true' }, profile.avatar),
          el('span', { class: 'chrome__name' }, profile.displayName),
        )
      : el('span', { class: 'chrome__profile' }, '(no profile)');

    const bar = el('div', { class: 'chrome' },
      backBtn,
      homeBtn,
      saveBtn,
      profileBtn,
      el('div', { class: 'chrome__totals' }, totalsStarsEl, totalsStickersEl),
    );

    root.append(bar);
  }

  /** Save the game's state WITHOUT leaving — a manual checkpoint that keeps
   *  the kid in the game. The game's `saveState` reply is persisted by the
   *  main message listener; we flash the pill right away so the tap always
   *  gives feedback (stars/score are auto-saved on every event regardless). */
  function saveNow() {
    postToFrame('requestState');
    flashSaved();
  }

  /** Tell the active game to return to its own home/welcome screen. The
   *  game is expected to subscribe via `bridge.onHubMessage('goHome', cb)`.
   *  We don't navigate ourselves — the game knows what "home" means. */
  function goGameHome() {
    postToFrame('goHome');
  }

  /** Ask the game for its current state, then return to hub when it replies (or after a small timeout). */
  function saveAndLeave() {
    const expected = expectedSlugFromIframe();
    if (!expected) { location.hash = ''; return; }
    let returned = false;
    function go() {
      if (returned) return;
      returned = true;
      location.hash = '';
    }
    // Listen for the imminent saveState reply.
    function once(ev) {
      const data = ev.data;
      if (!data || data.type !== 'kls:progress' || data.event !== 'saveState') return;
      window.removeEventListener('message', once);
      // Save has happened in the main listener; just navigate.
      setTimeout(go, 80); // give the Saved pill a moment
    }
    window.addEventListener('message', once);
    postToFrame('requestState');
    // Safety net: even if the game doesn't respond, leave after 600ms.
    setTimeout(function () { window.removeEventListener('message', once); go(); }, 600);
  }

  function refreshTotals() {
    if (!totalsStarsEl) return;
    const { totals } = progress.get();
    totalsStarsEl.textContent = '';
    totalsStarsEl.append('⭐ ', String(totals.stars));
    totalsStickersEl.textContent = '';
    totalsStickersEl.append('🏆 ', String(totals.stickers));
  }

  function mount() {
    render();
    if (unsubscribe) unsubscribe();
    unsubscribe = progress.subscribe(refreshTotals);
  }

  function unmount() {
    const root = qs('#chrome-root');
    if (root) root.innerHTML = '';
    totalsStarsEl = null;
    totalsStickersEl = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  function registerSlugs(slugs) {
    validSlugs.clear();
    slugs.forEach((s) => validSlugs.add(s));
  }

  function expectedSlugFromIframe() {
    const frame = qs('#stage-frame');
    if (!frame) return null;
    const src = frame.getAttribute('src') || '';
    const m = src.match(/^games\/([^/]+)\//);
    return m ? m[1] : null;
  }

  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.type !== 'kls:progress') return;
    const expected = expectedSlugFromIframe();
    if (!expected || !validSlugs.has(expected)) return;
    if (data.slug && data.slug !== expected) return;

    switch (data.event) {
      case 'awardStars':
        progress.awardStars(expected, data.level, data.stars);
        flashSaved();
        break;
      case 'awardSticker':
        progress.awardSticker(expected, data.stickerId);
        flashSaved();
        break;
      case 'session':
        progress.recordSession(expected, data.level, data.stats || {});
        flashSaved();
        break;
      case 'played':
        progress.played(expected);
        break;
      case 'saveState':
        progress.saveGameState(expected, data.state == null ? null : data.state);
        flashSaved();
        break;
      case 'clearState':
        progress.clearGameState(expected);
        break;
      case 'resetProgress':
        // Game requested a full wipe of hub-level data for itself (active profile).
        progress.reset(expected);
        flashSaved();
        break;
      case 'celebrate':
        if (window.KLS && window.KLS.celebrate) window.KLS.celebrate.fire();
        break;
      default:
        // ignore unknown events
    }
  });

  /** Send a hub→game message (validated slug). */
  function postToFrame(event, payload) {
    const frame = qs('#stage-frame');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        Object.assign({ type: 'kls:hub', event: event }, payload || {}),
        '*'
      );
    } catch (e) { /* ignore */ }
  }

  /** Briefly show the "Saved ✓" pill near the chrome bar. */
  let savedTimer = null;
  function flashSaved() {
    const root = qs('#chrome-root');
    if (!root) return;
    let pill = qs('.chrome__saved', root);
    if (!pill) {
      pill = el('div', { class: 'chrome__saved', 'aria-live': 'polite' }, 'Saved ✓');
      root.appendChild(pill);
    }
    pill.classList.remove('chrome__saved--show');
    // force reflow so the animation re-fires
    void pill.offsetWidth;
    pill.classList.add('chrome__saved--show');
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      pill.classList.remove('chrome__saved--show');
    }, 1500);
  }

  /** Push a saved blob into a freshly-loaded game (after the kid said "Continue"). */
  function pushResumeState(slug, state) {
    // Wait briefly for the iframe to load + bridge to attach its message listener.
    const tries = [80, 200, 500, 1000];
    tries.forEach(function (delay) {
      setTimeout(function () {
        const expected = expectedSlugFromIframe();
        if (expected !== slug) return;
        postToFrame('resumeState', { state: state });
      }, delay);
    });
  }

  /** Push the active profile id into a freshly-loaded game so it can scope its
   *  own localStorage per profile. Retries because the bridge listener attaches
   *  on iframe load, not before. */
  function pushProfileToIframe(slug) {
    const snap = progress.get();
    const pid = (snap.profile && snap.profile.id) || null;
    if (!pid) return;
    const tries = [40, 120, 300, 700, 1500];
    tries.forEach(function (delay) {
      setTimeout(function () {
        const expected = expectedSlugFromIframe();
        if (expected !== slug) return;
        postToFrame('setProfile', { profileId: pid });
      }, delay);
    });
  }

  window.KLS = window.KLS || {};
  window.KLS.chrome = { mount, unmount, registerSlugs, pushResumeState, pushProfileToIframe };
})();
