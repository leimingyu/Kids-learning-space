# Cosmic Math Quest — Grade Bands + Mode Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cosmic Math Quest's easy/medium/hard and multiply/divide pickers with a one-time grade setting (2/3/4/5) plus four play-mode tiles (Mission, Boss Battle, Lightning, Fix-It), all drawing mixed questions from grade-band recipes — with drift-up bonus questions at band mastery and due-review weave-in inside Missions.

**Architecture:** A new self-contained `games/cosmic-math-quest/gradeBands.js` module (IIFE on `window.GradeBands`, node-smoke-testable) owns the band recipes, generators, and band-aware validation (Tasks 1–6). `index.html` swaps its level/mode pipeline for `GameState.bandPlan` + a rewritten `generateRoundQuestionAtIndex`, redesigns the menu, and adds per-mode branches (Tasks 7–17). `learningIntelligence.js` widens fact families to 2–12 with baseFact-first mapping. Approved spec: `docs/superpowers/specs/2026-07-05-cmq-grade-bands-play-modes-design.md` — read it before starting any task.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step, must work over `file://`), Node ≥ 18 for smoke tests, `python3 -m http.server 8000` for manual QA.

## Global Constraints

- All work lands on branch `feature/cmq-grade-bands-modes`; every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `games/cosmic-math-quest/index.html` must stay fully playable standalone over `file://`: `gradeBands.js` is a plain `<script>` sibling (like `learningIntelligence.js`), consumed behind `typeof GradeBands !== 'undefined'` guards — no modules, no imports, no network.
- `gradeBands.js` must never reference an `index.html` global — node smoke tests eval it standalone.
- Preserve hearts, streaks, hints, typed answers, and review/practice mode. Mistakes contract (root `MISTAKES_AND_PRACTICE.md`): record only final graded commits; a repeated miss merges via `mergeWrongIntoHistory` (`missCount++`), never a duplicate record; practice awards no stars; profile-scoped storage keys `cosmicMathQuest_v1` / `cosmicMathQuest_wrongs_v1` and their hub `storageBase` registration are unchanged; never silently migrate legacy data.
- Old wrong-answer records (level `easy|medium|hard`, no `grade`/`playMode`) must replay verbatim in practice with zero migration.
- Question prompts use `×` and `÷`; ASCII `+`/`-` appear only in `g5_orderops` prompts (enforced by `validateBandQuestion`).
- `prefers-reduced-motion` must neutralize every new animation: boss HP bar transition and crit pulse off; Lightning bar hidden entirely (numeric countdown only).
- API names, format tokens, and the question-object shape come from the spec (§3, §7) and are restated in each task's **Interfaces** block — do not rename anything cross-task.
- Line numbers are PRE-EDIT hints only; anchor every edit by function/element name and read the current body first.
- KNOWN DEBT (intentional): Task 9 deletes the legacy generation *entry points* but keeps the old builder/picker complex (~lines 2455–3105 pre-edit) as unreachable dead code because it is internally cross-referenced; excising it wholesale is a post-release cleanup, deliberately out of scope here.

---
### Task 1: gradeBands.js skeleton — recipes, fast formats, round plans

The game (`games/cosmic-math-quest/index.html`) is one self-contained HTML file; new logic that needs node smoke tests lives in sibling standalone modules (pattern: `learningIntelligence.js`, an IIFE that attaches to `window`). This task creates the new `gradeBands.js` module with the band recipes and the round-plan builder, plus the new smoke-test file. Nothing in `index.html` is touched in this task; the game keeps running on its old UI.

**Files:**
- Create: `games/cosmic-math-quest/gradeBands.js`
- Create: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`
- Test: `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (run from the repo root)

**Interfaces:**
- Consumes: nothing (module is fully self-contained — it must never reference an `index.html` global, so node can `eval` it standalone).
- Produces: `window.GradeBands.GRADES = [2,3,4,5]`; `window.GradeBands.RECIPES` (per-grade format quotas summing to 10); `window.GradeBands.FAST_FORMATS` (per-grade Lightning-safe formats); `window.GradeBands.buildRoundPlan(grade, size, opts) -> string[]` (format tokens, length exactly `size`; `opts = {fastOnly:boolean}`).

**Steps:**

- [ ] Write the failing test. Create `games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (bootstrap copied from `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`, which fakes `window` as `globalThis` and `eval`s the source file):

```js
/**
 * Smoke tests for gradeBands.js (no browser).
 * Run from repo root: node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

globalThis.window = globalThis;
const code = readFileSync(join(root, 'gradeBands.js'), 'utf8');
eval(code);

const GB = globalThis.GradeBands;

// ---------- Task 1: recipes & round plans ----------

// 1) Every grade's recipe quotas sum to exactly 10
for (const grade of GB.GRADES) {
  const total = Object.values(GB.RECIPES[grade]).reduce((s, n) => s + n, 0);
  assert.strictEqual(total, 10, `recipe for grade ${grade} must sum to 10, got ${total}`);
}

// 2) buildRoundPlan(4, 10) has length 10 and matches the quota counts exactly
{
  const plan = GB.buildRoundPlan(4, 10);
  assert.strictEqual(plan.length, 10);
  const counts = {};
  for (const t of plan) counts[t] = (counts[t] || 0) + 1;
  assert.deepStrictEqual(counts, GB.RECIPES[4]);
}

// 3) buildRoundPlan(4, 16) cycles: 16 tokens, first 10 are the full recipe,
//    the remaining 6 are all recipe tokens
{
  const plan = GB.buildRoundPlan(4, 16);
  assert.strictEqual(plan.length, 16);
  const first10 = {};
  for (const t of plan.slice(0, 10)) first10[t] = (first10[t] || 0) + 1;
  assert.deepStrictEqual(first10, GB.RECIPES[4]);
  for (const t of plan.slice(10)) assert.ok(GB.RECIPES[4][t] > 0, `cycled token ${t} must come from the recipe`);
}

// 4) fastOnly plans only contain FAST_FORMATS tokens, for every grade
for (const grade of GB.GRADES) {
  const plan = GB.buildRoundPlan(grade, 12, { fastOnly: true });
  assert.strictEqual(plan.length, 12);
  for (const t of plan) assert.ok(GB.FAST_FORMATS[grade].includes(t), `grade ${grade} fast plan leaked slow token ${t}`);
}

console.log('smoke-grade-bands: Task 1 OK');
```

- [ ] Run it, expect FAIL because the module does not exist yet:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output ends with: `Error: ENOENT: no such file or directory, open '.../games/cosmic-math-quest/gradeBands.js'`

- [ ] Write the implementation. Create `games/cosmic-math-quest/gradeBands.js`:

```js
/**
 * Grade-band recipes, generators, and band-aware validation for Cosmic Math Quest.
 * Pattern: learningIntelligence.js — an IIFE attaching to window.
 * MUST stay self-contained (no index.html globals) so node smoke tests can eval it.
 */
