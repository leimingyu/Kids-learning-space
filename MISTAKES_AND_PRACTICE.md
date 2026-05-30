# Mistakes & Practice — cross-game design requirement

**Every game in this repo must:**
1. **Remember the kid's mistakes** (profile-scoped) so they're not lost
   between sessions.
2. **Expose a "Practice" affordance** that lets the kid replay or
   remediate those mistakes — separate from normal play.

This is a hard requirement, not a nice-to-have. Daily-practice kids
benefit most from targeted re-exposure to what they got wrong, and
parents need to see that the games are actually improving weak spots
rather than just generating fresh randoms.

Cosmic Math Quest (`games/cosmic-math-quest/`) is the reference
implementation. Read its `learningIntelligence.js` and the
`btn-practice-wrongs` flow in `index.html` before designing a new
mistake/practice layer.

---

## What counts as a "mistake"

A mistake is one *graded question* the kid got wrong. The minimum
record:

```
{
  questionId:    "string-or-canonical-key",  // stable across sessions
  questionShape: { …game-specific },          // enough to re-present
  yourAnswer:    "what the kid typed",
  correctAnswer: "what the engine expected",
  timestamp:     "ISO-8601 string",
  attempts:      n,                           // wrong tries before move-on
  resolved:      false                        // flipped true on later success
}
```

Games may add fields (fact family, level, problem template, etc.) but
must include at least the four marked above.

### When to record
- After the engine grades a step or problem as wrong.
- Don't record mid-typing, mid-hint, or mid-reveal — only on final
  graded commits.
- Same question wrong twice in a row counts as one *record* with
  incremented `attempts`, not two records.

### When NOT to record
- Watch / Demo / auto-step modes.
- Anything the kid did inside the worked-example replay or hint preview.

---

## What counts as "Practice" mode

A mode (or top-level affordance) where the kid replays mistakes,
remediates weak topics, or both. Not the same as normal "free play."

Two flavors are acceptable; pick the one that fits the game:

### Flavor A — Replay queue
Just re-present the saved mistake questions, in a sensible order. The
kid solves them; correct → mark `resolved: true` and remove from active
queue. Long Division Coach, Word Problem Adventure, and Let's Learn
Fractions can all use this.

### Flavor B — Adaptive remediation
Use a learning-intelligence layer (like Cosmic Math Quest's
`learningIntelligence.js`) to detect weak fact families or topic
clusters from the mistake history, then *generate* fresh questions in
those weak areas. More powerful, more code. Suitable when the question
space is parametric (multiplication facts, fraction comparisons).

### Practice mode must:
- Be discoverable from the main game UI (button, top-level mode, tile
  badge — game's choice).
- Be empty/disabled if there are no mistakes yet, with a friendly
  empty state ("No tricky questions yet — keep playing!").
- Track its own session stats separately from normal play, so progress
  in practice doesn't pollute the main streak/star economy.
- Not double-count mistakes — a problem missed in practice gets its
  `attempts` incremented but doesn't create a duplicate record.

---

## Storage — profile-scoped, like everything else

Per the project CLAUDE.md "Per-profile state" invariant, mistake
history MUST be scoped by the active hub profile id. The standard
pattern is a separate storage key from the game's main state:

```
key = `<gameSlug>_wrongs_v1__<profileId>`         // when embedded
key = `<gameSlug>_wrongs_v1`                      // standalone fallback
```

Why a separate key (vs. inlining into the game's main state blob):
1. Backup/restore can ship just the mistakes if a kid switches devices.
2. The mistakes list grows unboundedly; isolating it keeps the main
   state blob small and parseable.
3. Cosmic Math Quest already uses this pattern; new games should match.

Register the separate base in the hub's `GAMES` array so backup
discovers it:

```js
storageBase: ['<gameSlug>_v1', '<gameSlug>_wrongs_v1'],
```

`shared/scripts/backup.js` already supports array `storageBase`.

### Privacy / scope rules
- Don't ship mistakes off-device. They live only in the local profile.
- Reset in any game also clears its mistakes for the active profile
  (call `localStorage.removeItem` on both keys, plus
  `bridge.resetProgress()`).
- Never silently migrate un-scoped legacy mistakes into a profile.

---

## UX recommendations (not strict requirements)

- **Surface in the chrome bar.** A "Tricky Q's: 5" badge on the game
  tile in the hub is high-leverage — kids see the count and feel pulled
  to clear it.
- **Cap the active queue.** Beyond ~20 unresolved mistakes, oldest
  ones fall out (or get archived). A wall of 100 wrong questions is
  demoralizing.
- **Celebrate "all caught up."** When the queue empties, a small
  positive moment (sticker, confetti, mascot line). Pairs well with the
  completion-overlay pattern.
- **Don't surface mistakes during Game Mode missions.** Streak runs
  should be uninterrupted. Show the practice nudge between missions,
  not mid-flow.

---

## Per-game implementation status

| Game | Mistake tracking | Practice mode | Notes |
| ---- | ---------------- | ------------- | ----- |
| `cosmic-math-quest`     | ✓ (`cosmicMathQuest_wrongs_v1`) | ✓ "Fix Tricky Questions" | Reference implementation. Uses adaptive remediation (Flavor B). |
| `word-problem-adventure` | ✓ (`wordProblemAdventure_wrongs_v1`, mirror of inline per-type `wrongIds`) | ✓ practice grid | Always-on recording (any mode). Inline blob also still carries wrongIds for the existing UI; mirror layer is the spec-compliant authoritative store. |
| `lets-learn-fractions`  | ✓ (`letsLearnFractions_wrongs_v1`) | ✓ "Practice tricky pizzas (N)" home button | Replay queue (Flavor A). Profile-scoped via bridge. Reset wipes the queue. |
| `long-division-coach`   | ✓ (`longDivisionCoach_wrongs_v1`) | ✓ "Tricky problems (N)" toolbar pill | Practice mode + replay queue (Flavor A). Records problem-level on Practice-mode completion when the kid struggled (wrong attempts / hints / reveal). |

Update this table when you ship the feature in a game.

---

## When you add it to a game

1. Read the canonical record shape above and the existing reference in
   cosmic-math-quest.
2. Decide flavor A (replay) or B (adaptive).
3. Add a separate `wrongs_v1` storage key, profile-scoped.
4. Register both bases in `shared/scripts/hub.js` `GAMES[].storageBase`.
5. Hook the game's wrong-answer event into a `recordMistake(record)`
   function.
6. Build the Practice affordance — empty state, queue rendering,
   resolution semantics.
7. Wire the game's Reset to also clear the mistakes store.
8. Update the per-game `docs/MISTAKES_AND_PRACTICE.md` with the
   storage key, record shape, and where in the code the integration
   lives.
9. Update the status table above.
