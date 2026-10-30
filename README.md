# Kids Learning Space

A static, no-build, no-framework, `file://`-friendly hub of four math learning
games for kids in grades 2–5. Pure vanilla HTML / CSS / JS — no npm, no
bundler, no server required. **Fully self-contained and offline** — fonts are
bundled, and nothing is fetched from the network at runtime. Runs the same on
macOS and Windows.

> Pip the Fox 🦊 hosts the hub. Tiles show each game with a topic tag, stars
> earned, and last-played time. Click in, play, win — confetti, and "Played
> just now" appears back on the hub when you return.

## Games

| | Game | Topic | Audience |
|---|---|---|---|
| 📚 | **Word Problem Adventure** | 400 reasoning stories, 100 per grade; ten kingdoms with visible progress, stars, and badges | grades 2–5 |
| 🚀 | **Cosmic Math Quest**       | Multiplication & division mastery missions     | ages 8–10  |
| 🍕 | **Let's Learn Fractions!**  | Fractions and equivalence                       | grades 2–4 |
| ➗ | **Long Division Coach**     | Animated sharing → coached equations → solo practice | grades 3–5 |

## Run

Word Problem Adventure now opens with a grade chooser and twenty five-story
quests per grade. Children earn quest stars and badges at 5, 10, 25, 50, 75,
and 100 independent solves. Hints, worked solutions, saved sessions, and a
tricky-story practice queue support learning at the child's own pace.
Earlier adventures remain under **Grown-up notes & more adventures**.
Every profile opens the current ten-kingdom interface. Older saved sessions
remain available through **Continue earlier adventure**, with progress kept.
See the [feature and verification record](games/word-problem-adventure/docs/GRADE_ADVENTURE_RELEASE.md).

**Recommended: double-click “Play Kids Learning Space”** (`.bat` on Windows,
`.command` on macOS). It starts a local server with Python 3, then opens the
app in your browser. Keep its window open while playing. Progress saves in
the browser, and backups are written automatically into this app's
`saved_status/` folder. There is no Save button to remember.

Opening the launcher again reuses the same folder's running server. It opens
the browser after binding the port, avoiding a browser/server startup race.
If a different app is using port 8000, close that app and launch again.

You can also start the same server yourself:

```bash
python3 tools/kls_server.py 8000 --open
```

**Without Python:** double-click `index.html`. The games still work offline
and progress saves in that browser. On the Parent page, use **Backup settings
→ Download backup** to keep a separate file. Chrome and Edge can also choose
a backup folder there. Browser backup history depends on IndexedDB support;
Firefox and Safari may not offer that history when opening a file directly.
A regular `python3 -m http.server` serves the site but does not write backups.

Requires Chrome 111+, Safari 15.4+, or Firefox 113+.

### Save and restore

- **Play normally.** Folder backups run after changes, with up to three
  minutes between writes. Browser snapshots are kept after about ten seconds
  without another change. The Parent page shows browser saving and the last
  confirmed folder backup separately.
- **Restore:** Parent page → **Restore progress** → review the latest backup
  (or expand **Earlier backups**) → **Replace all profiles and progress**.
  Browser history and launcher folder backups appear together. **Choose a
  backup file…** accepts previously downloaded JSON backups.
- **Undo:** a completed restore offers **Undo restore** on the Parent page.
  Validation, a mandatory safety copy, rollback, and interrupted-restore
  recovery protect the replacement. Restoring replaces every profile and
  registered game's progress; it does not merge profiles.
- **Move computers:** use **Backup settings → Download backup**, move the
  downloaded file, and choose it in **Restore progress** on the other computer (or choose **Already played? Restore a backup…**
  during first-time setup).
  Old backup files remain compatible; the backup format is still v1.

If browser profiles are missing but backups exist, startup offers to restore
before creating new profiles or starting automatic backups. **Start fresh →
Create new profiles** explicitly continues without restoring. Your existing
backup files remain available (normal retention keeps the newest 30).
Opening via `file://` and via the launcher uses separate browser storage;
use a downloaded backup to move progress between them. The launcher cannot
silently access another browser or origin's progress.

For confirmed in-game session saves, see the
[save reliability record](docs/SAVE_RELIABILITY_RELEASE.md).

## What's where

```
/
├── index.html              Hub landing + iframe stage
├── design-system.html      Living component documentation
├── Play Kids Learning Space.command   Double-click to play + save to this folder (macOS)
├── Play Kids Learning Space.bat       Double-click to play + save to this folder (Windows)
├── README.md
├── ARCHITECTURE.md         Decisions: iframe, chrome, progress, routing
├── shared/
│   ├── fonts/              Bundled Fredoka + Nunito woff2 (OFL) — self-hosted
│   ├── styles/
│   │   ├── fonts.css       @font-face for the bundled fonts (no CDN)
│   │   ├── tokens.css      OKLCH palette, spacing, type, motion, dark mode
│   │   └── components.css  Buttons, tiles, chrome, modal, toast, progress
│   ├── scripts/
│   │   ├── util.js         qs/el helpers
│   │   ├── progress.js     localStorage progress API (kls.progress.v1)
│   │   ├── chrome.js       Parent-rendered top bar
│   │   ├── hub.js          Hash router, tile grid, topic filter
│   │   ├── audio.js        Web Audio SFX (click/success/fail/level-complete)
│   │   ├── celebrate.js    Custom particle confetti
│   │   └── game-bridge.js  Loaded by each game; posts progress events
│   └── assets/
│       └── mascot.svg      Pip the Fox (curious / cheering / thinking / sleeping)
└── games/
    ├── word-problem-adventure/
    ├── cosmic-math-quest/
    ├── lets-learn-fractions/
    └── long-division-coach/
```

