# 08 — Test checklist, bugs, improvements

## Automated

Run from project root:

```bash
node tests/smoke-learning-intelligence.mjs
```

Covers: `getFactFamily`, `getWeakFamilies`, follow-up pool uniqueness, `recordFamilyAttempt` / `familyStats` shape.

---

## Manual acceptance (browser)

Use a fresh profile or clear site data first when testing persistence.

| # | Case | Steps | Expected |
|---|------|--------|----------|
| 1 | Wrong answer stored | Play mission, answer one question wrong | Hearts/lives update; after round, “Things to improve” / save shows activity |
| 2 | Appears in Quick Fix | After wrongs exist, Menu → **Quick Fix** | Practice session starts with those items (or recent/history fallback) |
| 3 | Correct → progress | Finish practice item correctly | Star/score in practice; `resolveMistake` clears item from active list; badges/stats may update |
| 4 | Mastery after repeats | Same fact wrong multiple times, then fix in practice | `masteryStage` → mastered when resolved; mistake can clear from list |
| 5 | Due Today | Ensure mistakes have `nextReviewAt` ≤ now (new mistakes schedule “now”) | **Due Today** starts a non-empty session when due items exist |
| 6 | No duplicate questions in smart practice | Start Quick Fix / Most Missed with ≥2 overlapping keys | `finalizeSmartPracticeSet` + `uniquePracticeRecordsFromBuffer` dedupe by `key` |

---

## Edge cases

| Edge | How to test | Expected |
|------|-------------|----------|
| Empty mistake list | Menu Quick Fix with no history | Empty-state message; no crash |
| All mastered | Resolve all mistakes | Due Today / Quick Fix empty until new wrongs |
| Rapid answers | Spam Check / Enter quickly | One submission per question (`answered` guard) |
| Reload persistence | Wrong answers + progress, reload page | `localStorage` restores history, stars, badges, `familyStats` |

---

## Bug list (current)

| Severity | Issue | Notes |
|----------|--------|------|
| Low | Legacy rows with `nextReviewAt: null` never appear in **Due Today** until a new wrong updates them | By design unless backfill is added |
| Low | `recordFamilyAttemptsForQuestion` saves progress on every graded answer | Extra `localStorage` writes; fine for typical use |

*No blocking defects found in code review for this pass.*

---

## Improvements (backlog)

1. Migration: set `nextReviewAt` for unresolved rows missing it so **Due Today** is useful on old saves.
2. Optional: debounce or batch `saveProgress` when only `familyStats` changes many times in one round.
3. E2E: add Playwright/Cypress later for full `index.html` flows.
4. Export: include `masteryStage` / `family` in text export for parent review.

---

## Sign-off

- [ ] All manual rows exercised on target browser(s)
- [ ] `node tests/smoke-learning-intelligence.mjs` passes in CI/local
