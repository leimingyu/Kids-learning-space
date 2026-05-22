# Architecture

Kids Learning Space is a static, no-build game hub that embeds four independent
vanilla-JS learning games. The hub adds shared chrome (back button, profile,
totals) and a unified progress layer on top of games that otherwise know
nothing about each other.

## Layout

```
/
├── index.html                          # hub landing + game embed shell
├── ARCHITECTURE.md
├── README.md
├── shared/
│   ├── styles/
│   │   ├── tokens.css                  # design tokens (colors, spacing, radii)
│   │   └── components.css              # hub + chrome component CSS
│   ├── scripts/
│   │   ├── util.js                     # qs/el/formatRelative helpers
│   │   ├── progress.js                 # localStorage-backed progress API
│   │   ├── chrome.js                   # parent-rendered chrome bar
│   │   └── hub.js                      # hash router + tile rendering
│   └── assets/                         # mascot, icons (placeholder)
└── games/
    ├── word-problem-adventure/
    │   ├── index.html
    │   └── tools/                      # python question-bank generators
    ├── cosmic-math-quest/
    │   ├── index.html
    │   ├── learningIntelligence.js
    │   ├── tests/
    │   └── docs/
    ├── lets-learn-fractions/
    │   └── index.html
    └── long-division-coach/
        ├── index.html
        ├── script.js
        ├── style.css
        └── docs/
```

Each `games/<slug>/index.html` is the original game, byte-for-byte (modulo
filename — three were renamed to `index.html` so iframe URLs are clean).
The slug is the canonical ID used in the URL and progress schema.

## Decisions

### 1. Embedding — iframe

Games are loaded into an `<iframe>`, not composed into the hub's DOM.

All four games define overlapping global CSS classes (`.btn`, `.card`,
`.screen`, `.subtitle`) and global JS state. An iframe gives free CSS
isolation, free JS isolation, free crash isolation, and zero-refactor
integration. The cost is `postMessage` for any hub↔game communication —
a small surface that v1 doesn't even need.

### 2. Back-to-hub — parent-rendered chrome

The chrome bar (back button, profile, total stars/stickers) is rendered by the
hub document *above* the iframe. Games are not modified. Games can opt into
richer integration later via postMessage; it is not required.

A consequence: when a game is opened directly (e.g. `games/cosmic-math-quest/`
from the file system, bypassing the hub), it works exactly as before. The
hub is additive.

### 3. Progress — single versioned blob in localStorage

Storage key: `kls.progress.v1`. The hub owns this key. Games' own internal
localStorage (`cosmicMathQuest_v1`, `cosmicMathQuest_wrongs_v1`, the
word-problem best-streak key) is left untouched.

#### Schema

```json
{
  "version": 1,
  "profile": {
    "displayName": "Friend",
    "avatar": "🦊",
    "createdAt": "ISO-8601"
  },
  "games": {
    "<slug>": {
      "lastPlayedAt": "ISO-8601 | null",
      "bestStreak": 0,
      "stickers": ["sticker-id", ...],
      "levels": {
        "<level>": { "stars": 0, "questionsAnswered": 0, "accuracy": 0 }
      }
    }
  }
}
```

Invariants:

- `stars` per level is **0–3** (canonical star rating).
- `stickers` is an array of stable string IDs; deduplicated on write.
- Totals (`totalStars`, `totalStickers`) are **derived on read**, never stored.

#### API (`window.KLS.progress`)

| Method | Behavior |
|---|---|
| `get()` | Full snapshot `{ ...state, totals }` |
| `getGame(slug)` | Per-game snapshot (default-shaped if absent) |
| `setProfile(patch)` | Shallow merge into profile |
| `awardStars(slug, level, stars)` | Idempotent; keeps the max |
| `awardSticker(slug, stickerId)` | Idempotent; dedupes |
| `recordSession(slug, level, stats)` | Updates accuracy/streak/lastPlayedAt |
| `reset(slug?)` | Clears one game or all |
| `subscribe(fn)` | Fires on writes (for live chrome updates) |

#### postMessage contract (optional, per game)

Games opt in by posting to `window.parent`:

```json
{ "type": "kls:progress", "event": "awardStars",   "slug": "...", "level": "...", "stars": 3 }
{ "type": "kls:progress", "event": "awardSticker", "slug": "...", "stickerId": "..." }
{ "type": "kls:progress", "event": "session",      "slug": "...", "level": "...", "stats": {...} }
```

The parent validates the message's `slug` against the iframe's `src` before
applying — one game cannot write to another's record.

### 4. Routing — hash-based

```
index.html                                  → hub
index.html#/games/<slug>                    → embedded game
```

Hash routing was chosen because the project is meant to run on `file://`
and from any plain static host (Python `http.server`, GitHub Pages,
Netlify drop-in). History API would require a server-side `*` →
`index.html` rewrite and break `file://` opens entirely.

## Adding a new game

1. Drop it into `games/<new-slug>/index.html`.
2. Add an entry to the `GAMES` registry in `shared/scripts/hub.js`.
3. Done. Progress integration is optional and additive.

## Migrated from previous layout

| Old path | New path |
|---|---|
| `01-word_problems/word_problem/word_problem_adventure.html` | `games/word-problem-adventure/index.html` |
| `01-word_problems/word_problem/*.py` | `games/word-problem-adventure/tools/` |
| `02-multiply_divide/mul_divide/index.html` | `games/cosmic-math-quest/index.html` |
| `02-multiply_divide/mul_divide/learningIntelligence.js` | `games/cosmic-math-quest/learningIntelligence.js` |
| `02-multiply_divide/mul_divide/tests/` | `games/cosmic-math-quest/tests/` |
| `02-multiply_divide/mul_divide/0*_*.md` | `games/cosmic-math-quest/docs/` |
| `03-fraction-game/faction_game/fraction_game.html` | `games/lets-learn-fractions/index.html` |
| `04-long-division/long-division-kids-web/{index.html,script.js,style.css}` | `games/long-division-coach/` |
| `04-long-division/long-division-kids-web/*.md` | `games/long-division-coach/docs/` |

Also dropped: `01-word_problems/word_problem/__pycache__/` (regenerates on
demand; should be gitignored).

## Backup & Restore

Progress lives in `localStorage`, which is fragile (cleared site data, new
device, breaking schema change all wipe it). A manual Export-to-JSON /
Import-from-JSON flow on the Parent page gives parents a safety net to take
a snapshot before app updates and restore it afterwards. Restore is
REPLACE-only (the backup wins; the device is wiped first). The format is
versioned independently of the hub schema and treats each game's payload as
an opaque string. See `BACKUP_RESTORE.md` for the full design spec.

## Out of scope (this phase)

- Multi-theme system (only one theme today)
- Audio framework
- Profile editor UI
- Wiring any existing game into the postMessage contract — each game has its
  own PRD/QA docs that must be respected before touching its internals
- Cloud sync for backups (manual export/import file only; see `BACKUP_RESTORE.md`)
