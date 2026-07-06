/**
 * Smoke tests for learningIntelligence.js (no browser).
 * Run: node tests/smoke-learning-intelligence.mjs
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

globalThis.window = globalThis;
const code = readFileSync(join(root, 'learningIntelligence.js'), 'utf8');
eval(code);

const L = globalThis.LearningIntel;

// 1) Fact families for ×6×7
const q67 = {
  key: 't',
  operation: 'multiply',
  type: 'basic',
  meta: { a: 6, b: 7, prod: 42 },
};
const fam = L.getFactFamily(q67);
assert.strictEqual(fam.kind, 'fact');
assert.ok(fam.familyIds.includes('mul:6') && fam.familyIds.includes('mul:7'));

// 2) Weak families aggregate missCount
const store = {
  wrongAnswersHistory: [
    {
      resolved: false,
      key: 'k1',
      missCount: 3,
      questionSnapshot: q67,
    },
  ],
};
const weak = L.getWeakFamilies(store);
assert.ok(weak.length >= 1);
assert.ok(weak[0].weaknessScore > 0);

// 3) Follow-up pool for 6×7 includes neighbors + inverse divides
const fu = L.generateFollowUpQuestion(q67);
assert.ok(fu && fu.operation === 'multiply' || fu.operation === 'divide');
const pool = L.getFollowUpRawPool(q67);
assert.ok(pool.length >= 4);
const keys = new Set(pool.map((r) => r.key));
assert.strictEqual(keys.size, pool.length, 'follow-up pool should not duplicate keys');

// 4) Family stats round-trip
const st = L.createEmptyFamilyStats();
L.recordFamilyAttempt(st, 'mul:6', true);
L.recordFamilyAttempt(st, 'mul:6', false);
assert.ok(st.families['mul:6'].attempts === 2);
assert.ok(typeof st.families['mul:6'].masteryPct === 'number');

console.log('smoke-learning-intelligence: OK');

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
