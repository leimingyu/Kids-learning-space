# Sharing → written division

Integrated October 28, 2026 from the approved playable lesson.

Open Long Division Coach from the hub. The default learning home offers:

1. **Watch sharing:** 432 ÷ 3, with directional arrows, equal groups and animated exchanges of a hundred for ten tens, or a ten for ten ones.
2. **Solve together:** write each step of 528 ÷ 3 on the division board.
3. **Try solo:** 672 ÷ 4, 738 ÷ 3 and 864 ÷ 4, followed by optional zero-quotient and remainder challenges.

Answers are checked only on Enter or **Check answer**. Completing the last subtraction finishes the equation immediately; there is no large-multiplication gate. A celebration advances to the next equation after about two seconds. **Stay & read** pauses that advance. **Why does my answer fit?** opens an optional visual explanation without counting it as a division hint.

**Daily mission** and **More practice · Easy / Medium / Hard** retain the earlier game, including two-digit divisors, streaks and its tricky-problem queue. **Learning home** returns from that screen. An earlier advanced checkpoint has its own Continue button; opening learning does not discard it.

## State and safety

- The existing `longDivisionCoach_v1__<profileId>` key gains `learningJourney` and optional `classicSession` fields. Calendar/streak data and the existing wrongs key are retained. Standalone uses the original unscoped keys; no unscoped data is imported into a profile.
- The shared backup envelope and storage registry do not change. Backups include the extended raw game key automatically.
- A learning checkpoint is `{v:2,module:'learning',learningJourney,classicSession}`. Earlier v1/v2 classic checkpoints still restore through the earlier engine. Pending checkpoints are preserved verbatim until the child chooses Continue or Learning home.
- Mount, load and restore do not award stars, save, record errors or restart automatic advancement. Completed boards restore paused. Guided completion earns coaching credit; solo rewards depend on actual accepted answers, mistakes and division hints. Watching earns no mastery stars.
- Wrong answers and division hints immediately enter the profile's existing tricky queue. Clean replay resolves the entry. Unsupported lesson equations replay in the earlier practice engine.
- Home preserves drafts and earlier sessions. Save captures the active draft, retries failed writes and lets the bridge report failure if storage remains unavailable. Suspended sessions cancel animations and timers and cannot write progress.
- A mission checkpoint taken between problems resumes the next unsolved problem without awarding the completed problem again.

## Files

- `division-core.js`: immutable arithmetic and validated answer-history replay.
- `sharing-player.js`: value-conserving base-ten motion, arrows and reduced-motion rendering.
- `learning-journey.js` / `.css`: scoped learning UI and lifecycle API; no storage dependency.
- `script.js`: profile-scoped persistence, old-game adapter, rewards, Home and checkpoint contract.

## Verification

```sh
node games/long-division-coach/tests/smoke-division-core.mjs
node games/long-division-coach/tests/smoke-sharing-player.mjs
node games/long-division-coach/tests/smoke-learning-journey.mjs
node games/long-division-coach/tests/smoke-save-compatibility.mjs
node games/tests/smoke-game-startup.mjs
node games/tests/smoke-session-checkpoints.mjs
node tests/smoke-save-session.mjs
```

Browser QA covers sharing arrows, real Enter input, Home/Continue, advanced practice, hub Save/reopen and narrow layouts. Synthetic test data stays separate from existing family profiles.
