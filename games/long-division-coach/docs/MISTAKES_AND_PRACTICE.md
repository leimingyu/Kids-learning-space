# Mistakes & Practice — Long Division Coach

See the project-root `MISTAKES_AND_PRACTICE.md` for the canonical
cross-game spec. See also this game's `v2_DESIGN.md` for context on
the existing two-mode model.

## Implementation status

✓ Mistake tracking — `longDivisionCoach_wrongs_v1` (profile-scoped)
✓ Practice mode + replay queue ("Tricky problems (N)" pill in toolbar)
✓ Hub registration as array storageBase
✓ Reset wipes both keys

Records get pushed to the wrongs store on Practice-mode problem completion
when the kid showed they struggled (`attemptsThisProblem > 0`, hints used,
or reveal used). Clicking the pill replays the oldest queued problem; a
clean run resolves it.

## Recommended approach

**Flavor A — Replay queue** is the right pick. Long-division problems
are parametric (divisor + dividend), so replaying the *exact* problems
the kid got wrong is more pedagogically useful than generating fresh
ones in the same family.

A small Flavor-B extension could come later: detect *which phase* of
the algorithm the kid struggles with (divide / multiply / subtract /
bring-down) and bias problem generation toward exercising that phase.
The engine already tracks per-phase wrong counts in `app.attemptsThisStep`
and `app.attemptsThisProblem` — surfacing that is a small step.

## Proposed storage

- Main state base:  `longDivisionCoach_v1` (already registered in
  `shared/scripts/hub.js`).
- **New** wrongs base: `longDivisionCoach_wrongs_v1`.
- Update the GAMES registry entry to array form:
  `storageBase: ['longDivisionCoach_v1', 'longDivisionCoach_wrongs_v1']`.

## Proposed record shape

```
{
  questionId:    `${divisor}/${dividend}`,
  questionShape: { dividend, divisor, difficulty,
                   expectedQuotient, expectedRemainder },
  phaseWhereStuck: 'divide'|'multiply'|'subtract'|'bringDown',
  yourAnswer:    last wrong value the kid committed,
  correctAnswer: expected value at that phase,
  timestamp:     "ISO-8601",
  attempts:      number of wrong tries on the failed phase,
  hintsUsed:     copied from app.hintsUsedThisProblem,
  resolved:      false                 // flipped on clean replay
}
```

We deliberately record at the **problem level**, not the step level —
otherwise a single bad problem could create 4 records (one per phase).
`phaseWhereStuck` carries the most-failed phase for diagnostics.

## When to record

In `handleCheckOrAdvance`, at the point where the engine reaches
`phase === "done"` (Practice mode only, not Game mode mission play):
- If `app.attemptsThisProblem > 0` OR `app.hintsUsedThisProblem > 0`
  OR `app.revealUsedThisProblem`, push a record.
- A clean completion (3-star) does NOT record.
- If the same problem is later replayed cleanly, find the existing
  record and flip `resolved: true`.

## Proposed UX

- In the Practice mode header, add a small **"Tricky problems: N"**
  pill. Tapping it switches the practice flow to "replay mode":
  the queued problems come from the wrongs store instead of the
  random generator.
- When the queue empties, show the completion overlay with a special
  "You cleared all your tricky problems!" message + a `ldc-cleared-wrongs`
  sticker via `bridge.sticker(...)`.
- Game Mode missions never pull from the wrongs queue — keep them
  randomly generated for streak fairness.

## Integration points in the existing code

- Engine wrong signals already flow through `applyAnswerAndAdvance` →
  feedback `kind: 'error'`. `handleCheckOrAdvance` increments
  `attemptsThisProblem`. No engine changes required.
- `app.attemptsThisProblem`, `app.hintsUsedThisProblem`,
  `app.revealUsedThisProblem` are the inputs to the record decision.
- `scoreProblem()` already returns 1–3; treat `score < 3` as
  "interesting" but only record if the engine actually saw a wrong
  answer or hint, not just timing.
- `handleResetProgress` must also wipe the new wrongs key.

## Where to start

1. Add `longDivisionCoach_wrongs_v1` storage helpers next to the
   existing `loadProgress`/`saveProgress` pair in `script.js`.
2. Update the hub registry to the array form.
3. Hook the record-creation logic into the done branch of
   `handleCheckOrAdvance`.
4. Add the "Tricky problems" pill to the Practice mode UI and wire it
   to a replay-queue mode.
5. Update Reset to clear the new key.
6. Update both this file and the project-root status table when
   shipped.
