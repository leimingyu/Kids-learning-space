# Kids Learning Space

A static, no-build, no-framework, `file://`-friendly hub of four math learning
games for kids in grades 2–5. Pure vanilla HTML / CSS / JS — no npm, no
bundler, no server required.

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

Double-click `index.html`, or serve locally:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

That's it. Requires a modern browser (Chrome 111+, Safari 15.4+, Firefox 113+)
because tokens use `oklch()` and components use `:focus-visible`.

## What's where

```
/
├── index.html              Hub landing + iframe stage
├── design-system.html      Living component documentation
├── README.md
├── ARCHITECTURE.md         Decisions: iframe, chrome, progress, routing
├── shared/
│   ├── styles/
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
