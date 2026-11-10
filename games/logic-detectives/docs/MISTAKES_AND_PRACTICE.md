# Mistakes and Practice — Logic Detectives

The canonical cross-game requirement is in the root
`MISTAKES_AND_PRACTICE.md`. This game uses **Flavor A: exact replay**.

## Stores and profile scope

- Main state base: `logicDetectives_v1`.
- Mistake base: `logicDetectives_wrongs_v1`.
- Embedded keys: `<base>__<activeProfileId>`.
- Standalone keys: the un-scoped bases, with no automatic migration to a profile.

Both bases are registered in `GAMES[].storageBase` so backups discover every
profile's state. The store refuses all key access before embedded binding.

The main store includes additive `conceptRuns` and `conceptMastery` containers
for Grade 3's Magic Square Lab, Parentheses Workshop, and Rule Detective. The
36 concept puzzles use the same profile scope and existing base keys. Unknown
JSON fields in both stores remain preserved.

## Authoritative record

The wrongs store is an object keyed by stable question ID. Each value retains:

```js
{
  questionId: 'g2-...',
  questionShape: { /* full original puzzle, including fixed clues */ },
  grade: 2,
  skill: 'pattern:shapes', // or pattern:flags, table, sticks, magic, parentheses, rule
  yourAnswer: { /* submitted picture features, numbers, signs, or stick state */ },
  correctAnswer: { /* completion, numbers, or all legal stick solutions */ },
  timestamp: 'ISO-8601',
  attempts: 1,
  resolved: false
}
```

The snapshot preserves the actual question rather than regenerating a different
question from its skill name. The store preserves additive JSON metadata.

## Recording

Record a mistake only after a complete answer is submitted and graded wrong.
Repeated misses of the same question increment its existing `attempts`; they do
not create duplicates. A previously resolved record becomes unresolved if that
question is missed again.

Do not record incomplete submissions, partially typed numbers, picture-feature
changes, stick exploration, Undo, hints, optional explanation views, or popup
dismissal as wrong answers. Hint usage is retained on the attempt and prevents
that attempt from counting as an independent solve.

Choosing a concept sign or typing a number only edits the draft. A concept
mistake is recorded only after every required field is filled and an explicit
Check (or Enter from a numeric field) commits an incorrect answer. Native Enter
on a sign dropdown chooses or opens its menu and does not submit an answer.

## Replay and resolution

The home board exposes **Practice tricky puzzles** with the unresolved count for
the selected grade. Its friendly empty state is shown when there are none.
Practice selects up to five unresolved question IDs, oldest first, and replays
their original puzzles. The child uses the same controls and explanations as
ordinary play.

The Grade 3 queue includes concept mistakes alongside its existing case puzzles.
It replays the stored magic-square clues, parentheses rewrite, or X/Y table and
rule fields exactly, rather than generating another puzzle of the same family.

A correct replay with no hints and no wrong attempts resolves the record. A
correct answer after help is still celebrated, while the question remains for
a later independent retry. Clearing the queue produces a positive completion
message.

Tricky practice statistics are separate from case statistics. Tricky practice
does not award case stars, add mastery, grant badges, or overwrite an unfinished
case. Unique independent mastery can be earned once per puzzle in a case or
Quick practice; repeating it cannot inflate the count or duplicate a stable
badge.

Concept practice has separate independent mastery and one resumable five-puzzle
checkpoint per concept. An independent concept solve outside Tricky practice
updates `conceptMastery`; it adds no case stars or case badges. Tricky practice
does not add concept mastery or replace an unfinished concept run.

## Reset, backup, and failure behavior

Explicit Reset my progress clears both keys for the active profile and resets
the hub's `logic-detectives` record. Other profiles and standalone keys remain.
The game blocks writes while a restore journal is prepared. Failed writes remain
available in the current tab for retry. Corrupt or future-version saves remain
protected until a successful explicit reload, restore, or explicit game reset.

The game's mistake/history schema does not change backup envelope version 1.
Reset also clears the active profile's concept checkpoints and concept mastery.
Shared backup coverage is exercised by `tests/smoke-backup.mjs`; store isolation
and failure recovery are covered by `tests/smoke-storage.mjs`.
