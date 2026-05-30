(function () {
  const { qs, el, formatRelative } = window.KLS.util;
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

  function makeTile(g) {
    const stars = gameStarsTotal(g.slug);
    const game = progress.getGame(g.slug);
    const last = game.lastPlayedAt;
    const stickers = (game.stickers || []).length;
    const hasSaved = !!game.gameState;

    const badges = [];
    if (stars > 0)    badges.push(el('span', { class: 'tile__badge tile__badge--stars' }, '⭐ ' + stars));
    if (stickers > 0) badges.push(el('span', { class: 'tile__badge tile__badge--stickers' }, '🏆 ' + stickers));
    if (hasSaved)    badges.push(el('span', { class: 'tile__badge tile__badge--saved', title: 'Saved game waiting' }, '💾 Continue'));

    return el('a', {
      class: 'tile',
      href: '#/games/' + g.slug,
      'aria-label': g.title,
    },
      el('div', { class: 'tile__illo', 'aria-hidden': 'true' }, g.emoji),
      el('span', { class: 'tile__tag ' + (g.tagClass || '') }, g.tag),
      el('h2', { class: 'tile__title' }, g.title),
      el('p', { class: 'tile__subtitle' }, g.subtitle),
      el('div', { class: 'tile__badges' }, badges),
      el('div', { class: 'tile__stats' },
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

  /** Should the "back up your data" nudge be shown right now? */
  function shouldNudgeBackup() {
    // Only nudge if the user has progress worth losing.
    const snap = progress.get();
    if (!snap.profile) return false;
    if (snap.totals.stars === 0 && snap.totals.stickers === 0) return false;

    // Respect dismissal (1 day) and last-export age (>= 7 days = stale).
    const NUDGE_DISMISS_KEY = 'kls.backup.nudgeDismissedAt';
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const STALE_AFTER = 7 * ONE_DAY;
    try {
      const dismissed = localStorage.getItem(NUDGE_DISMISS_KEY);
      if (dismissed && Date.now() - new Date(dismissed).getTime() < ONE_DAY) return false;
    } catch (e) { /* ignore */ }
    const backup = window.KLS && window.KLS.backup;
    if (!backup) return false;
    const last = backup.getLastExportedAt();
    if (!last) return true; // never backed up + has progress → nudge
    return Date.now() - new Date(last).getTime() > STALE_AFTER;
  }

  function dismissNudgeForToday() {
    try { localStorage.setItem('kls.backup.nudgeDismissedAt', new Date().toISOString()); } catch (e) { /* ignore */ }
  }

  function renderBackupNudge(parent) {
    if (!shouldNudgeBackup()) return;
    const backup = window.KLS && window.KLS.backup;
    const last = backup ? backup.getLastExportedAt() : null;
    const msg = last
      ? "It's been a while since you last backed up. Save a fresh copy so progress can't be lost."
      : 'Your kids’ progress lives only in this browser. Save a backup file so it can’t be lost.';
    const banner = el('div', { class: 'hub__nudge', role: 'note' },
      el('span', { class: 'hub__nudge-icon', 'aria-hidden': 'true' }, '💾'),
      el('span', { class: 'hub__nudge-text' }, msg),
      el('button', {
        type: 'button',
        class: 'btn btn-primary btn-tiny',
        onclick: function () {
          if (!backup) { alert('Backup module not loaded.'); return; }
          backup.exportToFile().then(function (ok) {
            if (ok) banner.remove();
          }).catch(function (e) {
            alert('Save failed: ' + (e && e.message ? e.message : e));
          });
        },
      }, 'Back up now'),
      el('button', {
        type: 'button',
        class: 'btn btn-muted btn-tiny',
        'aria-label': 'Dismiss for today',
        onclick: function () { dismissNudgeForToday(); banner.remove(); },
      }, 'Later'),
    );
    parent.prepend(banner);
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

    hub.innerHTML = ''
      + '<header class="hub__header">'
      +   '<svg class="hub__mascot" viewBox="0 0 200 200" role="img" aria-label="Pip the fox">'
      +     '<use href="#pip-curious"></use>'
      +   '</svg>'
      +   '<h1 class="hub__title">Kids Learning Space</h1>'
      +   '<p class="hub__subtitle">Pick a game and start learning!</p>'
      +   '<button type="button" class="hub__profile-pill" id="hub-profile-pill" aria-label="Switch profile">'
      +     '<span class="hub__profile-avatar" aria-hidden="true"></span>'
      +     '<span class="hub__profile-name"></span>'
      +     '<span class="hub__profile-hint" aria-hidden="true">Switch ▾</span>'
      +   '</button>'
      + '</header>'
      + '<div id="hub-filter" class="hub__filter" role="group" aria-label="Filter games by topic"></div>'
      + '<div id="hub-tiles" class="hub__tiles"></div>'
      + '<div id="hub-account-actions" class="hub__account-actions"></div>'
      + '<p class="hub__parent-link"><a href="#/parent">Parent / Data Page</a></p>';

    qs('.hub__profile-avatar', hub).textContent = profile ? profile.avatar : '🦊';
    qs('.hub__profile-name',   hub).textContent = profile ? profile.displayName : 'Friend';
    qs('#hub-profile-pill', hub).addEventListener('click', function () {
      location.hash = '#/profiles';
    });

    renderBackupNudge(hub);
    renderFilter();
    renderTiles();
    renderAccountActions();
  }

  /** Save / Load all account info buttons, rendered below the tiles. */
  function renderAccountActions() {
    const slot = qs('#hub-account-actions');
    if (!slot) return;
    slot.innerHTML = '';
    const backup = window.KLS && window.KLS.backup;

    const loadInput = el('input', {
      type: 'file', accept: 'application/json', style: 'display:none',
    });
    loadInput.addEventListener('change', function (ev) {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file || !backup) return;
      const typed = window.prompt(
        "Loading will REPLACE all accounts and progress on this device with the file's contents. " +
        "Accounts on this device that aren't in the file will be deleted.\n\n" +
        'Type REPLACE to continue:'
      );
      if (typed !== 'REPLACE') {
        alert('Load cancelled. Nothing was changed.');
        return;
      }
      backup.importFromFile(file).catch(function (e) {
        alert('Load failed: ' + (e && e.message ? e.message : e) + '\n\nNothing on this device was changed.');
      });
    });

    const lastExport = backup ? backup.getLastExportedAt() : null;
    const note = lastExport
      ? 'Last saved: ' + new Date(lastExport).toLocaleString()
      : 'No saved file yet on this device.';

    // The "Choose backup folder" button is only useful in browsers that
    // support the directory picker (Chrome/Edge over http/https). Hide it
    // elsewhere — Safari/Firefox/file:// users get the regular Save As flow.
    const folderButton = (backup && backup.supportsDirectoryPicker())
      ? el('button', {
          type: 'button',
          class: 'btn btn-muted btn-tiny',
          title: 'Make the Save dialog default to your project folder',
          onclick: function () {
            backup.pickBackupFolder().then(function (dh) {
              if (dh) alert('Backup folder set. The Save dialog will default to it next time.');
            }).catch(function (e) {
              alert('Could not set backup folder: ' + (e && e.message ? e.message : e));
            });
          },
        }, '📁 Choose backup folder')
      : null;

    slot.append(
      el('div', { class: 'hub__account-actions-row' },
        el('button', {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () {
            if (!backup) { alert('Backup module not loaded.'); return; }
            backup.exportToFile().then(function (ok) {
              if (ok) renderAccountActions(); // refresh "Last saved" line
            }).catch(function (e) {
              alert('Save failed: ' + (e && e.message ? e.message : e));
            });
          },
        }, '💾 Save all account info'),
        el('button', {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () { loadInput.click(); },
        }, '📥 Load all account info…'),
        loadInput,
      ),
      el('p', { class: 'hub__account-actions-note' }, note),
      folderButton ? el('p', { class: 'hub__account-actions-secondary' }, folderButton) : null,
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

    // Resume gate: if a saved blob exists, ask the kid before loading the iframe.
    const saved = progress.getGameState(slug);
    if (saved != null && profileUI && profileUI.confirmResume) {
      profileUI.confirmResume(slug, saved,
        function onResume() { actuallyStart(saved); },
        function onStartOver() { progress.clearGameState(slug); actuallyStart(null); }
      );
    } else {
      actuallyStart(null);
    }
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