## How it works

The hub is one HTML page. Clicking a tile sets `location.hash =
'#/games/<slug>'`; `hub.js` parses the hash and points an `<iframe>` at
`games/<slug>/index.html`. A persistent **chrome bar** at the top renders the
back button, profile, and total stars/stickers — it lives in the parent
document, above the iframe, so games stay byte-for-byte unchanged.

Each game optionally loads a thin `game-bridge.js` that detects the embedded
context and `postMessage`s progress events (`played`, `session`, `awardStars`,
`awardSticker`, `celebrate`) up to the hub. The hub validates the event's
implied slug against the iframe `src` before applying it, so one game can
never write into another's record.

```
┌──────────────────────────────────────────────────────────┐
│ index.html (hub document)                                │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ chrome bar      ← Hub   🦊 Friend   ⭐ 12   🏆 3     │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │                                                      │ │
│ │   iframe src=games/<slug>/                           │ │
│ │   ──────────────────────────────                     │ │
│ │   game-bridge.js posts                               │ │
│ │     {type:'kls:progress', event:'played'}    ────────┼─┼─▶ progress.played(slug)
│ │     {type:'kls:progress', event:'celebrate'} ────────┼─┼─▶ celebrate.fire()
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                                                ▲
                            localStorage: kls.progress.v1
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full decision record.

## Add a new game in 5 steps

1. **Drop it in.** Put your game at `games/<your-slug>/index.html`. It can be
   a single self-contained HTML or HTML + CSS + JS — your call. Slugs are
   `kebab-case` and are the canonical ID in URLs and progress storage.

2. **Register it** in `shared/scripts/hub.js`:
   ```js
   {
     slug: 'your-slug',
     title: 'Your Game Title',
     emoji: '🎯',
     subtitle: 'One short line.',
     topics: ['mul-div'],            // matches a filter chip
     tag: 'Mult & Div',
     tagClass: 'tile__tag--math',    // math / reading / logic / memory
   }
   ```

3. **(Optional) Pick up shared tokens** in your game's `<head>`:
   ```html
   <link rel="stylesheet" href="../../shared/styles/tokens.css">
   ```
   Variables like `--kls-primary` are now available; your CSS can use them.

4. **(Optional) Wire progress** before `</body>`:
   ```html
   <script src="../../shared/scripts/game-bridge.js"></script>
   <script>
     if (window.KLS && window.KLS.bridge) {
       window.KLS.bridge.onVisible('#your-end-screen', function () {
         window.KLS.bridge.played();
         window.KLS.bridge.celebrate();
       });
     }
   </script>
   ```
   Use whatever selector matches your end-of-session screen — class toggle
   (`#x.active`) or `hidden` attribute both work; `onVisible` detects either.

5. **Reload the hub.** Your tile shows up; click it; play; finish; back; "Played
   just now" appears. Done.

## Design system

`design-system.html` is a living reference for every token and component
(palette, type, spacing, radii, shadows, motion, buttons, tiles, modal, toast,
celebration, mascot, audio). Open it anytime you're styling something new.

## Progress data

Stored at `localStorage["kls.progress.v1"]`:

```json
{
  "version": 1,
  "profile": { "displayName": "Friend", "avatar": "🦊", "createdAt": "..." },
  "games": {
    "<slug>": {
      "lastPlayedAt": "ISO-8601",
      "bestStreak": 0,
      "stickers": ["sticker-id"],
      "levels": { "<level>": { "stars": 0, "questionsAnswered": 0, "accuracy": 0 } }
    }
  }
}
```

Per-game internal storage (e.g. `cosmicMathQuest_v1`, `cosmicMathQuest_wrongs_v1`)
is left untouched — the hub keeps its own summary layer.

## Saving / loading accounts

Open the **Parent page** for **Restore progress** and **Backup settings**.
All backups include every profile, journey, and registered mistakes store.
See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for the file format and recovery
rules, and the save-and-restore walkthrough above for everyday use.

## Accessibility

- Tiles, filter chips, and chrome buttons are real `<a>` / `<button>` elements
  and tab-navigable in source order.
- `:focus-visible` rings throughout (sunshine yellow on focus).
- ARIA labels on the mascot, back button, filter group, and star meters.
- All hover-styling is for enhancement; nothing is gated by hover.
- `prefers-reduced-motion` collapses motion durations and replaces confetti
  with a brief sunshine flash.
- `prefers-color-scheme: dark` flips the palette via token overrides.

## Browser support

Hub + design system: Chrome 111+, Safari 15.4+, Firefox 113+. The games
themselves are vanilla HTML/CSS/JS and run further back than that.
# Kids-learning-space
