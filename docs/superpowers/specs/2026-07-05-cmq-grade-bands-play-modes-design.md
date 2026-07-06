# Cosmic Math Quest — Grade Bands + Mode Arcade (design spec)

- **Date:** 2026-07-05
- **Status:** approved design, pre-implementation
- **Game:** `games/cosmic-math-quest/`
- **Decisions made with the user:** direction = grade setting + mode tiles hybrid; all four grade bands built in one release; launch modes = Mission, Boss Battle, Lightning, Fix-It, plus daily review weave-in; drift-up at mastery; grade is kid-changeable; G2 covers the full 12×12 table with a taste of sharing division; remainders debut in G4; G5 includes order-of-operations.

## 1. Goal

Simplify the play interface — remove the easy/medium/hard picker and the multiply/divide picker entirely — and replace them with:

1. a **one-time grade setting** (2/3/4/5) per profile that selects a content *band*,
2. a menu of **play-mode tiles** (Mission, Boss Battle, Lightning, Fix-It) that all draw from the same banded, mixed question pool,
3. the existing **adaptive tier** re-anchored to the grade band, plus a **drift-up** rule for kids who master their band.

### Non-goals (out of scope)

- Wiring `bridge.stars()` to the hub (stars stay internal, as today).
- A journey/planet map, daily-quest session framing, or addition/subtraction content.
- Migrating or rewriting old wrong-answer records (they must keep working as-is).

### Invariants that must survive (from `docs/01_coordinator_master_plan.md` and root specs)

Hearts, streaks, hints, typed answers, the review/practice mode, the mistake-recording contract (`MISTAKES_AND_PRACTICE.md`: record only final graded commits, dedupe by key with `missCount++`, practice stats separate from stars), profile-scoped storage, standalone `file://` play, and "Reset my progress". No pre-game interstitials: scaffolds only on the failure path.

## 2. Menu & first-run

- Delete both segment rows ("Choose level", "Choose mode") from `#screen-menu`.
- **First run per profile:** the menu itself shows a card — *"Which grade are you in?"* — with four big buttons (2/3/4/5). Mode tiles are visible but disabled until a grade is picked. This is a one-time menu state, not an interstitial; it never appears before a round again.
- **After first run:** a small chip near the header — `🌌 Grade 3 · change` — tapping it re-opens the same four buttons inline. The kid may change grade freely at any time; changing grade loses no data.
- Menu contents after redesign: mascot/header, grade chip, four mode tiles (🚀 Mission, 🎯 Boss Battle, ⚡ Lightning, 🔧 Fix-It with a due-count badge), the existing "Continue my last session" row, My Progress, How to play, Reset.

## 3. Grade bands — content recipes

