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
| 📚 | **Word Problem Adventure** | Addition / subtraction / multi-step word stories | grades 2–3 |
| 🚀 | **Cosmic Math Quest**       | Multiplication & division mastery missions     | ages 8–10  |
| 🍕 | **Let's Learn Fractions!**  | Fractions and equivalence                       | grades 2–4 |
| ➗ | **Long Division Coach**     | Step-by-step long division                      | grades 3–5 |

## Run

Pick whichever is easiest — no install, works offline:

- **Double-click `index.html`** to just play. Saves become a download (see below).
- **Double-click `Play Kids Learning Space`** (`.command` on macOS, `.bat` on
  Windows) to play **with saves written into this folder** — it starts a tiny
  local server (needs Python 3) and opens the game. This is the way to get a real
  `saved_status/` folder next to the game.
- **Serve locally** yourself (equivalent to the launcher):

  ```bash
  python3 tools/kls_server.py 8000
  # open http://localhost:8000
  ```

That's it. Requires a modern browser (Chrome 111+, Safari 15.4+, Firefox 113+)
because tokens use `oklch()` and components use `:focus-visible`.

### A note on backups when opening from a file

Progress and the **Export a file…** backup work in every browser, whether you
open via a launcher (`file://`) or a local server. The *silent, automatic*
snapshots use IndexedDB: on `file://` they work in **Chrome / Edge**, but
Firefox and Safari disable IndexedDB for `file://` — there, progress is still
saved and you can still Export a file manually. For fully automatic backups in
**any** browser, run the local server above (`http://localhost`) instead of
opening the file directly. See `FEATURE_QUIET_BACKUP.md` for the backup design.

### Saving your game to a folder

Everyday progress **auto-saves in the browser** (survives closing/reopening and
restarts). To save into a **`saved_status` folder on disk**, click
**💾 Save my game** (on the hub, or Parent page → Backups).

**On Chrome or Edge — just double-click `index.html`, no launcher needed:**
the first time you Save, the browser asks you to **pick a folder** (pick the
`Kids-learning-space` folder to keep saves next to the game). It then writes
`kls-backup-latest.json` + `saved_status/kls-save-<time>.json` into a
`saved_status/` folder there. Every later Save writes to the same place
(after a browser restart it may ask once to re-confirm access). Verified: the
File System Access API works on `file://` in Chrome/Edge.

**On Firefox or Safari** (which don't support that folder API from a
double-clicked file): Save **downloads** the backup as a `saved_status_…json`
file to your Downloads instead. To get a real folder there too, open with
**`Play Kids Learning Space`** (starts a tiny local server, `tools/kls_server.py`,
needs Python 3) — it writes into `Kids-learning-space/saved_status/` in any
browser, automatically.

Restore any of these with **Import a file…**.

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

The hub has **Save all account info** and **Load all account info** buttons
below the game tiles. "Save" writes a single JSON file with every profile and
all per-game progress; "Load" restores from that file (REPLACE-only — type
`REPLACE` to confirm). See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for the
full spec.

### Where the save file lands

Browsers don't let a static `file://` page choose its own save folder — that's
a security boundary. Two ways to control where backups end up:

1. **Run via local server, then a Save As dialog appears** (Chrome/Edge only):
   ```bash
   python3 -m http.server 8000
   # → http://localhost:8000
   ```
   Over `localhost`, Chrome/Edge open a native Save As dialog when you click
   Save. Navigate to this project folder and the JSON lands right next to
   `index.html`. Safari and Firefox still use their default Downloads folder.

2. **Change the browser's default download folder to this project folder.**
   Works in any browser, `file://` or `http://`, and applies to every save.
   - **Chrome / Edge:** Settings → Downloads → Location → pick this folder.
     Optionally toggle "Ask where to save each file before downloading" so
     you can confirm per-file.
   - **Safari:** Settings → General → File download location → pick this
     folder.
   - **Firefox:** Settings → General → Files and Applications → Downloads →
     choose this folder, or pick "Always ask you where to save files."

If neither is set up, backups land in the browser's regular Downloads folder
and you can move them yourself.

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
