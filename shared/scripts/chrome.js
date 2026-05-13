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
      'aria-label': 'Back to hub',
      onclick: () => { location.hash = ''; },
    }, '← Hub');

    const saveBtn = el('button', {
      class: 'chrome__save',
      type: 'button',
      'aria-label': 'Save and return to hub',
      title: 'Save & Quit',
      onclick: saveAndQuit,
    }, '💾 Save & Quit');

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
      saveBtn,
      profileBtn,
      el('div', { class: 'chrome__totals' }, totalsStarsEl, totalsStickersEl),
    );

    root.append(bar);
  }

  /** Ask the game for its current state, then return to hub when it replies (or after a small timeout). */
  function saveAndQuit() {
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

  window.KLS = window.KLS || {};
  window.KLS.chrome = { mount, unmount, registerSlugs, pushResumeState };
})();
