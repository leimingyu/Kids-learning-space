/*
 * Kids Learning Space — progress + profile store.
 *
 * Storage key: `kls.progress.v2` (multi-profile). The legacy `kls.progress.v1`
 * key is one-time migrated and left in place as a backup; the v2 store wins
 * thereafter. All times are ISO-8601 strings.
 *
 * Schema:
 *   {
 *     version: 2,
 *     activeProfileId: "p_xxx" | null,
 *     profiles: {
 *       "p_xxx": {
 *         id, displayName, avatar, createdAt, lastActiveAt,
 *         games: {
 *           "<slug>": {
 *             lastPlayedAt, bestStreak,
 *             stickers: [...],
 *             levels: { "<level>": { stars, questionsAnswered, accuracy } },
 *             gameState: any | null            // opaque per-game blob
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * Migrations are versioned and idempotent (see `MIGRATIONS`). When you bump
 * the schema, add a new migrator that takes state at version N and returns
 * state at version N+1. The loader runs them in order.
 */
(function () {
  const KEY = 'kls.progress.v2';
  const LEGACY_V1_KEY = 'kls.progress.v1';
  const CURRENT_VERSION = 2;
  const MAX_PROFILES = 6;

  // ────────────────────────────────────────────────────────────────────────
  // Schema defaults
  // ────────────────────────────────────────────────────────────────────────
  const defaultState = () => ({
    version: CURRENT_VERSION,
    activeProfileId: null,
    profiles: {},
  });

  const defaultProfile = (id, name, avatar) => ({
    id,
    displayName: name || 'Friend',
    avatar: avatar || '🦊',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    games: {},
  });

  const defaultGame = () => ({
    lastPlayedAt: null,
    bestStreak: 0,
    stickers: [],
    levels: {},
    gameState: null,
  });

  const defaultLevel = () => ({
    stars: 0,
    questionsAnswered: 0,
    accuracy: 0,
  });

  // ────────────────────────────────────────────────────────────────────────
  // Migrations: keyed by source version. Each returns state at version+1.
  // Add migrators here; the loader runs them in order until CURRENT_VERSION.
  // ────────────────────────────────────────────────────────────────────────
  const MIGRATIONS = {
    // v1 → v2: wrap the single profile as profiles["p_legacy"].
    1: function (v1) {
      const id = 'p_legacy';
      const p = defaultProfile(
        id,
        (v1.profile && v1.profile.displayName) || 'Friend',
        (v1.profile && v1.profile.avatar) || '🦊'
      );
      p.createdAt = (v1.profile && v1.profile.createdAt) || p.createdAt;
      p.games = v1.games || {};
      // Pre-existing per-game state has no gameState field yet — fill it.
      for (const slug of Object.keys(p.games)) {
        if (!('gameState' in p.games[slug])) p.games[slug].gameState = null;
      }
      return {
        version: 2,
        activeProfileId: id,
        profiles: { [id]: p },
      };
    },
  };

  function runMigrations(state) {
    let s = state;
    while (s && typeof s.version === 'number' && s.version < CURRENT_VERSION) {
      const fn = MIGRATIONS[s.version];
      if (!fn) {
        console.warn('[KLS] no migration from version', s.version, '— using defaults');
        return defaultState();
      }
      s = fn(s);
    }
    return s;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Read / write
  // ────────────────────────────────────────────────────────────────────────
  const listeners = new Set();

  function readRaw() {
    // Prefer v2.
    let raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === CURRENT_VERSION) return parsed;
        if (parsed && parsed.version < CURRENT_VERSION) return runMigrations(parsed);
      } catch (e) {
        console.warn('[KLS] v2 parse failed', e);
      }
    }
    // No v2 — try migrating v1.
    let v1raw;
    try { v1raw = localStorage.getItem(LEGACY_V1_KEY); } catch (e) { /* ignore */ }
    if (v1raw) {
      try {
        const v1 = JSON.parse(v1raw);
        if (v1 && v1.version === 1) {
          const migrated = runMigrations(v1);
          // Persist v2 immediately (leave v1 untouched as backup).
          try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch (e) { /* ignore */ }
          return migrated;
        }
      } catch (e) {
        console.warn('[KLS] v1 parse failed', e);
      }
    }
    return defaultState();
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

  function genProfileId() {
    return 'p_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internal mutators (all operate on the active profile by default)
  // ────────────────────────────────────────────────────────────────────────
  function activeProfileMut(state) {
    const id = state.activeProfileId;
    if (id && state.profiles[id]) return state.profiles[id];
    return null;
  }

  function getGameMut(profile, slug) {
    if (!profile.games[slug]) profile.games[slug] = defaultGame();
    if (!('gameState' in profile.games[slug])) profile.games[slug].gameState = null;
    return profile.games[slug];
  }

  function getLevelMut(game, level) {
    if (!game.levels[level]) game.levels[level] = defaultLevel();
    return game.levels[level];
  }

  function totals(profile) {
    if (!profile) return { stars: 0, stickers: 0 };
    let stars = 0;
    let stickers = 0;
    for (const g of Object.values(profile.games || {})) {
      stickers += (g.stickers || []).length;
      for (const lv of Object.values(g.levels || {})) {
        stars += lv.stars || 0;
      }
    }
    return { stars, stickers };
  }

  function safeAvatar(s) {
    s = String(s || '').trim();
    if (!s) return '🦊';
    // Keep it small — first 4 code units (one emoji can be 1–2 code units).
    return s.slice(0, 4);
  }

  function safeName(s) {
    s = String(s || '').trim();
    if (!s) return 'Friend';
    return s.slice(0, 16);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────
  const api = {
    /** Full snapshot: { version, activeProfileId, profiles, profile, totals }. */
    get() {
      const s = readRaw();
      const profile = activeProfileMut(s) || null;
      return Object.assign({}, s, { profile, totals: totals(profile) });
    },

    /** List all profiles, most-recently-active first. */
    listProfiles() {
      const s = readRaw();
      return Object.values(s.profiles).sort(function (a, b) {
        return (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '');
      });
    },

    /** True if a profile is selected as active. */
    hasActiveProfile() {
      const s = readRaw();
      return !!(s.activeProfileId && s.profiles[s.activeProfileId]);
    },

    /** Create a new profile and (optionally) make it active. Returns the new profile. */
    createProfile(input, makeActive) {
      const s = readRaw();
      if (Object.keys(s.profiles).length >= MAX_PROFILES) {
        throw new Error('Profile limit reached (' + MAX_PROFILES + ').');
      }
      input = input || {};
      const id = genProfileId();
      const profile = defaultProfile(id, safeName(input.displayName), safeAvatar(input.avatar));
      s.profiles[id] = profile;
      if (makeActive !== false) s.activeProfileId = id;
      write(s);
      return profile;
    },

    setActiveProfile(id) {
      const s = readRaw();
      if (!s.profiles[id]) return false;
      s.activeProfileId = id;
      s.profiles[id].lastActiveAt = new Date().toISOString();
      write(s);
      return true;
    },

    updateProfile(id, patch) {
      const s = readRaw();
      const p = s.profiles[id];
      if (!p) return false;
      if (patch.displayName != null) p.displayName = safeName(patch.displayName);
      if (patch.avatar != null) p.avatar = safeAvatar(patch.avatar);
      write(s);
      return true;
    },

    deleteProfile(id) {
      const s = readRaw();
      if (!s.profiles[id]) return false;
      delete s.profiles[id];
      if (s.activeProfileId === id) {
        const remaining = Object.keys(s.profiles);
        s.activeProfileId = remaining[0] || null;
      }
      write(s);
      return true;
    },

    /** Active profile's view of a game, default-shaped if absent. */
    getGame(slug) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return defaultGame();
      return Object.assign(defaultGame(), p.games[slug] || {});
    },

    /** Backward-compat alias kept from v1 API. */
    setProfile(patch) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      if (patch.displayName != null) p.displayName = safeName(patch.displayName);
      if (patch.avatar != null) p.avatar = safeAvatar(patch.avatar);
      write(s);
    },

    awardStars(slug, level, stars) {
      const n = Math.max(0, Math.min(3, Number(stars) | 0));
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = getGameMut(p, slug);
      const lv = getLevelMut(g, level);
      if (n > lv.stars) lv.stars = n;
      g.lastPlayedAt = new Date().toISOString();
      p.lastActiveAt = g.lastPlayedAt;
      write(s);
    },

    awardSticker(slug, stickerId) {
      if (!stickerId) return;
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = getGameMut(p, slug);
      if (!g.stickers.includes(stickerId)) g.stickers.push(stickerId);
      g.lastPlayedAt = new Date().toISOString();
      p.lastActiveAt = g.lastPlayedAt;
      write(s);
    },

    played(slug) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = getGameMut(p, slug);
      g.lastPlayedAt = new Date().toISOString();
      p.lastActiveAt = g.lastPlayedAt;
      write(s);
    },

    recordSession(slug, level, stats) {
      stats = stats || {};
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = getGameMut(p, slug);
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
      p.lastActiveAt = g.lastPlayedAt;
      write(s);
    },

    /** Opaque per-game state. The shape is whatever the game wants. */
    saveGameState(slug, blob) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = getGameMut(p, slug);
      g.gameState = blob == null ? null : blob;
      g.lastPlayedAt = new Date().toISOString();
      p.lastActiveAt = g.lastPlayedAt;
      write(s);
    },

    getGameState(slug) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return null;
      const g = p.games[slug];
      return g ? g.gameState : null;
    },

    clearGameState(slug) {
      const s = readRaw();
      const p = activeProfileMut(s);
      if (!p) return;
      const g = p.games[slug];
      if (g) { g.gameState = null; write(s); }
    },

    /** Reset one game for the active profile, or all data when slug is omitted. */
    reset(slug) {
      const s = readRaw();
      if (slug) {
        const p = activeProfileMut(s);
        if (!p) return;
        delete p.games[slug];
        write(s);
      } else {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        try { localStorage.removeItem(LEGACY_V1_KEY); } catch (e) { /* ignore */ }
        const fresh = defaultState();
        listeners.forEach((fn) => { try { fn(fresh); } catch (e) { console.error(e); } });
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ──────────────────────────────────────────────────────────────────────
    // Export / Import (one of the killer features of a no-backend design)
    // ──────────────────────────────────────────────────────────────────────

    /** Export one profile (default: active) as a self-contained JSON blob. */
    exportProfile(id) {
      const s = readRaw();
      const profile = id ? s.profiles[id] : activeProfileMut(s);
      if (!profile) return null;
      return {
        kls: 'profile',
        version: CURRENT_VERSION,
        exportedAt: new Date().toISOString(),
        profile: JSON.parse(JSON.stringify(profile)),
      };
    },

    /** Export everything (all profiles + active id) as a JSON blob. */
    exportAll() {
      const s = readRaw();
      return {
        kls: 'profiles',
        version: CURRENT_VERSION,
        exportedAt: new Date().toISOString(),
        activeProfileId: s.activeProfileId,
        profiles: JSON.parse(JSON.stringify(s.profiles)),
      };
    },

    /**
     * Import a JSON blob (one profile OR a full export). Returns {imported, skipped}.
     * mode = 'merge' (default): add as new profile(s), regenerate ids on collision.
     * mode = 'replace': wipe all existing profiles and adopt the import.
     */
    importJSON(blob, mode) {
      mode = mode || 'merge';
      if (!blob || typeof blob !== 'object') throw new Error('Bad import blob');
      if (blob.version && blob.version > CURRENT_VERSION) {
        throw new Error('Import is from a newer version (' + blob.version + ').');
      }

      let incoming = [];
      if (blob.kls === 'profile' && blob.profile) {
        incoming = [blob.profile];
      } else if (blob.kls === 'profiles' && blob.profiles) {
        incoming = Object.values(blob.profiles);
      } else {
        throw new Error('Unrecognized KLS export shape');
      }

      let s = mode === 'replace' ? defaultState() : readRaw();

      let imported = 0;
      let skipped = 0;
      incoming.forEach(function (p) {
        if (!p || !p.displayName) { skipped++; return; }
        let id = p.id || genProfileId();
        if (s.profiles[id]) id = genProfileId(); // avoid collision
        const merged = Object.assign(defaultProfile(id, p.displayName, p.avatar), p, { id });
        merged.games = merged.games || {};
        for (const slug of Object.keys(merged.games)) {
          if (!('gameState' in merged.games[slug])) merged.games[slug].gameState = null;
        }
        // Capacity check.
        if (Object.keys(s.profiles).length >= MAX_PROFILES) { skipped++; return; }
        s.profiles[id] = merged;
        imported++;
      });

      if (mode === 'replace' && blob.kls === 'profiles' && blob.activeProfileId && s.profiles[blob.activeProfileId]) {
        s.activeProfileId = blob.activeProfileId;
      } else if (!s.activeProfileId) {
        const firstId = Object.keys(s.profiles)[0];
        if (firstId) s.activeProfileId = firstId;
      }
      write(s);
      return { imported, skipped };
    },

    /** Constant for UI to render. */
    MAX_PROFILES,
    CURRENT_VERSION,
  };

  window.KLS = window.KLS || {};
  window.KLS.progress = api;
})();
