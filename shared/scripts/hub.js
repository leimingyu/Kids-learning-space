(function () {
  const { qs, el, formatRelative } = window.KLS.util;
  const progress = window.KLS.progress;
  const chrome = window.KLS.chrome;

  const GAMES = [
    {
      slug: 'word-problem-adventure',
      title: 'Word Problem Adventure',
      emoji: '📚',
      subtitle: 'Read the story. Add, subtract, compare, share.',
      topics: ['word-problems'],
      tag: 'Word Problems',
      tagClass: 'tile__tag--reading',
    },
    {
      slug: 'cosmic-math-quest',
      title: 'Cosmic Math Quest',
      emoji: '🚀',
      subtitle: 'Multiplication & division mastery missions.',
      topics: ['mul-div'],
      tag: 'Mult & Div',
      tagClass: 'tile__tag--math',
    },
    {
      slug: 'lets-learn-fractions',
      title: "Let's Learn Fractions!",
      emoji: '🍕',
      subtitle: 'Slice pizzas. Compare pieces. Find equal fractions.',
      topics: ['fractions'],
      tag: 'Fractions',
      tagClass: 'tile__tag--math',
    },
    {
      slug: 'long-division-coach',
      title: 'Long Division Coach',
      emoji: '➗',
      subtitle: 'Divide, multiply, subtract, bring down.',
      topics: ['long-division', 'mul-div'],
      tag: 'Long Division',
      tagClass: 'tile__tag--logic',
    },
  ];

  const TOPICS = [
    { slug: 'all',           label: 'All' },
    { slug: 'word-problems', label: 'Word Problems' },
    { slug: 'mul-div',       label: 'Mult & Div' },
    { slug: 'fractions',     label: 'Fractions' },
    { slug: 'long-division', label: 'Long Division' },
  ];

  const SLUGS = new Set(GAMES.map((g) => g.slug));
  chrome.registerSlugs([...SLUGS]);

  let activeTopic = 'all';

  function parseHash() {
    const m = (location.hash || '').match(/^#\/games\/([^/?#]+)/);
    if (m && SLUGS.has(m[1])) return { route: 'game', slug: m[1] };
    return { route: 'hub' };
  }

  function gameStarsTotal(slug) {
    const g = progress.getGame(slug);
    let total = 0;
    for (const lv of Object.values(g.levels || {})) total += lv.stars || 0;
    return total;
  }

  function starString(n) {
    n = Math.max(0, Math.min(99, Number(n) | 0));
    return n > 0 ? '★'.repeat(n) : '–';
  }

  function visibleGames() {
    if (activeTopic === 'all') return GAMES;
    return GAMES.filter((g) => g.topics.includes(activeTopic));
  }

  function makeTile(g) {
    const stars = gameStarsTotal(g.slug);
    const last = progress.getGame(g.slug).lastPlayedAt;
    return el('a', {
      class: 'tile',
      href: '#/games/' + g.slug,
      'aria-label': g.title,
    },
      el('div', { class: 'tile__illo', 'aria-hidden': 'true' }, g.emoji),
      el('span', { class: 'tile__tag ' + (g.tagClass || '') }, g.tag),
      el('h2', { class: 'tile__title' }, g.title),
      el('p', { class: 'tile__subtitle' }, g.subtitle),
      el('div', { class: 'tile__stats' },
        el('span', { class: 'tile__stars', 'aria-label': stars + ' stars earned' }, starString(stars)),
        el('span', { class: 'tile__lastplayed' },
          last ? 'Played ' + formatRelative(last) : 'Not played yet'),
      ),
    );
  }

  function renderTiles() {
    const tilesEl = qs('#hub-tiles');
    if (!tilesEl) return;
    const games = visibleGames();
    tilesEl.innerHTML = '';
    if (games.length === 0) {
      tilesEl.append(
        el('div', { class: 'hub__empty' },
          el('p', {}, 'No games match this filter.'),
        )
      );
      return;
    }
    games.forEach((g) => tilesEl.append(makeTile(g)));
  }

  function renderFilter() {
    const filterEl = qs('#hub-filter');
    if (!filterEl) return;
    filterEl.innerHTML = '';
    TOPICS.forEach((t) => {
      const chip = el('button', {
        class: 'hub__filter-chip',
        type: 'button',
        'aria-pressed': t.slug === activeTopic ? 'true' : 'false',
        onclick: () => {
          if (activeTopic === t.slug) return;
          activeTopic = t.slug;
          renderFilter();
          renderTiles();
        },
      }, t.label);
      filterEl.append(chip);
    });
  }

  function playEnter(node) {
    node.classList.remove('kls-page-enter');
    // restart animation
    void node.offsetWidth;
    node.classList.add('kls-page-enter');
  }

  function renderHub() {
    chrome.unmount();
    const hub = qs('#hub-root');
    const stage = qs('#stage-root');
    stage.hidden = true;
    hub.hidden = false;
    playEnter(hub);

    const profile = progress.get().profile;

    // innerHTML for the header so the inline <svg><use> element gets the
    // correct SVG namespace (DOM API would require createElementNS).
    hub.innerHTML = ''
      + '<header class="hub__header">'
      +   '<svg class="hub__mascot" viewBox="0 0 200 200" role="img" aria-label="Pip the fox">'
      +     '<use href="#pip-curious"></use>'
      +   '</svg>'
      +   '<h1 class="hub__title">Kids Learning Space</h1>'
      +   '<p class="hub__subtitle">Pick a game and start learning!</p>'
      +   '<div class="hub__profile">'
      +     '<span class="hub__profile-avatar" aria-hidden="true" style="font-size:1.4rem"></span>'
      +     '<span class="hub__profile-name"></span>'
      +   '</div>'
      + '</header>'
      + '<div id="hub-filter" class="hub__filter" role="group" aria-label="Filter games by topic"></div>'
      + '<div id="hub-tiles" class="hub__tiles"></div>';

    qs('.hub__profile-avatar', hub).textContent = profile.avatar;
    qs('.hub__profile-name',   hub).textContent = profile.displayName;

    renderFilter();
    renderTiles();
  }

  function renderGame(slug) {
    const hub = qs('#hub-root');
    const stage = qs('#stage-root');
    const frame = qs('#stage-frame');

    hub.hidden = true;
    stage.hidden = false;
    playEnter(stage);
    chrome.mount();

    // Explicit index.html so this works on file:// (which has no directory
    // index resolution) as well as HTTP servers.
    const desired = 'games/' + slug + '/index.html';
    if (frame.getAttribute('src') !== desired) frame.setAttribute('src', desired);

    const meta = GAMES.find((g) => g.slug === slug);
    document.title = (meta ? meta.title : 'Game') + ' — Kids Learning Space';
  }

  function route() {
    const r = parseHash();
    if (r.route === 'game') {
      renderGame(r.slug);
    } else {
      document.title = 'Kids Learning Space';
      renderHub();
    }
  }

  // Live-refresh tiles when progress changes (so "Played 2m ago" stays current
  // and new stars appear without a manual reload).
  progress.subscribe(() => {
    if (parseHash().route === 'hub') renderTiles();
  });

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', route);
  } else {
    route();
  }
})();
