# Long Division Coach — v2 design notes

This document captures what the game became after the 2026-05-28 session
and the rules future contributors (human or Claude) must keep intact.
Read this **before** changing anything inside `games/long-division-coach/`.
The project-level CLAUDE.md still applies (per-profile scoping, additive
hub, etc.); this file extends it with game-specific architecture.

## High-level shape

Single-page game, vanilla HTML/CSS/JS, no build step. Three files:

- `index.html` — markup for header, mode toggle, mission panel, step
  card, board, times-table, and completion overlay.
- `script.js` — IIFE wrapping a pure-functional engine + UI state + DOM
  renderers. ~1500 lines but organized into labeled sections.
- `style.css` — design tokens at top, layout in the middle, v2 additions
  (mode toggle, cycle ring, times-table, mission, completion overlay,
  wide-screen 3-col, compact spacing) in a clearly-marked block near the
  bottom.

## Mode model

There are **two top-level modes**, selected via the big toggle above the
header toolbar:

### Practice mode (`topMode === "practice"`)
Free-form solving. The kid picks difficulty + Watch/Practice/Challenge
sub-mode. Coach affordances are on:

- **Cycle ring** at the top of the step card (Divide → Multiply →
  Subtract → Bring down), current phase lit, completed phases ✓.
- **Times-table panel** on the right showing the current divisor's
  multiples. The expected best digit is `is-best`, fitting digits are
  `is-fits`, over-the-target rows are dimmed (`is-over`).
- **Zero-quotient prompt**: when `currentValue < divisor` during divide
  phase, the step prompt itself becomes the amber lesson — *not* a
  separate banner (see Invariants).
- **Worked example** button appears after 2 wrong divide attempts.
- **Bring-down ghost target** + animated SVG arrow points from the next
  dividend digit to the landing column on the same row as the remainder.
- **Completion overlay** appears 450 ms after the final answer commits.

### Game mode (`topMode === "game"`)
Daily mission frame. The mission panel replaces the lesson and toolbar
(hidden via `body[data-top-mode="game"]` rules):

- 14-day calendar strip showing stars-per-day and freeze days.
- Streak badge with weekly freeze (refreshed on ISO-week change).
- Mission entry screen: kid picks Easy / Medium / Hard.
- Mission = **1 warm-up Easy** + **2 main at chosen difficulty** = 3
  problems. Auto-advances between problems (700 ms gap).
- Per-problem stars (0–3 via `scoreProblem()`) → averaged → pushed to
  the hub via `bridge.stars(...)`.
- Mission summary screen at the end.
- Bonus rounds after the day's mission is done don't count toward streak.

### Sub-modes (Practice only)
Watch / Practice / Challenge are inside Practice. They change prompt
verbosity and (in Watch) auto-step via Next.

## Engine (pure-functional core)

The engine functions are **pure** (no DOM, no `app.*` access):
`createEngine`, `applyAnswerAndAdvance`, `getStepExpectation`,
`applyHint`, `getAutoAnswer`, `buildDisplayRows`, `cloneEngineState`,
`pickInitialChunk`.

Engine state shape (informal):
```
{ phase: 'divide'|'multiply'|'subtract'|'bringDown'|'done',
  dividendDigits, divisor, cursorIndex, currentValue,
  activeStartIndex, activeEndIndex, activeQuotientIndex,
  quotientDigits, qDigit, product, remainder, rows }
```

State transitions go through `applyAnswerAndAdvance(state, userValue) →
{ nextEngine, correct, feedback, stepCorrect }`. **Always immutable** —
return a clone. Undo is just popping from `app.history`.

## Input model — roaming cursor (no separate input box)

The kid types **directly into the active cell on the board**:

| Phase       | Active cell location                                            |
| ----------- | --------------------------------------------------------------- |
| divide      | quotient slot at `activeQuotientIndex`                          |
| multiply    | pending product row, cells right-aligned to `activeEndIndex`    |
| subtract    | pending remainder row, cells right-aligned to `activeEndIndex`  |
| bringDown   | ghost target on the **same row as the remainder** at `cursorIndex` |

Input handling:
- Document-level `keydown` listener captures `0-9`, `Backspace`, `Enter`.
- Skips when target is a button so Enter on Hint still hits Hint.
- Enter (or the Check fallback button, or the keypad on touch) commits.
- Watch mode disables typing; Next drives auto-stepping.
- Keypad is hidden on desktop (`@media (hover: none)`), visible on touch.

