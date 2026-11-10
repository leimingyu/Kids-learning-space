# Logic Detectives — release verification

Development date: 2026-11-01. **Automated release checks and the recorded desktop
Chromium browser walkthrough passed.** The coverage and limits below distinguish
live observations from exhaustive automated checks.

## Release scope

- 60 stable-ID original puzzles; 30 per grade, six five-puzzle cases per grade.
- Per grade: ten picture patterns, ten addition tables, ten stick equations.
- Desktop mouse and keyboard controls, direct Next clue, optional explanation,
  correct/incorrect/incomplete popups, three hints, and persistent exact replay.
- Profile-scoped cases, drafts, best stars, mastery, badges, and mistake records.
- Standalone use, hub tile, Logic topic, Home, checkpoint, reset, and backup paths.

## Executed checks

| Check | Status | Evidence |
| --- | --- | --- |
| Store JavaScript syntax | Passed | `node --check games/logic-detectives/store.js` |
| Store isolation and failure suite | Passed | `node games/logic-detectives/tests/smoke-storage.mjs` |
| Puzzle bank mathematics and uniqueness | Passed | `node games/logic-detectives/tests/smoke-engine.mjs` |
| Shared backup/export/restore integration | Passed | `node games/logic-detectives/tests/smoke-backup.mjs` |
| Complete app and bridge startup/checkpoint flow | Passed | `node games/logic-detectives/tests/smoke-game.mjs` |
| Desktop browser walkthrough | Passed for recorded flows | Live Chromium in-app browser on isolated `http://127.0.0.1:8768` |

The executed store suite uses isolated memory storage and the real `store.js`.
It covers both grades, rich drafts, additive fields, separate profiles, un-scoped
standalone exclusion, zero storage access before binding, unavailable storage,
quota denial, second-key failure rollback, failed rollback recovery, pending
retry scoping, prepared/malformed restore guards, protected corrupt/future saves,
read-outage protection, active-profile reset, and opaque JSON round-trips.

The engine suite verifies all 60 unique questions and twelve balanced cases,
unique picture/table completions, and 3,212 independently enumerated stick edits.
It confirms that every accepted stick change obeys the stated rule and that all
valid alternative answers are accepted.

The game suite executes the complete HTML/script load order, real bridge, and
actual control handlers in an isolated fake DOM. It solves all sixty puzzles
through twelve missions and checks early/late profile binding, clean standalone
use, direct popup Next without a reason quiz, optional explanations, exact draft
continuation, grade-specific Practice, reward deduplication, storage-quota retry
before hub rewards are released, future/additive JSON preservation, current-only
reset, suspended checks, checkpoint honesty, restore guards, and the real backup
round-trip. Tricky practice resolves mistakes without case stars, mastery, or
badges. These are functional checks, not a claim that all sixty puzzles received
a live visual browser walkthrough.

The backup suite reads the actual hub `GAMES` registry and executes the real
shared `backup.js` against isolated storage. It verifies both registered bases
for two profiles, read-only preview, REPLACE restore, Undo, standalone/preference
exclusion, unknown-base allowlisting, the game's prepared-journal write guard,
interrupted-restore recovery, and invalid JSON rejection before any mutation.

## Recorded desktop browser walkthrough

Live verification used Chromium in the in-app browser on the disposable local
origin `http://127.0.0.1:8768`. It did not use existing children's browser records.

- Opened the game standalone and completed a full five-puzzle Grade 2 case. An
  intentional wrong answer followed by reload/resume retained the attempt history;
  the case finished with two stars.
- Opened the main hub, observed the Logic Detectives tile and Logic filter, and
  created disposable profile A. It started at zero despite the completed
  un-scoped standalone save on the same origin.
- Completed a full Grade 2 case in profile A with five independent solves. The
  hub showed three stars and two stickers.
- Typed `15` into an unfinished number table, used shared Home, and resumed with
  that draft preserved. The hub save acknowledgement reached **Saved**.
- Created disposable profile B. It started empty despite A's completed case.
- Completed B's full Grade 3 case, including two-blank picture builders, linked
  missing number-table headers, and a seven-position equation with a two-digit
  number. An intentional flag error opened **Try again**; Escape dismissed the
  popup and allowed retry. The case finished with two stars and one badge.
- Replayed the saved tricky question independently. The Practice queue reached
  zero while stars and badges remained unchanged.
- Checked the profile list after these actions: A retained three stars/two
  stickers; B retained two stars/one sticker.
- Verified native mouse dragging in the full embedded Grade 3 game. For
  `16 + 4 = 14`, moving the 6's middle stick to its upper-right position produced
  `10 + 4 = 14`; Check accepted it and opened the correct-answer popup. The
  multi-digit numbers remained visually grouped correctly.
- This independent Quick practice solve brought B to five unique mastered
  questions and earned its second badge while case stars stayed at two. Quick
  practice may earn unique mastery; Tricky practice does not.
- The final console checks returned no errors or warnings for either the hub tab
  or the standalone game tab.

The success popup was refined to show a compact example directly, with **Next
clue** as the primary action and optional **Show me why**. This flow was exercised
through all sixty questions by the actual-handler automated suite.

Visual evidence is retained in [screenshots/hub.png](screenshots/hub.png),
[screenshots/casebook.png](screenshots/casebook.png),
[screenshots/grade-3-success.png](screenshots/grade-3-success.png), and
[screenshots/try-again.png](screenshots/try-again.png). The accepted full-game
native drag is shown in
[screenshots/stick-drag-success.png](screenshots/stick-drag-success.png).
Two-click stick movement and rule checking are also covered by the automated
full-game suite.

