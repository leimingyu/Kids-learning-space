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