(function (global) {
  'use strict';

  var GRADES = [2, 3, 4, 5];

  var RECIPES = {
    2: { g2_recall: 7, g2_picture: 2, g2_sharing: 1 },
    3: { g3_recall: 3, g3_missing: 3, g3_divfact: 2, g3_word: 2 },
    4: { g4_multidigit: 3, g4_longdiv: 2, g4_word2: 2, g4_invreason: 2, g4_warmup: 1 },
    5: { g5_bigmult: 2, g5_longdiv2: 2, g5_pattern: 2, g5_orderops: 2, g5_word: 1, g5_reason: 1 }
  };

  var FAST_FORMATS = {
    2: ['g2_recall'], // g2_sharing is a word problem — reading under a timer is unfair (spec §5 Lightning)
    3: ['g3_recall', 'g3_missing', 'g3_divfact'],
    4: ['g4_warmup'],
    5: ['g5_pattern']
  };

  var MAX_GENERATE_ATTEMPTS = 60;

  // ---------- small helpers ----------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Expand a grade's recipe {token: quota} into a flat 10-token array. */
  function expandRecipe(grade) {
    var recipe = RECIPES[grade] || {};
    var tokens = [];
    for (var fmt in recipe) {
      if (!Object.prototype.hasOwnProperty.call(recipe, fmt)) continue;
      for (var i = 0; i < recipe[fmt]; i++) tokens.push(fmt);
    }
    return tokens;
  }

  /**
   * Build a round plan of exactly `size` format tokens.
   * Normal: shuffled quota expansion, cycling a fresh shuffle when size > 10.
   * opts.fastOnly: round-robin over FAST_FORMATS[grade] (Lightning mode).
   */
  function buildRoundPlan(grade, size, opts) {
    opts = opts || {};
    var plan = [];
    if (opts.fastOnly) {
      var fast = FAST_FORMATS[grade] || [];
      if (!fast.length) return plan;
      for (var i = 0; i < size; i++) plan.push(fast[i % fast.length]);
      return plan;
    }
    while (plan.length < size) {
      var cycle = shuffle(expandRecipe(grade));
      if (!cycle.length) break;
      for (var j = 0; j < cycle.length && plan.length < size; j++) plan.push(cycle[j]);
    }
    return plan;
  }

  global.GradeBands = {
    GRADES: GRADES.slice(),
    RECIPES: RECIPES,
    FAST_FORMATS: FAST_FORMATS,
    buildRoundPlan: buildRoundPlan,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] Run, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK`

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/gradeBands.js games/cosmic-math-quest/tests/smoke-grade-bands.mjs
git commit -m "feat(cmq): add gradeBands.js skeleton with band recipes and round plans

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): add gradeBands.js skeleton with band recipes and round plans`

### Task 2: Question assembly + Grade 2 and Grade 3 generators

Adds the shared question-object factory, the G2 generators (recall / picture / sharing), AND the G3 generators (recall / missing / divfact / word). G3 rides along here (a deviation from a strict "G2 only" split) because its builders are simple table-fact ports, `generateDriftBonus(2, …)` in Task 5 needs `g3_missing`, and Task 5's full-format fuzz covers every recipe token. Also adds the public `generateForSlot(formatToken, tier)` entry with its ≤60-attempt retry loop.

**Validation-ordering choice (stated per instructions):** `validateBandQuestion` is created NOW as a permissive stub (`return !!q`), so `generateForSlot` has its final shape from day one and Tasks 2–4 can test generators through the real public entry point. Task 5 replaces only the stub's body with the real band rules.

**visualSpec note:** the shared contract says `visualSpec:{kind:'array'|'groups', rows, cols}`, but `renderVisualFromSpec` in `index.html` (~line 2657 pre-edit) reads `spec.a`/`spec.b` for arrays and `spec.groups`/`spec.per` for groups. We emit BOTH key sets (`rows`/`cols` per contract plus the renderer aliases) so hint visuals work with zero `index.html` changes.

**Files:**
- Modify: `games/cosmic-math-quest/gradeBands.js`
- Modify: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (append)
- Test: `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs`

**Interfaces:**
- Consumes: Task 1 helpers (`randInt`, `pick`, `RECIPES`).
- Produces: `window.GradeBands.generateForSlot(formatToken, tier) -> question|null` (question shape: `{type, operation:'multiply'|'divide'|'expr', prompt, promptSub, answer:int, answerR:int|null, key, level:'easy'|'medium'|'hard', grade:int, format, meta:{...,baseFact:{a,b,op:'mul'|'div'}|null}, hintEasy, hintMed, hintHard, visualSpec|null}`); `window.GradeBands.validateBandQuestion(q, grade) -> boolean` (permissive stub for now). Internal: `makeQuestion`, `levelForFormat`, `BUILDERS` map with `g2_recall`, `g2_picture`, `g2_sharing`, `g3_recall`, `g3_missing`, `g3_divfact`, `g3_word`.

**Steps:**

- [ ] Write the failing tests. Append to the END of `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`:

```js
// ---------- Task 2: G2 + G3 generators ----------

function gen(format, tier) {
  const q = GB.generateForSlot(format, tier);
  assert.ok(q, `generateForSlot(${format}, ${tier}) returned null`);
  return q;
}

// g2_recall tier ranges: tier -1 anchors on the pattern tables {1,2,5,10}; +1 on {11,12}
for (let i = 0; i < 50; i++) {
  const q = gen('g2_recall', -1);
  const { a, b } = q.meta;
  assert.ok([1, 2, 5, 10].includes(a) || [1, 2, 5, 10].includes(b), `tier -1 recall must anchor on 1/2/5/10: ${q.prompt}`);
  assert.ok(a >= 1 && a <= 12 && b >= 1 && b <= 12, 'G2 factors stay in 1..12');
  assert.strictEqual(q.level, 'easy');
  assert.strictEqual(q.grade, 2);
  assert.strictEqual(q.answerR, null);
  assert.deepStrictEqual(q.meta.baseFact, { a, b, op: 'mul' });
  assert.ok(q.visualSpec && q.visualSpec.kind === 'array');
}
for (let i = 0; i < 50; i++) {
  const q = gen('g2_recall', 1);
  const { a, b } = q.meta;
  assert.ok([11, 12].includes(a) || [11, 12].includes(b), `tier +1 recall must anchor on 11/12: ${q.prompt}`);
}

// g2_picture: one-sentence word problem with an equal-groups visual
for (let i = 0; i < 30; i++) {
  const q = gen('g2_picture', 0);
  assert.strictEqual(q.type, 'word');
  assert.ok(q.visualSpec && q.visualSpec.kind === 'groups');
  assert.strictEqual(q.answer, q.meta.a * q.meta.b);
  assert.ok(q.meta.baseFact && q.meta.baseFact.op === 'mul');
}

// g2_sharing: divisor ∈ {2,5,10}, picture support, gentle at tier -1 (answer may be 1)
const sharingDivisors = new Set();
for (let i = 0; i < 60; i++) {
  const q = gen('g2_sharing', -1);
  assert.ok([2, 5, 10].includes(q.meta.divisor), `sharing divisor set: ${q.prompt}`);
  sharingDivisors.add(q.meta.divisor);
  assert.ok(q.visualSpec && q.visualSpec.kind === 'groups');
  assert.strictEqual(q.meta.divisor * q.answer, q.meta.dividend);
  assert.ok(q.answer >= 1 && q.answer <= 5, `tier -1 sharing stays gentle: ${q.prompt}`);
  assert.deepStrictEqual(q.meta.baseFact, { a: q.meta.divisor, b: q.answer, op: 'div' });
}
assert.ok(sharingDivisors.size >= 2, 'sharing should use more than one divisor across 60 draws');

// G3: missing has a blank and answer >= 2; divfact stays inside the 12×12 table
for (let i = 0; i < 50; i++) {
  const q = gen('g3_missing', 0);
  assert.strictEqual(q.level, 'medium');
  assert.ok(q.prompt.includes('?'));
  assert.ok(q.answer >= 2);
  assert.ok(q.meta.baseFact && (q.meta.baseFact.op === 'mul' || q.meta.baseFact.op === 'div'));
}
for (let i = 0; i < 50; i++) {
  const q = gen('g3_divfact', 0);
  assert.strictEqual(q.operation, 'divide');
  assert.ok(q.meta.dividend <= 144, `12×12 table dividends: ${q.prompt}`);
  assert.strictEqual(q.meta.divisor * q.answer, q.meta.dividend);
}
// tier -1 favors tables 2..6 (both baseFact factors small)
for (let i = 0; i < 40; i++) {
  const q = gen('g3_recall', -1);
  assert.ok(Math.min(q.meta.a, q.meta.b) <= 6, `tier -1 favors small tables: ${q.prompt}`);
}
for (let i = 0; i < 30; i++) {
  const q = gen('g3_word', 1);
  assert.strictEqual(q.type, 'word');
  assert.ok(q.meta.baseFact);
  assert.ok(q.answer >= 2);
}

// every generated question has the full contract shape
for (const fmt of ['g2_recall', 'g2_picture', 'g2_sharing', 'g3_recall', 'g3_missing', 'g3_divfact', 'g3_word']) {
  const q = gen(fmt, 0);
  for (const field of ['type', 'operation', 'prompt', 'promptSub', 'answer', 'answerR', 'key', 'level', 'grade', 'format', 'meta', 'hintEasy', 'hintMed', 'hintHard', 'visualSpec']) {
    assert.ok(field in q, `${fmt} question missing field ${field}`);
  }
  assert.strictEqual(q.format, fmt);
  assert.ok('baseFact' in q.meta, `${fmt} meta must carry baseFact (may be null)`);
}

console.log('smoke-grade-bands: Task 2 OK');
```

- [ ] Run it, expect FAIL:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected: `smoke-grade-bands: Task 1 OK` then `TypeError: GB.generateForSlot is not a function`

- [ ] Implement part A — question assembly. In `games/cosmic-math-quest/gradeBands.js`, insert this block immediately ABOVE the `global.GradeBands = {` line:

```js
  // ---------- question assembly ----------
  /** Contract: recall/warmup formats -> 'easy', missing -> 'medium', everything else -> 'hard'. */
  function levelForFormat(format) {
    if (format === 'g2_recall' || format === 'g3_recall' || format === 'g4_warmup') return 'easy';
    if (format === 'g3_missing') return 'medium';
    return 'hard';
  }

  /** 'g4_longdiv' -> 4 */
  function gradeOfFormat(format) {
    return parseInt(String(format).slice(1), 10);
  }

  // rows/cols per shared contract; a/b + groups/per aliases keep index.html's
  // renderVisualFromSpec working unchanged.
  function visArray(rows, cols) {
    return { kind: 'array', rows: rows, cols: cols, a: rows, b: cols };
  }

  function visGroups(groups, per) {
    return { kind: 'groups', rows: groups, cols: per, groups: groups, per: per };
  }

  function makeQuestion(fields) {
    var meta = fields.meta || {};
    if (!('baseFact' in meta)) meta.baseFact = null;
    var answerR = fields.answerR != null ? fields.answerR : null;
    if (answerR != null) meta.remainder = true;
    return {
      type: fields.type,
      operation: fields.operation,
      prompt: fields.prompt,
      promptSub: fields.promptSub || null,
      answer: fields.answer,
      answerR: answerR,
      key: fields.key,
      level: levelForFormat(fields.format),
      grade: gradeOfFormat(fields.format),
      format: fields.format,
      meta: meta,
      hintEasy: fields.hintEasy,
      hintMed: fields.hintMed,
      hintHard: fields.hintHard,
      visualSpec: fields.visualSpec || null
    };
  }

  var BUILDERS = {};

  // ---------- Grade 2 ----------
  function g2FactorForTier(tier) {
    if (tier <= -1) return pick([1, 2, 5, 10]);
    if (tier >= 1) return pick([11, 12]);
    return pick([3, 4, 6, 7, 8, 9]);
  }

  BUILDERS.g2_recall = function (tier) {
    var anchor = g2FactorForTier(tier);
    var other = tier >= 1 ? randInt(6, 12) : randInt(1, 12);
    var flip = Math.random() < 0.5;
    var a = flip ? anchor : other;
    var b = flip ? other : anchor;
    var prod = a * b;
    return makeQuestion({
      format: 'g2_recall',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g2:rc:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visArray(a, b),
      hintEasy: 'Picture ' + a + ' rows with ' + b + ' in each row. Count them all.',
      hintMed: 'Skip-count by ' + b + ', ' + a + ' times.',
      hintHard: 'Recall ' + a + ' × ' + b + '.'
    });
  };

  var G2_PICTURE_TEMPLATES = [
    function (a, b) { return 'There are ' + a + ' baskets with ' + b + ' apples in each basket. How many apples in all?'; },
    function (a, b) { return a + ' rows of ' + b + ' stars are on the flag. How many stars is that?'; },
    function (a, b) { return a + ' friends each have ' + b + ' balloons. How many balloons altogether?'; },
    function (a, b) { return 'A sticker sheet has ' + a + ' rows of ' + b + ' stickers. How many stickers?'; }
  ];

  BUILDERS.g2_picture = function (tier) {
    var a = randInt(2, 6);
    var b = tier <= -1 ? pick([2, 5]) : tier >= 1 ? randInt(6, 9) : pick([3, 4, 6]);
    var prod = a * b;
    return makeQuestion({
      format: 'g2_picture',
      type: 'word',
      operation: 'multiply',
      prompt: pick(G2_PICTURE_TEMPLATES)(a, b),
      answer: prod,
      key: 'g2:pic:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visGroups(a, b),
      hintEasy: 'Look at the picture: ' + a + ' equal groups of ' + b + '.',
      hintMed: 'Same as ' + a + ' × ' + b + '.',
      hintHard: 'Multiply groups × how many in each.'
    });
  };

  BUILDERS.g2_sharing = function (tier) {
    var divisor = pick([2, 5, 10]);
    var quotient = tier <= -1 ? randInt(1, 5) : tier >= 1 ? randInt(5, 12) : randInt(2, 8);
    var dividend = divisor * quotient;
    var nouns = pick(['stickers', 'cookies', 'marbles', 'crayons']);
    return makeQuestion({
      format: 'g2_sharing',
      type: 'word',
      operation: 'divide',
      prompt: dividend + ' ' + nouns + ' are shared equally between ' + divisor + ' friends. How many does each friend get?',
      answer: quotient,
      key: 'g2:sh:' + dividend + '/' + divisor,
      meta: { dividend: dividend, divisor: divisor, quotient: quotient, baseFact: { a: divisor, b: quotient, op: 'div' } },
      visualSpec: visGroups(divisor, quotient),
      hintEasy: 'Deal the ' + nouns + ' into ' + divisor + ' piles, one at a time.',
      hintMed: 'Same as ' + dividend + ' ÷ ' + divisor + '.',
      hintHard: '? × ' + divisor + ' = ' + dividend + '.'
    });
  };
```

- [ ] Implement part B — Grade 3 + the generation entry. Insert this block immediately AFTER the `BUILDERS.g2_sharing` function you just added (still above `global.GradeBands = {`):

```js
  // ---------- Grade 3 ----------
  /** Tier -1 favors tables 2–6; tier +1 favors 7–12 (per spec §3). */
  function g3Pair(tier) {
    var a, b;
    if (tier <= -1) {
      a = randInt(2, 6);
      b = randInt(2, 9);
    } else if (tier >= 1) {
      a = randInt(7, 12);
      b = randInt(6, 12);
    } else {
      a = pick([6, 7, 8, 9, 10, 11, 12]);
      b = randInt(3, 9);
    }
    if (Math.random() < 0.5) { var t = a; a = b; b = t; }
    return { a: a, b: b, prod: a * b };
  }

  BUILDERS.g3_recall = function (tier) {
    var p = g3Pair(tier);
    return makeQuestion({
      format: 'g3_recall',
      type: 'basic',
      operation: 'multiply',
      prompt: p.a + ' × ' + p.b + ' = ?',
      answer: p.prod,
      key: 'g3:rc:' + p.a + 'x' + p.b,
      meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
      visualSpec: visArray(p.a, p.b),
      hintEasy: 'Skip-count by ' + p.b + ', ' + p.a + ' times.',
      hintMed: 'Use a fact you know: ' + p.a + ' × ' + (p.b - 1) + ', then one more ' + p.a + '.',
      hintHard: 'Recall ' + p.a + ' × ' + p.b + '.'
    });
  };

  BUILDERS.g3_missing = function (tier) {
    var p = g3Pair(tier);
    if (Math.random() < 0.5) {
      var hideA = Math.random() < 0.5;
      return makeQuestion({
        format: 'g3_missing',
        type: 'missing',
        operation: 'multiply',
        prompt: hideA ? '? × ' + p.b + ' = ' + p.prod : p.a + ' × ? = ' + p.prod,
        answer: hideA ? p.a : p.b,
        key: 'g3:mm:' + (hideA ? 'a' : 'b') + ':' + p.a + 'x' + p.b,
        meta: { a: p.a, b: p.b, prod: p.prod, hideA: hideA, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintEasy: hideA ? 'How many ' + p.b + 's make ' + p.prod + '?' : 'What times ' + p.a + ' makes ' + p.prod + '?',
        hintMed: 'Which factor is missing?',
        hintHard: 'Try ' + p.prod + ' ÷ ' + (hideA ? p.b : p.a) + '.'
      });
    }
    return makeQuestion({
      format: 'g3_missing',
      type: 'missing',
      operation: 'divide',
      prompt: p.prod + ' ÷ ? = ' + p.b,
      answer: p.a,
      key: 'g3:md:' + p.prod + '/' + p.a,
      meta: { dividend: p.prod, divisor: p.a, quotient: p.b, missing: 'divisor', baseFact: { a: p.a, b: p.b, op: 'div' } },
      visualSpec: visGroups(p.a, p.b),
      hintEasy: '? × ' + p.b + ' = ' + p.prod + '.',
      hintMed: 'What times ' + p.b + ' gives ' + p.prod + '?',
      hintHard: 'Multiply back.'
    });
  };

  BUILDERS.g3_divfact = function (tier) {
    var p = g3Pair(tier);
    return makeQuestion({
      format: 'g3_divfact',
      type: 'basic',
      operation: 'divide',
      prompt: p.prod + ' ÷ ' + p.a + ' = ?',
      answer: p.b,
      key: 'g3:df:' + p.prod + '/' + p.a,
      meta: { dividend: p.prod, divisor: p.a, quotient: p.b, baseFact: { a: p.a, b: p.b, op: 'div' } },
      visualSpec: visGroups(p.a, p.b),
      hintEasy: 'Split ' + p.prod + ' into ' + p.a + ' equal shares.',
      hintMed: 'What times ' + p.a + ' equals ' + p.prod + '?',
      hintHard: '? × ' + p.a + ' = ' + p.prod + '.'
    });
  };

  var G3_WORD_TEMPLATES = [
    function (p) {
      return {
        prompt: 'There are ' + p.a + ' boxes with ' + p.b + ' pencils in each box. How many pencils are there?',
        operation: 'multiply',
        answer: p.prod,
        meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintFact: p.a + ' × ' + p.b
      };
    },
    function (p) {
      return {
        prompt: 'A parking lot has ' + p.a + ' rows of ' + p.b + ' cars. How many cars are parked?',
        operation: 'multiply',
        answer: p.prod,
        meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintFact: p.a + ' × ' + p.b
      };
    },
    function (p) {
      return {
        prompt: p.prod + ' stickers are shared equally among ' + p.a + ' kids. How many does each kid get?',
        operation: 'divide',
        answer: p.b,
        meta: { dividend: p.prod, divisor: p.a, quotient: p.b, baseFact: { a: p.a, b: p.b, op: 'div' } },
        visualSpec: visGroups(p.a, p.b),
        hintFact: p.prod + ' ÷ ' + p.a
      };
    },
    function (p) {
      return {
        prompt: p.prod + ' apples are packed into bags of ' + p.b + ' apples. How many bags are filled?',
        operation: 'divide',
        answer: p.a,
        meta: { dividend: p.prod, divisor: p.b, quotient: p.a, baseFact: { a: p.b, b: p.a, op: 'div' } },
        visualSpec: visGroups(p.b, p.a),
        hintFact: p.prod + ' ÷ ' + p.b
      };
    }
  ];

  BUILDERS.g3_word = function (tier) {
    var p = g3Pair(tier);
    var idx = randInt(0, G3_WORD_TEMPLATES.length - 1);
    var t = G3_WORD_TEMPLATES[idx](p);
    return makeQuestion({
      format: 'g3_word',
      type: 'word',
      operation: t.operation,
      prompt: t.prompt,
      answer: t.answer,
      key: 'g3:w:t' + idx + ':' + p.a + 'x' + p.b,
      meta: t.meta,
      visualSpec: t.visualSpec,
      hintEasy: 'Same as ' + t.hintFact + '.',
      hintMed: t.operation === 'multiply' ? 'Equal groups: multiply.' : 'Equal shares: divide.',
      hintHard: t.hintFact + ' = ?'
    });
  };

  // ---------- generation entry ----------
  // Permissive stub — replaced with real band rules in Task 5.
  function validateBandQuestion(q, grade) {
    return !!q && typeof q === 'object';
  }

  /** Public entry: build a validated question for a format token, or null after 60 tries. */
  function generateForSlot(formatToken, tier) {
    var builder = BUILDERS[formatToken];
    if (!builder) return null;
    var grade = gradeOfFormat(formatToken);
    var t = typeof tier === 'number' ? tier : 0;
    for (var attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      var q = builder(t);
      if (q && validateBandQuestion(q, grade)) return q;
    }
    return null;
  }
```

- [ ] Wire the exports. In the `global.GradeBands = {` block, apply this exact edit:

Old:
```js
    buildRoundPlan: buildRoundPlan,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe
    }
```

New:
```js
    buildRoundPlan: buildRoundPlan,
    generateForSlot: generateForSlot,
    validateBandQuestion: validateBandQuestion,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe,
      levelForFormat: levelForFormat,
      BUILDERS: BUILDERS
    }
```

- [ ] Run, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK` then `smoke-grade-bands: Task 2 OK`

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/gradeBands.js games/cosmic-math-quest/tests/smoke-grade-bands.mjs
git commit -m "feat(cmq): grade 2 and grade 3 band generators with generateForSlot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): grade 2 and grade 3 band generators with generateForSlot`

### Task 3: Grade 4 generators — multi-digit, long division with remainders, two-step words, inverse/reasoning, warm-up

G4 is where remainders debut (`answerR` + `meta.remainder`). The inverse/reasoning builders are PORTS of `buildInverseMultiply` (~line 2838 pre-edit), `buildReasoningCompare`/`buildReasoningTrueFalse` (~2865–2929), `buildDivReasoningCompare`/`buildDivReasoningTrueFalse` (~2931–2986) and `buildInverseDivide` (~3061) from `index.html` — rewritten self-contained (no `pickHardMultiplyPair`/`getAdaptiveTier` calls, which are index.html globals), factors to 12, and their `meta.reasoning` values (`compare`, `tf`, `compare_div`, `tf_div`) kept identical so `learningIntelligence.js`'s reasoning family mapping keeps working.

**Files:**
- Modify: `games/cosmic-math-quest/gradeBands.js`
- Modify: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (append)
- Test: `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs`

**Interfaces:**
- Consumes: `makeQuestion`, `visArray`, `randInt`, `pick`, `BUILDERS` (Task 2).
- Produces: `BUILDERS.g4_multidigit`, `BUILDERS.g4_longdiv` (sets `answerR`), `BUILDERS.g4_word2` (6 templates, `meta.template` = index), `BUILDERS.g4_invreason`, `BUILDERS.g4_warmup` — all reachable through `GradeBands.generateForSlot`.

**Steps:**

- [ ] Write the failing tests. Append to the END of `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`:

```js
// ---------- Task 3: G4 generators ----------

// g4_multidigit: 2-digit × 1-digit at tier -1/0, 3-digit × 1-digit at tier +1
for (let i = 0; i < 50; i++) {
  const q0 = gen('g4_multidigit', 0);
  assert.ok(q0.meta.a >= 10 && q0.meta.a <= 99, `tier 0 wants a 2-digit factor: ${q0.prompt}`);
  assert.ok(q0.meta.b >= 2 && q0.meta.b <= 9);
  assert.strictEqual(q0.answer, q0.meta.a * q0.meta.b);
  assert.deepStrictEqual(q0.meta.baseFact, { a: q0.meta.a, b: q0.meta.b, op: 'mul' });
  const q1 = gen('g4_multidigit', 1);
  assert.ok(q1.meta.a >= 100 && q1.meta.a <= 999, `tier +1 wants a 3-digit factor: ${q1.prompt}`);
}

// g4_longdiv: 1-digit divisors 3-9; exact-only at tier -1 with 2-digit dividends
for (let i = 0; i < 80; i++) {
  const qm = gen('g4_longdiv', -1);
  assert.strictEqual(qm.answerR, null, `tier -1 long division must be exact: ${qm.prompt}`);
  assert.strictEqual(qm.meta.divisor * qm.answer, qm.meta.dividend);
  assert.ok(qm.meta.dividend >= 10 && qm.meta.dividend <= 99);
  assert.ok(qm.meta.divisor >= 3 && qm.meta.divisor <= 9);
}
// tier 0/+1: remainders appear and satisfy divisor*quotient+r === dividend with 0 < r < divisor
let sawRemainder = false;
for (let i = 0; i < 120; i++) {
  const q = gen('g4_longdiv', i % 2 === 0 ? 0 : 1);
  const { dividend, divisor } = q.meta;
  assert.ok(divisor >= 3 && divisor <= 9);
  if (q.answerR != null) {
    sawRemainder = true;
    assert.ok(q.answerR > 0 && q.answerR < divisor, `0 < r < divisor: ${q.prompt}`);
    assert.strictEqual(divisor * q.answer + q.answerR, dividend, `remainder identity: ${q.prompt}`);
    assert.strictEqual(q.meta.remainder, true, 'meta.remainder flags the R-box');
  } else {
    assert.strictEqual(divisor * q.answer, dividend);
  }
}
assert.ok(sawRemainder, 'tier 0/+1 long division should produce remainders sometimes');

// g4_word2: template variety (>= 4 distinct across 80 draws), sane integer answers
const w2Templates = new Set();
for (let i = 0; i < 80; i++) {
  const q = gen('g4_word2', 0);
  assert.strictEqual(q.type, 'word');
  assert.ok(Number.isInteger(q.answer) && q.answer >= 2, `word answer sane: ${q.prompt} -> ${q.answer}`);
  assert.ok(!q.prompt.includes('+') && !/\d\s*-\s*\d/.test(q.prompt), `no +/- symbols in word prompts: ${q.prompt}`);
  w2Templates.add(q.meta.template);
}
assert.ok(w2Templates.size >= 4, `expected >= 4 distinct two-step templates, saw ${w2Templates.size}`);

// g4_invreason: inverse + reasoning variety; tf answers are 0/1; compare answers = larger value
const irKinds = new Set();
for (let i = 0; i < 120; i++) {
  const q = gen('g4_invreason', 0);
  irKinds.add(q.meta.reasoning || 'inverse');
  if (q.meta.reasoning === 'tf' || q.meta.reasoning === 'tf_div') {
    assert.ok(q.answer === 0 || q.answer === 1);
  }
  if (q.meta.reasoning === 'compare') {
    assert.strictEqual(q.answer, Math.max(q.meta.prod, q.meta.prod2));
  }
  if (q.meta.reasoning === 'compare_div') {
    assert.strictEqual(q.answer, Math.max(q.meta.quotient, q.meta.quotient2));
  }
}
assert.ok(irKinds.size >= 3, `inverse/reasoning variety: saw ${[...irKinds].join(',')}`);

// g4_warmup: recall weighted to 11s/12s
let elevenTwelve = 0;
for (let i = 0; i < 100; i++) {
  const q = gen('g4_warmup', 0);
  assert.strictEqual(q.level, 'easy');
  if (q.meta.a === 11 || q.meta.a === 12 || q.meta.b === 11 || q.meta.b === 12) elevenTwelve++;
}
assert.ok(elevenTwelve >= 50, `warmup should hit 11s/12s most of the time (saw ${elevenTwelve}/100)`);

console.log('smoke-grade-bands: Task 3 OK');
```

- [ ] Run it, expect FAIL:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected: Tasks 1–2 OK, then `AssertionError [ERR_ASSERTION]: generateForSlot(g4_multidigit, 0) returned null`

- [ ] Implement part A — multi-digit and long division. In `games/cosmic-math-quest/gradeBands.js`, insert immediately ABOVE the `// ---------- generation entry ----------` comment:

```js
  // ---------- Grade 4 ----------
  BUILDERS.g4_multidigit = function (tier) {
    var a, d;
    if (tier <= -1) {
      a = randInt(12, 30);
      d = randInt(2, 4);
    } else if (tier >= 1) {
      a = randInt(102, 399);
      d = randInt(3, 9);
    } else {
      a = randInt(21, 99);
      d = randInt(3, 9);
    }
    var prod = a * d;
    var ones = a % 10;
    var tens = a - ones;
    return makeQuestion({
      format: 'g4_multidigit',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + d + ' = ?',
      answer: prod,
      key: 'g4:md:' + a + 'x' + d,
      meta: { a: a, b: d, prod: prod, baseFact: { a: a, b: d, op: 'mul' } },
      visualSpec: null,
      hintEasy: 'Break ' + a + ' into ' + tens + ' and ' + ones + '. Multiply each part by ' + d + ', then add them.',
      hintMed: tens + ' × ' + d + ' first, then ' + ones + ' × ' + d + '.',
      hintHard: 'Add the two partial products.'
    });
  };

  BUILDERS.g4_longdiv = function (tier) {
    var d = randInt(3, 9);
    var q, r;
    if (tier <= -1) {
      // exact only, 2-digit dividend
      q = randInt(Math.ceil(10 / d) + 1, Math.floor(99 / d));
      r = 0;
    } else if (tier >= 1) {
      // 3-digit dividend, remainders allowed
      q = randInt(Math.ceil(100 / d) + 1, Math.floor(900 / d));
      r = Math.random() < 0.6 ? randInt(1, d - 1) : 0;
    } else {
      // 2-digit dividend, remainders allowed
      q = randInt(Math.ceil(10 / d) + 1, Math.floor(90 / d));
      r = Math.random() < 0.5 ? randInt(1, d - 1) : 0;
    }
    var dividend = d * q + r;
    return makeQuestion({
      format: 'g4_longdiv',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + d + ' = ?',
      promptSub: r > 0 ? 'This one has a remainder — put it in the R box.' : null,
      answer: q,
      answerR: r > 0 ? r : null,
      key: 'g4:ld:' + dividend + '/' + d,
      meta: { dividend: dividend, divisor: d, quotient: q, baseFact: { a: d, b: q, op: 'div' } },
      visualSpec: null,
      hintEasy: 'How many whole ' + d + 's fit into ' + dividend + '?',
      hintMed: 'Find the biggest multiple of ' + d + ' that fits, then count what is left over.',
      hintHard: r > 0 ? 'Check: divisor × answer, then add the leftover to reach ' + dividend + '.' : '? × ' + d + ' = ' + dividend + '.'
    });
  };
```

- [ ] Implement part B — two-step word problems. Insert immediately after `BUILDERS.g4_longdiv` (still above `// ---------- generation entry ----------`):

```js
  var NAMES = ['Maya', 'Leo', 'Zara', 'Kai', 'Nina', 'Omar'];

  var G4_WORD2_TEMPLATES = [
    function () {
      var a = randInt(3, 9), b = randInt(4, 9), c = randInt(2, 10);
      return {
        prompt: pick(NAMES) + ' buys ' + a + ' packs of ' + b + ' trading cards, then gives ' + c + ' cards to a friend. How many cards are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var a = randInt(3, 9), b = randInt(4, 9), c = randInt(3, 20);
      return {
        prompt: 'A library has ' + a + ' shelves with ' + b + ' books on each shelf. Then ' + c + ' more books arrive. How many books are there now?',
        answer: a * b + c,
        meta: { a: a, b: b, c: c, steps: 'mul_add', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then add ' + c
      };
    },
    function () {
      var d = randInt(2, 6), teams = randInt(3, 8), k = randInt(2, 6);
      var n = d * teams;
      return {
        prompt: n + ' students split into teams of ' + d + '. Each team gets ' + k + ' cones for practice. How many cones are needed?',
        answer: teams * k,
        meta: { d: d, teams: teams, k: k, steps: 'div_mul', baseFact: null },
        hintFact: n + ' ÷ ' + d + ' teams first, then × ' + k
      };
    },
    function () {
      var a = randInt(4, 9), b = randInt(3, 9), c = randInt(2, 10);
      return {
        prompt: pick(NAMES) + ' saves ' + b + ' coins every day for ' + a + ' days, then spends ' + c + ' coins on a snack. How many coins are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var d = randInt(3, 6), boxes = randInt(5, 9), c = randInt(2, 3);
      var n = d * boxes;
      return {
        prompt: 'A baker makes ' + n + ' muffins and packs them into boxes of ' + d + '. She sells ' + c + ' full boxes. How many boxes are left?',
        answer: boxes - c,
        meta: { d: d, boxes: boxes, c: c, steps: 'div_sub', baseFact: { a: d, b: boxes, op: 'div' } },
        hintFact: n + ' ÷ ' + d + ' boxes first, then take away ' + c
      };
    },
    function () {
      var a = randInt(4, 9), b = randInt(5, 9), c = randInt(2, 8);
      return {
        prompt: a + ' rows of ' + b + ' chairs are set up for the show. ' + c + ' chairs are broken and removed. How many chairs are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    }
  ];

  BUILDERS.g4_word2 = function (tier) {
    // word templates stay at table-fact sizes at every tier
    var idx = randInt(0, G4_WORD2_TEMPLATES.length - 1);
    var t = G4_WORD2_TEMPLATES[idx]();
    t.meta.template = idx;
    return makeQuestion({
      format: 'g4_word2',
      type: 'word',
      operation: t.meta.steps.indexOf('div') === 0 ? 'divide' : 'multiply',
      prompt: t.prompt,
      answer: t.answer,
      key: 'g4:w2:t' + idx + ':' + t.answer + ':' + (t.meta.a || t.meta.d) + 'v' + (t.meta.b || t.meta.boxes || t.meta.teams),
      meta: t.meta,
      visualSpec: null,
      hintEasy: 'Two steps: ' + t.hintFact + '.',
      hintMed: 'Find the total first, then do the second step.',
      hintHard: t.hintFact + '.'
    });
  };
```

- [ ] Implement part C — inverse/reasoning + warm-up. Insert immediately after `BUILDERS.g4_word2` (still above `// ---------- generation entry ----------`):

```js
  /** Table-fact pair for G4 inverse/reasoning, factors to 12, biased by tier. */
  function g4Pair(tier) {
    var lo = tier <= -1 ? 3 : tier >= 1 ? 7 : 4;
    var hi = tier <= -1 ? 8 : 12;
    return { a: randInt(lo, hi), b: randInt(lo, hi) };
  }

  BUILDERS.g4_invreason = function (tier) {
    var kind = pick(['inv_mult', 'inv_div', 'compare', 'tf', 'compare_div', 'tf_div']);
    var p = g4Pair(tier);
    var a = p.a, b = p.b, prod = a * b;

    if (kind === 'inv_mult') {
      return makeQuestion({
        format: 'g4_invreason', type: 'inverse', operation: 'multiply',
        prompt: 'If ' + prod + ' ÷ ' + a + ' = ' + b + ', what is ' + a + ' × ' + b + '?',
        answer: prod,
        key: 'g4:ir:im:' + a + 'x' + b,
        meta: { a: a, b: b, prod: prod, dividend: prod, divisor: a, quotient: b, baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'Think about the matching multiply fact.',
        hintMed: a + ' × ' + b + ' = ?',
        hintHard: 'Inverse facts match: divide and multiply.'
      });
    }
    if (kind === 'inv_div') {
      return makeQuestion({
        format: 'g4_invreason', type: 'inverse', operation: 'divide',
        prompt: prod + ' ÷ ' + a + ' = ?',
        promptSub: 'If ' + a + ' × ' + b + ' = ' + prod,
        answer: b,
        key: 'g4:ir:id:' + prod + '/' + a,
        meta: { a: a, b: b, prod: prod, dividend: prod, divisor: a, quotient: b, baseFact: { a: a, b: b, op: 'div' } },
        visualSpec: null,
        hintEasy: 'Think: ' + a + ' × ? = ' + prod + '.',
        hintMed: 'Undo the multiply.',
        hintHard: prod + ' ÷ ' + a + '.'
      });
    }
    if (kind === 'compare') {
      var p2 = g4Pair(tier), guard = 0;
      while (p2.a * p2.b === prod && guard < 30) { p2 = g4Pair(tier); guard++; }
      if (p2.a * p2.b === prod) p2 = { a: a + 1, b: b };
      var prod2 = p2.a * p2.b;
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'multiply',
        prompt: 'Which is larger: ' + a + ' × ' + b + ' or ' + p2.a + ' × ' + p2.b + '? Type the larger value only.',
        answer: Math.max(prod, prod2),
        key: 'g4:ir:rc:' + a + 'x' + b + 'v' + p2.a + 'x' + p2.b,
        meta: { a: a, b: b, prod: prod, c: p2.a, d: p2.b, prod2: prod2, reasoning: 'compare', baseFact: null },
        visualSpec: null,
        hintEasy: 'Figure each side, then pick the bigger total.',
        hintMed: a + ' × ' + b + ' = ' + prod + '. ' + p2.a + ' × ' + p2.b + ' = ' + prod2 + '.',
        hintHard: 'Compare ' + prod + ' and ' + prod2 + '.'
      });
    }
    if (kind === 'tf') {
      var wrong = prod + pick([-5, -4, -3, -2, 2, 3, 4, 5, 6]);
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'multiply',
        prompt: 'Is ' + a + ' × ' + b + ' = ' + wrong + '? Type 1 for yes, 0 for no.',
        answer: 0,
        key: 'g4:ir:tf:' + a + 'x' + b + ':' + wrong,
        meta: { a: a, b: b, prod: prod, shown: wrong, reasoning: 'tf', baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'What is ' + a + ' × ' + b + ' really?',
        hintMed: a + ' × ' + b + ' = ' + prod + ', not ' + wrong + '.',
        hintHard: 'Check the product.'
      });
    }
    if (kind === 'compare_div') {
      var p3 = g4Pair(tier), guard2 = 0;
      while (p3.b === b && guard2 < 30) { p3 = g4Pair(tier); guard2++; }
      if (p3.b === b) p3 = { a: p3.a, b: b === 12 ? 11 : b + 1 };
      var d1 = a * b, d2 = p3.a * p3.b;
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'divide',
        prompt: 'Which is larger: ' + d1 + ' ÷ ' + a + ' or ' + d2 + ' ÷ ' + p3.a + '? Type the larger value only.',
        answer: Math.max(b, p3.b),
        key: 'g4:ir:rdc:' + d1 + '/' + a + 'v' + d2 + '/' + p3.a,
        meta: { dividend: d1, divisor: a, quotient: b, dividend2: d2, divisor2: p3.a, quotient2: p3.b, reasoning: 'compare_div', baseFact: null },
        visualSpec: null,
        hintEasy: 'Solve both division facts and compare the answers.',
        hintMed: d1 + ' ÷ ' + a + ' = ' + b + '. ' + d2 + ' ÷ ' + p3.a + ' = ' + p3.b + '.',
        hintHard: 'Compare ' + b + ' and ' + p3.b + '.'
      });
    }
    // tf_div
    var wrongQ = b + pick([-3, -2, -1, 1, 2, 3]);
    if (wrongQ === b || wrongQ < 1) wrongQ = b + 1;
    return makeQuestion({
      format: 'g4_invreason', type: 'reasoning', operation: 'divide',
      prompt: 'Is ' + prod + ' ÷ ' + a + ' = ' + wrongQ + '? Type 1 for yes, 0 for no.',
      answer: 0,
      key: 'g4:ir:rdt:' + prod + '/' + a + ':' + wrongQ,
      meta: { dividend: prod, divisor: a, quotient: b, shown: wrongQ, reasoning: 'tf_div', baseFact: { a: a, b: b, op: 'div' } },
      visualSpec: null,
      hintEasy: 'Work out the division fact first.',
      hintMed: prod + ' ÷ ' + a + ' = ' + b + ', not ' + wrongQ + '.',
      hintHard: 'Check the quotient.'
    });
  };

  BUILDERS.g4_warmup = function (tier) {
    var anchor = Math.random() < 0.7 ? pick([11, 12]) : randInt(6, 12);
    var other = tier <= -1 ? randInt(2, 6) : tier >= 1 ? randInt(6, 12) : randInt(2, 9);
    var flip = Math.random() < 0.5;
    var a = flip ? anchor : other;
    var b = flip ? other : anchor;
    var prod = a * b;
    return makeQuestion({
      format: 'g4_warmup',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g4:wu:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visArray(a, b),
      hintEasy: 'For 11s, the digit repeats: 11 × 4 = 44. For 12s, do ×10 and ×2, then add them.',
      hintMed: 'Use a ×10 fact you know, then adjust.',
      hintHard: 'Recall ' + a + ' × ' + b + '.'
    });
  };
```

- [ ] Run, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK`, `Task 2 OK`, `Task 3 OK`

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/gradeBands.js games/cosmic-math-quest/tests/smoke-grade-bands.mjs
git commit -m "feat(cmq): grade 4 band generators with remainder long division

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): grade 4 band generators with remainder long division`

### Task 4: Grade 5 generators — big multiplication, 2-digit long division, ×10 patterns, order of operations, multi-step words, reasoning

Prompt-symbol convention (verified in `index.html`): the game renders multiplication as the unicode `×` and division as `÷` in all prompts (e.g. `buildDivBasic` ~line 2994 pre-edit), and `validateQuestion` (~3303) rejects any prompt containing ASCII `+` or a digit-minus-digit pattern. `g5_orderops` keeps `×`/`÷` for the mult/div part and uses ASCII `+`/`-` for the second operation — it is the ONLY format allowed to do so (enforced in Task 5).

**Files:**
- Modify: `games/cosmic-math-quest/gradeBands.js`
- Modify: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (append)
- Test: `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs`

**Interfaces:**
- Consumes: `makeQuestion`, `randInt`, `pick`, `BUILDERS` (Task 2).
- Produces: `BUILDERS.g5_bigmult`, `BUILDERS.g5_longdiv2` (sets `answerR`), `BUILDERS.g5_pattern` (baseFact = underlying table fact), `BUILDERS.g5_orderops` (`operation:'expr'`, meta: `{a, b, c, form:'plus'|'minus', useDiv, termVal, baseFact}`), `BUILDERS.g5_word` (6 templates, `meta.template`), `BUILDERS.g5_reason`.

**Steps:**

- [ ] Write the failing tests. Append to the END of `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`:

```js
// ---------- Task 4: G5 generators ----------

// g5_bigmult: 2-digit × 2-digit at tier 0; 3-digit × 2-digit at tier +1; no baseFact
for (let i = 0; i < 40; i++) {
  const q0 = gen('g5_bigmult', 0);
  assert.ok(q0.meta.a >= 10 && q0.meta.a <= 99 && q0.meta.b >= 10 && q0.meta.b <= 99, q0.prompt);
  assert.strictEqual(q0.answer, q0.meta.a * q0.meta.b);
  assert.strictEqual(q0.meta.baseFact, null);
  const q1 = gen('g5_bigmult', 1);
  assert.ok(q1.meta.a >= 100 && q1.meta.a <= 999, `tier +1 unlocks 3-digit: ${q1.prompt}`);
}

// g5_longdiv2: 2-digit divisors, remainder identity when present
let ld2Rem = false;
for (let i = 0; i < 120; i++) {
  const q = gen('g5_longdiv2', 0);
  assert.ok(q.meta.divisor >= 10 && q.meta.divisor <= 99, q.prompt);
  if (q.answerR != null) {
    ld2Rem = true;
    assert.ok(q.answerR > 0 && q.answerR < q.meta.divisor);
    assert.strictEqual(q.meta.divisor * q.answer + q.answerR, q.meta.dividend);
    assert.strictEqual(q.meta.remainder, true);
  } else {
    assert.strictEqual(q.meta.divisor * q.answer, q.meta.dividend);
  }
}
assert.ok(ld2Rem, 'some 2-digit long divisions should carry remainders');

// g5_pattern: baseFact is the underlying table fact
for (let i = 0; i < 80; i++) {
  const q = gen('g5_pattern', i % 2 === 0 ? 0 : 1);
  const bf = q.meta.baseFact;
  assert.ok(bf && bf.a >= 2 && bf.a <= 12 && bf.b >= 2 && bf.b <= 12, `pattern must anchor a table fact: ${q.prompt}`);
  if (q.operation === 'multiply') {
    assert.strictEqual(bf.op, 'mul');
    assert.strictEqual(q.meta.a, bf.a * 10, `first factor is the table fact ×10: ${q.prompt}`);
    assert.ok(q.meta.b === bf.b || q.meta.b === bf.b * 10, `second factor is bf.b or bf.b×10: ${q.prompt}`);
    assert.strictEqual(q.answer, q.meta.a * q.meta.b);
  } else {
    assert.strictEqual(bf.op, 'div');
    assert.strictEqual(q.meta.divisor, bf.a * 10, `divisor is the table divisor ×10: ${q.prompt}`);
    const scale = q.meta.dividend / (bf.a * bf.b);
    assert.ok(scale === 10 || scale === 100, `dividend is the table fact ×10/×100: ${q.prompt}`);
    assert.strictEqual(q.meta.divisor * q.answer, q.meta.dividend);
  }
}

// g5_orderops: positive-integer answers; contains + or -; the mult/div part is a table fact
const ooSigns = { plus: 0, minus: 0, lead: 0 };
for (let i = 0; i < 150; i++) {
  const q = gen('g5_orderops', i % 3 === 0 ? 1 : 0);
  assert.strictEqual(q.operation, 'expr');
  assert.ok(Number.isInteger(q.answer) && q.answer >= 1, `orderops answers are positive integers: ${q.prompt} -> ${q.answer}`);
  const hasPlus = q.prompt.includes('+');
  const hasMinus = /\d\s*-\s*\d/.test(q.prompt);
  assert.ok(hasPlus !== hasMinus, `exactly one of +/-: ${q.prompt}`);
  if (hasPlus) ooSigns.plus++;
  if (hasMinus) ooSigns.minus++;
  if (/^\d+\s*\+/.test(q.prompt)) ooSigns.lead++;
  assert.ok(q.prompt.includes('×') || q.prompt.includes('÷'), `mult/div part always present: ${q.prompt}`);
  const bf = q.meta.baseFact;
  assert.ok(bf && bf.a >= 2 && bf.a <= 12 && bf.b >= 2 && bf.b <= 12, 'orderops anchors a table fact');
  const expected = q.meta.form === 'plus' ? q.meta.termVal + q.meta.c : q.meta.termVal - q.meta.c;
  assert.strictEqual(q.answer, expected, `answer recomputes from meta: ${q.prompt}`);
}
assert.ok(ooSigns.plus > 0 && ooSigns.minus > 0, 'both + and - forms appear');

// g5_word: multi-step templates, variety, symbol-free prompts
const w5Templates = new Set();
for (let i = 0; i < 100; i++) {
  const q = gen('g5_word', 0);
  assert.strictEqual(q.type, 'word');
  assert.ok(Number.isInteger(q.answer) && q.answer >= 2);
  assert.ok(!q.prompt.includes('+') && !/\d\s*-\s*\d/.test(q.prompt), `word prompts stay symbol-free: ${q.prompt}`);
  w5Templates.add(q.meta.template);
}
assert.ok(w5Templates.size >= 4, `expected >= 4 distinct multi-step templates, saw ${w5Templates.size}`);

// g5_reason: compare answers equal the larger product; tf answers 0/1
for (let i = 0; i < 60; i++) {
  const q = gen('g5_reason', 0);
  if (q.meta.reasoning === 'compare') {
    assert.strictEqual(q.answer, Math.max(q.meta.prod, q.meta.prod2));
  } else {
    assert.strictEqual(q.meta.reasoning, 'tf');
    assert.ok(q.answer === 0 || q.answer === 1);
  }
}

console.log('smoke-grade-bands: Task 4 OK');
```

- [ ] Run it, expect FAIL:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected: Tasks 1–3 OK, then `AssertionError [ERR_ASSERTION]: generateForSlot(g5_bigmult, 0) returned null`

- [ ] Implement part A — big multiplication, 2-digit long division, patterns. In `games/cosmic-math-quest/gradeBands.js`, insert immediately ABOVE the `// ---------- generation entry ----------` comment:

```js
  // ---------- Grade 5 ----------
  BUILDERS.g5_bigmult = function (tier) {
    var a, b;
    if (tier <= -1) {
      a = randInt(11, 19);
      b = randInt(11, 19);
    } else if (tier >= 1) {
      a = randInt(112, 399);
      b = randInt(12, 49);
    } else {
      a = randInt(12, 49);
      b = randInt(12, 49);
    }
    var prod = a * b;
    var bOnes = b % 10;
    var bTens = b - bOnes;
    return makeQuestion({
      format: 'g5_bigmult',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g5:bm:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: null },
      visualSpec: null,
      hintEasy: 'Split ' + b + ' into ' + bTens + ' and ' + bOnes + '. Multiply ' + a + ' by each part, then add them.',
      hintMed: a + ' × ' + bTens + ' first, then ' + a + ' × ' + bOnes + '.',
      hintHard: 'Add the two partial products.'
    });
  };

  BUILDERS.g5_longdiv2 = function (tier) {
    var d, q, r;
    if (tier <= -1) {
      d = randInt(11, 20);
      q = randInt(2, 9);
      r = 0;
    } else if (tier >= 1) {
      d = randInt(21, 60);
      q = randInt(6, 20);
      r = Math.random() < 0.6 ? randInt(1, d - 1) : 0;
    } else {
      d = randInt(11, 30);
      q = randInt(3, 12);
      r = Math.random() < 0.5 ? randInt(1, d - 1) : 0;
    }
    var dividend = d * q + r;
    return makeQuestion({
      format: 'g5_longdiv2',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + d + ' = ?',
      promptSub: r > 0 ? 'This one has a remainder — put it in the R box.' : null,
      answer: q,
      answerR: r > 0 ? r : null,
      key: 'g5:ld2:' + dividend + '/' + d,
      meta: { dividend: dividend, divisor: d, quotient: q, baseFact: null },
      visualSpec: null,
      hintEasy: 'How many groups of ' + d + ' fit into ' + dividend + '?',
      hintMed: 'Try easy multiples first: ' + d + ' × 5 and ' + d + ' × 10, then zoom in.',
      hintHard: r > 0 ? 'The answer is not exact — the leftover goes in the R box.' : '? × ' + d + ' = ' + dividend + '.'
    });
  };

  BUILDERS.g5_pattern = function (tier) {
    var maxF = tier >= 1 ? 12 : 9;
    var a = randInt(2, maxF);
    var b = randInt(2, maxF);
    var p = a * b;
    var mult = tier <= -1 ? true : Math.random() < 0.5;
    if (mult) {
      var big = tier >= 1 || Math.random() < 0.5; // a0 × b0 vs a0 × b
      var x = a * 10;
      var y = big ? b * 10 : b;
      var ans = x * y;
      return makeQuestion({
        format: 'g5_pattern',
        type: 'basic',
        operation: 'multiply',
        prompt: x + ' × ' + y + ' = ?',
        answer: ans,
        key: 'g5:pat:' + x + 'x' + y,
        meta: { a: x, b: y, prod: ans, baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'Start with ' + a + ' × ' + b + ' = ' + p + ', then put the zeros back.',
        hintMed: 'Count the zeros in the question.',
        hintHard: 'It is ' + p + ' with the zeros attached.'
      });
    }
    var hundred = tier >= 1 && Math.random() < 0.5;
    var dividend = hundred ? p * 100 : p * 10;
    var divisor = a * 10;
    var ans2 = hundred ? b * 10 : b;
    return makeQuestion({
      format: 'g5_pattern',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + divisor + ' = ?',
      answer: ans2,
      key: 'g5:pat:' + dividend + '/' + divisor,
      meta: { dividend: dividend, divisor: divisor, quotient: ans2, baseFact: { a: a, b: b, op: 'div' } },
      visualSpec: null,
      hintEasy: 'Start with ' + p + ' ÷ ' + a + ' = ' + b + ', then match the zeros.',
      hintMed: 'Cross off one zero from each side.',
      hintHard: 'It is ' + p + ' ÷ ' + a + ' with zeros.'
    });
  };
```

- [ ] Implement part B — order of operations. Insert immediately after `BUILDERS.g5_pattern` (still above `// ---------- generation entry ----------`):

```js
  BUILDERS.g5_orderops = function (tier) {
    var maxF = tier >= 1 ? 12 : 9;
    var a = randInt(2, maxF);
    var b = randInt(2, maxF);
    var prod = a * b;
    var useDiv = Math.random() < 0.5;
    var form = pick(['plus', 'minus']);
    var termStr, termVal, baseFact;
    if (useDiv) {
      termStr = prod + ' ÷ ' + a;
      termVal = b;
      baseFact = { a: a, b: b, op: 'div' };
    } else {
      termStr = a + ' × ' + b;
      termVal = prod;
      baseFact = { a: a, b: b, op: 'mul' };
    }
    var c, prompt, answer;
    if (form === 'plus') {
      c = randInt(2, 20);
      answer = termVal + c;
      // tier +1 may lead with the added term: '12 + 4 × 6'
      var leadWithC = tier >= 1 && Math.random() < 0.5;
      prompt = leadWithC ? c + ' + ' + termStr + ' = ?' : termStr + ' + ' + c + ' = ?';
    } else {
      c = termVal < 3 ? 1 : randInt(1, termVal - 1); // keep the result positive
      answer = termVal - c;
      prompt = termStr + ' - ' + c + ' = ?';
    }
    return makeQuestion({
      format: 'g5_orderops',
      type: 'expr',
      operation: 'expr',
      prompt: prompt,
      promptSub: 'Multiply or divide first!',
      answer: answer,
      key: 'g5:oo:' + prompt.replace(/\s+/g, '').replace('=?', ''),
      meta: { a: a, b: b, c: c, form: form, useDiv: useDiv, termVal: termVal, baseFact: baseFact },
      visualSpec: null,
      hintEasy: 'Do ' + termStr + ' first. That makes ' + termVal + '.',
      hintMed: 'Multiplication and division always come before adding or subtracting.',
      hintHard: 'Now just ' + (form === 'plus' ? termVal + ' plus ' + c : termVal + ' minus ' + c) + '.'
    });
  };
```

- [ ] Implement part C — multi-step words + reasoning. Insert immediately after `BUILDERS.g5_orderops` (still above `// ---------- generation entry ----------`):

```js
  var G5_WORD_TEMPLATES = [
    function () {
      var a = randInt(3, 9), b = randInt(2, 9), d = pick([2, 3, 4, 6]);
      var perBox = b * d;
      return {
        prompt: 'A school orders ' + a + ' boxes of ' + perBox + ' pencils and shares them equally among ' + d + ' classes. How many pencils does each class get?',
        answer: a * b,
        meta: { a: a, perBox: perBox, d: d, steps: 'mul_div', baseFact: null },
        hintFact: a + ' × ' + perBox + ' first, then ÷ ' + d
      };
    },
    function () {
      var k = randInt(2, 5), p1 = randInt(4, 9), m = randInt(2, 4), p2 = randInt(10, 15);
      return {
        prompt: 'Kid tickets cost ' + p1 + ' dollars and adult tickets cost ' + p2 + ' dollars. A family buys ' + k + ' kid tickets and ' + m + ' adult tickets. How many dollars do they pay?',
        answer: k * p1 + m * p2,
        meta: { k: k, p1: p1, m: m, p2: p2, steps: 'mul_mul_add', baseFact: null },
        hintFact: k + ' × ' + p1 + ' and ' + m + ' × ' + p2 + ', then add them'
      };
    },
    function () {
      var a = randInt(6, 12), b = randInt(11, 15), c = randInt(5, 20);
      return {
        prompt: 'A farmer picks ' + a + ' crates of ' + b + ' apples. ' + c + ' apples are rotten and thrown away. How many good apples are there?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: null },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var days = randInt(3, 6), laps = randInt(4, 8), meters = pick([25, 50, 100]);
      return {
        prompt: 'Nina swims ' + laps + ' laps every day for ' + days + ' days. Each lap is ' + meters + ' meters. How many meters does she swim in all?',
        answer: days * laps * meters,
        meta: { days: days, laps: laps, meters: meters, steps: 'mul_mul', baseFact: null },
        hintFact: laps + ' × ' + days + ' laps first, then × ' + meters
      };
    },
    function () {
      var d = pick([4, 6, 8]), boxes = randInt(6, 12), s = randInt(2, 4);
      var n = d * boxes;
      return {
        prompt: 'A baker makes ' + n + ' cupcakes and packs them into boxes of ' + d + '. He sells ' + s + ' full boxes. How many boxes are left?',
        answer: boxes - s,
        meta: { d: d, boxes: boxes, s: s, steps: 'div_sub', baseFact: { a: d, b: boxes, op: 'div' } },
        hintFact: n + ' ÷ ' + d + ' boxes first, then take away ' + s
      };
    },
    function () {
      var bags = randInt(6, 12), choc = randInt(3, 9), candy = randInt(3, 9);
      return {
        prompt: 'Each gift bag gets ' + choc + ' chocolates and ' + candy + ' candies. How many treats are needed to fill ' + bags + ' bags?',
        answer: bags * (choc + candy),
        meta: { bags: bags, choc: choc, candy: candy, steps: 'add_mul', baseFact: null },
        hintFact: choc + ' plus ' + candy + ' treats per bag first, then × ' + bags
      };
    }
  ];

  BUILDERS.g5_word = function (tier) {
    var idx = randInt(0, G5_WORD_TEMPLATES.length - 1);
    var t = G5_WORD_TEMPLATES[idx]();
    t.meta.template = idx;
    return makeQuestion({
      format: 'g5_word',
      type: 'word',
      operation: t.meta.steps.indexOf('div') === 0 ? 'divide' : 'multiply',
      prompt: t.prompt,
      answer: t.answer,
      key: 'g5:w:t' + idx + ':' + t.answer,
      meta: t.meta,
      visualSpec: null,
      hintEasy: 'Two steps: ' + t.hintFact + '.',
      hintMed: 'Break it into steps and write each one down.',
      hintHard: t.hintFact + '.'
    });
  };

  function g5BigFactor(tier) {
    return tier >= 1 ? randInt(31, 99) : randInt(21, 49);
  }

  BUILDERS.g5_reason = function (tier) {
    if (Math.random() < 0.5) {
      var a1 = g5BigFactor(tier), d1 = randInt(3, 9);
      var a2 = g5BigFactor(tier), d2 = randInt(3, 9);
      var guard = 0;
      while (a1 * d1 === a2 * d2 && guard < 30) {
        a2 = g5BigFactor(tier);
        d2 = randInt(3, 9);
        guard++;
      }
      if (a1 * d1 === a2 * d2) a2 = a2 + 1;
      var p1 = a1 * d1, p2 = a2 * d2;
      return makeQuestion({
        format: 'g5_reason',
        type: 'reasoning',
        operation: 'multiply',
        prompt: 'Which is larger: ' + a1 + ' × ' + d1 + ' or ' + a2 + ' × ' + d2 + '? Type the larger value only.',
        answer: Math.max(p1, p2),
        key: 'g5:rs:rc:' + a1 + 'x' + d1 + 'v' + a2 + 'x' + d2,
        meta: { a: a1, b: d1, prod: p1, c: a2, d: d2, prod2: p2, reasoning: 'compare', baseFact: null },
        visualSpec: null,
        hintEasy: 'Work out both products, then pick the bigger one.',
        hintMed: 'Estimate first: round each big number to the nearest ten.',
        hintHard: 'Compare ' + p1 + ' and ' + p2 + '.'
      });
    }
    var a = g5BigFactor(tier), d = randInt(3, 9);
    var prod = a * d;
    var wrong = prod + pick([-30, -20, -10, 10, 20, 30]);
    return makeQuestion({
      format: 'g5_reason',
      type: 'reasoning',
      operation: 'multiply',
      prompt: 'Is ' + a + ' × ' + d + ' = ' + wrong + '? Type 1 for yes, 0 for no.',
      answer: 0,
      key: 'g5:rs:tf:' + a + 'x' + d + ':' + wrong,
      meta: { a: a, b: d, prod: prod, shown: wrong, reasoning: 'tf', baseFact: { a: a, b: d, op: 'mul' } },
      visualSpec: null,
      hintEasy: 'Work out ' + a + ' × ' + d + ' for real.',
      hintMed: 'Check the ones digit: what does ' + (a % 10) + ' × ' + d + ' end in?',
      hintHard: a + ' × ' + d + ' = ' + prod + ', not ' + wrong + '.'
    });
  };
```

- [ ] Run, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK` … `smoke-grade-bands: Task 4 OK`

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/gradeBands.js games/cosmic-math-quest/tests/smoke-grade-bands.mjs
git commit -m "feat(cmq): grade 5 band generators incl. order of operations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): grade 5 band generators incl. order of operations`

### Task 5: Band-aware validation + drift-up bonus generator

Replaces the permissive `validateBandQuestion` stub (Task 2) with the real band rules, so `generateForSlot`'s ≤60-attempt retry loop now actually gates output. Band rules replace `index.html`'s global guards where they conflict: G2 legitimately allows `1 × 1` and answers < 2 (the old `isTooEasyForEightYearOld` / `answer >= 2` guards at ~3240/3313 pre-edit were tuned for the removed 8-year-old easy level); remainders (`answerR`) are legal only at grades 4/5; ASCII `+` / digit-minus-digit prompts are legal only for `g5_orderops`. Also adds `generateDriftBonus` — the next-band taste for kids who master their band.

**Files:**
- Modify: `games/cosmic-math-quest/gradeBands.js`
- Modify: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs` (append)
- Test: `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs`

**Interfaces:**
- Consumes: `generateForSlot`, `GRADES`, `RECIPES`, all `BUILDERS` (Tasks 2–4).
- Produces: `window.GradeBands.validateBandQuestion(q, grade) -> boolean` (real rules); `window.GradeBands.generateDriftBonus(grade, tier) -> question|null` (2 → gentle `g3_missing`; 3 → `g4_multidigit` with product ≤ 100; 4 → `g5_pattern`; 5 → null).

**Steps:**

- [ ] Write the failing tests. Append to the END of `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`:

```js
// ---------- Task 5: band validation, retry gate, drift bonus ----------

// G2 accepts 1×1 (trivial facts are legal in grade 2); G3 rejects answers < 2
{
  const q = {
    type: 'basic', operation: 'multiply', prompt: '1 × 1 = ?', promptSub: null,
    answer: 1, answerR: null, key: 'g2:rc:1x1', level: 'easy', grade: 2, format: 'g2_recall',
    meta: { a: 1, b: 1, prod: 1, baseFact: null },
    hintEasy: 'h', hintMed: 'h', hintHard: 'h', visualSpec: null
  };
  assert.strictEqual(GB.validateBandQuestion(q, 2), true, 'G2 must accept 1×1');
  const q3 = { ...q, grade: 3, format: 'g3_recall', key: 'g3:rc:1x1' };
  assert.strictEqual(GB.validateBandQuestion(q3, 3), false, 'G3 must reject answer < 2');
}

// answerR: rejected at grades 2/3, accepted at 4 only when the identity holds
{
  const rq = {
    type: 'basic', operation: 'divide', prompt: '68 ÷ 5 = ?', promptSub: null,
    answer: 13, answerR: 3, key: 'g4:ld:68/5', level: 'hard', grade: 4, format: 'g4_longdiv',
    meta: { dividend: 68, divisor: 5, quotient: 13, remainder: true, baseFact: { a: 5, b: 13, op: 'div' } },
    hintEasy: 'h', hintMed: 'h', hintHard: 'h', visualSpec: null
  };
  assert.strictEqual(GB.validateBandQuestion(rq, 4), true);
  assert.strictEqual(GB.validateBandQuestion({ ...rq, grade: 3, format: 'g3_divfact' }, 3), false, 'no remainders before grade 4');
  assert.strictEqual(GB.validateBandQuestion({ ...rq, grade: 2, format: 'g2_sharing' }, 2), false);
  assert.strictEqual(GB.validateBandQuestion({ ...rq, answerR: 6 }, 4), false, 'r must be < divisor');
  assert.strictEqual(GB.validateBandQuestion({ ...rq, answer: 12 }, 4), false, 'identity divisor*q+r === dividend');
}

// '+' in a prompt is rejected everywhere except g5_orderops
{
  const plusQ = {
    type: 'basic', operation: 'multiply', prompt: '3 × 4 + 1 = ?', promptSub: null,
    answer: 13, answerR: null, key: 'g3:rc:bad', level: 'easy', grade: 3, format: 'g3_recall',
    meta: { baseFact: null }, hintEasy: 'h', hintMed: 'h', hintHard: 'h', visualSpec: null
  };
  assert.strictEqual(GB.validateBandQuestion(plusQ, 3), false, 'plus sign only allowed in g5_orderops');
  const ooQ = {
    type: 'expr', operation: 'expr', prompt: '3 × 4 + 1 = ?', promptSub: null,
    answer: 13, answerR: null, key: 'g5:oo:3x4p1', level: 'hard', grade: 5, format: 'g5_orderops',
    meta: { baseFact: { a: 3, b: 4, op: 'mul' } }, hintEasy: 'h', hintMed: 'h', hintHard: 'h', visualSpec: null
  };
  assert.strictEqual(GB.validateBandQuestion(ooQ, 5), true, 'orderops may contain +');
}

// 500-iteration fuzz per format token: generateForSlot always returns validated questions
const ALL_FORMATS = GB.GRADES.flatMap((g) => Object.keys(GB.RECIPES[g]));
for (const fmt of ALL_FORMATS) {
  const grade = parseInt(fmt.slice(1), 10);
  for (let i = 0; i < 500; i++) {
    const tier = [-1, 0, 1][i % 3];
    const q = GB.generateForSlot(fmt, tier);
    assert.ok(q, `generateForSlot(${fmt}, ${tier}) exhausted retries`);
    assert.strictEqual(GB.validateBandQuestion(q, grade), true, `invalid ${fmt} question: ${JSON.stringify(q)}`);
  }
}

// unknown format token -> null
assert.strictEqual(GB.generateForSlot('g9_nope', 0), null);

// drift bonus: per-grade next-band formats, null at grade 5
for (let i = 0; i < 30; i++) {
  const d2 = GB.generateDriftBonus(2, 0);
  assert.ok(d2 && d2.format === 'g3_missing', 'G2 drifts to gentle missing-factor');
  const d3 = GB.generateDriftBonus(3, 0);
  assert.ok(d3 && d3.format === 'g4_multidigit' && d3.answer <= 100, `G3 drift keeps products <= 100 (got ${d3 && d3.answer})`);
  const d4 = GB.generateDriftBonus(4, 0);
  assert.ok(d4 && d4.format === 'g5_pattern', 'G4 drifts to ×10 patterns');
}
assert.strictEqual(GB.generateDriftBonus(5, 0), null, 'G5 has no next band');

console.log('smoke-grade-bands: Task 5 OK');
```

- [ ] Run it, expect FAIL (the stub returns true for everything):

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected: Tasks 1–4 OK, then `AssertionError [ERR_ASSERTION]: G3 must reject answer < 2`

- [ ] Implement the real validator. In `games/cosmic-math-quest/gradeBands.js`, REPLACE this exact block:

```js
  // ---------- generation entry ----------
  // Permissive stub — replaced with real band rules in Task 5.
  function validateBandQuestion(q, grade) {
    return !!q && typeof q === 'object';
  }
```

with:

```js
  // ---------- generation entry ----------
  function isTrueFalseQuestion(q) {
    var m = q.meta || {};
    return m.reasoning === 'tf' || m.reasoning === 'tf_div';
  }

  /**
   * Band-aware validation (replaces index.html's global guards for band questions):
   * - G2 allows answer < 2 and trivial facts; grades 3-5 require answer >= 2
   *   (except true/false answers 0/1 and order-of-ops answers >= 1).
   * - answerR only at grades 4/5, with divisor*quotient + r === dividend and 0 < r < divisor.
   * - ASCII '+' / digit-minus-digit prompts only for format 'g5_orderops'.
   * - All answers are non-negative integers.
   */
  function validateBandQuestion(q, grade) {
    if (!q || typeof q !== 'object') return false;
    if (GRADES.indexOf(grade) === -1) return false;
    if (q.grade !== grade) return false;
    if (q.operation !== 'multiply' && q.operation !== 'divide' && q.operation !== 'expr') return false;
    if (typeof q.key !== 'string' || !q.key) return false;
    if (typeof q.prompt !== 'string' || !q.prompt) return false;
    if (q.level !== 'easy' && q.level !== 'medium' && q.level !== 'hard') return false;

    if (typeof q.answer !== 'number' || !Number.isFinite(q.answer) || q.answer !== Math.floor(q.answer)) return false;
    if (q.answer < 0) return false;

    var isOrderOps = q.format === 'g5_orderops';
    if (q.operation === 'expr' && !isOrderOps) return false;
    if (!isOrderOps) {
      if (q.prompt.indexOf('+') !== -1) return false;
      if (/\d\s*[-−]\s*\d/.test(q.prompt)) return false;
    }

    if (q.answerR != null) {
      if (grade !== 4 && grade !== 5) return false;
      var m = q.meta || {};
      if (typeof q.answerR !== 'number' || q.answerR !== Math.floor(q.answerR)) return false;
      if (typeof m.divisor !== 'number' || typeof m.dividend !== 'number') return false;
      if (!(q.answerR > 0 && q.answerR < m.divisor)) return false;
      if (m.divisor * q.answer + q.answerR !== m.dividend) return false;
      if (m.remainder !== true) return false;
    }

    if (isTrueFalseQuestion(q)) {
      if (q.answer !== 0 && q.answer !== 1) return false;
    } else if (isOrderOps) {
      if (q.answer < 1) return false;
    } else if (grade >= 3) {
      if (q.answer < 2) return false;
    }

    return true;
  }
```

- [ ] Add the drift-bonus generator. Insert immediately AFTER the closing brace of `function generateForSlot(...) { ... }` (still above `global.GradeBands = {`):

```js
  /**
   * Drift-up bonus: one question from the NEXT band's gentlest format.
   * The caller (index.html, chunk 3) marks it isBonus — no heart loss, no accuracy impact.
   */
  function generateDriftBonus(grade, tier) {
    var t = typeof tier === 'number' ? tier : 0;
    if (grade === 2) return generateForSlot('g3_missing', -1);
    if (grade === 3) {
      for (var i = 0; i < MAX_GENERATE_ATTEMPTS; i++) {
        var q = generateForSlot('g4_multidigit', -1);
        if (q && q.answer <= 100) return q;
      }
      return null;
    }
    if (grade === 4) return generateForSlot('g5_pattern', Math.min(t, 0));
    return null;
  }
```

- [ ] Export it. In the `global.GradeBands = {` block, apply this exact edit:

Old:
```js
    generateForSlot: generateForSlot,
    validateBandQuestion: validateBandQuestion,
```

New:
```js
    generateForSlot: generateForSlot,
    validateBandQuestion: validateBandQuestion,
    generateDriftBonus: generateDriftBonus,
```

- [ ] Run, expect PASS (the fuzz makes this the slowest run — a few seconds):

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK` … `smoke-grade-bands: Task 5 OK`

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/gradeBands.js games/cosmic-math-quest/tests/smoke-grade-bands.mjs
git commit -m "feat(cmq): band-aware validation, retry gate, and drift-up bonus generator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): band-aware validation, retry gate, and drift-up bonus generator`

### Task 6: learningIntelligence.js — families 2–12, baseFact-first mapping

`learningIntelligence.js` is the game's fact-family tracker (loaded by `index.html` at line 1182 pre-edit; also smoke-tested standalone). Today it only tracks families for factors 3–9 and derives families from `meta.a/b` (multiply) or `meta.divisor/quotient` (divide). This task (a) extends `FAMILY_FACTORS` to `[2..12]` (×1 stays untracked), and (b) makes `getFactFamily` read `q.meta.baseFact` FIRST when present — the anchor every gradeBands question carries — falling back to the existing logic for legacy questions and old wrong-answer snapshots (which never have `baseFact`, so their behavior is unchanged apart from the wider factor range).

**Files:**
- Modify: `games/cosmic-math-quest/learningIntelligence.js`
- Modify: `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs` (append)
- Test: `node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs` and `node games/cosmic-math-quest/tests/smoke-grade-bands.mjs`

**Interfaces:**
- Consumes: the question shape produced by `GradeBands.generateForSlot` (`meta.baseFact = {a, b, op:'mul'|'div'}|null`).
- Produces: `LearningIntel.FAMILY_FACTORS === [2,3,4,5,6,7,8,9,10,11,12]`; `LearningIntel.getFactFamily(q)` returns `kind:'fact'` with `familyIds` derived from `baseFact.a/b` (each mapped to `mul:<n>`/`div:<n>` when in 2..12) whenever `q.meta.baseFact` is present.

**Steps:**

- [ ] Baseline: run the existing suite BEFORE touching anything, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
```

Expected output: `smoke-learning-intelligence: OK`

- [ ] Write the failing tests. Append to the END of `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`:

```js
// 5) FAMILY_FACTORS now spans 2..12 (×1 stays untracked)
assert.deepStrictEqual(L.FAMILY_FACTORS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

// 6) mul:2 and mul:12 are now tracked by the legacy meta path (no baseFact)
const q212 = { key: 't212', operation: 'multiply', type: 'basic', meta: { a: 2, b: 12, prod: 24 } };
const fam212 = L.getFactFamily(q212);
assert.strictEqual(fam212.kind, 'fact');
assert.ok(fam212.familyIds.includes('mul:2') && fam212.familyIds.includes('mul:12'));

// 7) baseFact wins when present: a g5_pattern-shaped question maps to the table fact
const qPat = {
  key: 'g5:pat:40x70', operation: 'multiply', type: 'basic',
  meta: { a: 40, b: 70, prod: 2800, baseFact: { a: 4, b: 7, op: 'mul' } },
};
const famPat = L.getFactFamily(qPat);
assert.strictEqual(famPat.kind, 'fact');
assert.deepStrictEqual(famPat.familyIds.slice().sort(), ['mul:4', 'mul:7']);

// 8) g4_multidigit-shaped: only the in-range factor becomes a family
const qMd = {
  key: 'g4:md:34x6', operation: 'multiply', type: 'basic',
  meta: { a: 34, b: 6, prod: 204, baseFact: { a: 34, b: 6, op: 'mul' } },
};
assert.deepStrictEqual(L.getFactFamily(qMd).familyIds, ['mul:6']);

// 9) division baseFact maps to div: families (long division -> the divisor's family)
const qLd = {
  key: 'g4:ld:68/5', operation: 'divide', type: 'basic',
  meta: { dividend: 68, divisor: 5, quotient: 13, remainder: true, baseFact: { a: 5, b: 13, op: 'div' } },
};
assert.deepStrictEqual(L.getFactFamily(qLd).familyIds, ['div:5']);

// 10) order-of-ops-shaped: baseFact wins even for operation 'expr'
const qOo = {
  key: 'g5:oo:4x6p12', operation: 'expr', type: 'expr',
  meta: { a: 4, b: 6, c: 12, baseFact: { a: 4, b: 6, op: 'mul' } },
};
assert.deepStrictEqual(L.getFactFamily(qOo).familyIds.slice().sort(), ['mul:4', 'mul:6']);

// 11) band question with an EXPLICIT null baseFact maps to NO family.
//     (Without this, a g5_bigmult like 12 × 15 falls through to the legacy
//     meta path and pollutes mul:11/mul:12 familyStats — which drives drift-up.)
const qBm = {
  key: 'g5:bm:12x15', operation: 'multiply', type: 'basic',
  meta: { a: 12, b: 15, prod: 180, baseFact: null },
};
const famBm = L.getFactFamily(qBm);
assert.strictEqual(famBm.kind, 'unknown');
assert.deepStrictEqual(famBm.familyIds, []);

console.log('smoke-learning-intelligence: extended OK');
```

- [ ] Run it, expect FAIL:

```bash
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
```

Expected: `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` showing `[ 3, 4, 5, 6, 7, 8, 9 ]` vs `[ 2, 3, ..., 12 ]`

- [ ] Implement edit 1 — the factor range. In `games/cosmic-math-quest/learningIntelligence.js` (line 9), REPLACE:

```js
  var FAMILY_FACTORS = [3, 4, 5, 6, 7, 8, 9];
```

with:

```js
  var FAMILY_FACTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
```

(Leave `FLUENCY_MIN`/`FLUENCY_MAX` at 2/9 — they scope the follow-up-question pool, not family tracking.)

- [ ] Implement edit 2 — baseFact-first mapping. In `getFactFamily` (line 43), REPLACE:

```js
  function getFactFamily(q) {
    if (!q || typeof q !== 'object') {
      return { kind: 'unknown', operation: null, familyIds: [], primaryFactors: [], meta: {} };
    }
    var op = q.operation;
```

with:

```js
  function getFactFamily(q) {
    if (!q || typeof q !== 'object') {
      return { kind: 'unknown', operation: null, familyIds: [], primaryFactors: [], meta: {} };
    }
    var bf = q.meta && q.meta.baseFact;
    if (bf && typeof bf === 'object' && (bf.op === 'mul' || bf.op === 'div')) {
      var bfPrefix = bf.op === 'div' ? 'div:' : 'mul:';
      var bfFactors = [];
      [bf.a, bf.b].forEach(function (f) {
        if (typeof f === 'number' && isFamilyTable(f)) bfFactors.push(f);
      });
      return {
        kind: 'fact',
        operation: q.operation || (bf.op === 'div' ? 'divide' : 'multiply'),
        familyIds: uniq(bfFactors.map(function (n) { return bfPrefix + n; })),
        primaryFactors: bfFactors.slice().sort(function (x, y) { return x - y; }),
        meta: { baseFact: { a: bf.a, b: bf.b, op: bf.op } },
      };
    }
    if (q.meta && 'baseFact' in q.meta && !q.meta.baseFact) {
      // A band question that explicitly declares "no anchoring table fact"
      // (g5_bigmult, g5_longdiv2). Never fall through to the legacy meta
      // paths — with families widened to 2-12 they would misfile 12 × 15
      // under mul:12 and pollute the mastery stats that drive drift-up.
      // Legacy questions and old snapshots never carry the baseFact key.
      return { kind: 'unknown', operation: q.operation || null, familyIds: [], primaryFactors: [], meta: {} };
    }
    var op = q.operation;
```

(`isFamilyTable` and `uniq` are already defined above in the same IIFE; with `FAMILY_FACTORS` widened, `isFamilyTable` now accepts 2..12, which is exactly the contract's baseFact range.)

- [ ] Run, expect PASS:

```bash
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
```

Expected output: `smoke-learning-intelligence: OK` then `smoke-learning-intelligence: extended OK`

- [ ] Regression: the gradeBands suite still passes and the chunk is green end-to-end:

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
```

Expected output: `smoke-grade-bands: Task 1 OK` … `smoke-grade-bands: Task 5 OK`

- [ ] Manual browser sanity check (learningIntelligence.js is live game code; gradeBands.js is not yet loaded by index.html — that wiring is chunk 2):
  1. From the repo root run `python3 -m http.server 8000`.
  2. Open `http://localhost:8000/games/cosmic-math-quest/index.html` (standalone). Open DevTools console.
  3. Click Play, answer one question wrong on purpose, then one right. Confirm no console errors and the game advances normally.
  4. Open `http://localhost:8000/index.html#/games/cosmic-math-quest` (hub). Confirm the game loads in the iframe with the chrome bar and no console errors.

- [ ] Commit:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
git add games/cosmic-math-quest/learningIntelligence.js games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
git commit -m "feat(cmq): learning intelligence tracks families 2-12 via baseFact

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: `[feature/cmq-grade-bands-modes <hash>] feat(cmq): learning intelligence tracks families 2-12 via baseFact`
### Task 7: State & storage plumbing (gradeBands script tag, progress fields, GameState fields)

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`, `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`, `games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs` (existing — must stay green)

**Interfaces:**
- Consumes: `window.GradeBands` (from Task 1's `games/cosmic-math-quest/gradeBands.js`), existing `defaultProgress()` / `ensureProgressShape(p)` / `GameState` in `index.html`.
- Produces: `progress.grade` (`2|3|4|5|null`), `progress.bestLightningByGrade` (`{}`), `progress.lightningBestBeats` (`0`); `GameState.grade`, `GameState.playMode` (default `'mission'`), `GameState.lastPlayMode`; `hasGradeBands()` guard function.

Context for the executing engineer: `index.html` is one 4,587-line file containing all game logic in a single IIFE (starts ~line 1184). The game persists a per-profile "progress" blob to localStorage via `defaultProgress()`/`ensureProgressShape()`/`saveProgress()`. `gradeBands.js` (built in Tasks 1–5) is a standalone script that attaches `window.GradeBands`.

- [ ] Add the gradeBands script tag. Find line ~1182:

```html
  <script src="learningIntelligence.js"></script>
```

Replace with:

```html
  <script src="learningIntelligence.js"></script>
  <script src="gradeBands.js"></script>
```

- [ ] Add the `hasGradeBands()` guard. In the CONFIG section, directly after the `WRONGS_KEY_BASE` constant (~line 1201, `const WRONGS_KEY_BASE = 'cosmicMathQuest_wrongs_v1';`), insert:

```js
  /** GradeBands module presence guard — index.html must never hard-depend
   *  on script load order (standalone file:// play). */
  function hasGradeBands() {
    return typeof GradeBands !== 'undefined' && !!GradeBands &&
      typeof GradeBands.buildRoundPlan === 'function' &&
      typeof GradeBands.generateForSlot === 'function';
  }
```

- [ ] Add the new GameState fields. In the `GameState` literal (~line 1240), replace:

```js
  const GameState = {
    level: 'easy',
    mode: 'multiply',
```

with:

```js
  const GameState = {
    /** Active grade band (2|3|4|5|null); mirrors progress.grade at round start. */
    grade: null,
    /** How the current round is being played: 'mission'|'boss'|'lightning'|'practice'. */
    playMode: 'mission',
    /** playMode of the last completed normal round (results "Play again"). */
    lastPlayMode: 'mission',
    level: 'easy',
    mode: 'multiply',
```

(`level` is deleted in Task 9 — leave it for now so the old generators keep working until then.)

- [ ] Add the new progress fields to `defaultProgress()` (~line 1295). Replace:

```js
  function defaultProgress() {
    return {
      totalStars: 0,
      roundsPlayed: 0,
```

with:

```js
  function defaultProgress() {
    return {
      /** Grade band chosen on the menu (2|3|4|5); null = not picked yet. */
      grade: null,
      /** Best Lightning score per grade, e.g. {3: 14}. Filled by chunk 3. */
      bestLightningByGrade: {},
      /** How many times the kid beat their own Lightning best (badge fuel). */
      lightningBestBeats: 0,
      totalStars: 0,
      roundsPlayed: 0,
```

- [ ] Backfill the same fields in `ensureProgressShape(p)` (~line 1329). Replace:

```js
    return {
      totalStars: Number(p.totalStars) || 0,
```

with:

```js
    return {
      grade: p.grade === 2 || p.grade === 3 || p.grade === 4 || p.grade === 5 ? p.grade : null,
      bestLightningByGrade:
        p.bestLightningByGrade && typeof p.bestLightningByGrade === 'object' ? p.bestLightningByGrade : {},
      lightningBestBeats: Number(p.lightningBestBeats) || 0,
      totalStars: Number(p.totalStars) || 0,
```

- [ ] Run the node smoke tests (none of them touch these regions, so all must stay green):

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
```

Expected: each exits 0; the last two end with `smoke-learning-intelligence: OK` and `smoke-wrongs-roundtrip: OK`.

- [ ] Manual browser check:
  1. From the repo root run `python3 -m http.server 8000`.
  2. Open `http://localhost:8000/games/cosmic-math-quest/index.html`.
  3. Open devtools Console (F12). Expect ZERO errors (a red error here most likely means the gradeBands.js path or a syntax slip).
  4. In the Console type `typeof GradeBands` → must print `"object"`.
  5. Play one quick Easy mission question to confirm nothing regressed, then in Console run `JSON.parse(localStorage.getItem('cosmicMathQuest_v1'))` — after the round ends the object must contain `"grade": null`, `"bestLightningByGrade": {}`, `"lightningBestBeats": 0`.

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): wire gradeBands module + grade/playMode state plumbing"
```

### Task 8: Menu redesign — grade card, grade chip, mode tiles

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: manual browser checks (no DOM test harness exists)

**Interfaces:**
- Consumes: `progress.grade` / `saveProgress` / `ensureProgressShape` (Task 7), existing `showScreen`, `startRound`, `safeStartWrongAnswerPractice`, `__cmq_pendingResume` resume plumbing.
- Produces: DOM ids `#grade-card`, `#grade-chip-row`, `#grade-chip`, `#btn-tile-mission`, `#btn-tile-boss` (hidden), `#btn-tile-lightning` (hidden), `#btn-tile-fixit`, `#fixit-due-badge`; JS functions `isGradeSet()`, `renderGradeUi()`; module-level `var gradeCardForcedOpen`.

Context: the menu is `#screen-menu` (lines 962–1009). It currently has two "segment" picker rows (level + mode) whose click handlers live at lines 4212–4234. The section's `aria-labelledby="menu-title"` points at the "Choose level" label we are deleting, so the id moves to the `<h1>`.

- [ ] Move the `menu-title` id to the heading. Replace (~line 962-965):

```html
    <section id="screen-menu" class="screen active" aria-labelledby="menu-title">
      <div class="brand">
        <h1>🚀 Cosmic Math Quest</h1>
```

with:

```html
    <section id="screen-menu" class="screen active" aria-labelledby="menu-title">
      <div class="brand">
        <h1 id="menu-title">🚀 Cosmic Math Quest</h1>
```

- [ ] Replace the two picker rows and the Play button with the grade card + chip + mode tiles. Replace the block from `<div class="segment-label" id="menu-title">Choose level</div>` (~line 968) through the Play-button row's closing `</div>` (~line 985) — i.e. everything between `<div class="panel">` and `<div class="segment-label">Things to Improve</div>` — with:

```html
        <!-- One-time grade picker: visible until progress.grade is set,
             and re-opened by the grade chip. NOT an interstitial — it lives
             on the menu itself and never blocks a started round. -->
        <div class="grade-card" id="grade-card" hidden>
          <div class="segment-label" id="grade-card-title">Which grade are you in?</div>
          <div class="grade-btn-row" role="group" aria-labelledby="grade-card-title">
            <button type="button" class="grade-btn" data-grade="2">2</button>
            <button type="button" class="grade-btn" data-grade="3">3</button>
            <button type="button" class="grade-btn" data-grade="4">4</button>
            <button type="button" class="grade-btn" data-grade="5">5</button>
          </div>
        </div>
        <div class="grade-chip-row" id="grade-chip-row" hidden>
          <button type="button" class="grade-chip" id="grade-chip">🌌 Grade 3 · change</button>
        </div>
        <div class="mode-tile-grid" id="mode-tile-grid">
          <button type="button" class="mode-tile" id="btn-tile-mission">
            <span class="mode-tile-emoji" aria-hidden="true">🚀</span>
            <span class="mode-tile-name">Mission</span>
            <span class="mode-tile-sub">10 questions · hearts &amp; stars</span>
          </button>
          <button type="button" class="mode-tile" id="btn-tile-boss" hidden>
            <span class="mode-tile-emoji" aria-hidden="true">🎯</span>
            <span class="mode-tile-name">Boss Battle</span>
            <span class="mode-tile-sub">Bring the boss to 0 HP</span>
          </button>
          <button type="button" class="mode-tile" id="btn-tile-lightning" hidden>
            <span class="mode-tile-emoji" aria-hidden="true">⚡</span>
            <span class="mode-tile-name">Lightning</span>
            <span class="mode-tile-sub">90 seconds · beat your best</span>
          </button>
          <button type="button" class="mode-tile" id="btn-tile-fixit">
            <span class="mode-tile-emoji" aria-hidden="true">🔧</span>
            <span class="mode-tile-name">Fix-It</span>
            <span class="mode-tile-sub">Practice tricky questions</span>
            <span class="mode-tile-badge" id="fixit-due-badge" hidden></span>
          </button>
        </div>
        <div class="btn-row" id="cmq-resume-row" hidden>
          <button type="button" class="btn btn-primary cmq-resume" id="btn-cmq-resume">▶ Continue my last session</button>
        </div>
```

(The resume row markup is unchanged — it just moved below the tiles. Boss/Lightning ship `hidden`; chunk 3 unhides them.)

- [ ] Add the CSS. Insert immediately before the `@media (min-width: 600px)` rule at the end of the `<style>` block (~line 951 pre-edit):

```css
    /* ===== Menu redesign: grade picker + mode tiles ===== */
    .grade-card {
      border: 2px solid rgba(110, 181, 255, 0.35);
      border-radius: 14px;
      padding: 0.25rem 1rem 1rem;
      margin-bottom: 1rem;
      background: rgba(110, 181, 255, 0.08);
    }

    .grade-btn-row { display: flex; gap: 10px; flex-wrap: wrap; }

    .grade-btn {
      flex: 1 1 0;
      min-width: 64px;
      min-height: 64px;
      font-family: inherit;
      font-size: 1.6rem;
      font-weight: 800;
      border-radius: 14px;
      border: 2px solid rgba(110, 181, 255, 0.35);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.12s;
    }
    .grade-btn:active { transform: scale(0.97); }
    .grade-btn:focus-visible { outline: 3px solid var(--accent-warm); outline-offset: 3px; }
    .grade-btn.selected {
      background: rgba(126, 255, 179, 0.2);
      border-color: var(--accent);
      color: var(--accent);
    }

    .grade-chip-row { display: flex; justify-content: center; margin-bottom: 0.75rem; }
    .grade-chip {
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      padding: 0.4rem 0.9rem;
      border-radius: 999px;
      border: 2px solid rgba(110, 181, 255, 0.4);
      background: rgba(110, 181, 255, 0.15);
      color: var(--text);
      cursor: pointer;
    }
    .grade-chip:focus-visible { outline: 3px solid var(--accent-warm); outline-offset: 3px; }

    .mode-tile-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 0.5rem;
    }
    .mode-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 1rem 0.75rem;
      min-height: 108px;
      font-family: inherit;
      color: var(--text);
      background: linear-gradient(145deg, rgba(110, 181, 255, 0.14), rgba(124, 255, 179, 0.08));
      border: 2px solid rgba(110, 181, 255, 0.35);
      border-radius: 16px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      transition: transform 0.12s, border-color 0.15s, filter 0.12s;
    }
    .mode-tile:active { transform: scale(0.97); }
    .mode-tile:focus-visible { outline: 3px solid var(--accent-warm); outline-offset: 3px; }
    .mode-tile[aria-disabled="true"] {
      opacity: 0.45;
      cursor: not-allowed;
      filter: grayscale(0.4);
    }
    .mode-tile-emoji { font-size: 1.9rem; line-height: 1; }
    .mode-tile-name { font-size: 1.15rem; font-weight: 800; }
    .mode-tile-sub { font-size: 0.85rem; color: var(--text-muted); text-align: center; }
    .mode-tile-badge {
      position: absolute;
      top: 8px;
      right: 10px;
      font-size: 0.8rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--accent-warm);
      color: #3a2a00;
    }
```

- [ ] Replace the segment-button handlers with the grade/tile logic. Delete the two `document.querySelectorAll('[data-level]')…` and `document.querySelectorAll('[data-mode]')…` blocks AND the `document.getElementById('btn-play').addEventListener('click', startRound);` line (lines 4212–4236 pre-edit, right under `// ========== MENU / EVENTS ==========`), and insert in their place:

```js
  // ---- Grade picker + mode tiles (menu redesign) ----
  /** True when the chip re-opened the grade card over an already-set grade. */
  var gradeCardForcedOpen = false;

  function isGradeSet() {
    var g = progress && progress.grade;
    return g === 2 || g === 3 || g === 4 || g === 5;
  }

  /** Single source of truth for menu grade UI: card vs chip, tile enablement. */
  function renderGradeUi() {
    progress = ensureProgressShape(progress);
    var set = isGradeSet();
    var card = document.getElementById('grade-card');
    var chipRow = document.getElementById('grade-chip-row');
    var chip = document.getElementById('grade-chip');
    if (card) card.hidden = set && !gradeCardForcedOpen;
    if (chipRow) chipRow.hidden = !set;
    if (chip && set) chip.textContent = '🌌 Grade ' + progress.grade + ' · change';
    var tiles = document.querySelectorAll('.mode-tile');
    var i;
    for (i = 0; i < tiles.length; i++) {
      tiles[i].setAttribute('aria-disabled', set ? 'false' : 'true');
    }
    var gbtns = document.querySelectorAll('.grade-btn');
    var j;
    for (j = 0; j < gbtns.length; j++) {
      var g = parseInt(gbtns[j].getAttribute('data-grade'), 10);
      gbtns[j].classList.toggle('selected', set && g === progress.grade);
    }
  }

  document.querySelectorAll('.grade-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var g = parseInt(btn.getAttribute('data-grade'), 10);
      if (!(g >= 2 && g <= 5)) return;
      progress = ensureProgressShape(progress);
      progress.grade = g;
      saveProgress(progress);
      GameState.grade = g;
      gradeCardForcedOpen = false;
      renderGradeUi();
    });
  });

  document.getElementById('grade-chip').addEventListener('click', function () {
    gradeCardForcedOpen = true;
    renderGradeUi();
  });

  /** Tiles are inert until a grade is picked (they just re-open the card). */
  function guardTile(handler) {
    return function () {
      if (!isGradeSet()) {
        gradeCardForcedOpen = true;
        renderGradeUi();
        return;
      }
      handler();
    };
  }

  document.getElementById('btn-tile-mission').addEventListener('click', guardTile(function () {
    startRound();
  }));
  // Boss Battle / Lightning tiles ship hidden; chunk 3 unhides and wires them.
  document.getElementById('btn-tile-fixit').addEventListener('click', guardTile(function () {
    // Temporary wiring (replaced in Task 11 by the combined Fix-It set):
    safeStartWrongAnswerPractice(null, { emptyStateLocation: 'menu' });
  }));
```

- [ ] Update the resume-clear listener that referenced `btn-play`. In the resume-wiring IIFE (~line 4545 pre-edit), replace:

```js
    var play = document.getElementById('btn-play');
    if (play) play.addEventListener('click', function () {
      if (__cmq_pendingResume) __cmq_clearPendingResume();
    }, true);
```

with:

```js
    var play = document.getElementById('btn-tile-mission');
    if (play) play.addEventListener('click', function () {
      if (__cmq_pendingResume) __cmq_clearPendingResume();
    }, true);
```

- [ ] Refresh grade UI on every menu show and on profile switch. In `showScreen` (~line 3660), replace:

```js
    if (name === 'menu') updateMenuMistakeButtons();
```

with:

```js
    if (name === 'menu') {
      updateMenuMistakeButtons();
      renderGradeUi();
    }
```

And in `reloadStateForActiveProfile` (~line 4447), replace:

```js
  function reloadStateForActiveProfile() {
    progress = loadProgress();
    wrongAnswerStore = loadWrongAnswerHistory();
    resetLatestPracticeStateOnLaunch();
    updatePracticeButtons();
  }
```

with:

```js
  function reloadStateForActiveProfile() {
    progress = loadProgress();
    wrongAnswerStore = loadWrongAnswerHistory();
    resetLatestPracticeStateOnLaunch();
    updatePracticeButtons();
    GameState.grade = (progress && progress.grade) || null;
    gradeCardForcedOpen = false;
    renderGradeUi();
  }
```

- [ ] Call `renderGradeUi()` once at startup. Replace (~line 4436):

```js
  (function initWrongAnswersUi() {
    resetLatestPracticeStateOnLaunch();
    updatePracticeButtons();
  })();
```

with:

```js
  (function initWrongAnswersUi() {
    resetLatestPracticeStateOnLaunch();
    updatePracticeButtons();
    GameState.grade = (progress && progress.grade) || null;
    renderGradeUi();
  })();
```

- [ ] Update the "How to play" modal (it still describes the deleted pickers). Replace the first two `<li>` items in `#modal-how` (~lines 1143–1144):

```html
        <li>Pick <strong>Easy</strong>, <strong>Medium</strong>, or <strong>Hard</strong>. Tap <strong>Show hint</strong> for help (pictures on Easy).</li>
        <li>Choose <strong>Multiplication</strong>, <strong>Division</strong>, or <strong>Mix</strong>.</li>
```

with:

```html
        <li>Pick your <strong>grade</strong> once — change it any time with the <strong>🌌 Grade</strong> chip.</li>
        <li>Choose a tile: <strong>🚀 Mission</strong> to play, or <strong>🔧 Fix-It</strong> to practice tricky questions. Tap <strong>Show hint</strong> for help.</li>
```

- [ ] Manual browser check — first-run flow, grade change flow, standalone + hub:
  1. `python3 -m http.server 8000` from the repo root.
  2. Standalone first run: open `http://localhost:8000/games/cosmic-math-quest/index.html` in a **private/incognito window** (clean localStorage). The menu shows "Which grade are you in?" with buttons 2/3/4/5; the Mission and Fix-It tiles are visible but dimmed; Boss/Lightning tiles are absent (hidden).
  3. Click a dimmed tile → nothing starts; the grade card stays open.
  4. Click **3** → the card closes, chip reads `🌌 Grade 3 · change`, tiles brighten.
  5. Reload the page → chip still shows Grade 3, no card (persistence works).
  6. Click the chip → card re-opens with **3** highlighted; click **4** → card closes, chip reads `🌌 Grade 4 · change`.
  7. Click 🚀 Mission → a round starts (still the old easy/multiply generator until Task 9 — that is expected).
  8. Hub: open `http://localhost:8000/index.html#/games/cosmic-math-quest`, pick/create a profile. A brand-new profile sees the grade card (profile-scoped key = clean slate). Pick a grade, confirm the chip, go back to the hub, re-enter — the chip persists for that profile.
  9. Console shows zero errors throughout.

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): menu redesign — grade picker, grade chip, mode tiles"
```

### Task 9: Mission wiring — rounds draw from grade-band recipes

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: node smoke tests (regression) + manual browser check of a full Grade-3 mission

**Interfaces:**
- Consumes: `GradeBands.buildRoundPlan(grade, size, opts)`, `GradeBands.generateForSlot(formatToken, tier)` (Tasks 1–5); `hasGradeBands()`, `isGradeSet()`, `renderGradeUi()`, `gradeCardForcedOpen` (Tasks 7–8); existing `getAdaptiveTier()`, `collectRoundKeysExcludingIndex()`, `sessionAskedKeys`, `recordWrongAnswer`, `resolveMistake`, `wrongAnswerStore`.
- Produces: `startRound(playMode)` (new signature), `GameState.bandPlan` (array of format tokens), band-backed `generateRoundQuestionAtIndex(slotIndex)`, wrong records with `grade` + `playMode` fields, HUD badge "Grade N", `GameState.lastPlayMode` written by `endRound`, badge `hard` relabeled "Challenger 🏆". Deletes `GameState.level`, `GameState.lastRoundMode`, `GameState.lastRoundLevel`, `GameState.roundAdaptivePlan` and the dead legacy plan/pool functions.

Context: today `startRound()` builds a round from `GameState.level`/`GameState.mode` via `generateRoundQuestionAtIndex` → `generateRawQuestion`/`finalizeQuestion`/`validateQuestion` (lazy: each slot generates when reached, so the adaptive tier applies). We keep the lazy-slot architecture and swap the generator to `GradeBands`. Practice ("review mode") replays stored snapshots and must not touch the band path.

- [ ] Rewrite `startRound` (~line 4173). Replace the whole function with:

```js
  /** @param {'mission'|'boss'|'lightning'} playMode - defaults to 'mission'. */
  function startRound(playMode) {
    progress = ensureProgressShape(progress);
    if (!hasGradeBands()) {
      window.alert('Oops — the question maker did not load. Please refresh the page.');
      return;
    }
    if (!isGradeSet()) {
      gradeCardForcedOpen = true;
      renderGradeUi();
      showScreen('menu');
      return;
    }
    GameState.playMode = playMode || 'mission';
    GameState.grade = progress.grade;
    GameState.mode = 'mixed'; // band rounds always mix ops; keeps the wrong-record 'mode' field truthful
    GameState.questionIndex = 0;
    GameState.score = 0;
    GameState.streak = 0;
    GameState.bestStreakThisRound = 0;
    GameState.hearts = INITIAL_HEARTS;
    GameState.correctCount = 0;
    GameState.totalAnswered = 0;
    GameState.isReviewMode = false;
    GameState.pendingReviewAdvance = false;
    GameState.reviewCompletedAllCorrect = false;
    GameState.reviewJustCompleted = false;
    GameState.isGameOver = false;
    GameState.mistakeSeenThisRound = false;
    GameState.correctAfterFirstMistake = 0;
    GameState.hintsUsedThisRound = 0;
    GameState.roundSize = ROUND_SIZE;
    GameState.currentRoundId = newRoundId();
    GameState.currentRoundWrongAnswers = [];
    resetAdaptiveDifficultyState();
    GameState.roundMixOps = null;
    // Format plan for the whole round (quota recipe for the grade, shuffled).
    GameState.bandPlan = GradeBands.buildRoundPlan(GameState.grade, ROUND_SIZE);
    GameState.roundQuestions = new Array(ROUND_SIZE);
    generateRoundQuestionAtIndex(0);
    GameState.currentQuestion = GameState.roundQuestions[0];
    setReviewBannerVisible(false);
    setGameTitle('🛸 Mission in progress');
    setGameOverModalOpen(false);
    showNormalResultsStats();
    showScreen('game');
    updateExitButtonLabel();
    renderQuestion();
  }
```

- [ ] Update the three callers of `startRound` to pass a playMode. The Mission tile (Task 8): change `startRound();` to `startRound('mission');`. The results "Play again" button (~line 4339): replace

```js
  document.getElementById('btn-again').addEventListener('click', startRound);
```

with:

```js
  document.getElementById('btn-again').addEventListener('click', function () {
    startRound(GameState.lastPlayMode || 'mission');
  });
```

The game-over "Try Again" button (~line 4341): replace

```js
  document.getElementById('btn-game-over-try-again').addEventListener('click', function () {
    setGameOverModalOpen(false);
    startRound();
  });
```

with:

```js
  document.getElementById('btn-game-over-try-again').addEventListener('click', function () {
    setGameOverModalOpen(false);
    startRound(GameState.playMode || 'mission');
  });
```

- [ ] Rewrite `generateRoundQuestionAtIndex` (~line 3469). Replace the whole function with:

```js
  /** One slot of the current banded round, generated at ask-time so it uses
   *  the CURRENT GameState.adaptiveTier. Only normal rounds land here —
   *  review/practice replays stored snapshots and never calls this. */
  function generateRoundQuestionAtIndex(slotIndex) {
    var roundKeys = collectRoundKeysExcludingIndex(slotIndex);
    var plan = GameState.bandPlan || [];
    var token = plan[slotIndex];
    var q = null;
    var candidate = null;
    var attempt;
    for (attempt = 0; attempt < 30; attempt++) {
      candidate = GradeBands.generateForSlot(token, getAdaptiveTier());
      if (!candidate) continue;
      if (roundKeys.has(candidate.key)) continue;                 // never repeat inside a round
      if (sessionAskedKeys.has(candidate.key) && attempt < 20) continue; // soft cross-round dedupe
      q = candidate;
      break;
    }
    if (!q) q = candidate; // dedupe exhausted — accept the last valid candidate
    if (!q) {
      // GradeBands returned null 30 times (should never happen): hard-coded safe fact.
      q = {
        type: 'basic',
        operation: 'multiply',
        prompt: '6 × 7 = ?',
        promptSub: '',
        answer: 42,
        answerR: null,
        key: 'g' + (GameState.grade || 3) + ':fallback:6x7',
        level: 'easy',
        grade: GameState.grade || 3,
        format: token || 'fallback',
        meta: { a: 6, b: 7, baseFact: { a: 6, b: 7, op: 'mul' } },
        hintEasy: 'Skip-count by 7: 7, 14, 21, 28, 35, 42.',
        hintMed: 'Think of 6 groups of 7.',
        hintHard: '6 × 7 = 42.',
        visualSpec: { kind: 'array', rows: 6, cols: 7 },
      };
    }
    roundKeys.add(q.key);
    sessionAskedKeys.add(q.key);
    if (sessionAskedKeys.size > 4000) {
      sessionAskedKeys = new Set(Array.from(sessionAskedKeys).slice(-2000));
    }
    GameState.roundQuestions[slotIndex] = q;
  }
```

- [ ] Remove the legacy repair loop from `renderQuestion` (~line 3889). Band questions were validated inside `GradeBands.generateForSlot`, and review mode replays snapshots verbatim, so the regenerate-on-invalid loop (which called the old level/mode generators) goes away. Replace:

```js
  function renderQuestion() {
    var q = GameState.currentQuestion;
    var guard = 0;
    var rk = new Set();
    var rqi, rkQ;
    for (rqi = 0; rqi < GameState.roundQuestions.length; rqi++) {
      rkQ = GameState.roundQuestions[rqi];
      if (rkQ && rqi !== GameState.questionIndex) rk.add(rkQ.key);
    }
    while (guard < 24 && !validateQuestion(q, GameState.mode, { roundKeys: rk, skipSession: true })) {
      var opFix = GameState.mode === 'multiply' ? 'multiply' : GameState.mode === 'divide' ? 'divide' : GameState.roundMixOps[GameState.questionIndex];
      var rawFix = generateRawQuestion(GameState.level, opFix, fallbackQtypeForSlot(GameState.level, opFix));
      q = finalizeQuestion(rawFix, GameState.level, GameState.mode);
      GameState.roundQuestions[GameState.questionIndex] = q;
      GameState.currentQuestion = q;
      guard++;
    }

    GameState.answered = false;
```

with:

```js
  function renderQuestion() {
    var q = GameState.currentQuestion;
    // Band questions are validated by GradeBands at generation time; review
    // mode replays stored snapshots verbatim. No regenerate-on-invalid loop.
    GameState.answered = false;
```

- [ ] Render the optional band sub-prompt. In the question card HTML (~line 1049), replace:

```html
        <div class="question-card">
          <p class="question-text" id="q-text">Loading…</p>
        </div>
```

with:

```html
        <div class="question-card">
          <p class="question-text" id="q-text">Loading…</p>
          <p class="question-sub" id="q-sub" hidden></p>
        </div>
```

Add this CSS next to `.question-text` (~line 353, after its closing brace):

```css
    .question-sub {
      font-size: 1.05rem;
      color: var(--text-muted);
      margin: 0;
    }
```

And in `renderQuestion`, directly after `document.getElementById('q-text').textContent = q.prompt;`, insert:

```js
    var subEl = document.getElementById('q-sub');
    if (subEl) {
      subEl.textContent = q.promptSub || '';
      subEl.hidden = !q.promptSub;
    }
```

- [ ] Teach the visual renderer the band `visualSpec` shape (`{kind, rows, cols}` per the contract; legacy specs use `{a,b}` / `{groups,per}`). Replace `renderVisualFromSpec` (~line 2657):

```js
  function renderVisualFromSpec(spec) {
    if (!spec) return null;
    if (spec.kind === 'array') return renderArray(spec.a, spec.b);
    if (spec.kind === 'groups') return renderGroups(spec.groups, spec.per);
    return null;
  }
```

with:

```js
  function renderVisualFromSpec(spec) {
    if (!spec) return null;
    if (spec.kind === 'array') {
      var a = spec.a != null ? spec.a : spec.rows;
      var b = spec.b != null ? spec.b : spec.cols;
      if (a == null || b == null) return null;
      return renderArray(a, b);
    }
    if (spec.kind === 'groups') {
      var g = spec.groups != null ? spec.groups : spec.rows;
      var per = spec.per != null ? spec.per : spec.cols;
      if (g == null || per == null) return null;
      return renderGroups(g, per);
    }
    return null;
  }
```

- [ ] Add `grade` + `playMode` to wrong records. In `buildWrongAnswerRecord` (~line 1601), replace:

```js
      level: q.level,
      mode: GameState.mode,
```

with:

```js
      level: q.level,
      grade: q.grade != null ? q.grade : (GameState.grade || null),
      playMode: GameState.playMode || 'mission',
      mode: GameState.mode,
```

(`level` stays — copied from `q.level` — so `interleavePracticeRecordsByLevel` and the hint paths keep working on old and new records alike.)

- [ ] HUD badge shows the grade. Replace `updateModeIndicator` (~line 3749) and delete the now-unused `modeLabelForState` (~line 3743) in the same edit:

```js
  function modeLabelForState(mode) {
    if (mode === 'multiply') return 'Multiplication';
    if (mode === 'divide') return 'Division';
    return 'Mixed';
  }

  function updateModeIndicator() {
    var badge = document.getElementById('hud-mode-badge');
    var cur = document.getElementById('hud-current-op');
    if (!badge || !cur) return;
    if (GameState.isReviewMode) {
      badge.textContent = 'Mode: Fix tricky questions';
    } else {
      badge.textContent = 'Mode: ' + modeLabelForState(GameState.mode);
    }
    var op = GameState.currentQuestion && GameState.currentQuestion.operation;
    var opLabel = op === 'multiply' ? 'Multiplication' : op === 'divide' ? 'Division' : '—';
    cur.innerHTML = 'Current question: <strong>' + opLabel + '</strong>';
  }
```

becomes:

```js
  function updateModeIndicator() {
    var badge = document.getElementById('hud-mode-badge');
    var cur = document.getElementById('hud-current-op');
    if (!badge || !cur) return;
    if (GameState.isReviewMode) {
      badge.textContent = 'Mode: Fix tricky questions';
    } else {
      badge.textContent = 'Grade ' + (GameState.grade || '?');
    }
    var op = GameState.currentQuestion && GameState.currentQuestion.operation;
    var opLabel =
      op === 'multiply' ? 'Multiplication'
      : op === 'divide' ? 'Division'
      : op === 'expr' ? 'Number sentence'
      : '—';
    cur.innerHTML = 'Current question: <strong>' + opLabel + '</strong>';
  }
```

- [ ] Remove the `GameState.level` fallbacks from the hint/level helpers (band questions always carry `q.level`; `hintTextForQuestion` reads `q.hintEasy/hintMed/hintHard` — verified, they flow through untouched). Three small replacements:

`currentQuestionLevel` (~line 3592):

```js
  function currentQuestionLevel() {
    var q = GameState.currentQuestion;
    return q && q.level != null ? q.level : GameState.level;
  }
```

becomes:

```js
  function currentQuestionLevel() {
    var q = GameState.currentQuestion;
    return q && q.level != null ? q.level : 'medium';
  }
```

`hintTextForQuestion` (~line 3667):

```js
  function hintTextForQuestion(q) {
    var lvl = q && q.level != null ? q.level : GameState.level;
    if (lvl === 'easy') return q.hintEasy;
    if (lvl === 'medium') return q.hintMed;
    return q.hintHard;
  }
```

becomes:

```js
  function hintTextForQuestion(q) {
    var lvl = q && q.level != null ? q.level : 'medium';
    if (lvl === 'easy') return q.hintEasy;
    if (lvl === 'medium') return q.hintMed;
    return q.hintHard;
  }
```

`attachHintVisual` (~line 3674) — also let Grade-2 band questions (whose picture/sharing formats derive level `'hard'`) keep their visuals:

```js
  function attachHintVisual(panel, q) {
    const spec = q.visualSpec;
    if (!spec) return;
    var lvl = q && q.level != null ? q.level : GameState.level;
    if (lvl === 'easy') {
```

becomes:

```js
  function attachHintVisual(panel, q) {
    const spec = q.visualSpec;
    if (!spec) return;
    var lvl = q && q.level != null ? q.level : 'medium';
    if (q && q.grade === 2) lvl = 'easy'; // G2 always gets picture support
    if (lvl === 'easy') {
```

- [ ] De-level `startWrongAnswerPractice` (~line 2112). Practice must always derive its op mix from the snapshots (the `preserveRoundContext` branch read the deleted fields), and it stamps `playMode:'practice'` so re-recorded mistakes carry it. Replace:

```js
    if (opts.preserveRoundContext) {
      GameState.mode = GameState.lastRoundMode;
      GameState.level = GameState.lastRoundLevel;
    } else {
      var hasM = false;
      var hasD = false;
      var si;
      for (si = 0; si < snaps.length; si++) {
        if (snaps[si].operation === 'multiply') hasM = true;
        if (snaps[si].operation === 'divide') hasD = true;
      }
      if (hasM && hasD) GameState.mode = 'mixed';
      else if (hasD) GameState.mode = 'divide';
      else GameState.mode = 'multiply';
    }
```

with:

```js
    var hasM = false;
    var hasD = false;
    var si;
    for (si = 0; si < snaps.length; si++) {
      if (snaps[si].operation === 'multiply') hasM = true;
      if (snaps[si].operation === 'divide') hasD = true;
    }
    if (hasM && hasD) GameState.mode = 'mixed';
    else if (hasD) GameState.mode = 'divide';
    else GameState.mode = 'multiply';
    GameState.playMode = 'practice';
```

- [ ] Fix `exportWrongAnswersToText` header lines (~lines 1850–1851). Replace:

```js
    lines.push('Round Mode: ' + (r0 && r0.mode ? r0.mode : GameState.lastRoundMode || GameState.mode));
    lines.push('Level: ' + (r0 && r0.level ? r0.level : GameState.lastRoundLevel || GameState.level));
```

with:

```js
    lines.push('Round Mode: ' + (r0 && r0.mode ? r0.mode : GameState.mode));
    lines.push('Grade: ' + (r0 && r0.grade ? r0.grade : (progress && progress.grade) || '—'));
    lines.push('Level: ' + (r0 && r0.level ? r0.level : '—'));
```

- [ ] `endRound` records the play mode instead of level/mode (~lines 4139–4140). Replace:

```js
    GameState.lastRoundMode = GameState.mode;
    GameState.lastRoundLevel = GameState.level;
```

with:

```js
    GameState.lastPlayMode = GameState.playMode;
```

- [ ] Re-earn the `hard` badge as "Challenger" (same stored id, so saved badges stay valid). In `evaluateMissionBadges` (~line 4063), replace:

```js
      { id: 'hard', test: function () { return GameState.level === 'hard' && stars >= 4; } },
```

with:

```js
      {
        id: 'hard', // stored id kept for old saves; relabeled "Challenger 🏆"
        test: function () {
          return stars >= 4 && (GameState.grade || 0) >= 4 &&
            (GameState.playMode === 'mission' || GameState.playMode === 'boss');
        },
      },
```

And in the badge `labels` map (~line 4275), replace:

```js
      hard: '🚀 Hard hero',
```

with:

```js
      hard: 'Challenger 🏆',
```

- [ ] Delete the retired GameState fields. In the `GameState` literal, delete the line `level: 'easy',` (~1241 pre-edit) and the lines `lastRoundMode: 'multiply',` and `lastRoundLevel: 'easy',` (~1264–1265), and replace `roundAdaptivePlan: null,` (~1279) with:

```js
    /** Per-round format-token plan from GradeBands.buildRoundPlan. */
    bandPlan: null,
```

Also delete the doc comment above `roundAdaptivePlan` (`/** Hard-mode subtype queues + metadata for lazy round generation. */`).

- [ ] Delete the dead legacy plan/pool functions — grep BEFORE each deletion; delete only if the only remaining hits are the definition itself (all commands run from `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest`):

```bash
grep -n "generateQuestions\|POOL_SIZE" index.html
```
Expect: the `POOL_SIZE` const (~1189), the `generateQuestions` definition (~3518) and its internal `POOL_SIZE` use. Delete the whole `generateQuestions` function and the `const POOL_SIZE = 100;` line.

```bash
grep -n "attachAdaptiveRoundPlan\|getHardMultTagForSlot\|getHardDivTagForSlot\|countOpSlotsBefore\|multiplySlotsInMode\|divideSlotsInMode\|roundAdaptivePlan" index.html
```
Expect: the six function definitions (~3389–3443 pre-edit) plus their internal cross-reference calls (~3407–3408, 3428–3429, 3438–3439 — the six only call each other; startRound's call was removed above). Delete `multiplySlotsInMode`, `divideSlotsInMode`, `attachAdaptiveRoundPlan`, `countOpSlotsBefore`, `getHardMultTagForSlot`, `getHardDivTagForSlot`.

```bash
grep -n "varietyClash\|recentAnchorsForSlot" index.html
```
Expect: only the two definitions (~3384, ~3445) — their only caller was the old `generateRoundQuestionAtIndex`. Delete both.

```bash
grep -n "pickTypeForSlot\|buildHardMultiplySubtypeOrder\|buildHardDivideSubtypeOrder\|hardMultTagToQtype\|hardDivTagToQtype\|pickHardMultiplyQtypeRandom\|pickHardDivideQtypeRandom" index.html
```
Expect: only the seven definitions (~2674–2753). Delete all seven.

```bash
grep -n "chooseAllowedQuestionTypes\|fallbackQtypeForSlot" index.html
```
Expect THREE hits: the `chooseAllowedQuestionTypes` definition (~2448), its LIVE caller inside `validateQuestionForLevel` (~3274 — part of the kept validator complex below), and the `fallbackQtypeForSlot` definition (~3401). Delete ONLY `fallbackQtypeForSlot`; `chooseAllowedQuestionTypes` stays with the kept complex.

```bash
grep -n "generateDivisionQuestion\|validateDivisionQuestion" index.html
```
Expect: only the two definitions (~3375–3382) — they had zero callers even before this task. Delete both.

Do **NOT** delete `chooseAllowedQuestionTypes` (live caller in `validateQuestionForLevel` ~3274), `pickEasyPair`, `pickFluencyPair`, `pairWithProd`, `pickHardMultiplyPair`, `pickStrictHardDivisionTriple`, `pickEasyDivisionTriple`, `pickFluencyDivisionTriple`, `pickDivisionTripleForLevel`, `generateRawQuestion`, `finalizeQuestion`, or `validateQuestion` — grep shows the pickers are still referenced by the `buildMult*`/`buildDiv*`/reasoning builders (lines ~2755–3105), which `generateRawQuestion` dispatches to. They are now unreachable from live code but internally cross-referenced; excising the whole ~700-line complex is a separate cleanup, not part of this task. Verify you kept them consistent:

```bash
grep -n "pickEasyPair\|pickFluencyPair(" index.html | head
```
Expect: definition lines plus caller lines inside the builders — MORE than just definitions, which is exactly why they stay.

- [ ] Confirm the retired names are fully gone:

```bash
grep -cn "GameState\.level\|lastRoundLevel\|lastRoundMode\|roundAdaptivePlan" index.html
```
Expect: `2` — exactly the two resume lines that survive until Task 12 rewrites them: `level: (GameState && GameState.level) || null,` inside `__cmq_captureState` (~4501) and `GameState.level = blob.level;` inside `__cmq_doRestoreFromBlob` (~4526). Leave BOTH untouched here — Task 12's old-code quotes depend on them. Any hit beyond those two means a missed edit above: open it and apply the matching replacement.

- [ ] Run the node smoke tests (regression — none of them eval the deleted regions):

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
```
Expected: all exit 0 (`smoke-learning-intelligence: OK`, `smoke-wrongs-roundtrip: OK`).

- [ ] Manual browser check — full Grade-3 mission, mistake recording, practice untouched:
  1. `python3 -m http.server 8000` from the repo root; open `http://localhost:8000/games/cosmic-math-quest/index.html` in a private window.
  2. Pick Grade **3**, tap 🚀 Mission. The HUD badge must read **Grade 3** (not "Mode: Multiplication").
  3. Play all 10 questions. You should see a mix of recall (`a × b = ?`), missing-factor/divisor, division facts, and word problems. Answer at least one deliberately wrong (type `0`): feedback appears, a heart empties, streak resets — hearts/streak/hints all still work (open a hint once to confirm the modal shows text).
  4. Finish the round → results screen shows 1–5 stars and stats.
  5. Devtools (F12) → Application → Local Storage → `http://localhost:8000` → key `cosmicMathQuest_wrongs_v1`. In its JSON, `wrongAnswersHistory[0]` must contain `"grade": 3`, `"playMode": "mission"`, and a `"level"` of `easy|medium|hard`.
  6. On results, tap **Fix Tricky Questions** → review mode starts (banner "Fix tricky questions", hearts shown as safe). Answer the missed question correctly → it resolves. Review mode never generated a new band question (it replayed your exact miss).
  7. Play a second mission and confirm no question from the first round repeats immediately (session dedupe).
  8. Hub check: `http://localhost:8000/index.html#/games/cosmic-math-quest` → pick profile → mission plays the same way; zero console errors.

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): missions draw from grade-band recipes; retire level/mode generators"
```

### Task 10: Remainder input (`R` box) for long division

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: manual browser check (G4 long division) + node smoke tests (regression)

**Interfaces:**
- Consumes: band question fields `q.answerR` (int|null) and `q.meta.remainder` (contract, Tasks 1–5); existing `renderQuestion`, `handleSubmitAnswer`, `showFeedback`, `cloneQuestionForStorage`, `questionFromSnapshot`, `recordWrongAnswer`.
- Produces: DOM `#answer-r-wrap` + `#answer-input-r`; two-part answer checking; snapshots that round-trip `answerR`/`grade`/`format`/`promptSub` so practice re-renders the R box.

Context: the answer area is `.answer-stack` (~line 1053); `.answer-stack input` CSS (~line 439) styles any input inside it, so the R input inherits the big-number styling and only needs a width override.

- [ ] Add the R-box HTML. Replace (~lines 1053–1057):

```html
        <div class="answer-stack" id="answer-area">
          <label class="sr-only" for="answer-input">Your answer</label>
          <input type="text" inputmode="numeric" pattern="[0-9-]*" id="answer-input" autocomplete="off" enterkeyhint="done" />
          <button type="button" class="btn btn-secondary btn-check" id="btn-submit-answer">Check</button>
        </div>
```

with:

```html
        <div class="answer-stack" id="answer-area">
          <label class="sr-only" for="answer-input">Your answer</label>
          <input type="text" inputmode="numeric" pattern="[0-9-]*" id="answer-input" autocomplete="off" enterkeyhint="done" />
          <span class="r-wrap" id="answer-r-wrap" hidden>
            <label class="r-label" for="answer-input-r">R</label>
            <input type="text" inputmode="numeric" pattern="[0-9]*" id="answer-input-r" autocomplete="off" enterkeyhint="done" aria-label="Remainder" />
          </span>
          <button type="button" class="btn btn-secondary btn-check" id="btn-submit-answer">Check</button>
        </div>
```

- [ ] Add the R-box CSS, immediately after the `.answer-stack input:focus { … }` rule (~line 457):

```css
    /* Remainder input — appears only for grade 4/5 long-division questions */
    .r-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .r-wrap[hidden] { display: none; }
    .r-label {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--accent-warm);
    }
    #answer-input-r {
      width: 110px;
      max-width: 110px;
    }
```

- [ ] Show/hide + clear the R box per question. In `renderQuestion`, directly after the existing line `document.getElementById('answer-input').value = '';`, insert:

```js
    var rWrap = document.getElementById('answer-r-wrap');
    var rInput = document.getElementById('answer-input-r');
    var needsR = q && q.answerR != null;
    if (rWrap) rWrap.hidden = !needsR;
    if (rInput) rInput.value = '';
```

- [ ] Disable the R input together with the main one. Replace `setAnswerControlsEnabled` (~line 3883):

```js
  function setAnswerControlsEnabled(on) {
    document.getElementById('answer-input').disabled = !on;
    document.getElementById('btn-submit-answer').disabled = !on;
  }
```

with:

```js
  function setAnswerControlsEnabled(on) {
    document.getElementById('answer-input').disabled = !on;
    var r = document.getElementById('answer-input-r');
    if (r) r.disabled = !on;
    document.getElementById('btn-submit-answer').disabled = !on;
  }
```

- [ ] Parse and grade both parts. In `handleSubmitAnswer` (~line 3925), replace:

```js
    const num = parseInt(raw, 10);
    if (Number.isNaN(num)) {
      document.getElementById('feedback').textContent = 'Type a number, then tap Check.';
      document.getElementById('feedback').className = 'feedback neutral';
      return;
    }

    GameState.answered = true;
    GameState.totalAnswered++;
    const ok = num === q.answer;
```

with:

```js
    const num = parseInt(raw, 10);
    if (Number.isNaN(num)) {
      document.getElementById('feedback').textContent = 'Type a number, then tap Check.';
      document.getElementById('feedback').className = 'feedback neutral';
      return;
    }

    // Remainder questions (grade 4/5 long division) need BOTH boxes.
    const needsR = q.answerR != null;
    let rnum = 0;
    if (needsR) {
      const rawR = document.getElementById('answer-input-r').value.trim();
      if (!/^\d+$/.test(rawR)) {
        document.getElementById('feedback').textContent =
          rawR === ''
            ? 'Type the answer AND the remainder in the R box, then tap Check.'
            : 'Use digits only in the R box, then tap Check.';
        document.getElementById('feedback').className = 'feedback neutral';
        return;
      }
      rnum = parseInt(rawR, 10);
    }

    GameState.answered = true;
    GameState.totalAnswered++;
    const ok = num === q.answer && (!needsR || rnum === q.answerR);
```

And a few lines below, replace:

```js
      recordWrongAnswer(q, num);
```

with:

```js
      recordWrongAnswer(q, needsR ? String(num) + ' R ' + String(rnum) : num);
```

- [ ] Show the full `q R r` answer in wrong feedback. In `showFeedback` (~line 3866), replace:

```js
      fb.className = 'feedback gentle';
      fb.textContent = pick(GENTLE_PHRASES) + ' The answer is ' + q.answer + '.';
```

with:

```js
      fb.className = 'feedback gentle';
      var answerText = q.answerR != null ? q.answer + ' R ' + q.answerR : String(q.answer);
      fb.textContent = pick(GENTLE_PHRASES) + ' The answer is ' + answerText + '.';
```

And in `wrongExplainParagraph` (~line 3546), directly after the line `var m = q.meta || {};`, insert:

```js
    if (q.answerR != null) {
      if (m.dividend != null && m.divisor != null) {
        return m.dividend + ' ÷ ' + m.divisor + ' = ' + q.answer + ' R ' + q.answerR +
          ', because ' + m.divisor + ' × ' + q.answer + ' + ' + q.answerR + ' = ' + m.dividend + '.';
      }
      return 'Divide, then write what is left over: the answer is ' + q.answer + ' R ' + q.answerR + '.';
    }
```

- [ ] Round-trip `answerR` (and the other band fields) through snapshots so practice re-renders the R box. In `cloneQuestionForStorage` (~line 1516), in the **try** object replace:

```js
          answer: q.answer,
          result: q.result,
```

with:

```js
          answer: q.answer,
          answerR: q.answerR != null ? q.answerR : null,
          grade: q.grade != null ? q.grade : null,
          format: q.format || null,
          promptSub: q.promptSub || '',
          result: q.result,
```

and in the **catch** fallback object replace:

```js
        answer: q.answer,
        result: q.result,
```

with:

```js
        answer: q.answer,
        answerR: q.answerR != null ? q.answerR : null,
        grade: q.grade != null ? q.grade : null,
        format: q.format || null,
        promptSub: q.promptSub || '',
        result: q.result,
```

(`meta` is already deep-cloned in the try path, which preserves `meta.remainder`; the catch path stores `meta: {}` for legacy safety — unchanged.)

In `questionFromSnapshot` (~line 1555), replace:

```js
      answer: snap.answer,
      result: snap.result != null ? snap.result : snap.answer,
```

with:

```js
      answer: snap.answer,
      answerR: snap.answerR != null ? snap.answerR : null,
      grade: snap.grade != null ? snap.grade : null,
      format: snap.format || null,
      promptSub: snap.promptSub || '',
      result: snap.result != null ? snap.result : snap.answer,
```

- [ ] Enter submits from the R box too. After the existing `answer-input` keydown listener (~line 4428), insert:

```js
  document.getElementById('answer-input-r').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleSubmitAnswer();
  });
```

- [ ] Run the node smoke tests (regression):

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
```
Expected: exit 0 both (`smoke-wrongs-roundtrip: OK`).

- [ ] Manual browser check — remainder question wrong, then fixed via practice:
  1. `python3 -m http.server 8000`; open `http://localhost:8000/games/cosmic-math-quest/index.html` in a private window; pick Grade **4**.
  2. Sanity-check the generator in the Console first (GradeBands is a window global):
     ```js
     for (let i = 0; i < 40; i++) { const q = GradeBands.generateForSlot('g4_longdiv', 1); if (q && q.answerR != null) { console.log(q.prompt, '→', q.answer, 'R', q.answerR); break; } }
     ```
     Expect one line like `68 ÷ 5 = ? → 13 R 3`.
  3. Tap 🚀 Mission. The G4 recipe has 2 long-division slots per round; remainders appear at tier 0/+1 (tier 0 is the default, so no forcing needed — if a whole round passes with no R box, play one more round).
  4. When the R box appears next to the main input: type only the quotient, press Check → neutral message asks for the R box (not graded).
  5. Now enter a deliberately WRONG pair (e.g. quotient right, remainder off by one) → gentle feedback shows the `… = q R r` form and a heart is lost.
  6. Finish or exit the round; from the menu tap 🔧 Fix-It (or results → Fix Tricky Questions). The replayed remainder question shows the R box again (snapshot round-trip). Answer both parts correctly → it resolves.
  7. Zero console errors throughout.

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): remainder (R) input for grade 4/5 long division"
```

### Task 11: Fix-It consolidation + results cleanup

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: manual browser checks + node smoke tests (regression)

**Interfaces:**
- Consumes: `getDueTodaySet()`, `getQuickFixSet()`, `getMostMissedSet()`, `finalizeSmartPracticeSet()`, `safeStartWrongAnswerPractice()`, `showNoMistakesMessage()`, `confettiBurst()`, `guardTile()` (Task 8), `#btn-tile-fixit` + `#fixit-due-badge` (Task 8).
- Produces: `getFixItSet()`, `startFixItPractice()`, `updateFixItTile()`; deletes the six smart-practice buttons (`btn-menu-quickfix/mostmissed/duetoday`, `btn-results-quickfix/mostmissed/duetoday`) and the results `btn-change-level`/`btn-change-mode` buttons.

Context: today three "smart practice" entry points (Quick Fix / Most Missed / Due Today) appear as button rows on both menu and results, each building a capped practice set. The Fix-It tile replaces all of them with ONE combined set: due today → recent → most missed, deduped by key.

- [ ] Build the combined set + tile handler. Insert directly after `getDueTodaySet` (~line 2269, after its closing brace):

```js
  /**
   * Fix-It: ONE combined practice set — due today first, then recent,
   * then most missed — deduped by question key, capped by
   * finalizeSmartPracticeSet (5–10 items when enough exist).
   */
  function getFixItSet() {
    var combined = [];
    var seen = {};
    function addAll(list) {
      var i;
      for (i = 0; i < list.length; i++) {
        var r = list[i];
        if (r && r.key && !seen[r.key]) {
          seen[r.key] = true;
          combined.push(r);
        }
      }
    }
    addAll(getDueTodaySet());
    addAll(getQuickFixSet());
    addAll(getMostMissedSet());
    return finalizeSmartPracticeSet(combined);
  }

  function startFixItPractice() {
    var set = getFixItSet();
    if (!set.length) {
      showNoMistakesMessage('menu');
      confettiBurst(); // an empty list is GOOD news
      return;
    }
    safeStartWrongAnswerPractice(set, { emptyStateLocation: 'menu' });
  }

  /** Due-count badge on the Fix-It tile; refreshed on every menu render. */
  function updateFixItTile() {
    var badge = document.getElementById('fixit-due-badge');
    if (!badge) return;
    var due = getDueTodaySet().length;
    var active = getActiveMistakes().length;
    if (due > 0) {
      badge.textContent = due + ' due';
      badge.hidden = false;
    } else if (active > 0) {
      badge.textContent = active + ' saved';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
```

- [ ] Point the Fix-It tile at the new flow. Replace the temporary Task-8 wiring:

```js
  document.getElementById('btn-tile-fixit').addEventListener('click', guardTile(function () {
    // Temporary wiring (replaced in Task 11 by the combined Fix-It set):
    safeStartWrongAnswerPractice(null, { emptyStateLocation: 'menu' });
  }));
```

with:

```js
  document.getElementById('btn-tile-fixit').addEventListener('click', guardTile(startFixItPractice));
```

- [ ] Friendly empty-state text. In `getNoMistakesMessage` (~line 1823), replace:

```js
    if (location === 'menu') return 'Nice work! Nothing to improve right now — fly a mission first.';
```

with:

```js
    if (location === 'menu') return 'No tricky questions right now! 🎉';
```

- [ ] Delete the menu smart-practice row. In `#screen-menu`, delete this block (~lines 987–991 pre-edit; keep the "Things to Improve" label, the save-to-disk row, and the `menu-mistakes-empty` message):

```html
        <div class="btn-row mistake-actions">
          <button type="button" class="btn btn-secondary btn-small" id="btn-menu-quickfix" hidden>Quick Fix</button>
          <button type="button" class="btn btn-secondary btn-small" id="btn-menu-mostmissed" hidden>Most Missed</button>
          <button type="button" class="btn btn-secondary btn-small" id="btn-menu-duetoday" hidden>Due Today</button>
        </div>
```

And delete their three click handlers (~lines 4238–4246):

```js
  document.getElementById('btn-menu-quickfix').addEventListener('click', function () {
    window.SmartPractice.start('quickfix', { emptyStateLocation: 'menu' });
  });
  document.getElementById('btn-menu-mostmissed').addEventListener('click', function () {
    window.SmartPractice.start('mostmissed', { emptyStateLocation: 'menu' });
  });
  document.getElementById('btn-menu-duetoday').addEventListener('click', function () {
    window.SmartPractice.start('duetoday', { emptyStateLocation: 'menu' });
  });
```

- [ ] Delete the results smart-practice row + change buttons. In `#screen-results`, delete (~lines 1086–1087):

```html
          <button type="button" class="btn btn-secondary" id="btn-change-level">Change level</button>
          <button type="button" class="btn btn-ghost" id="btn-change-mode">Change mode</button>
```

and (~lines 1094–1098):

```html
        <div class="btn-row mistake-actions">
          <button type="button" class="btn btn-secondary btn-small" id="btn-results-quickfix" hidden>Quick Fix</button>
          <button type="button" class="btn btn-secondary btn-small" id="btn-results-mostmissed" hidden>Most Missed</button>
          <button type="button" class="btn btn-secondary btn-small" id="btn-results-duetoday" hidden>Due Today</button>
        </div>
```

Also relabel BOTH kept practice buttons to sentence case — the string `>Fix Tricky Questions<` occurs twice, so anchor each edit by its full button line: on the results screen (~line 1092), the line containing `id="btn-practice-wrongs"` gets its label changed to `Fix tricky questions`; in the game-over modal (~line 1176), the line containing `id="btn-game-over-practice"` gets the same relabel (the two surfaces must not disagree on casing).

Delete the corresponding handlers (~lines 4367–4384):

```js
  document.getElementById('btn-results-quickfix').addEventListener('click', function () {
    window.SmartPractice.start('quickfix', {
      emptyStateLocation: 'results',
      preserveRoundContext: true,
    });
  });
  document.getElementById('btn-results-mostmissed').addEventListener('click', function () {
    window.SmartPractice.start('mostmissed', {
      emptyStateLocation: 'results',
      preserveRoundContext: true,
    });
  });
  document.getElementById('btn-results-duetoday').addEventListener('click', function () {
    window.SmartPractice.start('duetoday', {
      emptyStateLocation: 'results',
      preserveRoundContext: true,
    });
  });
```

and (~lines 4420–4421):

```js
  document.getElementById('btn-change-level').addEventListener('click', function () { showScreen('menu'); });
  document.getElementById('btn-change-mode').addEventListener('click', function () { showScreen('menu'); });
```

- [ ] Update the two UI-refresh functions that referenced the deleted buttons. Replace `updateMenuMistakeButtons` (~line 2017):

```js
  function updateMenuMistakeButtons() {
    var qf = document.getElementById('btn-menu-quickfix');
    var mm = document.getElementById('btn-menu-mostmissed');
    var dt = document.getElementById('btn-menu-duetoday');
    var ms = document.getElementById('btn-menu-save-saved-wrongs');
    var emptyMsg = document.getElementById('menu-mistakes-empty');
    var hasLatest = hasPracticeMistakes() || getActiveMistakes().length > 0;
    if (qf) qf.hidden = !hasLatest;
    if (mm) mm.hidden = !hasLatest;
    if (dt) dt.hidden = !hasLatest;
    if (ms) ms.hidden = !hasLatest;
    if (emptyMsg) {
      emptyMsg.textContent = getNoMistakesMessage('menu');
      emptyMsg.hidden = hasLatest;
    }
  }
```

with:

```js
  function updateMenuMistakeButtons() {
    var ms = document.getElementById('btn-menu-save-saved-wrongs');
    var hasLatest = hasPracticeMistakes() || getActiveMistakes().length > 0;
    if (ms) ms.hidden = !hasLatest;
    var emptyMsg = document.getElementById('menu-mistakes-empty');
    if (emptyMsg) emptyMsg.hidden = true; // only shown after tapping Fix-It with nothing due
    updateFixItTile();
  }
```

And replace `updateResultsExportButtons` (~line 1992):

```js
  function updateResultsExportButtons() {
    var pr = document.getElementById('btn-practice-wrongs');
    var rq = document.getElementById('btn-results-quickfix');
    var rm = document.getElementById('btn-results-mostmissed');
    var rd = document.getElementById('btn-results-duetoday');
    var sr = document.getElementById('btn-save-wrongs-recent');
    var sa = document.getElementById('btn-save-wrongs-all');
    var emptyMsg = document.getElementById('results-mistakes-empty');
    if (!pr || !sr || !sa) return;
    var hasLast = hasPracticeMistakes(GameState.lastRoundWrongBuffer);
    var hasHist = wrongAnswerStore.wrongAnswersHistory.length > 0;
    var hasImprove = getActiveMistakes().length > 0;
    var showSmart = hasImprove && !GameState.reviewJustCompleted;
    pr.hidden = !hasLast || GameState.reviewJustCompleted;
    if (rq) rq.hidden = !showSmart;
    if (rm) rm.hidden = !showSmart;
    if (rd) rd.hidden = !showSmart;
    sr.hidden = !hasLast;
    sa.hidden = !hasHist;
    if (emptyMsg) {
      emptyMsg.textContent = getNoMistakesMessage('results');
      emptyMsg.hidden = !!(hasLast || hasImprove || GameState.reviewJustCompleted);
    }
  }
```

with:

```js
  function updateResultsExportButtons() {
    var pr = document.getElementById('btn-practice-wrongs');
    var sr = document.getElementById('btn-save-wrongs-recent');
    var sa = document.getElementById('btn-save-wrongs-all');
    var emptyMsg = document.getElementById('results-mistakes-empty');
    if (!pr || !sr || !sa) return;
    var hasLast = hasPracticeMistakes(GameState.lastRoundWrongBuffer);
    var hasHist = wrongAnswerStore.wrongAnswersHistory.length > 0;
    var hasImprove = getActiveMistakes().length > 0;
    pr.hidden = !hasLast || GameState.reviewJustCompleted;
    sr.hidden = !hasLast;
    sa.hidden = !hasHist;
    if (emptyMsg) {
      emptyMsg.textContent = getNoMistakesMessage('results');
      emptyMsg.hidden = !!(hasLast || hasImprove || GameState.reviewJustCompleted);
    }
  }
```

- [ ] Verify no dangling references to the deleted ids:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest
grep -n "btn-menu-quickfix\|btn-menu-mostmissed\|btn-menu-duetoday\|btn-results-quickfix\|btn-results-mostmissed\|btn-results-duetoday\|btn-change-level\|btn-change-mode" index.html
```
Expect: no output. (`window.SmartPractice` and `startSmartPractice` stay — they are a published console API and still work.)

- [ ] Run the node smoke tests (regression):

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
```
Expected: both `OK`.

- [ ] Manual browser check:
  1. `python3 -m http.server 8000`; open `http://localhost:8000/games/cosmic-math-quest/index.html` in a private window; pick a grade.
  2. Empty state: tap 🔧 Fix-It with no mistakes saved → the menu shows "No tricky questions right now! 🎉" plus a confetti burst; no practice starts.
  3. Play a mission and miss 2–3 different questions. Back on the menu, the Fix-It tile shows a badge (`N due` or `N saved`).
  4. Tap 🔧 Fix-It → ONE practice session starts containing your misses (deduped — miss the same fact twice, it appears once). No hearts are lost on wrong answers.
  5. Results screen after a mission: only **Play again**, **Back to menu**, **Fix tricky questions** (when you missed something), the two save-to-file buttons, Clear saved list, and Stars & badges. No "Change level"/"Change mode"/Quick Fix/Most Missed/Due Today anywhere.
  6. Menu: the three smart-practice buttons are gone; "Save list to disk" still appears once mistakes exist.
  7. Zero console errors throughout (a `Cannot read properties of null` error means a handler for a deleted button survived — re-run the grep step).

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): consolidate smart practice into Fix-It tile; clean results screen"
```

### Task 12: Resume blob v2 + reset keeps the grade

**Files:**
- Modify: `/Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest/index.html`
- Test: manual browser checks (console-driven + hub flow)

**Interfaces:**
- Consumes: `GameState.playMode` (Task 7), `progress.grade` / `isGradeSet()` / `renderGradeUi()` (Tasks 7–8), existing `__cmq_pendingResume` plumbing, `storageKey()`/`wrongsKey()`, `KLS.bridge.resetProgress`.
- Produces: `window.__cmq_captureState()` returning `{v:2, screen, playMode, grade}`; `window.__cmq_restoreState` accepting v1 (screen-only) and v2 blobs; `resetMyProgress()` that preserves `progress.grade`.

Context: the hub asks the game for a resume blob via `requestState` postMessage and hands it back via `resumeState`; the game stashes it and shows a "Continue my last session" row (Approach 4 — no auto-restore). Reset wipes both profile-scoped localStorage keys and tells the hub to drop its per-game record. Per the spec, the grade is *identity, not progress* — it survives reset.

- [ ] Rewrite the capture function (~line 4494). Replace:

```js
  window.__cmq_captureState = function () {
    try {
      var active = document.querySelector('.screen.active');
      return {
        v: 1,
        screen: active ? active.id : 'screen-menu',
        mode: (GameState && GameState.mode) || null,
        level: (GameState && GameState.level) || null,
      };
    } catch (e) { return { v: 1, screen: 'screen-menu' }; }
  };
```

with:

```js
  window.__cmq_captureState = function () {
    try {
      var active = document.querySelector('.screen.active');
      return {
        v: 2,
        screen: active ? active.id : 'screen-menu',
        playMode: (GameState && GameState.playMode) || 'mission',
        grade: (progress && progress.grade) || null,
      };
    } catch (e) { return { v: 2, screen: 'screen-menu', playMode: 'mission', grade: null }; }
  };
```

- [ ] Rewrite the restore pair (~lines 4521–4535). Replace:

```js
  function __cmq_doRestoreFromBlob(blob) {
    if (!blob || blob.v !== 1) return;
    try {
      if (GameState) {
        if (blob.mode)  GameState.mode  = blob.mode;
        if (blob.level) GameState.level = blob.level;
      }
      showScreen('menu');
    } catch (e) { /* corrupted blob */ }
  }
  window.__cmq_restoreState = function (blob) {
    if (!blob || blob.v !== 1) return;
    __cmq_pendingResume = blob;
    __cmq_showResumeRow(true);
  };
```

with:

```js
  function __cmq_doRestoreFromBlob(blob) {
    if (!blob || (blob.v !== 1 && blob.v !== 2)) return;
    try {
      if (blob.v === 2) {
        if (blob.playMode) GameState.playMode = blob.playMode;
        // The per-profile progress blob is authoritative for grade; only
        // seed from the resume blob when no grade has been picked yet.
        if ((blob.grade === 2 || blob.grade === 3 || blob.grade === 4 || blob.grade === 5) && !isGradeSet()) {
          progress = ensureProgressShape(progress);
          progress.grade = blob.grade;
          saveProgress(progress);
          GameState.grade = blob.grade;
        }
      }
      // v1 blobs restore the screen only (their level/mode fields are ignored).
      renderGradeUi();
      showScreen('menu');
    } catch (e) { /* corrupted blob */ }
  }
  window.__cmq_restoreState = function (blob) {
    if (!blob || (blob.v !== 1 && blob.v !== 2)) return;
    __cmq_pendingResume = blob;
    __cmq_showResumeRow(true);
  };
```

- [ ] Reset preserves the grade. Replace `resetMyProgress` (~line 4456):

```js
  function resetMyProgress() {
    if (!window.confirm(
      'Reset Cosmic Math Quest progress for this profile?\n\n' +
      'This will erase your stars, badges, mastered facts, and saved review ' +
      "list — for YOU only. Other profiles are not changed."
    )) return;
    try {
      var k1 = storageKey(); if (k1) localStorage.removeItem(k1);
      var k2 = wrongsKey();  if (k2) localStorage.removeItem(k2);
    } catch (e) { /* ignore */ }
    progress = defaultProgress();
    wrongAnswerStore = defaultWrongAnswerStore();
    GameState.lastRoundWrongBuffer = [];
    GameState.reviewQueue = [];
    updatePracticeButtons();
    if (window.KLS && window.KLS.bridge && window.KLS.bridge.isEmbedded() && window.KLS.bridge.resetProgress) {
      window.KLS.bridge.resetProgress();
    }
    window.alert("All clear! Starting fresh. 🌟");
    showScreen('menu');
  }
```

with:

```js
  function resetMyProgress() {
    if (!window.confirm(
      'Reset Cosmic Math Quest progress for this profile?\n\n' +
      'This will erase your stars, badges, mastered facts, and saved review ' +
      "list — for YOU only. Other profiles are not changed."
    )) return;
    // The grade choice is identity, not progress — it survives the wipe.
    var keepGrade = null;
    if (progress && (progress.grade === 2 || progress.grade === 3 || progress.grade === 4 || progress.grade === 5)) {
      keepGrade = progress.grade;
    }
    try {
      var k1 = storageKey(); if (k1) localStorage.removeItem(k1);
      var k2 = wrongsKey();  if (k2) localStorage.removeItem(k2);
    } catch (e) { /* ignore */ }
    progress = defaultProgress();
    if (keepGrade) {
      progress.grade = keepGrade;
      saveProgress(progress);
    }
    GameState.grade = keepGrade;
    wrongAnswerStore = defaultWrongAnswerStore();
    GameState.lastRoundWrongBuffer = [];
    GameState.reviewQueue = [];
    updatePracticeButtons();
    renderGradeUi();
    if (window.KLS && window.KLS.bridge && window.KLS.bridge.isEmbedded() && window.KLS.bridge.resetProgress) {
      window.KLS.bridge.resetProgress();
    }
    window.alert("All clear! Starting fresh. 🌟");
    showScreen('menu');
  }
```

- [ ] Confirm nothing still produces or requires v1 blobs:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space/games/cosmic-math-quest
grep -n "blob.level\|blob.mode\|v: 1" index.html
```
Expect: no output.

- [ ] Manual browser check — console-driven resume contract (works standalone because the functions live on `window`):
  1. `python3 -m http.server 8000`; open `http://localhost:8000/games/cosmic-math-quest/index.html` in a private window; pick Grade **4**.
  2. Console: `window.__cmq_captureState()` → `{v: 2, screen: "screen-menu", playMode: "mission", grade: 4}`.
  3. Start a mission, then in Console run `window.__cmq_captureState()` again → `screen: "screen-game"`.
  4. Exit to menu. Simulate a **v1** blob: `window.__cmq_restoreState({v:1, screen:'screen-game', mode:'divide', level:'hard'})` → the "▶ Continue my last session" row appears. Click it → lands on the menu, no console error, and `window.__cmq_captureState().grade` is still `4` (the stale level/mode were ignored).
  5. Simulate a **v2** blob on a fresh profile: clear site data (devtools → Application → Clear site data), reload — the grade card shows. Run `window.__cmq_restoreState({v:2, screen:'screen-menu', playMode:'mission', grade:5})`, click Continue → the chip now reads `🌌 Grade 5 · change` (blob seeded the unset grade) and the card is gone.
  6. Reset flow: play one mission (earn stars), then menu → "🧹 Reset my progress" → confirm. Expect: alert, menu shows, chip STILL reads your grade (grade survived), Fix-It badge gone, and `JSON.parse(localStorage.getItem('cosmicMathQuest_v1')).totalStars` → `0` while `.grade` is unchanged. The first-run card must NOT reappear.
  7. Hub flow: open `http://localhost:8000/index.html#/games/cosmic-math-quest`, pick a profile, pick a grade, play a question, click **← Hub** in the chrome bar, then re-enter the game — if the hub delivers a resume blob, the Continue row appears; clicking it lands on the menu with the correct grade chip. Then use the hub Parent page or in-game reset once more to confirm `bridge.resetProgress()` still clears the hub's stars for that profile only.
  8. Zero console errors throughout.

- [ ] Run all node smoke tests one last time for the chunk:

```bash
cd /Users/leimingyu/Documents/KidProjects/Kids-learning-space
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
```
Expected: all exit 0.

- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): resume blob v2 + reset keeps grade"
```
### Task 13: Boss Battle mode

**Files:**
- Modify: `games/cosmic-math-quest/index.html` (menu tile markup ~line 962-1010 region post-chunk-2; `<style>` block ends ~line 954 pre-edit; status bar ~line 1026-1047; `GameState` literal ~line 1240; constants ~line 1188; `updateStatsUI()` ~line 3782 pre-edit; `handleSubmitAnswer()` ~line 3925 pre-edit; `goToNextQuestion()` ~line 4010 pre-edit; `endRound()` ~line 4093 pre-edit; `startRound()` ~line 4173 pre-edit)
- Test: manual browser checks (no harness exists for index.html UI)

**Interfaces:**
- Consumes: `GradeBands.buildRoundPlan(grade, size, opts)` (contract, chunk 1); `GameState.grade`, `GameState.playMode`, `startRound(playMode)`, `GameState.bandPlan` + `generateRoundQuestionAtIndex(slotIndex)` (the band question pipeline from Task 9 — boss rounds reuse it, no parallel pipeline), `guardTile(handler)` + `#btn-tile-boss` (Task 8, shipped hidden and unwired); existing helpers `getAdaptiveTier()` (~line 2355), `getRoundSize()` (~1935), `setGameTitle(text)` (~1944), `computeStarsForNormalRound()` (~4038), `recordPlayDateForMission()` (~1436), `accuracyPercent(c,t)` (~2330), `confettiBurst()` (~3637), `showNormalResultsStats()` (~2092), `updateResultsExportButtons()` (~1992), `clearSaveStatus(id)` (~1965), `saveProgress`, `saveWrongAnswerHistory`, `updatePracticeButtons`, `ensureProgressShape`
- Produces: constants `BOSS_HP=10`, `BOSS_MAX_QUESTIONS=16`, `BOSS_CRIT_DAMAGE=2`; `GameState.bossHp`; functions `updateModeHud()`, `updateBossHpUI()`, `flashBossCrit()`, `bossVictoryCelebration()`, `endBossRound()`; DOM ids `boss-hp-row`, `boss-hp-num`, `boss-hp-fill`; badge id `'boss_slayer'` pushed to `progress.badges`

Context for the executor: the whole game lives in one IIFE inside `index.html`. `startRound(playMode)` (reworked by chunk 2 to accept a playMode and build a band-recipe round) resets per-round state and shows the game screen; `handleSubmitAnswer()` grades the typed answer; `goToNextQuestion()` advances (lazily generating the next question); `endRound()` computes stars and shows results. Boss Battle rides this exact pipeline with three twists: an HP bar instead of hearts, 16 questions instead of 10, and damage/recharge instead of lives.

- [ ] Read the CURRENT (post-chunk-2) bodies of `startRound`, `handleSubmitAnswer`, `goToNextQuestion`, `endRound`, and the menu tile markup before editing — chunk 2 has already moved things; the pre-edit line numbers below are hints only.
- [ ] Add the boss constants next to `ROUND_SIZE` (~line 1188 pre-edit). Skip any line chunk 2 already added:

```js
  const BOSS_HP = 10;
  const BOSS_MAX_QUESTIONS = 16;
  const BOSS_CRIT_DAMAGE = 2;
```

- [ ] Add one field to the `GameState` object literal (~line 1240 pre-edit), after the `bandPlan: null,` line Task 9 added (Task 9 replaced `roundAdaptivePlan` with `bandPlan`):

```js
    /** Boss Battle: remaining boss HP (null outside boss rounds). */
    bossHp: null,
```

- [ ] Add the Boss HP bar HTML inside `#status-bar` (~line 1026-1047), immediately after the second `.status-row` `</div>` (the row containing `hud-lives-wrap`):

```html
          <div class="boss-hp-row" id="boss-hp-row" hidden>
            <span class="boss-hp-label">👾 Boss HP: <strong id="boss-hp-num">10</strong> / 10</span>
            <div class="boss-hp-track" aria-hidden="true">
              <div class="boss-hp-fill" id="boss-hp-fill"></div>
            </div>
          </div>
```

- [ ] Add the Boss HP CSS just before the closing `</style>` tag (~line 954 pre-edit). The `prefers-reduced-motion` block disables the width transition and crit pulse:

```css
    /* ===== Boss Battle HP bar ===== */
    .boss-hp-row { margin-top: 8px; }
    .boss-hp-label { font-weight: 700; font-size: 0.95rem; }
    .boss-hp-track {
      margin-top: 4px; height: 14px; border-radius: 999px;
      background: rgba(99, 110, 114, 0.25); overflow: hidden;
    }
    .boss-hp-fill {
      height: 100%; width: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #e17055, #d63031);
      transition: width 0.4s ease;
    }
    .boss-hp-fill.crit-flash { animation: bossCritPulse 0.5s ease; }
    @keyframes bossCritPulse {
      0% { filter: brightness(1); }
      40% { filter: brightness(1.9); }
      100% { filter: brightness(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .boss-hp-fill { transition: none; }
      .boss-hp-fill.crit-flash { animation: none; }
    }
```

- [ ] Add the helper functions right after `updateLivesUI()` (~line 3780 pre-edit). `updateModeHud()` is the single source of truth for which HUD rows show per mode (practice always wins and shows hearts). Question generation needs NO new helper — boss rounds reuse Task 9's `generateRoundQuestionAtIndex`, which already retries, dedupes within the round, and has a hard-coded fallback:

```js
  /** Show/hide hearts row vs Boss HP row based on the active play mode. */
  function updateModeHud() {
    var livesWrap = document.getElementById('hud-lives-wrap');
    var bossRow = document.getElementById('boss-hp-row');
    var inBoss = GameState.playMode === 'boss' && !GameState.isReviewMode;
    var hideHearts = !GameState.isReviewMode && GameState.playMode === 'boss';
    if (livesWrap) livesWrap.style.display = hideHearts ? 'none' : '';
    if (bossRow) bossRow.hidden = !inBoss;
  }

  function updateBossHpUI() {
    var num = document.getElementById('boss-hp-num');
    var fill = document.getElementById('boss-hp-fill');
    if (!num || !fill) return;
    var hp = typeof GameState.bossHp === 'number' ? GameState.bossHp : BOSS_HP;
    num.textContent = String(hp);
    fill.style.width = ((hp / BOSS_HP) * 100) + '%';
  }

  function flashBossCrit() {
    var fill = document.getElementById('boss-hp-fill');
    if (!fill) return;
    fill.classList.remove('crit-flash');
    void fill.offsetWidth; // restart the CSS animation
    fill.classList.add('crit-flash');
  }

  function bossVictoryCelebration() {
    confettiBurst();
    setTimeout(confettiBurst, 350);
    setTimeout(confettiBurst, 700);
    try {
      if (window.KLS && window.KLS.bridge && window.KLS.bridge.celebrate) {
        window.KLS.bridge.celebrate();
      }
    } catch (e) { /* standalone: no hub */ }
  }
```

- [ ] Wire the HUD switch: at the end of `updateStatsUI()` (~line 3782 pre-edit), after the `updateLivesUI();` line, add:

```js
    updateModeHud();
```

- [ ] Add the boss branch to `startRound(playMode)` (~line 4173 pre-edit). Place it AFTER the shared per-round state reset (score/streak/hearts/counters/`resetAdaptiveDifficultyState()`/`newRoundId()`) and make it bypass the mission plan/questions setup (wrap chunk 2's mission setup in the `else`, or early-branch — match what chunk 2 left; the boss block itself is):

The five mission-specific lines Task 9 left in `startRound` (`GameState.bandPlan = GradeBands.buildRoundPlan(GameState.grade, ROUND_SIZE);`, `GameState.roundQuestions = new Array(ROUND_SIZE);`, `generateRoundQuestionAtIndex(0);`, `GameState.currentQuestion = GameState.roundQuestions[0];`, `setGameTitle('🛸 Mission in progress');`) move into the `else` branch; everything else in `startRound` stays shared:

```js
    GameState.bossHp = null;
    if (playMode === 'boss') {
      GameState.bossHp = BOSS_HP;
      GameState.roundSize = BOSS_MAX_QUESTIONS;
      // Recipe cycles past 10 slots inside buildRoundPlan (contract).
      GameState.bandPlan = GradeBands.buildRoundPlan(GameState.grade, BOSS_MAX_QUESTIONS, {});
      GameState.roundQuestions = new Array(BOSS_MAX_QUESTIONS);
      generateRoundQuestionAtIndex(0);
      GameState.currentQuestion = GameState.roundQuestions[0];
      setGameTitle('🎯 Boss Battle!');
    } else {
      // ...the five mission setup lines listed above, unchanged...
    }
    updateBossHpUI();
```

- [ ] Boss scoring in `handleSubmitAnswer()` (~line 3925 pre-edit). Two edits. First, insert the damage block AFTER the `if (ok) { … } else { … }` scoring block and BEFORE the `GameState.adaptiveStats.correctThisRound = …` line (~3976 pre-edit). Note `GameState.streak` was already incremented on a correct answer, so `streak >= 3` means "third-and-beyond consecutive correct":

```js
    if (GameState.playMode === 'boss' && !GameState.isReviewMode) {
      if (ok) {
        var bossDmg = GameState.streak >= 3 ? BOSS_CRIT_DAMAGE : 1;
        GameState.bossHp = Math.max(0, GameState.bossHp - bossDmg);
        if (bossDmg >= BOSS_CRIT_DAMAGE) {
          pointsLine += '  ·  ⚡ CRITICAL HIT!';
          flashBossCrit();
        }
      } else {
        GameState.bossHp = Math.min(BOSS_HP, GameState.bossHp + 1);
      }
      updateBossHpUI();
    }
```

Second, in the wrong-answer branch, restrict heart loss to Mission — change:

```js
      if (!GameState.isReviewMode) handleLifeLost();
```

to:

```js
      if (!GameState.isReviewMode && GameState.playMode === 'mission') handleLifeLost();
```

(Wrong answers still call `recordWrongAnswer(q, num)` on the line above — mistakes are recorded normally in boss rounds; the record already carries `grade`/`playMode` from chunk 2.)

- [ ] Boss end conditions in `goToNextQuestion()` (~line 4010 pre-edit). Insert the HP-zero check right after the opening `if (!GameState.answered || GameState.isGameOver) return;` guard:

```js
    if (GameState.playMode === 'boss' && !GameState.isReviewMode && GameState.bossHp !== null && GameState.bossHp <= 0) {
      endRound();
      return;
    }
```

Then widen the existing lazy-generation gate so rounds longer than 10 questions keep generating. The current code caps lazy generation at `ROUND_SIZE` (10), which would leave boss slot 11+ empty; the `questionIndex >= rs` return just above already bounds the index, and the emptiness check (`!GameState.roundQuestions[...]`) protects pre-filled weave-in (Task 16) and bonus (Task 15) slots. Change:

```js
    if (!GameState.isReviewMode && GameState.questionIndex < ROUND_SIZE) {
```

to:

```js
    if (!GameState.isReviewMode) {
```

Boss (16 slots) and Lightning (60 slots, Task 14) now lazy-generate through the exact same `generateRoundQuestionAtIndex` / `GameState.bandPlan` path Missions use — no parallel pipeline.

- [ ] Boss results. In `endRound()` (~line 4093 pre-edit), immediately after the `if (GameState.isReviewMode) { … return; }` practice branch, add:

```js
    if (GameState.playMode === 'boss') {
      endBossRound();
      return;
    }
```

Then add `endBossRound()` as a new function directly above `endRound()`. It mirrors the mission bookkeeping (same star formula over answered questions, per the spec) plus victory/escape presentation and the first-win badge:

```js
  function endBossRound() {
    var victory = typeof GameState.bossHp === 'number' && GameState.bossHp <= 0;
    progress = ensureProgressShape(progress);
    if (GameState.mistakeSeenThisRound) {
      progress.stats.streakRecoveryCount = Math.max(
        progress.stats.streakRecoveryCount,
        GameState.correctAfterFirstMistake
      );
    }
    var stars = computeStarsForNormalRound();
    progress.totalStars += stars;
    progress.roundsPlayed += 1;
    if (GameState.bestStreakThisRound > progress.bestStreakEver) {
      progress.bestStreakEver = GameState.bestStreakThisRound;
    }
    var acc = accuracyPercent(GameState.correctCount, GameState.totalAnswered);
    progress.lastRoundAccuracy = acc;
    recordPlayDateForMission();
    if (victory && progress.badges.indexOf('boss_slayer') === -1) {
      progress.badges.push('boss_slayer');
    }
    GameState.lastRoundWrongBuffer = GameState.currentRoundWrongAnswers.slice();
    wrongAnswerStore.recentWrongAnswers = GameState.lastRoundWrongBuffer.slice();
    saveWrongAnswerHistory();
    updatePracticeButtons();
    GameState.reviewJustCompleted = false;
    saveProgress(progress);
    if (victory) bossVictoryCelebration();
    showNormalResultsStats();
    document.getElementById('results-title').textContent =
      victory ? '🎉 Boss defeated!' : 'The boss escaped — next time!';
    document.getElementById('results-stars').textContent = new Array(stars + 1).join('⭐');
    document.getElementById('results-rating').textContent = victory
      ? 'Amazing! Your math attacks took the boss down!'
      : 'So close! The boss is already scared of your math.';
    document.getElementById('res-score').textContent = String(GameState.score);
    document.getElementById('res-correct').textContent =
      GameState.correctCount + ' / ' + GameState.totalAnswered;
    document.getElementById('res-accuracy').textContent = acc + '%';
    document.getElementById('res-streak').textContent = String(GameState.bestStreakThisRound);
    document.getElementById('res-stars').textContent = String(stars);
    clearSaveStatus('results-save-status');
    showScreen('results');
    updateResultsExportButtons();
  }
```

- [ ] Unhide and wire the Boss tile. In `#screen-menu`, delete the `hidden` attribute from `<button ... id="btn-tile-boss" hidden>` (Task 8 ships it hidden and unwired — this task owns the wiring). Next to the other tile handlers (`btn-tile-mission` / `btn-tile-fixit`, Task 8), add — `guardTile` is Task 8's wrapper that no-ops until a grade is picked:

```js
  document.getElementById('btn-tile-boss').addEventListener('click', guardTile(function () {
    startRound('boss');
  }));
```

- [ ] Manual verification (standalone + hub). Run `python3 -m http.server 8000` from the repo root, open `http://localhost:8000/games/cosmic-math-quest/index.html`:
  1. Menu shows the 🎯 Boss Battle tile (not hidden). Pick grade 3 via the grade chip if not already set.
  2. Click Boss Battle → game screen title "🎯 Boss Battle!", HUD shows "Boss HP: 10 / 10" with a full red bar, the hearts row is GONE, and "Question 1 of 16".
  3. Answer one question correctly → HP drops to 9, bar shrinks smoothly.
  4. Answer 3 in a row correctly → on the third, feedback shows "⚡ CRITICAL HIT!", the bar pulses, and HP drops by 2.
  5. Type a wrong answer on purpose → HP goes UP by 1 (never above 10), no heart animation, no game-over modal, streak resets to 0.
  6. Full win: keep answering correctly until HP reaches 0 → press Next → results screen "🎉 Boss defeated!" with stars, confetti bursts. Open ⭐ Stars & Badges → a new pill appears (it renders as raw `boss_slayer` until Task 17 adds the label — that is expected).
  7. Boss escape: play Boss again, alternate right/wrong so HP never reaches 0; after question 16 → results "The boss escaped — next time!" with accuracy-based stars.
  8. Results → "Fix Tricky Questions" → practice screen shows hearts again and NO boss bar (the wrong answers from the boss round are in the list).
  9. Hub pass: open `http://localhost:8000/index.html#/games/cosmic-math-quest`, pick a profile, play a short boss round; `← Hub` and `🏠 Home` still work.
  10. DevTools console: zero errors during all of the above.
- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): Boss Battle mode with HP bar, crit hits, and boss_slayer badge"
```

### Task 14: Lightning mode with a 90-second timer

**Files:**
- Modify: `games/cosmic-math-quest/index.html` (constants ~1188; `GameState` literal ~1240; status bar HTML ~1026-1047; `</style>` ~954; `updateModeHud()` from Task 13; `startWrongAnswerPractice()` ~2101 pre-edit; `endRound()` ~4093 pre-edit; `startRound()` ~4173 pre-edit; exit-game handler ~4299 pre-edit; `resetMyProgress()` ~4456 pre-edit; `window.__cmq_onGoHome` ~4486 pre-edit)
- Test: manual browser checks

**Interfaces:**
- Consumes: `GradeBands.buildRoundPlan(grade, 60, {fastOnly:true})` (contract); `progress.bestLightningByGrade` (object) and `progress.lightningBestBeats` (number) — both already backfilled by chunk 2's `ensureProgressShape`; `GameState.bandPlan` + `generateRoundQuestionAtIndex(slotIndex)` (Task 9), `guardTile(handler)` + `#btn-tile-lightning` (Task 8), `updateModeHud()`, the widened `goToNextQuestion` lazy gate, and the heart-loss `playMode === 'mission'` guard (all Task 13)
- Produces: constant `LIGHTNING_SECONDS=90`; `GameState.lightningTimerId`, `GameState.lightningSecondsLeft`; functions `clearLightningTimer()`, `startLightningTimer()`, `updateLightningTimerUI()`, `endLightningRound()`; DOM ids `lightning-timer-row`, `lightning-timer-num`, `lightning-timer-fill`; badge id `'lightning_streak'` pushed to `progress.badges`

- [ ] Add the constant next to the boss constants from Task 13:

```js
  const LIGHTNING_SECONDS = 90;
```

- [ ] Add two fields to the `GameState` literal, after `bossHp: null,` (Task 13):

```js
    /** Lightning: live setInterval id (MUST be cleared on every exit path). */
    lightningTimerId: null,
    lightningSecondsLeft: 0,
```

- [ ] Add the timer row HTML inside `#status-bar`, directly under the Task 13 `boss-hp-row` block:

```html
          <div class="lightning-timer-row" id="lightning-timer-row" hidden>
            <span id="lightning-timer-num" role="timer">90s</span>
            <div class="lightning-timer-track" aria-hidden="true">
              <div class="lightning-timer-fill" id="lightning-timer-fill"></div>
            </div>
          </div>
```

- [ ] Add the timer CSS before `</style>`, after the boss CSS. Under reduced motion the bar is removed entirely — the numeric countdown alone remains (no animating element at all):

```css
    /* ===== Lightning timer ===== */
    .lightning-timer-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
    #lightning-timer-num { font-weight: 800; min-width: 3.5ch; }
    .lightning-timer-track {
      flex: 1; height: 10px; border-radius: 999px;
      background: rgba(9, 132, 227, 0.18); overflow: hidden;
    }
    .lightning-timer-fill {
      height: 100%; width: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #74b9ff, #0984e3);
      transition: width 1s linear;
    }
    @media (prefers-reduced-motion: reduce) {
      .lightning-timer-track { display: none; } /* number-only countdown */
    }
```

- [ ] Add the timer functions right after `bossVictoryCelebration()` (Task 13):

```js
  /** Stop the Lightning countdown. Safe to call when no timer is running. */
  function clearLightningTimer() {
    if (GameState.lightningTimerId != null) {
      clearInterval(GameState.lightningTimerId);
      GameState.lightningTimerId = null;
    }
  }

  function updateLightningTimerUI() {
    var num = document.getElementById('lightning-timer-num');
    var fill = document.getElementById('lightning-timer-fill');
    var s = Math.max(0, GameState.lightningSecondsLeft | 0);
    if (num) num.textContent = s + 's';
    if (fill) fill.style.width = ((s / LIGHTNING_SECONDS) * 100) + '%';
  }

  function startLightningTimer() {
    clearLightningTimer();
    GameState.lightningSecondsLeft = LIGHTNING_SECONDS;
    updateLightningTimerUI();
    GameState.lightningTimerId = setInterval(function () {
      GameState.lightningSecondsLeft -= 1;
      updateLightningTimerUI();
      if (GameState.lightningSecondsLeft <= 0) {
        clearLightningTimer();
        // Mid-question expiry: the unanswered question was never graded
        // (totalAnswered only moves inside handleSubmitAnswer), so it is
        // simply discarded — not a graded commit.
        endRound();
      }
    }, 1000);
  }
```

- [ ] Replace the Task 13 `updateModeHud()` body with this extended version (hearts hidden in boss AND lightning; timer row only in live lightning):

```js
  /** Show/hide hearts row vs Boss HP row vs Lightning timer per play mode. */
  function updateModeHud() {
    var livesWrap = document.getElementById('hud-lives-wrap');
    var bossRow = document.getElementById('boss-hp-row');
    var timerRow = document.getElementById('lightning-timer-row');
    var inBoss = GameState.playMode === 'boss' && !GameState.isReviewMode;
    var inLightning = GameState.playMode === 'lightning' && !GameState.isReviewMode;
    var hideHearts = inBoss || inLightning;
    if (livesWrap) livesWrap.style.display = hideHearts ? 'none' : '';
    if (bossRow) bossRow.hidden = !inBoss;
    if (timerRow) timerRow.hidden = !inLightning;
  }
```

- [ ] Extend the `startRound(playMode)` branch chain from Task 13 — turn `} else {` into an `else if` chain so lightning gets its own setup (fast formats only; 60 planned slots is far more than any kid clears in 90s):

```js
    GameState.bossHp = null;
    if (playMode === 'boss') {
      // ...Task 13 boss block unchanged...
    } else if (playMode === 'lightning') {
      GameState.roundSize = 60;
      GameState.bandPlan = GradeBands.buildRoundPlan(GameState.grade, 60, { fastOnly: true });
      GameState.roundQuestions = new Array(60);
      generateRoundQuestionAtIndex(0);
      GameState.currentQuestion = GameState.roundQuestions[0];
      setGameTitle('⚡ Lightning Round!');
      startLightningTimer();
    } else {
      // ...the five mission setup lines (Task 13), unchanged...
    }
    updateBossHpUI();
```

Also add a defensive `clearLightningTimer();` as the FIRST line of `startRound(playMode)` (a new round must never inherit a live timer).

- [ ] Route lightning through `endRound()` (~4093 pre-edit). Add `clearLightningTimer();` as the first line of `endRound()` (covers "kid answered all 60" and any other end), then after the Task 13 boss routing add:

```js
    if (GameState.playMode === 'lightning') {
      endLightningRound();
      return;
    }
```

- [ ] Add `endLightningRound()` directly above `endBossRound()`. Personal best = correct answers this round; the improvement counter only increments when a PREVIOUS best (> 0) is beaten, so the very first round establishes a best without counting as a "beat". Stars capped at 3 (Mission stays the star-richest mode). Lightning deliberately does NOT touch `progress.lastRoundAccuracy` (that feeds the Mission improvement star):

```js
  function endLightningRound() {
    clearLightningTimer();
    progress = ensureProgressShape(progress);
    var g = GameState.grade;
    var acc = accuracyPercent(GameState.correctCount, GameState.totalAnswered);
    var prevBest = Number(progress.bestLightningByGrade[g]) || 0;
    var isNewBest = GameState.correctCount > prevBest;
    if (isNewBest) {
      progress.bestLightningByGrade[g] = GameState.correctCount;
      if (prevBest > 0) {
        progress.lightningBestBeats = (Number(progress.lightningBestBeats) || 0) + 1;
      }
    }
    var stars = 0;
    if (GameState.totalAnswered >= 5) stars += 1;               // played for real
    if (isNewBest) stars += 1;                                   // beat your own best
    if (GameState.totalAnswered > 0 && acc >= 90) stars += 1;    // sharp accuracy
    progress.totalStars += stars;
    progress.roundsPlayed += 1;
    if (GameState.bestStreakThisRound > progress.bestStreakEver) {
      progress.bestStreakEver = GameState.bestStreakThisRound;
    }
    recordPlayDateForMission();
    if (progress.lightningBestBeats >= 2 && progress.badges.indexOf('lightning_streak') === -1) {
      progress.badges.push('lightning_streak');
    }
    GameState.lastRoundWrongBuffer = GameState.currentRoundWrongAnswers.slice();
    wrongAnswerStore.recentWrongAnswers = GameState.lastRoundWrongBuffer.slice();
    saveWrongAnswerHistory();
    updatePracticeButtons();
    GameState.reviewJustCompleted = false;
    saveProgress(progress);
    showNormalResultsStats();
    document.getElementById('results-title').textContent = '⚡ Lightning finished!';
    document.getElementById('results-stars').textContent =
      stars > 0 ? new Array(stars + 1).join('⭐') : '—';
    document.getElementById('results-rating').textContent = isNewBest
      ? 'New personal best: ' + GameState.correctCount + ' correct! ⚡'
      : 'You got ' + GameState.correctCount + ' — your best is ' +
        (progress.bestLightningByGrade[g] || 0) + '. Beat your own best!';
    document.getElementById('res-score').textContent = String(GameState.score);
    document.getElementById('res-correct').textContent =
      GameState.correctCount + ' / ' + GameState.totalAnswered;
    document.getElementById('res-accuracy').textContent = acc + '%';
    document.getElementById('res-streak').textContent = String(GameState.bestStreakThisRound);
    document.getElementById('res-stars').textContent = String(stars);
    clearSaveStatus('results-save-status');
    showScreen('results');
    updateResultsExportButtons();
  }
```

- [ ] Clear the timer on EVERY exit path. The complete list — the first two are already done above; add the one-liner to each of the remaining five:
  1. Natural expiry — inside the `startLightningTimer` callback (done).
  2. `endRound()` first line (done) — covers finishing all 60 questions and any programmatic end.
  3. Exit-game button: in the `btn-menu-game` click handler (~line 4299 pre-edit), add `clearLightningTimer();` as the first line INSIDE the `if (window.confirm(confirmText)) {` block (before the review-mode cleanup).
  4. Hub 🏠 Home: in `window.__cmq_onGoHome` (~line 4486 pre-edit), make the body: `try { clearLightningTimer(); showScreen('menu'); } catch (e) { /* ignore */ }`.
  5. New round: first line of `startRound(playMode)` (done above).
  6. Practice start: in `startWrongAnswerPractice(buffer, opts)` (~line 2101 pre-edit), add `clearLightningTimer();` right after the `opts = opts || {};` line (defensive — practice can only start from menu/results, but it is one cheap line).
  7. Reset: in `resetMyProgress()` (~line 4456 pre-edit), add `clearLightningTimer();` immediately before the final `showScreen('menu');`.
  (`handleGameOver` needs nothing: lightning never loses hearts, so the game-over modal is unreachable — the Task 13 `playMode === 'mission'` guard on `handleLifeLost()` guarantees it.)
- [ ] Unhide and wire the Lightning tile. Delete the `hidden` attribute from `<button ... id="btn-tile-lightning" hidden>` (Task 8 ships it hidden and unwired), then add next to the other tile handlers:

```js
  document.getElementById('btn-tile-lightning').addEventListener('click', guardTile(function () {
    startRound('lightning');
  }));
```

- [ ] Manual verification. `python3 -m http.server 8000` from repo root, open `http://localhost:8000/games/cosmic-math-quest/index.html`:
  1. Menu shows the ⚡ Lightning tile. Set grade 2. Click it → title "⚡ Lightning Round!", timer shows "90s" and a blue bar, NO hearts row, NO boss bar.
  2. The number counts down every second; the bar shrinks smoothly in lockstep.
  3. Questions are fast formats only (bare facts / missing factor style — no word problems, no long multi-digit).
  4. Answer at least 6 questions, get at least one wrong on purpose, then let the timer run out MID-QUESTION (leave the answer box empty) → the game jumps straight to "⚡ Lightning finished!"; the "Correct / N" denominator equals only the questions you actually checked (the abandoned one is not counted).
  5. First round stars: with ≥5 answered and ≥1 correct you get 2 stars (played + first best). Never more than 3.
  6. DevTools console: `JSON.parse(localStorage.getItem('cosmicMathQuest_v1')).bestLightningByGrade` shows `{"2": <your correct count>}` and `.lightningBestBeats` is `0` (first round establishes, does not "beat").
  7. Play two more rounds, beating your correct-count best each time → `lightningBestBeats` becomes 2 and `badges` now contains `"lightning_streak"` (raw id pill until Task 17).
  8. Ghost-interval check: start a new Lightning round, wait until ~70s remain, click "Exit game" and confirm → menu appears. Now wait 2 full minutes on the menu: the screen must NOT jump to results, the console shows no errors, and no timer text changes anywhere. Re-enter Lightning → timer starts fresh at 90s.
  9. Hub pass: `http://localhost:8000/index.html#/games/cosmic-math-quest` → start Lightning → click the chrome bar `🏠 Home` mid-round → menu; wait past expiry → no jump to results.
  10. Reduced motion (DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce"): the bar is gone; only the numeric countdown remains.
- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): Lightning mode - 90s sprint, personal bests, lightning_streak badge"
```

### Task 15: Drift-up bonus challenges at band mastery

**Files:**
- Modify: `games/cosmic-math-quest/index.html` (constants ~1188; `hasMulFamilyMasteredEnough()` neighborhood ~1405 for the new predicate; `startRound()` ~4173 pre-edit; `handleSubmitAnswer()` ~3925 pre-edit; `updateStatsUI()` ~3782 pre-edit; `renderQuestion()` ~3889 pre-edit)
- Test: manual browser checks with a console seeding snippet

**Interfaces:**
- Consumes: `GradeBands.generateDriftBonus(grade, tier)` → question|null (contract: 2→gentle `g3_missing`, 3→`g4_multidigit` product≤100, 4→`g5_pattern`, 5→null); `progress.familyStats.families` records `{attempts, masteryPct}` (masteryPct is 0..1, from `LearningIntel.computeMasteryPct`); `recordWrongAnswer(q, childAnswer)` (~1715), `recordFamilyAttemptsForQuestion(q, correct)` (~1447); Task 13's `getAdaptiveTier()` usage pattern and `startRound` branch chain
- Produces: constants `DRIFT_MASTERY_PCT=0.8`, `DRIFT_MIN_FAMILIES=5`, `DRIFT_MIN_ATTEMPTS=20`, `BONUS_POINTS=15`; functions `isBandMastered(grade)`, `appendDriftBonusQuestions(playMode)`; question flag `isBonus` (set by index.html, never by gradeBands.js)

- [ ] Add the drift constants next to the boss/lightning constants:

```js
  const DRIFT_MASTERY_PCT = 0.8;
  const DRIFT_MIN_FAMILIES = 5;
  const DRIFT_MIN_ATTEMPTS = 20;
  const BONUS_POINTS = 15;
```

- [ ] Add `isBandMastered(grade)` right after `hasMulFamilyMasteredEnough()` (~line 1405 pre-edit). Relevant families per band: grade 2 → `mul:*` only; grades 3 and 4 → `mul:*` and `div:*`; grade 5 → no next band, never masters "up". `masteryPct` is on a 0..1 scale so `DRIFT_MASTERY_PCT = 0.8` compares directly:

```js
  /** Drift-up trigger: >= DRIFT_MIN_FAMILIES of the band's relevant fact
   *  families each have >= DRIFT_MIN_ATTEMPTS attempts and
   *  masteryPct >= DRIFT_MASTERY_PCT. Grade 5 has no next band. */
  function isBandMastered(grade) {
    if (grade == null || grade >= 5) return false;
    progress = ensureProgressShape(progress);
    var fams = (progress.familyStats && progress.familyStats.families) || {};
    var prefixes = grade === 2 ? ['mul:'] : ['mul:', 'div:'];
    var count = 0;
    for (var fid in fams) {
      if (!Object.prototype.hasOwnProperty.call(fams, fid)) continue;
      var matches = false;
      for (var pi = 0; pi < prefixes.length; pi++) {
        if (fid.indexOf(prefixes[pi]) === 0) { matches = true; break; }
      }
      if (!matches) continue;
      var f = fams[fid];
      if ((Number(f.attempts) || 0) >= DRIFT_MIN_ATTEMPTS &&
          (Number(f.masteryPct) || 0) >= DRIFT_MASTERY_PCT) {
        count++;
      }
    }
    return count >= DRIFT_MIN_FAMILIES;
  }
```

- [ ] Add `appendDriftBonusQuestions(playMode)` directly above `startRound()`:

```js
  /** Mastered the band? Append 1-2 next-band Bonus Challenge slots.
   *  Bonus questions never cost a heart and are excluded from
   *  accuracy/stars; a miss is still a graded commit (recorded). */
  function appendDriftBonusQuestions(playMode) {
    if (playMode !== 'mission') return; // Mission-only: a boss KO ends the round before appended slots (spec §4 amended)
    if (typeof GradeBands === 'undefined') return;
    if (!isBandMastered(GameState.grade)) return;
    var n = 1 + Math.floor(Math.random() * 2); // 1 or 2
    for (var i = 0; i < n; i++) {
      var bq = GradeBands.generateDriftBonus(GameState.grade, getAdaptiveTier());
      if (!bq) return;
      bq.isBonus = true;
      GameState.roundQuestions.push(bq);
      GameState.roundSize += 1;
    }
  }
```

- [ ] Call it from `startRound(playMode)`: add ONE line right after the boss/lightning/mission branch chain from Task 14 (i.e., after `GameState.roundQuestions` and `GameState.roundSize` are set for the chosen mode, just before the `updateBossHpUI();` line):

```js
    appendDriftBonusQuestions(playMode);
```

(`push` on the sparse mission array extends its length past 10, and `getRoundSize()` reads `GameState.roundSize`, so `goToNextQuestion`'s end check naturally reaches the bonus slots. Drift bonuses are deliberately Mission-only: in a boss round, appended slots sit past slot 16 and an early KO ends the round before them, so the boss half of the feature would be dead weight — spec §4 was amended to match.)

- [ ] Bonus grading path in `handleSubmitAnswer()`: insert this block immediately BEFORE the `GameState.answered = true;` / `GameState.totalAnswered++;` lines (after the digits-only input validation). It skips hearts, streak, accuracy, adaptive difficulty, and star accounting entirely; a correct answer pays `BONUS_POINTS`; a miss is still recorded (graded commit) and family attempts are logged either way (drift bonuses never have remainders, so the plain integer compare is safe):

```js
    if (q.isBonus) {
      GameState.answered = true;
      var okBonus = num === q.answer;
      var bonusLine = '';
      if (okBonus) {
        GameState.score += BONUS_POINTS;
        bonusLine = '+' + BONUS_POINTS + ' bonus';
      } else {
        recordWrongAnswer(q, num);
      }
      recordFamilyAttemptsForQuestion(q, okBonus);
      setAnswerControlsEnabled(false);
      document.getElementById('btn-hint').disabled = true;
      showFeedback(okBonus, bonusLine, '');
      document.getElementById('btn-next').hidden = false;
      updateStatsUI();
      return;
    }
```

- [ ] HUD label: in `updateStatsUI()` (~3782 pre-edit), replace the single `hud-q-num` assignment line:

```js
    document.getElementById('hud-q-num').textContent = 'Question ' + Math.min(n, rs) + ' of ' + rs;
```

with:

```js
    var qNumEl = document.getElementById('hud-q-num');
    if (GameState.currentQuestion && GameState.currentQuestion.isBonus) {
      qNumEl.textContent = '⭐ Bonus challenge!';
    } else {
      qNumEl.textContent = 'Question ' + Math.min(n, rs) + ' of ' + rs;
    }
```

- [ ] No `renderQuestion` guard is needed for bonus questions: Task 9 deleted the regenerate-on-invalid loop entirely (band questions are pre-validated), so nothing can swap a bonus question out. Verify with `grep -n "guard < 24" games/cosmic-math-quest/index.html` → no hits.

- [ ] Manual verification with forced mastery. Serve (`python3 -m http.server 8000`), open the STANDALONE page `http://localhost:8000/games/cosmic-math-quest/index.html`, open DevTools console and paste this temporary QA seeding snippet (writes 5 mastered ×-families into the un-scoped progress blob — for a hub profile use the scoped key from `Object.keys(localStorage).filter(k => k.startsWith('cosmicMathQuest_v1'))` instead):

```js
(function () {
  var key = 'cosmicMathQuest_v1';
  var p = JSON.parse(localStorage.getItem(key) || '{}');
  p.familyStats = p.familyStats && p.familyStats.families
    ? p.familyStats : { version: 1, updatedAt: null, families: {} };
  ['mul:2', 'mul:3', 'mul:4', 'mul:5', 'mul:6'].forEach(function (fid) {
    p.familyStats.families[fid] = {
      familyId: fid, attempts: 25, correctCount: 24,
      accuracy: 0.96, masteryPct: 0.95,
      lastPracticedAt: new Date().toISOString(),
    };
  });
  localStorage.setItem(key, JSON.stringify(p));
  console.log('CMQ drift-up mastery seeded — reload the page.');
})();
```

  Then:
  1. Reload the page (progress is read at load). Set grade to 2. Start a Mission.
  2. Play all 10 questions normally; note the accuracy shown on the HUD after question 10.
  3. One or two extra questions appear; the HUD says "⭐ Bonus challenge!" instead of "Question 11 of 11", and the question is a gentle missing-factor (next band, `g3_missing`).
  4. Answer a bonus correctly → "+15 bonus" tag; hearts unchanged; HUD "Correct: x / 10" and accuracy DID NOT move.
  5. Run again and miss a bonus on purpose → NO heart lost, gentle feedback, and the miss shows up in Fix-It (due count / practice list).
  6. Results screen: accuracy and "Correct / 10" are computed over the 10 scored questions only; stars unaffected by the bonus outcome.
  7. Set grade 5 (chip) → missions have NO bonus slots (generateDriftBonus returns null / isBandMastered false).
  8. Clean up: `localStorage.removeItem('cosmicMathQuest_v1')` (or use Reset my progress) so the seeded blob doesn't pollute later QA.
- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): drift-up bonus challenges when the grade band is mastered"
```

### Task 16: Daily review weave-in (Mission only)

**Files:**
- Modify: `games/cosmic-math-quest/index.html` (constants ~1188; question card HTML ~1049-1051; `</style>` ~954; `startRound()` ~4173 pre-edit; `renderQuestion()` ~3889 pre-edit; `handleSubmitAnswer()` ~3925 pre-edit)
- Test: manual browser checks

**Interfaces:**
- Consumes: `getDueTodaySet()` (~2269) — returns an array of wrong-answer RECORDS (deduped by key, unresolved, `nextReviewAt <= now`, capped 5-10; each has `.questionSnapshot`); `questionFromSnapshot(snap)` (~1555) — rebuilds a playable question object from a stored snapshot; `resolveMistake(questionKey)` (~1730) — marks every history record with that key resolved, bumps `stats.mistakesFixed` via `applyProgressOnMistakeFixed`, and prunes practice buffers (this is the exact path practice mode uses)
- Produces: constant `WEAVE_SLOTS=[2,6]`; question flag `isWeaveIn`; DOM id `weavein-chip`

- [ ] Add the constant next to the drift constants:

```js
  const WEAVE_SLOTS = [2, 6]; // 0-indexed round slots = "questions 3 and 7"
```

- [ ] Add the chip to the question card (~line 1049-1051): change

```html
        <div class="question-card">
          <p class="question-text" id="q-text">Loading…</p>
        </div>
```

to:

```html
        <div class="question-card">
          <span class="weavein-chip" id="weavein-chip" hidden>🔁 One more try!</span>
          <p class="question-text" id="q-text">Loading…</p>
        </div>
```

- [ ] Add the chip CSS before `</style>`:

```css
    /* ===== Review weave-in chip ===== */
    .weavein-chip {
      display: inline-block; margin-bottom: 6px; padding: 2px 10px;
      border-radius: 999px; font-size: 0.8rem; font-weight: 700;
      background: rgba(9, 132, 227, 0.14); color: #0984e3;
    }
```

- [ ] Weave due snapshots into Mission rounds. In `startRound(playMode)`, immediately BEFORE the `appendDriftBonusQuestions(playMode);` line from Task 15, add (mission only — never boss/lightning/practice). Overwriting a not-yet-generated sparse slot is fine; `goToNextQuestion`'s lazy generation only fills empty slots so the weave-ins survive:

```js
    if (playMode === 'mission') {
      var dueRecs = getDueTodaySet().slice(0, WEAVE_SLOTS.length); // at most 2
      for (var wvi = 0; wvi < dueRecs.length; wvi++) {
        var slot = WEAVE_SLOTS[wvi];
        var wq = questionFromSnapshot(dueRecs[wvi].questionSnapshot);
        if (!wq || slot >= GameState.roundQuestions.length) continue;
        wq.isWeaveIn = true;
        GameState.roundQuestions[slot] = wq;
      }
    }
```

- [ ] Show the chip in `renderQuestion()` (~3889 pre-edit). (No regeneration-loop guard is needed — Task 9 deleted that loop, so a woven-in snapshot can never be regenerated away.) After the `document.getElementById('q-text').textContent = q.prompt;` line, add:

```js
    var weaveChip = document.getElementById('weavein-chip');
    if (weaveChip) weaveChip.hidden = !q.isWeaveIn;
```

- [ ] Resolve on correct. In `handleSubmitAnswer()`, right after the `recordFamilyAttemptsForQuestion(q, ok);` line (~3979 pre-edit), add. Everything else about a weave-in stays normal Mission semantics — heart loss on wrong (already recorded via `recordWrongAnswer`, which re-records/bumps `missCount` through `mergeWrongIntoHistory`), normal points, counted in accuracy and stars:

```js
    if (ok && q.isWeaveIn && !GameState.isReviewMode) {
      // Same resolution path practice uses: marks the stored mistake
      // mastered and credits progress.stats.mistakesFixed.
      resolveMistake(q.key);
    }
```

- [ ] Manual verification. Serve (`python3 -m http.server 8000`), open `http://localhost:8000/games/cosmic-math-quest/index.html`:
  1. Seed a due mistake: set grade 3, start a Mission, deliberately answer question 1 wrong (note its prompt, e.g. "7 × 6 = ?"), then finish or exit the round. New wrong records get `nextReviewAt = now`, so the mistake is due immediately.
  2. Start a NEW Mission. Questions 1-2 are normal. Question 3 shows the "🔁 One more try!" chip and is EXACTLY the prompt you missed. (With 2+ due mistakes, question 7 carries the second one.)
  3. HUD is normal on the weave-in: "Question 3 of 10", hearts visible.
  4. Answer the weave-in WRONG → a heart is lost (normal Mission rules) and it stays in the due list.
  5. Play another Mission and answer the weave-in RIGHT → +10 points, streak continues, chip question counts in accuracy.
  6. DevTools console, verify the store shows it resolved:

```js
JSON.parse(localStorage.getItem('cosmicMathQuest_wrongs_v1'))
  .wrongAnswersHistory.map(r => ({ prompt: r.prompt, resolved: r.resolved, nextReviewAt: r.nextReviewAt }))
```

  The record for your prompt shows `resolved: true, nextReviewAt: null`. Also `JSON.parse(localStorage.getItem('cosmicMathQuest_v1')).stats.mistakesFixed` went up by 1.
  7. With no due mistakes (fresh profile / after resolving), Missions have no chip and all 10 slots are generated questions.
  8. Question 3 of the round following a resolution does NOT re-show the resolved item.
- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html
git commit -m "feat(cmq): weave due review questions into mission slots 3 and 7"
```

### Task 17: Badges, labels, docs, and full release QA

**Files:**
- Modify: `games/cosmic-math-quest/index.html` (`evaluateMissionBadges()` ~4050 pre-edit; badge `labels` map in `renderProgressScreen()` ~4269 pre-edit; `endBossRound()` from Task 13)
- Modify: `games/cosmic-math-quest/docs/MISTAKES_AND_PRACTICE.md` (record-shape section, after line 33)
- Modify: `MISTAKES_AND_PRACTICE.md` (repo root; the `cosmic-math-quest` row, line 142)
- Test: `games/cosmic-math-quest/tests/smoke-grade-bands.mjs`, `games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`, `games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs` + full manual checklist

**Interfaces:**
- Consumes: badge ids `'boss_slayer'` (pushed by Task 13) and `'lightning_streak'` (pushed by Task 14); `GameState.grade`, `GameState.playMode` (chunk 2); `endBossRound()` (Task 13)
- Produces: contract labels `'hard' → "Challenger 🏆"`, `'boss_slayer' → "Boss Slayer 🎯"`, `'lightning_streak' → "Lightning Streak ⚡"`; new `'hard'` predicate `stars>=4 && GameState.grade>=4 && playMode in ('mission','boss')`; updated docs

- [ ] Add the two new badge labels in `renderProgressScreen()`'s `labels` map (~line 4269 pre-edit). Note: Task 9 already relabeled `hard` to `Challenger 🏆` and rewrote its predicate — verify with `grep -n "Challenger" games/cosmic-math-quest/index.html` (expect the label line and the predicate comment) and do NOT redo it. Add inside the `labels` object, after `focus_mode: '🧭 Focus Mode',`:

```js
      boss_slayer: 'Boss Slayer 🎯',
      lightning_streak: 'Lightning Streak ⚡',
```

- [ ] Update predicates in `evaluateMissionBadges(stars)` (~line 4050 pre-edit). Two defs change — `perfect` and `focus_mode` are pinned to Mission (they were written against the 10-question round and would mis-fire on a 16-question boss round once `endBossRound` starts evaluating badges below). The `hard`/Challenger predicate was already rewritten by Task 9 — leave it. Replace:

```js
      {
        id: 'perfect',
        test: function () {
          return GameState.correctCount === ROUND_SIZE;
        },
      },
```

with:

```js
      {
        id: 'perfect',
        test: function () {
          return GameState.playMode === 'mission' && GameState.correctCount === ROUND_SIZE;
        },
      },
```

And replace:

```js
      {
        id: 'focus_mode',
        test: function () {
          return GameState.hintsUsedThisRound === 0 && GameState.totalAnswered === ROUND_SIZE;
        },
      },
```

with:

```js
      {
        id: 'focus_mode',
        test: function () {
          return GameState.playMode === 'mission' &&
            GameState.hintsUsedThisRound === 0 && GameState.totalAnswered === ROUND_SIZE;
        },
      },
```

- [ ] Let boss rounds earn general badges too: in `endBossRound()` (Task 13), add one line immediately BEFORE the `saveProgress(progress);` line:

```js
    evaluateMissionBadges(stars);
```

- [ ] Update the game's mistakes doc. In `games/cosmic-math-quest/docs/MISTAKES_AND_PRACTICE.md`, after the paragraph ending "…for weakness detection." (line 33), insert exactly:

```markdown

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
```

- [ ] Update the root spec's status table. In `MISTAKES_AND_PRACTICE.md` (repo root), replace line 142:

```markdown
| `cosmic-math-quest`     | ✓ (`cosmicMathQuest_wrongs_v1`) | ✓ "Fix Tricky Questions" | Reference implementation. Uses adaptive remediation (Flavor B). |
```

with:

```markdown
| `cosmic-math-quest`     | ✓ (`cosmicMathQuest_wrongs_v1`; records carry `grade` + `playMode` + remainder-capable snapshots since the grade-bands release) | ✓ Fix-It tile + "Fix Tricky Questions" + daily review weave-in (due mistakes replay inside Mission slots 3/7 and resolve on a correct answer) | Reference implementation. Adaptive remediation (Flavor B). Misses recorded in every mode (Mission, Boss, Lightning, drift bonus). |
```

- [ ] Run all three smoke tests from the repo root and confirm each prints its OK line (exact commands and expected final lines):

```bash
node games/cosmic-math-quest/tests/smoke-grade-bands.mjs
# expected: smoke-grade-bands: Task 1 OK … Task 5 OK (five lines, Task 5 OK last)

node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs
# expected: smoke-learning-intelligence: OK, then smoke-learning-intelligence: extended OK

node games/cosmic-math-quest/tests/smoke-wrongs-roundtrip.mjs
# expected first line: smoke-wrongs-roundtrip: OK (followed by its 3 detail lines)
```

Any assertion failure = stop and fix before proceeding.
- [ ] Full manual QA checklist (spec section 9). Run `python3 -m http.server 8000` from the repo root. Standalone URL: `http://localhost:8000/games/cosmic-math-quest/index.html`; hub URL: `http://localhost:8000/index.html#/games/cosmic-math-quest`:
  1. **First run:** clear site data (DevTools → Application → Clear site data), open standalone → menu shows the "Which grade are you in?" card, mode tiles disabled until a grade (pick 3) is chosen; the card never reappears afterward.
  2. **Grade change:** tap the `🌌 Grade 3 · change` chip → pick grade 5 → next Mission asks G5-style questions (big multiplication / order of operations); no data lost; chip updates.
  3. **Mission × grades:** play one full Mission at grade 2 (trivial facts like 1×1 allowed, picture-support formats appear) and one at grade 4 (a long-division question with an `R __` box appears at tier 0/+1). Stars 1-5 awarded; hearts work.
  4. **Boss Battle × grades:** one boss round at EACH grade 2/3/4/5 — win at least one (HP bar to 0, crit on 3-streak, "🎉 Boss defeated!", Boss Slayer 🎯 pill now shows its LABEL on the progress screen) and force at least one escape (16 questions, HP > 0, "The boss escaped — next time!"). Per-band spot checks: G2 serves recall/picture questions, G4 serves an `R __` division mid-fight, G5 serves order-of-operations under the boss HUD.
  5. **Lightning × grades:** one round at EACH grade 2/3/4/5, at least one run to expiry mid-question (discarded, not counted); stars ≤ 3. Fast formats only per band: G2 bare recall, G3 recall/missing/division facts, G4 warm-up facts (11s/12s heavy), G5 ×10 patterns — never word problems, long multi-digit, or order-of-ops. Beat your best twice at one grade → Lightning Streak ⚡ pill appears.
  6. **Fix-It:** miss questions in Mission AND Boss AND Lightning → the Fix-It tile badge counts them; one tap starts a 5-10 question practice set; correct answers resolve; empty state shows "No tricky questions right now! 🎉".
  7. **Weave-in:** with a due mistake, start Mission → 🔁 chip at question 3; answer right; verify `resolved: true` in the wrongs store (Task 16 console snippet).
  8. **Challenger badge:** at grade 4+, earn 4+ stars in a Mission or Boss round → "Challenger 🏆" appears (old profiles that had "Hard hero" show the same pill relabeled).
  9. **Old-profile compat:** in DevTools console inject a pre-change wrong record (no `grade`/`playMode`, `level: 'medium'`) into `cosmicMathQuest_wrongs_v1`'s `wrongAnswersHistory`, reload → it appears in Fix-It and replays verbatim; answering it right resolves it.
  10. **Hub + profiles:** in the hub URL, create profile A, play (earn stars/mistakes); create profile B → B starts at zero (no grade picked, no badges, no mistakes); switch back to A → A's grade and data intact.
  11. **Standalone file://:** `open games/cosmic-math-quest/index.html` (no server) → game fully playable: grade picker, all four tiles, a boss round, no console errors about GradeBands load order.
  12. **Reduced motion:** DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → boss HP bar snaps without transition and no crit pulse; Lightning shows number-only countdown (no bar); confetti paths unchanged from before this feature.
  13. **Reset:** menu → "🧹 Reset my progress" → stars/badges/mistakes wiped, `bestLightningByGrade` gone, but the GRADE CHOICE survives (it is identity, not progress — per spec §7); other profiles untouched.
  14. **Resume blob:** in the hub, start a Boss round, leave to hub (state saved), re-enter → Continue row restores to the menu with playMode/grade context; a hand-crafted v1 blob (`{v:1, screen:'screen-menu', mode:'multiply', level:'easy'}`) restores the screen only, no crash.
  15. Console clean (zero errors) across all of the above.
- [ ] Commit:

```bash
git add games/cosmic-math-quest/index.html games/cosmic-math-quest/docs/MISTAKES_AND_PRACTICE.md MISTAKES_AND_PRACTICE.md
git commit -m "feat(cmq): Challenger/Boss Slayer/Lightning Streak badges, docs, full grade-bands QA"
```
