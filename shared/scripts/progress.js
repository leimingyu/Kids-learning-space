(function () {
  const KEY = 'kls.progress.v1';

  const defaultState = () => ({
    version: 1,
    profile: {
      displayName: 'Friend',
      avatar: '🦊',
      createdAt: new Date().toISOString(),
    },
    games: {},
  });

  const defaultGame = () => ({
    lastPlayedAt: null,
    bestStreak: 0,
    stickers: [],
    levels: {},
  });

  const defaultLevel = () => ({
    stars: 0,
    questionsAnswered: 0,
    accuracy: 0,
  });

  const listeners = new Set();

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return defaultState();
      parsed.profile = Object.assign(defaultState().profile, parsed.profile || {});
      parsed.games = parsed.games || {};
      return parsed;
    } catch (e) {
      console.warn('[KLS] progress read failed, using defaults', e);
      return defaultState();
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[KLS] progress write failed', e);
      return;
    }
    listeners.forEach((fn) => { try { fn(state); } catch (err) { console.error(err); } });
  }

  function getGameMut(state, slug) {
    if (!state.games[slug]) state.games[slug] = defaultGame();
    return state.games[slug];
  }

  function getLevelMut(game, level) {
    if (!game.levels[level]) game.levels[level] = defaultLevel();
    return game.levels[level];
  }

  function totals(state) {
    let stars = 0;
    let stickers = 0;
    for (const g of Object.values(state.games)) {
      stickers += (g.stickers || []).length;
      for (const lv of Object.values(g.levels || {})) {
        stars += lv.stars || 0;
      }
    }
    return { stars, stickers };
  }

  const api = {
    get() {
      const s = read();
      return Object.assign({}, s, { totals: totals(s) });
    },

    getGame(slug) {
      const s = read();
      return s.games[slug] || defaultGame();
    },

    setProfile(patch) {
      const s = read();
      s.profile = Object.assign({}, s.profile, patch || {});
      write(s);
    },

    awardStars(slug, level, stars) {
      const n = Math.max(0, Math.min(3, Number(stars) | 0));
      const s = read();
      const g = getGameMut(s, slug);
      const lv = getLevelMut(g, level);
      if (n > lv.stars) lv.stars = n;
      g.lastPlayedAt = new Date().toISOString();
      write(s);
    },

    awardSticker(slug, stickerId) {
      if (!stickerId) return;
      const s = read();
      const g = getGameMut(s, slug);
      if (!g.stickers.includes(stickerId)) g.stickers.push(stickerId);
      g.lastPlayedAt = new Date().toISOString();
      write(s);
    },

    played(slug) {
      const s = read();
      const g = getGameMut(s, slug);
      g.lastPlayedAt = new Date().toISOString();
      write(s);
    },

    recordSession(slug, level, stats) {
      stats = stats || {};
      const s = read();
      const g = getGameMut(s, slug);
      const lv = getLevelMut(g, level);
      if (typeof stats.questionsAnswered === 'number') {
        lv.questionsAnswered += stats.questionsAnswered;
      }
      if (typeof stats.accuracy === 'number') {
        lv.accuracy = stats.accuracy;
      }
      if (typeof stats.bestStreak === 'number' && stats.bestStreak > g.bestStreak) {
        g.bestStreak = stats.bestStreak;
      }
      g.lastPlayedAt = new Date().toISOString();
      write(s);
    },

    reset(slug) {
      if (slug) {
        const s = read();
        delete s.games[slug];
        write(s);
      } else {
        localStorage.removeItem(KEY);
        listeners.forEach((fn) => { try { fn(defaultState()); } catch (e) { console.error(e); } });
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  window.KLS = window.KLS || {};
  window.KLS.progress = api;
})();
