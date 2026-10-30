# Game session checkpoints

Implemented 2026-10-08 as part of the reliable save manager.

## Common contract

Profile readiness is acknowledged after DOMContentLoaded, once every game script
and checkpoint handler is installed. Early profile identity can be cached for
safe scoping, but resume and Save messages wait for initialization. Full-script
tests cover this ordering; extracted capture-function tests alone do not.

The shared chrome requests `requestState` before Save, Home, navigation, and
profile changes. Games first retry their pending browser writes, then synchronously
reply through `bridge.saveState(blob)`. A specific failed main or mistakes key
calls `reportStorageError(error, key)` and remains failed until that same key is
written successfully and `clearStorageError(key)` is called. Pending values stay
in memory for retry. Every profile-data write and removal checks
`bridge.assertCanWrite()` so an interrupted restore cannot be overwritten by a
running game. Sound and other device preferences keep their existing scope.

`resumeState` only offers Continue. It never starts play automatically, including
repeated hub messages. Saving or leaving during this choice preserves the pending
checkpoint rather than replacing it with the default menu. Home retains a live
session as a Continue offer; choosing a fresh adventure discards that offer.

These checkpoints live in the existing hub game record. No storage bases, slugs,
or backup envelope versions changed. Earlier checkpoint versions remain accepted;
their missing session fields retain their previous menu/start behavior. Standalone
mode remains usable, with its existing unscoped progress. The new hub contract
does not import standalone progress into a child's profile.

Word Problem Adventure always opens the current grade homepage for every
profile, even when the hub checkpoint belongs to an earlier adventure. A
combined v2 grade checkpoint can carry `earlierAdventure`, and the existing
main store retains it as `earlierAdventureCheckpoint`. Continue earlier
adventure explicitly opens it. Save captures both editions from either surface;
returning Home captures and pauses earlier play. Profile binding and reset
clear the old in-memory queue so no account inherits another's session.

## Exact captured state

| Game | New checkpoint | Preserved state |
| --- | --- | --- |
| Cosmic Math Quest | v3 | Questions and generation plan, index, score, hearts, Boss HP, remaining Lightning seconds, adaptive state, review queue and advance flags, displayed question, answer input/remainder, feedback, results |
| Let's Learn Fractions | v2 | Active pizza including choice order, session index/counts/streak, oven heat/progress, practice queue index, prior question keys, typed input, answered-result feedback, elapsed answering time |
| Word Problem Adventure, earlier adventures | v2 | Stable bank question IDs/order and daily level tags, current index, lesson/practice/daily context, completion/first-try/streak counters, wrong attempts/help/picture flags, draft, summary text |
| Word Problem Adventure, grades 2–5 | v2 | Exact session and summary, question IDs/index, hint/reveal/attempt/answer/replay flags, typed draft, Stay & read pause, settled quest rewards; old thinking notes remain compatible; registered main store owns mastery and kingdom completion |
| Long Division Coach | v2 | Problem and engine phase/work, typed draft, per-step/problem counters, undo history, session stats, mission problem sequence/index/stars, replay identity, feedback, completion/mission summary |

Answered-state flags and counters are restored without re-grading the question.
Lightning resumes the saved remaining duration and does not restore live timer
handles. Device sound preferences are excluded from Cosmic checkpoints.
Fraction mistake replay also repairs old records whose choice-answer metadata
was omitted, without discarding the records.

## Verification

`node games/tests/smoke-session-checkpoints.mjs` evaluates the actual game
capture/restore and storage functions with isolated in-memory storage. It checks
staging without automatic play, Save before Continue, exact state for each game,
answered-input locking, review pointer handling, remaining Lightning duration,
mission/undo/replay preservation, keyed quota failures, same-value retries,
and restore-journal guards. Rendering and time are controlled fakes, so this
test establishes state behavior rather than visual layout.

`node games/word-problem-adventure/tests/smoke-grade-adventure.mjs` runs the
actual grade engine in a DOM harness. In addition to its 400-question/reward,
profile isolation, and backup roundtrips, it verifies the live typed draft,
answered celebration, and Stay & read pause survive hub checkpoints and Continue.
Older notes-containing checkpoints remain accepted without rendering the removed
thinking-space field. It verifies failed main
and mistakes writes remain reported until Save successfully retries both.
Next quest resumes the unfinished quest or skips already finished stories;
Continue retains the saved feedback when requested explicitly. Final correct
quest answers settle stars before the celebration delay, and a saved reward
flag prevents duplicate stars or session statistics after reload.

The tests neither open a real browser profile nor read or modify real saves.

`node games/cosmic-math-quest/tests/smoke-startup-save.mjs` and
`node games/tests/smoke-game-startup.mjs` execute complete HTML script order with
the real bridge. They check all four games' early/late binding, immediate parent
resume, menu and live-draft Save, Home, Continue, and standalone startup. Long
Division's profile callbacks register only after its initial engine exists.

`node games/word-problem-adventure/tests/smoke-version-routing.mjs` checks the
actual earlier checkpoint helpers and bridge registration: old/new staging,
explicit Continue, combined capture, account clearing, and failed Save replies.
