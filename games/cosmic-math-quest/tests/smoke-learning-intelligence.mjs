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
