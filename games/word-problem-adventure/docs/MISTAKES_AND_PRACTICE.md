# Mistakes & Practice — Word Problem Adventure

See the project-root `MISTAKES_AND_PRACTICE.md` for the canonical
cross-game spec. This file documents this game's implementation.

## Implementation status

### Grade 2–5 adventure (2026-09-29)

The default grade path adds 400 original questions. `grade-core.js` owns
mistake rules; `grade-adventure.js` owns the play/practice UI. New records
live in the existing registered `wordProblemAdventure_wrongs_v1` store under
`byType["Grade N: skill"]`. They retain the v2 record fields and additionally
include grade, correctAnswer, and a questionSnapshot. IDs are stable
`wpa-gN-001` through `wpa-gN-100`. Wrong graded submissions increment the
same record. Revealed or hinted stories are also queued with a distinct tag
for a fresh independent attempt; they do not count as mastered stories.

Practice shows up to five exact saved stories for the selected grade,
oldest first. An independent first-try answer removes the record and can
earn that story's first mastery credit. Correcting a miss in the same
attempt does not clear it. Practice has its own session counter and does
not award quest stars or alter quest accuracy. The old practice picker
counts only its legacy questions; grade practice is on the grade home.

The ten-kingdom journey uses a separate `completed` list. Correct answers after
a hint or miss finish a story for the journey but do not earn independent
mastery. A revealed solution counts as finished only after explicitly moving
on. Such stories remain in Practice. Practice can finish a story and earn its
first independent solve, while keeping its own statistics and no quest stars.
Next quest skips finished stories if practice replaced its checkpoint, so a
practice trip does not restart the original quest.

Main state is an additive `gradeAdventure` field inside the existing main
key, including the checkpoint and help/attempt flags. Profile-dependent
reads wait for the bridge; no standalone data is inherited by a profile.
Both new and legacy reset controls clear the two registered keys and call
the hub reset API. See `GRADE_ADVENTURE_RELEASE.md` for tests and source data.

### Earlier adventures

✓ Mistake tracking — **always-on (any mode)**, mirrored to a
  dedicated `wordProblemAdventure_wrongs_v1` key
✓ Practice mode — practice grid UI in-game (unchanged)
✓ Hub registration — array form
✓ Reset wipes both keys
✓ One-time per-profile migration of legacy inline wrongs

## Storage

- Main state: `wordProblemAdventure_v1` (carries per-type `wrongIds`
  inline so the existing practice-grid UI keeps working unchanged).
- Wrongs (spec-compliant authoritative store):
  `wordProblemAdventure_wrongs_v1` with shape
  `{ v: 2, byType: { [type]: [record] } }` where each record is
  `{ qid, missCount, yourAnswers[≤5], errorTags[≤5], firstMissedAt,
  lastMissedAt }`. Resolved mistakes are removed (spec flavor A).
  The old id-string shape (`[qid]`) upgrades lazily in
  `loadWrongsStore()` — old profiles keep their saved wrongs.
- `errorTags` come from `diagnoseWrongAnswer()` (index.html), which
  parses each question's `visual` equation back into operands and
  matches the kid's wrong answer against misconception foils:
  `op-swap`, `inverse-trap`, `first-step-only`, `second-step-swap`,
  `fact-slip`, `quotient-not-remainder`, `remainder-not-quotient`,
  `remainder-round-up/-down`, `off-by-one`. The same diagnosis drives
  the first-wrong feedback lead ("You added — but this story takes
  some away") instead of a generic "try again".
- Every `addPracticeWrong` / `removePracticeWrong` mirrors to the new key.
- On boot AND on profile-ready / setProfile messages, a one-time
  migration runs: if the new key is empty for this profile, the inline
  per-type `wrongIds` are copied across (as v2 records). Subsequent
  loads are no-ops.

## Entry points

- "Practice" affordance — see the `.practice-intro` / `.practice-grid`
  / `.practice-card` sections in `index.html`.
- Each storyline keeps its own wrongs list; the practice grid surfaces
  them grouped by storyline.

## Where to look first

- `games/word-problem-adventure/index.html` — search for `practice`,
  `wrongs`, `.practice-card`.
- `games/word-problem-adventure/tools/gen_banks.py` and
  `gen_extended_banks.py` — question bank generators (don't break the
  bank shape when adding fields to the wrongs record).
- `validate_banks.py` — runs after regeneration to catch malformed
  question shapes.

## When you change this game

If you split wrongs into a dedicated `_wrongs_v1` storage key, also:
1. Update `shared/scripts/hub.js` `storageBase` to the array form.
2. Migrate existing inline wrongs into the new key on first load (one
   time, then never again — per the project's "no silent legacy
   migration" rule, this is a per-game-version cleanup not a general
   import).
3. Update the status table in the project-root spec.
