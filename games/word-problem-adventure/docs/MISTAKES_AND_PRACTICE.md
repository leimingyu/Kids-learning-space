# Mistakes & Practice — Word Problem Adventure

See the project-root `MISTAKES_AND_PRACTICE.md` for the canonical
cross-game spec. This file documents this game's implementation.

## Implementation status

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
  `wordProblemAdventure_wrongs_v1` with shape `{ byType: { [type]: [qid] } }`.
- Every `addPracticeWrong` / `removePracticeWrong` mirrors to the new key.
- On boot AND on profile-ready / setProfile messages, a one-time
  migration runs: if the new key is empty for this profile, the inline
  per-type `wrongIds` are copied across. Subsequent loads are no-ops.

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
