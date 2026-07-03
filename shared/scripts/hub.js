(function () {
  const { qs, el } = window.KLS.util;
  const progress = window.KLS.progress;
  const chrome = window.KLS.chrome;
  const profileUI = window.KLS.profileUI;

  const GAMES = [
    {
      slug: 'word-problem-adventure',
      title: 'Word Problem Adventure',
      emoji: '📚',
      subtitle: 'Read the story. Add, subtract, compare, share.',
      topics: ['word-problems'],
      tag: 'Word Problems',
      tagClass: 'tile__tag--reading',
      storageBase: ['wordProblemAdventure_v1', 'wordProblemAdventure_wrongs_v1'],
    },
    {
      slug: 'cosmic-math-quest',
      title: 'Cosmic Math Quest',
      emoji: '🚀',
      subtitle: 'Multiplication & division mastery missions.',
      topics: ['mul-div'],
      tag: 'Mult & Div',
      tagClass: 'tile__tag--math',
      storageBase: ['cosmicMathQuest_v1', 'cosmicMathQuest_wrongs_v1'],
    },
    {
      slug: 'lets-learn-fractions',
      title: "Let's Learn Fractions!",
      emoji: '🍕',
      subtitle: 'Slice pizzas. Compare pieces. Find equal fractions.',
      topics: ['fractions'],
      tag: 'Fractions',
      tagClass: 'tile__tag--math',
      storageBase: 'letsLearnFractions_wrongs_v1',
    },
    {
      slug: 'long-division-coach',
      title: 'Long Division Coach',
      emoji: '➗',
      subtitle: 'Divide, multiply, subtract, bring down.',
      topics: ['long-division', 'mul-div'],
      tag: 'Long Division',
      tagClass: 'tile__tag--logic',
      storageBase: ['longDivisionCoach_v1', 'longDivisionCoach_wrongs_v1'],
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

  // Expose for backup.js (discovers per-game profile-scoped keys via storageBase).
  window.KLS = window.KLS || {};
  window.KLS.GAMES = GAMES;

  let activeTopic = 'all';

  function parseHash() {
    const h = location.hash || '';
    let m;
    if ((m = h.match(/^#\/games\/([^/?#]+)/))) {
      if (SLUGS.has(m[1])) return { route: 'game', slug: m[1] };
    }
    if (h === '#/profiles')      return { route: 'profiles' };
    if (h === '#/profiles/new')  return { route: 'profiles-new' };
    if (h === '#/parent')        return { route: 'parent' };
    return { route: 'hub' };
  }

  function gameStarsTotal(slug) {
    const g = progress.getGame(slug);
    let total = 0;
    for (const lv of Object.values(g.levels || {})) total += lv.stars || 0;
    return total;
  }

  function visibleGames() {
    if (activeTopic === 'all') return GAMES;
    return GAMES.filter((g) => g.topics.includes(activeTopic));
  }

  // (Big-tile renderer removed — Solution 1 uses only the compact mini tile.
  //  If a future redesign needs a hero card, restore via git history.)

  /** Compact tile — used in the single-section library. Solution 1 removes
   *  the tile tag (it duplicated the filter chips) and replaces the standalone
   *  Continue section with an inline ▶ overlay on tiles that have saved state. */
  function makeTileMini(g) {
    const stars = gameStarsTotal(g.slug);
    const game = progress.getGame(g.slug);
    const stickers = (game.stickers || []).length;
    const hasSaved = !!game.gameState;

    const meta = [];
    if (stars > 0)    meta.push(el('span', { class: 'tile__badge tile__badge--stars' },    '⭐ ' + stars));
    if (stickers > 0) meta.push(el('span', { class: 'tile__badge tile__badge--stickers' }, '🏆 ' + stickers));

    const classes = 'tile tile--mini' + (hasSaved ? ' tile--resumable' : '');
    return el('a', {
      class: classes,
      href: '#/games/' + g.slug,
      'aria-label': hasSaved ? 'Continue ' + g.title : g.title,
      title: g.subtitle,
    },
      el('div', { class: 'tile-mini__row' },
        el('div', { class: 'tile-mini__emoji', 'aria-hidden': 'true' }, g.emoji),
        el('div', { class: 'tile-mini__body' },
          el('h3', { class: 'tile-mini__title' }, g.title),
          meta.length ? el('div', { class: 'tile-mini__meta' }, meta) : null,
        ),
      ),
    );
  }

  // (Continue section removed in Solution 1 — inline ▶ overlay on resumable
  //  tiles serves the same purpose without a duplicate row.)

  function renderLibrary() {
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
    games.forEach((g) => tilesEl.append(makeTileMini(g)));
  }

  function renderTiles() {
    renderLibrary();
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
    hub.className = 'hub';
    playEnter(hub);

    const profile = progress.get().profile;

    // Solution 1 "Single-section stripped": no Continue section, no "All games"
    // heading, no subtitle, no tile tags (filter chips already do that job),
    // no bottom Parent link. Account actions collapse into a single chip
    // menu at the bottom-right.
    hub.innerHTML = ''
      + '<header class="hub__header hub__header--slim">'
      +   '<div class="hub__brand">'
      +     '<svg class="hub__mascot hub__mascot--small" viewBox="0 0 200 200" role="img" aria-label="Pip the fox">'
      +       '<use href="#pip-curious"></use>'
      +     '</svg>'
      +     '<div class="hub__brand-text">'
      +       '<h1 class="hub__title hub__title--slim">Kids Learning Space</h1>'
      +     '</div>'
      +   '</div>'
      +   '<button type="button" class="hub__profile-pill" id="hub-profile-pill" aria-label="Switch profile">'
      +     '<span class="hub__profile-avatar" aria-hidden="true"></span>'
      +     '<span class="hub__profile-name"></span>'
      +     '<span class="hub__profile-hint" aria-hidden="true">Switch ▾</span>'
      +   '</button>'
      + '</header>'
      + '<div id="hub-filter" class="hub__filter" role="group" aria-label="Filter games by topic"></div>'
      + '<div id="hub-tiles" class="hub__library-grid"></div>'
      + '<div id="hub-account-actions" class="hub__quick-row"></div>';

    qs('.hub__profile-avatar', hub).textContent = profile ? profile.avatar : '🦊';
    qs('.hub__profile-name',   hub).textContent = profile ? profile.displayName : 'Friend';
    qs('#hub-profile-pill', hub).addEventListener('click', function () {
      location.hash = '#/profiles';
    });

    renderFilter();
    renderTiles();
    renderAccountActions();
  }

  /** The hub renders no backup UI (Quiet Backup — snapshots happen silently
   *  in the background). The only thing left in the account-actions row is a
   *  quiet link to the grown-ups Parent page, which now hosts the restore
   *  timeline plus the manual Export/Import escape hatch. */
  function renderAccountActions() {
    const slot = qs('#hub-account-actions');
    if (!slot) return;
    slot.innerHTML = '';
    slot.append(
      el('a', { class: 'hub__parent-link', href: '#/parent' }, '👨‍👧 Parent page')
    );
  }

  function renderGame(slug) {
    const hub = qs('#hub-root');
    const stage = qs('#stage-root');
    const frame = qs('#stage-frame');

    function actuallyStart(resumeBlob) {
      hub.hidden = true;
      stage.hidden = false;
      playEnter(stage);
      chrome.mount();

      // Explicit index.html so this works on file:// (which has no directory
      // index resolution) as well as HTTP servers.
      const desired = 'games/' + slug + '/index.html';
      // Force reload even if same src (so resumeBlob delivery is deterministic).
      frame.setAttribute('src', desired);

      const meta = GAMES.find((g) => g.slug === slug);
      document.title = (meta ? meta.title : 'Game') + ' — Kids Learning Space';

      // Tell the game which profile is active so it can scope its own
      // localStorage. Runs before resumeState so the game has profile context
      // by the time it processes any saved blob.
      if (chrome.pushProfileToIframe) {
        chrome.pushProfileToIframe(slug);
      }
      if (resumeBlob != null && chrome.pushResumeState) {
        chrome.pushResumeState(slug, resumeBlob);
      }
    }

    // Approach 4: the hub no longer asks "Continue or start over?" — that
    // decision lives on the game's home screen. We always load the game
    // and push the saved blob (if any). The game STASHES the blob and
    // shows a two-button choice on its home screen.
    actuallyStart(progress.getGameState(slug));
  }

  function route() {
    const r = parseHash();
    if (r.route === 'game') {
      renderGame(r.slug);
      return;
    }
    // All non-game routes show the hub doc (chrome unmounted, stage hidden).
    qs('#stage-root').hidden = true;
    chrome.unmount();

    if (r.route === 'profiles')      { profileUI.renderManager();   document.title = 'Profiles — Kids Learning Space'; return; }
    if (r.route === 'profiles-new')  { profileUI.renderCreateNew({ firstTime: false, onCreated: function () { location.hash = ''; } }); document.title = 'New Profile — Kids Learning Space'; return; }
    if (r.route === 'parent')        { profileUI.renderParent();     document.title = 'Parent — Kids Learning Space'; return; }

    document.title = 'Kids Learning Space';
    renderHub();
  }

  function boot() {
    // Start silent background snapshots (Quiet Backup). GAMES is already on
    // window.KLS.GAMES by now, so buildEnvelope can discover every game's keys.
    if (window.KLS.backup && window.KLS.backup.initSnapshots) window.KLS.backup.initSnapshots();
    // First-visit gate: ensure there's an active profile before showing anything.
    profileUI.ensureProfileOrPick(function () {
      route();
    });
  }

  // Live-refresh tiles when progress changes (so "Played 2m ago" stays current
  // and new stars appear without a manual reload).
  progress.subscribe(() => {
    if (parseHash().route === 'hub') renderTiles();
  });

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