Every mode draws from the active band. Recipes are per-round format quotas (implemented like today's hard-mode subtype order builders: fixed quotas per 10 slots, shuffled). Rounds longer than 10 questions (Boss Battle) extend the plan by cycling the shuffled recipe. The adaptive tier (−1/0/+1) shifts *number ranges within* the recipe; it never changes the format quota. Operation balance: G2 is ~90% multiplication / 10% division; G3–G5 target roughly 50/50 across a round.

### Grade 2 — "Learn the whole table" (new generator)

| Format | Quota (per 10) | Details |
|---|---|---|
| Multiplication recall | 7 | `a × b = ?`, a, b ∈ 1–12 (the full 12×12 chart) |
| Equal-groups / array picture problems | 2 | one-sentence word problems with visual support |
| Sharing division | 1 | gentle sharing (`10 ÷ 2`, `20 ÷ 5`) with picture support, drawn only from tables at or below the kid's current tier comfort |

- Tier −1: pattern tables (×1, ×2, ×5, ×10). Tier 0: ×3, ×4, ×6–×9. Tier +1: ×11, ×12 and larger products.
- Visuals (arrays / equal groups) attach to hints and wrong-answer feedback, exactly like today's easy level.
- The existing guards `isTooEasyForEightYearOld` and "answer must be ≥ 2" are **bypassed for G2 only** (they were tuned for the old 8-year-old easy level; G2 legitimately includes 1×1).

### Grade 3 — "Same table, thinking backwards" (existing generators, re-bucketed)

| Format | Quota | Details |
|---|---|---|
| Recall | 3 | weighted toward the hard tables (6–12) to keep facts warm |
| Missing factor / missing divisor | 3 | `? × 7 = 42`, `56 ÷ ? = 8` (today's medium) |
| Division facts | 2 | direct division from the 12×12 table, dividends ≤ 144 |
| One-step word problems | 2 | at table-fact number sizes |

- Tier −1 favors tables 2–6; tier +1 favors 7–12.

### Grade 4 — "One number gets big" (part existing, part new)

| Format | Quota | Details |
|---|---|---|
| Multi-digit × 1-digit | 3 | 2-digit × 1-digit at tier 0 (34 × 6); 3-digit × 1-digit at tier +1 (214 × 3) — **new** |
| Long division, 1-digit divisor | 2 | 2-digit dividends at tier −1/0, 3-digit at tier +1; exact at tier −1, **remainders appear at tier 0/+1** (68 ÷ 5 = 13 R 3) — **new**; the `R __` input box debuts here |
| Two-step word problems | 2 | today's hard word problems, extended to two steps |
| Inverse / reasoning | 2 | today's hard inverse + reasoning-compare + true/false, factors to 12 |
| Recall warm-up | 1 | table facts, weighted to 11s/12s |

### Grade 5 — "Both numbers big + patterns" (new generators)

| Format | Quota | Details |
|---|---|---|
| Big multiplication | 2 | 2-digit × 2-digit (23 × 47); tier +1 unlocks 3-digit × 2-digit |
| Long division, 2-digit divisor | 2 | 96 ÷ 16; some with remainders (250 ÷ 40 = 6 R 10) |
| ×10 / ×100 patterns | 2 | 40 × 70 = 2800, 5400 ÷ 60 = 90 |
| Order of operations | 2 | two-operation expressions where the mult/div part is a table fact, in the forms term+c and term−c: `4 × 6 + 12`, `45 ÷ 9 − 3`. No parentheses; the mult/div term always comes first at tier −1/0; tier +1 may lead with the added term (`12 + 4 × 6`). Answers are positive integers. (Mult/div-chained forms like `45 ÷ 9 × 3` are deliberately out of scope.) |
| Multi-step word problems | 1 | |
| Reasoning | 1 | compare / true-false at G5 number sizes |

### Generator module

New file **`games/cosmic-math-quest/gradeBands.js`** (pattern: `learningIntelligence.js`) exposing `window.GradeBands` — band recipes, the new G2/G4/G5 generators, and band-aware validation. `index.html` consumes it behind `typeof GradeBands !== 'undefined'` guards so standalone play never hard-depends on load order. Rationale: `index.html` is already 4,587 lines, and a separate module is node-smoke-testable with the existing eval-into-faked-window pattern.

Band-aware validation replaces the global guards where they conflict: G2 allows trivial facts and answers < 2; G4/G5 allow remainder questions; G5 order-of-operations prompts are exempt from the "reject `+` / digit-minus-digit in prompt" rule.

## 4. Engine

### Adaptive tier

`GameState.adaptiveTier` (−1/0/+1) keeps its exact rules (up on correct with streak ≥ 3, down on 2+ wrong in last 4, at most one step per two questions, reset per round, disabled in review) but re-anchors from easy/medium/hard to the grade band, biasing number ranges as described per band above.

### Drift-up at mastery

- **Trigger:** ≥ 80% `masteryPct` on ≥ 5 of the band's relevant fact families, each with ≥ 20 attempts (from the existing `familyStats`).
- **Effect:** each Mission round sprinkles 1–2 **⭐ Bonus Challenge** questions drawn from the *next* band's gentlest format (Mission-only: a Boss round ends at HP 0 before appended slots would appear, so bonuses there would be dead weight): G2→G3 = gentle missing-factor; G3→G4 = 2-digit × 1-digit with product ≤ 100; G4→G5 = ×10 patterns. G5 has no next band → no drift.
- **Semantics:** bonus questions never cost a heart, are **excluded from accuracy and star computation**, award +15 points when correct, and a miss is recorded to the wrongs store (it is a graded commit) so practice picks it up.

## 5. Play modes

All modes draw from the active band recipe and feed the same graded-answer pipeline (`recordWrongAnswer`, `recordFamilyAttemptsForQuestion`) — every graded commit is recorded, nothing else.

### 🚀 Mission
Today's game unchanged: 10 questions, 5 hearts, hints, streak bonuses, 1–5 stars via `computeStarsForNormalRound`.

**Daily review weave-in (Mission only):** at round start, if due mistakes exist (`nextReviewAt ≤ now`), up to 2 due question snapshots replace slots 3 and 7, marked with a small 🔁 chip. They behave as normal Mission questions (heart loss, accuracy, points) — and a correct answer *additionally* resolves the stored mistake through the same path practice uses (`resolveMistake`).

### 🎯 Boss Battle
Untimed. Boss starts at 10 HP. Correct answer = 1 damage; the third-and-beyond consecutive correct is a ⚡ critical hit for 2. Wrong answer = boss recharges +1 HP (capped at 10, and streak resets). No hearts. Ends at HP 0 (big celebration) or after 16 questions — "The boss escaped — you'll get it next time!" with a friendly results screen either way. Stars: same accuracy-based formula as Mission. Full band recipe.

### ⚡ Lightning
90-second sprint, no hearts. Gentle timer bar, `prefers-reduced-motion` aware; framing stays low-pressure ("beat your own best"). Uses only the band's **fast formats** — recall, missing factor, division facts, and ×10 patterns; no word problems, no long-form multi-digit, no order-of-operations (reading/working long problems under a timer is unfair). Stars capped at 3 so Mission stays the star-richest mode: +1 for playing (≥ 5 answers committed), +1 for a new personal best (`bestLightningByGrade`), +1 for ≥ 90% accuracy. Timer expiry mid-question discards the unanswered question (not a graded commit). Wrong answers are recorded as mistakes normally.

### 🔧 Fix-It
One tile with a due-count badge (e.g., "3 due") replacing the three smart-practice buttons. One tap starts a single smart set built with priority **due today → recent → most missed**, deduped by key, 5–10 questions, using the existing set builders. Friendly empty state: "No tricky questions right now! 🎉". Practice rules unchanged: no hearts, no stars, correct = resolved, wrong = re-recorded. The results screen keeps its single "Fix tricky questions" button.

## 6. Stars & badges

- The 1–5 star formula, `totalStars`, and all existing badge ids survive unchanged.
- Badge `hard` keeps its stored id (saved badges stay valid) but is re-earned as "4+ stars in a Grade 4 or 5 round" and relabeled **Challenger**.
- Badge `perfect` stays Mission-only (10/10, no hints).
- Two new badges: **Boss Slayer** (`boss_slayer`, first boss defeated) and **Lightning Streak** (`lightning_streak`, beat your Lightning personal best twice).
- Fix-It/practice still awards no stars; Lightning caps at 3; Mission and Boss use the full formula.

## 7. Data & compatibility (no migration required)

- **Progress blob** (`cosmicMathQuest_v1[__pid]`): add `grade: 2|3|4|5|null` (null = not yet picked) and `bestLightningByGrade: {2:n,3:n,4:n,5:n}`. Purely additive; `ensureProgressShape` backfills. Keys and hub `storageBase` registration unchanged.
- **Wrong records:** new records gain `grade` and `playMode` fields and keep the `level` field for backward compatibility, derived from format: recall → `easy`, missing → `medium`, everything else → `hard`. Old easy/medium/hard records replay verbatim in Fix-It (existing `interleaveByLevel` and snapshot-replay paths untouched). Remainder questions store `meta.remainder` and the full answer in the snapshot so practice can re-render the `R __` box.
- **Resume blob** becomes `{v:2, screen, playMode, grade}`. A stale v1 blob restores the screen only (its `level`/`mode` are ignored).
- **`learningIntelligence.js`:** `FAMILY_FACTORS` extends from [3–9] to [2–12] (×1 stays untracked). New-format family mapping: multi-digit × 1-digit → the 1-digit factor's family; long division by 1-digit → the divisor's family; ×10 patterns → the underlying table fact's families (40 × 70 → `mul:4`, `mul:7`); order-of-operations → the embedded table fact's families; 2-digit-divisor division and 2-digit × 2-digit → no family (the module's unknown-kind path already degrades gracefully).
- **`GameState`:** `level`/`lastRoundLevel` replaced by `grade`/`bandTier` and `lastPlayMode`.
- Standalone `file://` play and profile scoping work as today (un-scoped base key standalone; `__<profileId>` embedded; no silent legacy migration). **Reset keeps the grade choice** (it's identity, not progress) while wiping both storage keys and calling `bridge.resetProgress()`.
- If the wrongs-record additions change the documented shape, update `games/cosmic-math-quest/docs/MISTAKES_AND_PRACTICE.md` (and the root spec's status table) in the same change.

## 8. Deletions

- The two menu segment rows and their click handlers.
- Results-screen "Change level" and "Change mode" buttons (Play again / Back to menu remain).
- The three smart-practice button rows on menu and results (superseded by the Fix-It tile; results keeps "Fix tricky questions").
- `GameState.level`, `lastRoundLevel`, and the level-anchored generation entry points (superseded by band recipes).

## 9. Testing

- **Extend** `tests/smoke-learning-intelligence.mjs`: families 2–12, multi-digit/pattern/order-of-ops family mapping.
- **New** `tests/smoke-grade-bands.mjs` (same eval-into-faked-window pattern): recipe quotas sum to 10 per band; every generated question passes band validation; range assertions per band (G2 factors ∈ 1–12; G4 remainders satisfy `divisor × quotient + r = dividend, 0 < r < divisor`; G5 order-of-ops answers positive integers; Lightning format filter excludes slow formats).
- **Manual QA checklist:** each mode per band; grade first-run + change flow; weave-in resolves a due mistake; boss escape path; Lightning timer expiry mid-question; old-profile compatibility (pre-change wrongs replay in Fix-It); standalone `file://` pass; reduced-motion pass; reset behavior.

## 10. Build order

One release (per user decision), built as three reviewable chunks on a feature branch:

1. **`gradeBands.js` + generators + smoke tests** — new module fully tested before any UI changes; game still runs on the old UI.
2. **Menu redesign** — grade picker/chip, mode tiles, Mission wired to bands, Fix-It consolidation, deletions, resume blob v2, record `grade`/`playMode` fields.
3. **Boss Battle + Lightning + drift-up + review weave-in + new badges.**

Each chunk leaves the game playable; merge once the full QA checklist passes.
