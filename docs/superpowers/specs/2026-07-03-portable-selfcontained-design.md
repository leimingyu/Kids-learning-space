# Portable & Self-Contained — Design Spec

**Date:** 2026-07-03
**Goal:** Zero external runtime dependencies; identical look and behavior offline; double-click to run on macOS and Windows; nothing that currently works breaks.

## Context (audit findings)

The app is already static, no-build, relative-path, and server-optional. All four
games are self-contained and use system-font stacks (`-apple-system`, `Segoe UI`,
`system-ui`) — already cross-platform. There are no `fetch`/XHR calls, no service
worker, no web manifest, and game slugs match their directory names exactly.

The **only** external runtime dependency is Google Fonts (Fredoka + Nunito) loaded
by `index.html` and `design-system.html` from `fonts.googleapis.com`. Offline the
hub silently falls back to system fonts (a fallback chain already exists), so it
degrades rather than breaks — but it is not self-contained.

Secondary nuance: the silent auto-backup uses IndexedDB, which works on `file://`
in Chrome/Edge but is disabled on `file://` in Firefox/Safari. Progress
(localStorage) and manual Export still work everywhere; only silent snapshots are
limited on `file://` in those two browsers.

## Decisions (from brainstorming)

1. **Self-host the fonts** (chosen over dropping web fonts) — keep the exact brand
   look, fully offline.
2. **Double-click launchers + docs** (chosen over a local-server launcher) — keep
   it truly zero-dependency; document the `file://` backup nuance and the
   `python3 -m http.server` path for full parity.

## Design

### 1. Bundle the fonts (self-contained fix)

- `shared/fonts/` holds the **latin-subset variable woff2** for each family
  (`fredoka-latin.woff2` ~29 KB, `nunito-latin.woff2` ~39 KB) plus each font's
  SIL OFL 1.1 license (`OFL-Fredoka.txt`, `OFL-Nunito.txt`) and a short
  `README.md` attribution. Both fonts are OFL, so bundling + redistribution is
  permitted. Latin subset is sufficient — its unicode-range (U+2000–206F) covers
  the curly quotes / dashes used in the copy; any missing glyph falls through the
  existing `font-family` chain to a system font.
- `shared/styles/fonts.css` declares two `@font-face` rules using **relative**
  paths, `font-display: swap`, and variable **weight ranges** (`font-weight:
  500 700` for Fredoka, `400 800` for Nunito) — the browser instances the `wght`
  axis, covering every weight the hub uses (Fredoka 500/600/700, Nunito
  400/600/700/800). No `local()` — always use the bundled file for identical
  rendering on every machine.
- `index.html` and `design-system.html`: replace the three `fonts.googleapis.com`
  `<link>`s (two `preconnect` + one stylesheet) with a single
  `<link rel="stylesheet" href="shared/styles/fonts.css">`, placed **before**
  `tokens.css` (which references the font families via `--kls-font-*`).

### 2. Double-click launchers

- `start-mac.command`: `cd "$(dirname "$0")"` then `open index.html`. Marked
  executable (`chmod +x`) so a double-click works from Finder.
- `start-windows.bat`: `cd /d "%~dp0"` then `start "" "index.html"`.
- Both open `index.html` via `file://` in the default browser — no server, no
  Python required.

### 3. Docs

- `README.md`: a "Run it" section (double-click `index.html` or your OS launcher;
  or `python3 -m http.server`), plus the honest `file://` auto-backup note
  (Chrome/Edge full; Firefox/Safari save progress + manual Export, snapshots
  limited).
- `CLAUDE.md`: note fonts are now bundled (no network) and launchers exist.

### 4. Verification (nothing breaks)

- Both Node smoke tests pass unchanged.
- Load the hub with **network blocked** in a browser and confirm: `document.fonts`
  reports Fredoka + Nunito loaded from the local files; **zero** requests to
  `googleapis.com`/`gstatic.com`; the chrome bar + an iframe game still render and
  work; loads over both `http://localhost` and `file://`.

## Scope guardrails

No changes to any game, no changes to progress/backup logic, `BACKUP_VERSION`
untouched. Only `index.html`, `design-system.html`, new `shared/fonts/*`, new
`shared/styles/fonts.css`, two launcher scripts, and docs.

## Risk

Font acquisition needs network at build time. Mitigated: the woff2 + OFL files
were fetched successfully as the first implementation step and committed, so the
shipped repo has no build-time or runtime network dependency.
