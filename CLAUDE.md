# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Static, no-build, no-framework, `file://`-friendly site. Pure vanilla HTML/CSS/JS — no npm, no bundler, no server required. Browser baseline: Chrome 111+, Safari 15.4+, Firefox 113+ (`oklch()` + `:focus-visible`).

## Commands

Run locally (either works):
```bash
# Just open the file
open index.html

# Or serve over HTTP
python3 -m http.server 8000
# → http://localhost:8000
```

Smoke test for the Cosmic Math Quest learning-intelligence module:
```bash
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
```
(This is the only test in the repo. It `eval`s `learningIntelligence.js` into a faked `window` and asserts on fact-family / weak-family aggregation.)

Regenerate Word Problem Adventure question banks (Python, patches the HTML in place):
```bash
python3 games/word-problem-adventure/tools/gen_banks.py
python3 games/word-problem-adventure/tools/gen_extended_banks.py
python3 games/word-problem-adventure/tools/validate_banks.py
```

## Architecture (the load-bearing parts)

The hub is **one** HTML page (`index.html`). It loads each game in an `<iframe>` and renders a "chrome bar" (back button, profile, total stars/stickers) above it. Routing is hash-based: `#/games/<slug>` → iframe `src=games/<slug>/index.html`. Hash routing is deliberate so `file://` and any static host work without rewrites.

Why iframe (not DOM composition): the four games define overlapping global CSS (`.btn`, `.card`, `.screen`) and global JS state. Iframe gives free CSS/JS/crash isolation and zero-refactor integration. Cost is `postMessage` for hub↔game traffic.

Each game is the **original game, byte-for-byte** (modulo filename — three were renamed to `index.html` for clean iframe URLs). Each `games/<slug>/index.html` must remain self-contained: opening it directly (bypassing the hub) must still work.

### Progress data flow

The hub owns a multi-profile localStorage blob: `kls.progress.v2` (migrated from the legacy `kls.progress.v1`). It holds every profile's stars/stickers/levels per game. Games keep their own internal localStorage for things the hub doesn't track (e.g. journey state, recent-question history, practice wrongs) — leave it untouched; the hub's key is a separate summary layer.

```
game (iframe)  ──postMessage──▶  chrome.js  ──▶  progress.js  ──▶  localStorage
                                     │
                                     └─validates message.slug against iframe src
                                       before applying (prevents cross-game writes)
```

Games opt into the hub via `shared/scripts/game-bridge.js`. Loaded standalone, every bridge method is a no-op so the game still works. Loaded in the iframe, the bridge adds `body.kls-embedded` and exposes `window.KLS.bridge.{played, session, stars, sticker, celebrate, saveState, clearState, resetProgress, onVisible, onHubMessage, getProfileId, onProfileReady}`. All four games currently load it.

### Per-profile state — the load-bearing rule

**Every new profile starts at zero.** No stars, no stickers, no journey progress, no saved wrong-questions list — nothing. Creating a profile in the hub must give the kid a clean slate in every game. This is not negotiable; do not write code that lets one profile inherit another's progress.

To make that true, **a game's own localStorage MUST be scoped by the active hub profile id**. The pattern is:

1. The hub sends the iframe a `{ type: 'kls:hub', event: 'setProfile', profileId }` message right after the iframe loads (chrome.js `pushProfileToIframe`, retried up to ~1.5s so it survives a slow first paint).
2. The bridge caches it. Games read it synchronously via `KLS.bridge.getProfileId()` and prefix their keys: e.g. `wordProblemAdventure_v1__<profileId>`.
3. Standalone (no hub) → `getProfileId()` returns null → game falls back to its un-scoped key so direct-file:// play still works.
4. **Device-level preferences** (mute, volume, theme) are NOT per-profile — keep those un-scoped.
5. **Do NOT auto-migrate un-scoped legacy data into any profile.** It looks helpful and is not — it gives whichever profile first opens the game an unfair head start. If users had pre-multi-profile data, they can keep using standalone mode for it, or replay. Future "import legacy" can be an explicit opt-in button if anyone asks for it; never silent.

