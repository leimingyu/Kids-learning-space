# Logic Detectives desktop try-out

A small, playable interaction prototype for Plan 2. Open `index.html` in a
desktop browser, or double-click **Try Logic Detectives.bat** on Windows.
Keep this folder inside the repository so its bundled fonts remain available.
No installation, server, account, or internet connection is needed.

## What you can try

- Choose Grade 2 or Grade 3 and open a four-puzzle case.
- Try shapes, flags, number tables, or stick repair individually from the case board.
- Grade 2 pictures use complete pieces; Grade 3 pictures use a feature builder.
- Number tables use your physical keyboard. Tab moves between inputs; Enter checks.
- Click sticks to remove them. To move a stick, click its source and destination,
  or drag it onto an empty outline. Undo lets you explore another idea.
- Three progressively stronger hints accompany every puzzle.
- Check answer opens a celebratory popup for correct answers or a gentle
  Try again popup with a useful clue for incorrect answers. Incomplete answers
  get a neutral reminder. Click the popup button, its close button, or press
  Escape to continue. The popup waits for the child and honors reduced motion.
- Choose a reason after each correct answer, then move to the next clue.
- Incorrect checked answers enter **Practice tricky puzzles** for the selected grade.
  A later correct replay without hints or mistakes clears that question.
- Case-board navigation retains unfinished cases for both grades during this session.

## Prototype boundary

There are eight reviewed sample puzzles, four per grade. This is an interaction
study, not the full question bank or final learning progression. It uses only
in-memory notes: reload or close the page to begin fresh. It never reads or writes
localStorage, IndexedDB, hub profiles, game progress, or backup files.

The main hub and existing games are unchanged. Integration with hub profiles,
backup/restore, persistent mistake history, stars, and the complete mission map
belongs to the later full-game implementation.

## Helpful things to notice

1. Can a child understand what to click without an adult explaining the controls?
2. Do complete pieces in Grade 2 and the builder in Grade 3 feel appropriate?
3. Is typing into the number table comfortable? Is the highlighted relationship useful?
4. Is stick selection clear? Which is easier: dragging or clicking twice?
5. Do hints explain a useful next step? Is choosing a reason helpful or repetitive?

## Verification

Run `node prototypes/logic-detectives/tests/smoke-engine.mjs` from the repository
root. The checks independently enumerate completions to confirm that the sample
grids and arithmetic tables have unique solutions, and enumerate every legal
one-stick change. The Grade 3 stick puzzle accepts both legal solutions.

For browser checks, serve the repository root with Python's local HTTP server,
then open `/prototypes/logic-detectives/`. The files use classic scripts and
relative asset paths so you can also launch the page directly in a desktop browser.

Browser walkthrough completed on 2026-11-01 over localhost: both four-puzzle
cases, wrong-answer feedback, all three hint levels, reasoning retries, keyboard
Tab/Enter, picture construction, stick removal, drag-to-move, click-to-move,
Undo, both valid Grade 3 stick solutions, case resume after Quick Play, and
independent Practice resolution. No browser console warnings or errors were
observed. The desktop preview was checked at 1265 × 712; longer puzzle panels
use normal page scrolling. Direct-file launch is provided for the user's browser;
the in-app browser permits HTTP/HTTPS previews only.

Screenshots of the case board and all three interactions are in `screenshots/`.
The feedback-popup update was also checked in the browser: correct, incorrect,
and incomplete submissions; mouse and Enter checks; main-button, close-button,
and Escape dismissal; preserved answers; and focus returning to reasoning or
the relevant retry control. Success and retry screenshots are included there.

## Answer reference (for adults)

| Sample | Answer |
| --- | --- |
| Grade 2 badge | Square outside, solid circle inside |
| Grade 2 flag | Solid triangular flag |
| Grade 2 table | Missing top header 11; missing total 20 |
| Grade 2 sticks | Remove the vertical stick of +: 9 − 5 = 4 |
| Grade 3 badges | Middle-left: circle outside, solid triangle inside. Center: triangle outside, empty square inside. |
| Grade 3 flags | Top-left: striped triangle flag. Top-middle: solid rectangle flag. |
| Grade 3 table | Missing row header 19, column header 12, totals 35 and 48 |
| Grade 3 sticks | Move 6's middle stick to its upper-right: 0 + 4 = 4. Or move the vertical stick of + to 6's upper-right: 8 − 4 = 4. |