## Bring-down input contract

The bring-down phase expects **just the next dividend digit**, not the
combined number. E.g., remainder 4 + next digit 5 → kid types `5`, not
`45`. Engine validates `userValue === dividendDigits[cursorIndex]` and
internally computes `combined = remainder * 10 + nextDigit` for the
`broughtDown` row and the new `currentValue`. Don't revert this.

## Storage

Profile-scoped via the hub bridge:

- Key: `longDivisionCoach_v1__<profileId>` when embedded,
  `longDivisionCoach_v1` when standalone (file://).
- Registered in `shared/scripts/hub.js` as `storageBase:
  'longDivisionCoach_v1'` so the backup module can discover it.
- Persisted shape: `{ streak, lastMissionDate, freezesAvailable,
  weekFreezeRefreshed, calendar, totalStars, missionsCompleted }`.
- `calendar[date]` = `{ stars, difficulty, freezeUsed? }`.
- Reset button wipes the profile-scoped key AND calls
  `bridge.resetProgress()` to clear the hub's per-game record. Other
  profiles and other games are never touched.
- Game's own internal state (mission in-flight, draft input) is kept in
  RAM only; we don't persist mid-problem state via `bridge.saveState`.

## Hub integration

- `bridge.played()` + `bridge.celebrate()` fire when `#doneSummary` or
  `#missionSummary` becomes visible (HTML `<script>` block at bottom of
  index.html, using `bridge.onVisible`).
- `bridge.stars(level, n)` is called from `pushStarsToHub(n)`, level
  IDs: `practice-<difficulty>` or `mission-<difficulty>`. **Per-problem
  scoring (0–3), never per-step.**
- `bridge.sticker('ldc-first-mission')` on first ever mission completion.
- `bridge.sticker('ldc-streak-N')` on streak milestones (3, 7, 14, 30).
- All bridge calls guarded with `if (window.KLS && window.KLS.bridge)`
  so standalone never crashes.

## Star rubric (per problem)

`scoreProblem()` returns 0–3:
- **3** — no hints, no wrong answers, no reveal used.
- **2** — ≤1 hint and ≤1 wrong attempt, no reveal.
- **1** — anything else (completion always earns at least 1).

Don't add per-step star counting (the v1 mistake). Stars represent
*mastery of a whole problem*.

## Completion overlay

Shown in Practice mode only (Game mode has its own mission summary).
Triggered 450 ms after `phase === "done"` so the kid sees the final
answer commit first. Contents:

- Bouncy 🎉, "You did it!", prominent answer (`A ÷ B = Q` or
  `A ÷ B = Q r R`), 0–3 stars dropping in, short "why" line, confetti
  rain, "Play another →" and dynamic "Try Medium / Hard / Another Hard
  →" buttons.
- Dismiss: backdrop click (`data-completion-dismiss="1"`), ✕ button,
  Escape key, or "Play another".
- Auto-hidden on `setTopMode` and `handleResetProgress`.

## Layout

Two layout modes, breakpoint at **1100 px**:

- **< 1100 px** — today's 2-column stacked: step card | board, then
  times-table full-width below. Full-size cells.
- **≥ 1100 px** — 3-column single row: step card (~220 px) | board
  (1fr) | times-table (~200 px). Compact spacing: `--digit-w: 28px`,
  `--digit-h: 32px`, `--digit-gap: 4px`, card padding 10 px, work-row
  gap 4 px, cycle ring nodes 38 px with labels hidden, times-table list
  single column.

The `.board__topRow` and `.board__midRow` **must use the same grid
track widths** in every breakpoint or the quotient slots drift out of
column-alignment with the dividend digits. The wide-screen overrides
explicitly mirror both (see CSS comment at the override).

## Bring-down visual flow

Two overlapping affordances during the bring-down phase:

1. **Ghost target** — the empty cell at `cursorIndex` on the remainder
   row gets mutated in-place to `workCell--ghostTarget` (dashed amber
   border, `?` content, `data-bringdown-target="1"`). Same row as the
   remainder, paper-style.
2. **Animated arrow** — SVG overlay at `#bringDownArrow`, always
   present in layout (no `hidden` toggling). Path is cleared on every
   render; redrawn from the next dividend digit (bottom-center) to the
   ghost target cell (top-center) via a curved Bezier. Marker arrowhead
   at the target. `requestAnimationFrame` defers the draw one frame so
   the freshly rendered DOM has settled. Recomputes on window resize.

When the kid types into the ghost target, it also gains the
`workCell--active` class (cyan + caret takes priority over amber).

## Reduced motion

`@media (prefers-reduced-motion: reduce)` disables: cycle-ring pulse,
ghost-target pulse, bring-down arrow march, active-cell pulse, caret
blink, completion overlay backdrop/card/emoji/star animations.
Confetti pieces are hidden entirely (they'd just sit static). All
visual *information* still rendered, only motion stripped.

## Invariants (load-bearing — don't break)

1. **Engine purity.** No `document.*` or `dom.*` reads/writes inside
   engine functions. The smoke test (`node games/cosmic-math-quest/...`)
   and the project's purity tests rely on this.

2. **`[hidden] { display: none !important; }`** in CSS so any element
   you set `.hidden = true` actually disappears, regardless of its own
   `display: flex/grid/etc.` rule. Without this, the mission panel and
   the now-removed zero-quotient banner both leaked through.

3. **Don't toggle `hidden` on layout-dependent overlays.** The bring-
   down arrow is always present in layout (`pointer-events: none`,
   empty SVG when inactive). Hiding it via `[hidden]` collapses its
   bounding rect to 0×0 and `getBoundingClientRect()` returns garbage,
   breaking arrow positioning. Toggle content (path children), not
   visibility.

4. **Twin column tracks.** `.board__topRow` and `.board__midRow` use
   the same `grid-template-columns` at every breakpoint. Otherwise
   quotient slots drift off the dividend digits.

5. **Single-digit bring-down input.** Engine bringDown phase expects
   the next dividend digit, not the combined number. Don't revert.

6. **Per-problem stars, not per-step.** `scoreProblem()` is the only
   source of stars sent to the hub.

7. **Standalone must keep working.** Every bridge call guarded with
   `if (window.KLS && window.KLS.bridge)`. Storage key falls back to
   un-scoped when `getProfileId()` returns null. No auto-migration of
   legacy un-scoped data into any profile.

8. **Times-table panel doesn't go below the work area at ≥1100 px.**
   The 3-column wide-screen layout exists specifically because that
   bottom-stacked position pushed everything off the fold on long
   problems. Don't `grid-column: 1 / -1` it inside the wide media
   query.

9. **Completion overlay only in Practice mode.** Game mode missions
   advance problem→problem with a 700 ms gap and use the mission
   summary screen for the bigger payoff. Don't add the per-problem
   overlay there or you'll get three modal interruptions per mission.

10. **Zero-quotient lesson lives in the step prompt, not a separate
    banner.** `getStepExpectation` returns `zeroQuotient: true` when
    `currentValue < divisor` in divide phase; the renderer toggles
    `.stepPrompt--zeroQ` on the prompt element. Don't reintroduce a
    standalone `#zeroQuotientTip` — that's what got tangled in the
    `display: flex` vs `hidden` attribute conflict.

## File map for fast orientation

```
games/long-division-coach/
├── index.html               # markup; everything has a stable id
├── script.js                # IIFE, sectioned with labeled banners
├── style.css                # design tokens → layout → v2 additions
└── docs/
    ├── PRD.md               # v1 product spec (still relevant)
    ├── REVIEW_MATH.md       # math correctness notes
    ├── QA_REPORT.md         # QA pass notes
    ├── README.md            # standalone usage
    ├── TASKS.md             # historical todo
    └── v2_DESIGN.md         # this file
```

## When you make a change

1. **Read this file first.** It is shorter than re-discovering the
   invariants via screenshots and debugging.
2. **Read the relevant code section.** `script.js` has labeled banners
   (`Engine`, `Storage`, `Game Mode: streak + calendar`, `Completion
   overlay`, etc.). Find the section before editing.
3. **Smoke test:** `node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`
   and `node --check games/long-division-coach/script.js`.
4. **Manual test paths:** open `games/long-division-coach/index.html`
   directly (standalone) AND via the hub. Profile-scoped storage only
   activates via the hub.
5. **Hard problems are the stress test.** Try `divisor=23,
   dividend=10847` (Hard generator). It surfaces layout, zero-quotient,
   multi-cycle bring-down, and overlay rendering all at once.