A "Reset my progress" affordance is owed to every kid on every game that stores progress. The game wipes its own profile-scoped key AND posts `bridge.resetProgress()` so the hub also drops its per-game record (stars/stickers/levels) for the active profile. Other profiles are untouched.

### Backup & Restore — the safety net for updates

Before changing anything that could invalidate stored data (schema version bump, slug rename, removal of a game, breaking change to a profile-scoped key), the previous version must still be able to **Export** every profile + all progress to a JSON file, and a future version must still be able to **Import** that file. See `BACKUP_RESTORE.md` for the full spec: envelope format, REPLACE-only restore semantics, the registered-`storageBase` discovery pattern, and the versioning rule (bump `BACKUP_VERSION` only when the envelope shape changes — never when an individual game's internal schema changes).

When adding or modifying a game that uses profile-scoped storage, register its `storageBase` in the `GAMES` entry in `hub.js` so the backup module can discover its keys without hard-coding them.

### Module map (shared/)

- `scripts/util.js` — `qs`/`el`/`formatRelative`. Loaded first; everything attaches to `window.KLS`.
- `scripts/progress.js` — the `window.KLS.progress` API (read/write of `kls.progress.v1`, derived totals, subscribe-on-write).
- `scripts/chrome.js` — parent-rendered chrome bar; owns the postMessage listener and slug validation.
- `scripts/hub.js` — `GAMES` registry, `TOPICS` filter, hash router, tile rendering.
- `scripts/celebrate.js`, `scripts/audio.js` — confetti particles and Web Audio SFX (reduced-motion aware).
- `scripts/game-bridge.js` — loaded **by each game**, not by the hub. Never reaches into hub internals; only posts messages.
- `styles/tokens.css`, `styles/components.css` — design tokens (OKLCH palette, spacing, motion, dark-mode overrides) and component CSS. `design-system.html` is a living reference page for these.

## Invariants and gotchas

- **Stars per level are clamped 0–3** in `progress.awardStars`. Totals (`totalStars`, `totalStickers`) are **derived on read**, never stored.
- **Stickers are deduped** by stable string ID on write.
- The iframe `src` is always built as `games/<slug>/index.html` (not the bare directory) — `file://` has no directory-index resolution.
- `chrome.js` validates incoming `kls:progress` messages by matching `data.slug` against the slug parsed from the iframe `src`. Don't bypass this check.
- The hub is **additive**: a game opened directly from `games/<slug>/index.html` must still work unchanged. Never make the hub a hard dependency of a game.
- Slugs are `kebab-case` and are the canonical ID in both URLs and the progress schema. Changing a slug invalidates a user's saved progress for that game.
- Each game under `games/` has its own `docs/` directory with PRD/QA/review docs. **Respect those before touching a game's internals** — the games predate the hub and have their own design intent.
- `prefers-reduced-motion` and `prefers-color-scheme: dark` are honored via token overrides and celebrate.js — preserve those paths when changing motion/visuals.

## Adding a new game

1. Drop into `games/<new-slug>/index.html` (self-contained).
2. Add an entry to the `GAMES` array in `shared/scripts/hub.js` (slug, title, emoji, subtitle, topics, tag, tagClass).
3. Optional: `<link>` `shared/styles/tokens.css` and `<script src="../../shared/scripts/game-bridge.js">` to wire progress. Hook `KLS.bridge.onVisible('#end-screen', () => { KLS.bridge.played(); KLS.bridge.celebrate(); })`.
4. **If your game persists state**, scope its localStorage by `KLS.bridge.getProfileId()` so each profile starts clean — see "Per-profile state" above. Add a visible "Reset my progress" affordance.

If you add a new topic, also add it to the `TOPICS` filter array in `hub.js`.

## Further reading

- `README.md` — user-facing intro and the 5-step "add a game" recipe.
- `ARCHITECTURE.md` — full decision record (iframe choice, chrome strategy, progress schema, postMessage contract, routing rationale).
- `design-system.html` — open in a browser; living reference for every token and component.
