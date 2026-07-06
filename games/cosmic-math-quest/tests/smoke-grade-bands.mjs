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
