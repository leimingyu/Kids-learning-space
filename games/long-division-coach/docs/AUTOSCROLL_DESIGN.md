# Auto-scroll: keep the active cell in view

**Status:** Design approved — ready for implementation plan
**Date:** 2026-06-25
**Scope:** `games/long-division-coach/` (index.html, script.js, style.css)

## Problem

As a kid works a long-division problem, the engine appends "work" rows downward
(product, subtraction-result, bring-down). On Medium/Hard problems the active
input cell eventually falls below the fold, and the kid has to scroll the page by
hand to see where to type next. We want the relevant cell to stay in view
automatically, without the kid touching the scrollbar.

A second problem follows from solving the first: the **Check / Hint / Explain /
Undo** buttons live in the left coach column. If the page scrolls down to follow a
deep work cell, those buttons scroll away with it, leaving the kid unable to act.

## Approach (chosen): lightweight A + B

Two small, independent pieces:

- **A — Camera-follow scroll.** After each render, nudge the page so the active
  cell sits in a comfortable band. A dead-zone means we only move when needed.
- **B — Fixed bottom-center action pill.** Pull the per-step action buttons out of
  the scrolling coach column into a `position: fixed` pill so they are always
  reachable, regardless of scroll depth or layout.

Explicitly **not** in scope (this is the "lightweight" pass, not Option C/D):
pinning the dividend/quotient as a sticky mini-header, an inner-scrolling board
panel, and zoom-to-fit board scaling. Those remain available as future upgrades.

## Relevant code facts (verified)

- The **whole page (iframe document) is the scroller.** No inner scroll panel, no
  existing scroll code (`scrollIntoView` / `scrollTo` / `scrollTop` all absent).
- Work rows render into `#workRows` (`.computation__rows`) and grow downward with
  no height cap — `renderWorkRows(e, done)` at `script.js:1325`.
- The active cell is **not stored as a reference**; each render re-marks it by CSS
  class:
  - `.workCell--active` — multiply / subtract phases (`script.js:1314`)
  - `.workCell--active` — ghost target during bring-down (`script.js:1368`)
  - `.slot--active` — active quotient slot during divide (`script.js:1188`)
- The active target **alternates between top and bottom**: the quotient slot (top)
  during *divide*, a work cell (bottom) during *multiply/subtract*. So the solution
  must follow *whichever* cell is active — never assume "scroll to bottom."
- Single render entry point: `render()` at `script.js:1381`, which calls
  `renderQuotientSlots` (`:1453`) then `renderWorkRows` (`:1455`). This is the one
  hook site.
- The coach column is `.card--step`, a grid item in `.mainInteraction`. That grid
  uses `align-items: start` (`style.css:185`), so the coach card is only as tall as
  its content and top-aligned — a plain `position: sticky` on the buttons would
  stick only while the short card is on screen and scroll away on deep problems.
  This is why B uses `position: fixed`, not `sticky`.
- The action buttons live in `.controls` (`index.html:200-207`):
  `#checkBtn`, `#nextBtn` (hidden), `#hintBtn`, `#explainBtn`, `#undoBtn`,
  `#exampleBtn` (hidden, long label "Show me one like this").
- Runs in the hub iframe via `game-bridge.js` (`index.html:372`). `position: fixed`
  and `window.scrollBy` resolve against the iframe's own viewport — no postMessage
  needed; behavior is identical standalone and embedded.
- This game expresses reduced-motion only in CSS today
  (`@media (prefers-reduced-motion: reduce)` ×4). The scroll behavior needs a JS
  check (`matchMedia`).

## Part A — Camera-follow scroll

### Behavior

- New helper, e.g. `keepActiveCellInView()`, invoked once at the **end of
  `render()`** (after `renderWorkRows` at `script.js:1455`).
- Wrap the body in `requestAnimationFrame` so the new rows are laid out before we
  measure. Coalesce: store the pending frame id and `cancelAnimationFrame` a prior
  one so rapid re-renders collapse to a single scroll.
- Find the active element:
  `document.querySelector('.workCell--active, .slot--active')`.
  If none (between phases, or problem done), return — no scroll.
- Measure `el.getBoundingClientRect()` and `vh = window.innerHeight`. Bail if
  `rect.height === 0` (not visible).

### Dead-zone + target

