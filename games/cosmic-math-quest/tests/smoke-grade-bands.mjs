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

// tf/tf_div must mix true and false statements (user-approved design change)
{
  const tfAnswers = new Set();
  for (let i = 0; i < 400 && tfAnswers.size < 2; i++) {
    const q = gen('g4_invreason', 0);
    if (q.meta.reasoning === 'tf' || q.meta.reasoning === 'tf_div') {
      tfAnswers.add(q.answer);
      if (q.answer === 1) {
        assert.strictEqual(q.meta.shown, q.meta.reasoning === 'tf' ? q.meta.prod : q.meta.quotient, `true statement must show the real value: ${q.prompt}`);
      }
    }
  }
  assert.deepStrictEqual([...tfAnswers].sort(), [0, 1], 'g4 T/F questions must mix true and false');
}

console.log('smoke-grade-bands: Task 3 OK');

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

// g5 tf must mix true and false statements (user-approved design change)
{
  const tfAnswers5 = new Set();
  for (let i = 0; i < 400 && tfAnswers5.size < 2; i++) {
    const q = gen('g5_reason', 0);
    if (q.meta.reasoning === 'tf') {
      tfAnswers5.add(q.answer);
      if (q.answer === 1) assert.strictEqual(q.meta.shown, q.meta.prod, `true statement must show the real product: ${q.prompt}`);
    }
  }
  assert.deepStrictEqual([...tfAnswers5].sort(), [0, 1], 'g5 T/F questions must mix true and false');
}

console.log('smoke-grade-bands: Task 4 OK');