## Storage and compatibility review

`logicDetectives_v1` and `logicDetectives_wrongs_v1` are new registered bases; no
existing game's slug or storage schema is changed. The backup envelope remains
version 1. Browser checks used a disposable local origin and test profiles,
without reading or altering existing children's records.

The two-key store verifies writes and attempts rollback on failure; localStorage
does not supply a physical multi-key transaction. When a browser failure prevents
rollback, a pending snapshot remains in the live tab and the UI reports that the
tab must stay open for retry. The existing shared restore journal supplies the
separate safety copy and Undo/Redo semantics for full backup restores.

## Practical limits

### Scheme 2: build one row

Main-launcher update loading: Logic Detectives now has a registry assetVersion
used for its iframe document. The root hub script and changed game CSS/controller/
guidance/animation scripts use the matching release query. Other games retain
their existing document versions. The actual-hub-route regression in
`tests/smoke-save-session.mjs` checks that agreement and the unchanged fallback.
All existing save/session checks passed. HTTP checks against the running main
launcher at localhost:8000 confirmed the current hub, game document and assets;
the row demo was also exercised standalone from that server without opening
profiles or writing folder backups. Console warnings/errors were empty.
Evidence: [row-pattern-main-server.png](screenshots/row-pattern-main-server.png).
An already-open older Chrome page needs one reload to replace its running code.

Replaced the single-cell walkthrough with **Watch a row**. Automatic playback
keeps one blue starting number fixed, adds successive pink printed top numbers,
and identifies their already-printed purple sums. Each example restarts with
the same left number. Missing headers and totals are skipped even if filled
by the child. Sixteen tables supply multiple examples; four have one safe
example. The ordinary workspace keeps the large equation hidden.

Passed the row-demo model tests, updated table-interface suite, full sixty-puzzle
game suite, profile storage suite, and shared-backup suite. The interface suite
covers Pause/Play/Replay, manual steps, reduced motion, finite completion, stale
timer callbacks, visibility/Home/reset/pagehide, drafts, and Enter/popups.

Live Chromium verified automatic playback through both examples and stopping
on Replay; manual steps; the fixed9 examples9+7=16 then9+14=23; blank values
remaining unknown; typing; Shift+Tab; incomplete Enter feedback and Escape;
Case board/resume preserving a partial draft. The preview was left with a
fresh empty workspace. Final console had no warnings or errors. Screenshot:
[row-pattern-demo.png](screenshots/row-pattern-demo.png).

### Number-path guidance update

Added visible-clue guidance for all twenty number tables: distinct across/down
arrows, matching equation cards, unknown-addend prompts, and an optional
three-step printed example. Table focus selection now survives checkpoint/reload.
Examples preserve drafts and do not count as hints or mistakes.

Passed `smoke-table-guide.mjs`, `smoke-table-interface.mjs`, `smoke-engine.mjs`,
and the full `smoke-game.mjs` suite. Live Chromium verified the missing top-label
screen, all three example steps, typed total mirroring, Shift+Tab returning to
the top-label path, and workspace reset. Final console contained no warnings or
errors. Desktop layout measurements were checked with a temporary viewport and
normal browser sizing restored. Screenshot: [table-paths.png](screenshots/table-paths.png).

The release is a finite curated 60-puzzle bank. It does not claim adaptive
generation, a complete school syllabus, or educator/classroom validation.
The live visual walkthrough covered representative complete cases and the
profile/practice paths above; all sixty puzzles were exercised by automated
actual-control checks, not all by live browser clicks.

Live browser coverage is Chromium over HTTP. Safari, Firefox, and direct
`file://` browser UI were not live-tested. Classic local scripts, relative bundled
assets, the offline path audit, and standalone fake-DOM startup checks support the
direct-file path; they are not claimed as live direct-file browser verification.

## Grade 3 concept practices — November 9, 2026

Added 36 deterministic concept puzzles outside the original 60 case puzzles:
12 magic squares, 12 parentheses rewrites, and 12 X/Y rules. Parentheses rewrites
have exactly one missing sign in a native `?` dropdown with no chevron. Concept
practice uses five-question runs with separate mastery and resumable drafts;
existing case IDs, stars, badges, profile keys, and backup envelope version 1
remain compatible.

Passed the existing engine, full-game, table-guide, table-interface, row-demo,
storage, and backup suites; the shared save-session and hub-dashboard suites;
and both new concept suites:

- `smoke-concepts-engine.mjs` independently proves unique magic completions,
  checks both diagonals, all four parentheses sign patterns, backward rules,
  malformed answers, and neutral incomplete submissions.
- `smoke-concepts-game.mjs` exercises all 36 puzzles through their actual
  controls, sign dropdowns, hints, exact drafts after reload, committed mistakes,
  Tricky practice, separate rewards, fresh profiles, standalone play, reset,
  future-field preservation, and registered backup/export/restore.

Live Chromium over HTTP on a disposable local origin verified the Grade 3
cards, the single-blank arrowless native menu, mouse and keyboard sign entry,
correct/retry popups, optional explanations, saved answer restoration after
reload, magic-square numeric Enter submission, and rule-table completion.
Desktop visual inspection covered all three practices. Rule tables and their
formula sit side by side on desktop and stack on narrow layouts. Existing child
profiles and the main launcher's save origin were not used for these checks.
Safari, Firefox, mobile viewport, and direct-file UI were not live-tested in
this update.
