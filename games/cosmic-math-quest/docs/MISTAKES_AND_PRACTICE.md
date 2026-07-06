# Mistakes & Practice — Cosmic Math Quest

This game is the **reference implementation** for the cross-game
mistakes-and-practice requirement. See the project-root
`MISTAKES_AND_PRACTICE.md` for the canonical spec.

## Implementation status

✓ Mistake tracking — full
✓ Practice mode — full ("Fix Tricky Questions")
✓ Adaptive remediation via `learningIntelligence.js`

## Storage

- Main state:   `cosmicMathQuest_v1` (profile-scoped: `__<profileId>` suffix)
- Mistakes:     `cosmicMathQuest_wrongs_v1` (also profile-scoped)
- Both keys registered in `shared/scripts/hub.js` `GAMES[].storageBase`
  as an array.

## Record shape

Stored in `index.html` under `wrongAnswerStore`:

```
{
  wrongAnswersHistory: [ … all-time wrong records … ],
  recentWrongAnswers:  [ … current round's wrongs (snapshot) … ]
}
```

Each record includes the question shape, kid's answer, correct answer,
timestamp, attempts, and fact-family tags used by
`learningIntelligence.js` for weakness detection.

Since the grade-bands release, new records additionally carry:

- `grade` — the profile's grade band (2-5) at the time of the miss.
- `playMode` — `'mission' | 'boss' | 'lightning' | 'practice'`.
- `level` — KEPT for backward compatibility, now derived from the
  question format (recall/warm-up → `easy`, missing → `medium`,
  everything else → `hard`). Old easy/medium/hard records replay
  verbatim in Fix-It.
- `questionSnapshot.answerR` and `questionSnapshot.meta.remainder` —
  present on remainder questions (G4/G5 long division) so practice
  re-renders the `R __` input box.

Misses are recorded in every mode — Mission, Boss Battle, Lightning,
and drift-up bonus questions (a bonus miss is a graded commit even
though bonuses never cost hearts or accuracy).

## Entry points

- **"Fix Tricky Questions"** button (`#btn-practice-wrongs`) on the
  results screen.
- **"Fix Tricky Questions"** button (`#btn-game-over-practice`) on the
  game-over screen.
- Practice is a separate session — its stats live under
  `progress.stats.totalPractices` (badge after 5).

## Where to look first

- `games/cosmic-math-quest/learningIntelligence.js` — weak-area
  detection, fact-family scoring, remediation question specs.
- `games/cosmic-math-quest/index.html` — search for
  `WRONGS_KEY_BASE`, `wrongAnswerStore`, `mergeWrongIntoHistory`,
  `recentWrongAnswers`, and `btn-practice-wrongs`.
- Test: `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`.

## When you change this game

Don't regress the wrongs store schema without a migration. Other games
mirror this pattern; if you change shape, update the canonical spec at
the project root too.
