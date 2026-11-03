# Logic Detectives — Grade 2 and Grade 3

## Product decision

Add one **Logic Detectives** tile to the Kids Learning Space main page. Children
solve short detective cases built around the reasoning in the supplied examples:
picture constraints, arithmetic tables, and repairing equations with sticks.
The new canonical slug is `logic-detectives`, under the **Logic** topic.

The accepted interaction prototype lives separately in
`prototypes/logic-detectives/`. The full game lives here and owns its own state.
Prototype notes are not imported into any profile.

## Content and progression

The release contains 60 original, stable-ID puzzles: 30 for each grade. Each
grade has six cases with five puzzles each. Every case mixes all three families.

| Family | Per grade | Grade 2 | Grade 3 |
| --- | ---: | --- | --- |
| Picture patterns | 10: five shapes, five flags | Complete pieces in early cases, then construct features; one missing picture before connected blanks | Construct features; combine row and column constraints with fewer given pictures |
| Addition tables | 10 | Missing totals, then missing headers; totals within 100 | Linked missing headers and totals; choose an informative clue to begin |
| Stick equations | 10 | Remove one stick first, then move one as a later challenge | Move exactly one stick, inspect operation signs and digits, and recognize alternative solutions |

Difficulty grows through connected deductions and reduced guidance. This is an
authored enrichment sequence based on the supplied reasoning examples, rather
than a claim of a complete school or RSM curriculum.

Each puzzle has three progressively stronger hints, a short success explanation,
and a longer optional explanation. Picture rules are explicit: each row and
column contains each relevant shape and filling exactly once. Arithmetic-table
rules are explicit addition. Stick rules state whether to remove or move a stick,
require recognizable seven-segment digits, and keep the equals sign fixed.

Picture and number-table clues must determine unique completions. Stick puzzles
can intentionally have several valid answers: the engine accepts every legal
one-stick change that produces a true equation. Multi-digit numbers cannot start
with zero.

## Desktop interaction

- **Pictures:** click a missing pocket, then a complete piece or picture buttons
  for its outside shape, inside shape, and filling. Preview the constructed piece.
- **Number tables:** click a blank, type digits with the physical keyboard, use
  Tab to move between blanks, and Enter or Check answer to submit.
  **Watch a row** demonstrates how already-printed sums were made. The blue
  starting number stays fixed while successive pink top numbers are added to
  produce the matching purple sums. Each example restarts from its row's left
  number; the row is not a running cumulative sum. Automatic playback has Pause,
  Play, manual Next step, Replay, and Back to my puzzle controls. The normal
  workspace keeps the equation panel hidden to reduce clutter.
  The lesson uses only fully printed headers and sums from one row, skipping
  every blank even after a child types an answer. Four tables have only one
  safe printed example. Watching preserves answers, hints, mistakes and rewards.
  Reduced-motion playback starts in manual mode. Navigating away cancels timers;
  hiding the page pauses them. No additional reasoning quiz is required.
- **Sticks:** click to remove; click a source and destination or drag to move.
  Undo and cancel-selection controls support exploration.
- **Navigation:** an in-game Case board control is available during play. The
  shared hub Home message also returns to the game's case board.

Changing an answer, selecting a picture feature, moving a stick, or opening a
hint is not a wrong answer. Grading happens only on a committed Check/Enter.

## Accepted answer flow

The prototype's mandatory explanation-selection quiz is removed.

1. The child submits an answer.
2. A correct answer opens an encouraging celebration popup with one short visual
   explanation. Its main action is **Next clue** (or finish on the final clue).
3. **Show me why** is optional and displays a longer visual explanation without
   requiring the child to choose a reason or type a sentence.
4. An incorrect answer opens **Try again, detective!** with useful feedback and
   keeps the child's work. Dismissal returns to a relevant retry control.
5. An incomplete answer receives a neutral reminder and creates no mistake.

Popups wait for the child rather than advancing on a timer. Mouse, Enter, Escape,
and close-button handling preserve useful keyboard focus. Celebrations honor
reduced motion; dark-mode colors remain readable.

## Case board, progress, and rewards

The child chooses Grade 2 or Grade 3 and sees all six cases for that grade. The
board distinguishes unopened, in-progress, and completed cases. Unfinished cases
retain their question, draft answers, hint count, and prior mistakes. Quick
practice and Tricky practice do not replace those case checkpoints.

Each finished case earns stars based on that run's independent solves:

| Result | Stars |
| --- | ---: |
| Finish all five puzzles | 1 |
| At least three solved independently | 2 |
| All five solved independently | 3 |

An independent solve is correct without hints or previous wrong submissions in
that attempt. Replays retain the best case-star result and cannot accumulate
extra stars. The maximum is 18 stars per grade and 36 across the game.

Independent mastery counts unique puzzle IDs, so repeating a known puzzle does
not inflate it. Stable badges celebrate 5, 15, 30, and 60 unique independent
solves, plus a first-case badge and one completion badge for each grade. A later
independent case or Quick practice solve can establish mastery after an earlier
helped attempt. Tricky practice resolves its saved questions without adding
mastery or badges.

## Tricky practice

Wrong committed answers are saved immediately with the original question and
answer snapshot. A visible **Practice tricky puzzles** button replays up to five
unresolved questions for the selected grade, oldest first. A later correct replay
without hints or wrong attempts resolves the record. A repeated miss updates the
same record's attempt count.

Tricky practice has its own session summary and does not award case stars,
mastery, or badges. Its question records remain separate from ordinary case
progress.

## Persistence and hub contract

| Data | Base key |
| --- | --- |
| Cases, draft state, best stars, unique mastery, badges, grade choice | `logicDetectives_v1` |
| Canonical mistake records | `logicDetectives_wrongs_v1` |

Embedded saves append `__<profileId>` to both keys. The app waits for the bridge
profile binding before reading or writing progress. A new profile starts empty;
standalone, un-scoped data is never migrated into a hub profile. Direct opening
uses the un-scoped bases and remains independent of the hub.

The `GAMES` entry registers both bases for the existing backup/export/restore
system. The backup envelope version remains 1 because no envelope shape changes.
The game supplies a synchronous checkpoint handler and saves its own stores
before acknowledging a hub state request. Restore's prepared journal blocks
game writes. Suspend messages stop further writes from a departing iframe.

Browser storage failures are visible. Failed writes retain a scoped pending
snapshot for retry; unreadable or unsupported saved data is preserved rather
than replaced by defaults. Reset is explicit, clears both current-profile keys,
and tells the hub to clear only this game's record for that profile.

## Release acceptance

Content checks must verify counts, unique IDs, case balance, mathematically valid
answers, unique picture/table completions, and all legal stick solutions. Storage
checks must verify profile isolation, standalone separation, save/restore round
trips, retry behavior, reset scope, and restore-journal protection. Browser checks
must exercise mouse/keyboard interaction, popup controls, direct continuation,
optional explanations, Practice, case resume, and the hub entry point.

The execution record is maintained in [QA_RELEASE.md](QA_RELEASE.md).
