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
    const { profile, totals } = snap;

    totalsStarsEl = el('span', { class: 'chrome__stat', title: 'Total stars' }, '⭐ ', String(totals.stars));
    totalsStickersEl = el('span', { class: 'chrome__stat', title: 'Stickers earned' }, '🏆 ', String(totals.stickers));

    const bar = el('div', { class: 'chrome' },
      el('button', {
        class: 'chrome__back',
        type: 'button',
        'aria-label': 'Back to hub',
        onclick: () => { location.hash = ''; },
      }, '← Hub'),
      el('div', { class: 'chrome__profile' },
        el('span', { class: 'chrome__avatar', 'aria-hidden': 'true' }, profile.avatar),
        el('span', { class: 'chrome__name' }, profile.displayName),
      ),
      el('div', { class: 'chrome__totals' }, totalsStarsEl, totalsStickersEl),
    );

    root.append(bar);
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
        break;
      case 'awardSticker':
        progress.awardSticker(expected, data.stickerId);
        break;
      case 'session':
        progress.recordSession(expected, data.level, data.stats || {});
        break;
      case 'played':
        progress.played(expected);
        break;
      case 'celebrate':
        if (window.KLS && window.KLS.celebrate) window.KLS.celebrate.fire();
        break;
      default:
        // ignore unknown events
    }
  });

  window.KLS = window.KLS || {};
  window.KLS.chrome = { mount, unmount, registerSlugs };
})();