```js
const TOP_GUARD = 0.20;   // keep cell below 20% of viewport
const BOT_GUARD = 0.70;   // keep cell above 70% of viewport
const TARGET    = 0.52;   // when we do scroll, land the cell's center here

if (rect.top >= vh * TOP_GUARD && rect.bottom <= vh * BOT_GUARD) return; // comfy → no move

const cellCenter = rect.top + rect.height / 2;
const delta = cellCenter - vh * TARGET;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.scrollBy({ top: delta, left: 0, behavior: reduce ? 'auto' : 'smooth' });
```

- Dead-zone (20–70%) prevents scrolling on every keystroke/re-render when the cell
  is already visible — kills the jumpy feel of raw `scrollIntoView`.
- 52% target leaves ~half a screen of look-ahead below for the row about to appear.
- `window.scrollBy` auto-clamps to valid range, so following the top quotient just
  rests at scroll position 0 — no over-scroll, no fighting.
- The 70% bottom guard keeps the active cell well clear of the bottom pill (Part B),
  which occupies roughly the bottom ~70px (~90–100% of viewport).

### Edge cases

- **No active element** (phase transitions, done summary): no-op.
- **Reduced motion:** instant jump (`behavior: 'auto'`).
- **Fresh problem / Start over:** active cell is near the top; dead-zone leaves it
  alone (already within band) — no surprise jump.
- **Standalone vs hub:** identical; iframe scrolls its own document.

## Part B — Fixed bottom-center action pill

### Structure

- Split `.controls` into two groups:
  - **Pill group** (fixed): `#checkBtn`, `#nextBtn`, `#hintBtn`, `#explainBtn`,
    `#undoBtn`.
  - **Stays in coach card** (normal flow): `#exampleBtn` ("Show me one like this")
    — contextual, long label, would bloat the pill.
- The pill reuses the **same button elements and IDs**, so all existing event
  listeners keep working with **zero rewiring**. Only the DOM grouping/markup and
  CSS change.

### CSS

- `position: fixed; left: 50%; transform: translateX(-50%); bottom: 12px;`
- Rounded pill, translucent/blurred backing, sits above content with a `z-index`
  beneath any full-screen overlay (e.g. completion / example panels).
- Honors existing design tokens incl. dark mode; matches current button styling.
- Visible focus states preserved for keyboard users.

### Visibility

- The pill shows whenever there is an actionable step. It **hides** when no action
  applies — i.e. when the done-summary is showing or none of its buttons are
  visible. Reuse existing show/hide state rather than adding parallel logic
  (e.g. toggle a class on the pill when `#doneSummary` is not hidden).
- `#nextBtn` continues to toggle against `#checkBtn` exactly as today; inside the
  pill that just swaps which primary button is visible.

### Layout breathing room

- Add bottom scroll padding (e.g. `padding-bottom` on `.main`, or a spacer) roughly
  equal to pill height + margin, so the last work rows can scroll fully clear of the
  pill when the kid scrolls (or when camera-follow parks the cell low in the band).

## Known limitation (accepted for this pass)

With "just the buttons" pinned, the **keypad scrolls with the page**. Desktop
physical-keyboard typing is unaffected. On a touch device, a kid deep in a long
problem would have to scroll up to tap a digit. This is intentionally out of scope
for the lightweight pass; if touch becomes a priority, the keypad can later get its
own sticky/fixed surface (or join the pill).

## Testing / verification

Manual, in both standalone (`open index.html`) and hub (iframe) contexts:

1. **Follow down:** Medium/Hard problem; advance through multiply/subtract until
   rows pass the fold. Active work cell stays in the comfortable band without hand
   scrolling.
2. **Follow up:** after a bring-down, the active **quotient** slot (top) is
   followed back up into view — not left off-screen above.
3. **Dead-zone:** small Easy problem where everything fits — page does **not** jump
   on each keystroke/Check.
4. **Pill reachability:** at maximum scroll depth, Check / Hint / Explain / Undo
   remain visible and clickable; Check↔Next swap still works.
5. **Pill non-occlusion:** the bottom-most work rows can be scrolled clear of the
   pill; the active cell is never hidden behind it.
6. **Reduced motion:** with OS "reduce motion" on, scrolling jumps instantly (no
   smooth animation).
7. **Done state:** on completion, the pill hides (or shows only the relevant
   action) and nothing scrolls unexpectedly.
8. **Standalone parity:** all of the above behave the same opening the file
   directly as inside the hub.

No automated test (the repo's only test covers Cosmic Math Quest). Changes are
contained to this game's three files.
