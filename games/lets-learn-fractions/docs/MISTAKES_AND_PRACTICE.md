# Mistakes & Practice — Let's Learn Fractions

See the project-root `MISTAKES_AND_PRACTICE.md` for the canonical
cross-game spec.

## Implementation status

✓ Mistake tracking — `letsLearnFractions_wrongs_v1` (profile-scoped)
✓ Practice mode — "Practice tricky pizzas (N)" button on the home
  screen; clicking enters a session that pulls from the queue.
✓ Hub registration — single string `storageBase` (no main-state key
  exists for this game)
✓ Reset wipes wrongs (via `resetWrongs()`)

Implementation lives inside the inline `<script>` in `index.html`:
search for `WRONGS_KEY_BASE`, `wrongsStore`, `isTrickyPractice`,
`recordMistake`, `startTrickyPractice`. Profile-scoped storage was
added in the same change set (the game previously had no
`localStorage` whatsoever).

## Recommended approach

This game has a small, well-defined question space (slice the pizza,
compare pieces, find equal fractions), so **Flavor A — Replay queue**
is the right pick. No adaptive remediation needed initially.

## Proposed storage

- Main state base: `letsLearnFractions_v1` (currently NOT registered in
  `shared/scripts/hub.js` `GAMES[].storageBase` — add it).
- Wrongs base: `letsLearnFractions_wrongs_v1`.
- Register both as an array in the GAMES registry so backup discovers
  them.

## Proposed record shape

```
{
  questionId:    "slice-pizza-1/4-into-thirds",
  questionShape: { kind: "slice"|"compare"|"equal", numerator, denominator, ... },
  yourAnswer:    "kid's selection",
  correctAnswer: "engine expectation",
  timestamp:     "ISO-8601",
  attempts:      1,
  resolved:      false
}
```

## Proposed UX

- Add a small "Tricky pizzas: N" badge to the main menu when N > 0.
- Practice mode opens a queue screen: each wrong question is a small
  card, kid taps to retry.
- On correct retry → mark `resolved: true`, remove from queue.
- Empty state: "All pizzas perfectly sliced! 🍕"

## Where to start

1. Identify the engine's `grade(answer)` (or equivalent) call site in
   `index.html` and hook a `recordMistake(record)` after the wrong
   branch.
2. Add `letsLearnFractions_v1` and `letsLearnFractions_wrongs_v1` to
   the hub registry.
3. Build the practice queue screen and entry button.
4. Wire the existing Reset (if any) to also clear the wrongs store and
   call `bridge.resetProgress()`.
5. Update the status table in the project-root spec when shipped.
