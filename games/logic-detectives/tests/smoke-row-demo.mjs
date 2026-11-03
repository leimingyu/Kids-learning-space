import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
for (const file of ['engine.js', 'table-guide.js']) vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
const E = context.window.LogicDetectivesEngine, G = context.window.LogicDetectivesTableGuide;
const plain = value => JSON.parse(JSON.stringify(value));
const table = (rows, cols, blanks) => ({ type: 'table', rows, cols, blanks });
const keys = examples => plain(examples.map(example => example.totalKey));

// Select the row with the most complete printed examples, never combine rows.
// Original table order matters: an unordered header list is not numerically sorted.
const most = table([9, 6, 12], [7, 3, 4], ['v0_1', 'v2_2']);
assert.deepEqual(keys(G.getRowExamples(most)), ['v1_0', 'v1_1', 'v1_2']);
assert.deepEqual(plain(G.getRowExamples(most).map(example => example.col)), [0, 1, 2]);
assert(G.getRowExamples(most).every(example => example.rowKey === 'r1'));

// Ties are stable and choose the earliest printed row. A single example is
// a safe fallback when the rest of the row cannot be explained without spoilers.
assert.deepEqual(keys(G.getRowExamples(table([9, 6], [3, 4, 7], ['v0_2', 'v1_2']))), ['v0_0', 'v0_1']);
const single = table([9, 6], [3, 4], ['c1', 'r1']);
assert.deepEqual(keys(G.getRowExamples(single)), ['v0_0']);
assert.deepEqual(keys(G.getRowExamples(single, { c1: '4', r1: '6' })), ['v0_0'], 'Typed answers cannot become worked examples');

// Missing headers exclude all dependent cells; missing totals exclude just
// that cell. No hidden operands are rendered, even when they are known internally.
const unknown = table([91], [82], ['r0', 'c0', 'v0_0']);
assert.deepEqual(plain(G.getRowExamples(unknown)), []);
assert.deepEqual(plain(G.getRowExamples(table([9], [3], ['v0_0']))), []);
assert.deepEqual(plain(G.getRowExamples(table([9], [3], ['r0']))), []);
assert.deepEqual(plain(G.getRowExamples(table([9], [3], ['c0']))), []);
assert.deepEqual(plain(G.getRowExamples({ type: 'pattern' })), []);
assert.deepEqual(plain(G.getRowExamples(null)), []);
assert.deepEqual(plain(G.getRowExamples(table([NaN], [4], []))), []);
assert.deepEqual(plain(G.getRowExamples(table([9], [Infinity], []))), []);
assert.deepEqual(plain(G.getRowExamples(table([Number.MAX_VALUE], [Number.MAX_VALUE], []))), []);

const tables = E.puzzles.filter(p => p.type === 'table');
assert.equal(tables.length, 20);
let singleCount = 0;
for (const p of tables) {
  const before = JSON.stringify(p), examples = G.getRowExamples(p);
  assert(examples.length > 0, p.id + ' has at least one printed demonstration');
  if (examples.length === 1) singleCount++;
  assert.equal(new Set(examples.map(example => example.row)).size, 1, p.id + ' keeps one row start');
  assert(examples.every((example, index) => index === 0 || example.col > examples[index - 1].col), p.id + ' follows original column order');
  const counts = p.rows.map((_, row) => p.cols.filter((_, col) => !p.blanks.includes('r' + row) && !p.blanks.includes('c' + col) && !p.blanks.includes(`v${row}_${col}`)).length);
  assert.equal(examples.length, Math.max(...counts), p.id + ' chooses the fullest printed row');
  assert.equal(examples[0].row, counts.indexOf(Math.max(...counts)), p.id + ' deterministic tie break');
  for (const example of examples) {
    assert(example.keys.every(key => !p.blanks.includes(key)), p.id + ' cannot reveal a question blank');
    const terms = G.describe(p, example.totalKey).terms;
    assert(terms.every(term => term.value !== '' && !p.blanks.includes(term.key)));
    assert.equal(Number(terms[0].value) + Number(terms[1].value), Number(terms[2].value));
    assert.equal(Number(terms[0].value), p.rows[examples[0].row], p.id + ' every calculation restarts at the same start');
  }
  assert.deepEqual(plain(examples), plain(G.getRowExamples(p)), 'Repeated lookup is deterministic');
  assert.equal(JSON.stringify(p), before, 'Lookup leaves puzzle data unchanged');
  examples[0].keys.push('local-only');
  assert(!G.getRowExamples(p)[0].keys.includes('local-only'), 'Each lookup returns fresh relation data');
}
console.log(`Logic Detectives row demonstration: ${tables.length} tables, safe same-row printed examples, original order, no blank reveals, ${singleCount} single-example fallbacks passed.`);
