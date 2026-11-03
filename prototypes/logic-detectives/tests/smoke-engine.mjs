import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../engine.js', import.meta.url), 'utf8'), context);
const engine = context.window.LogicDetectivesEngine;
const plain = value => JSON.parse(JSON.stringify(value));
const copy = value => plain(value);
assert.equal(engine.puzzles.length, 8);
assert.equal(new Set(engine.puzzles.map(puzzle => puzzle.id)).size, 8);
for (const grade of [2,3]) {
  const puzzles = engine.puzzles.filter(puzzle => puzzle.grade === grade);
  assert.equal(puzzles.length, 4);
  assert.deepEqual(plain(puzzles.map(puzzle => puzzle.type)), ['pattern','pattern','table','sticks']);
}

for (const puzzle of engine.puzzles) {
  assert.ok(puzzle.scene && puzzle.instruction && puzzle.explanation);
  assert.equal(puzzle.hints.length, 3);
  assert.equal(puzzle.reasonOptions.filter(option => option.correct).length, 1);
  if (puzzle.type === 'pattern') {
    const answer = Object.fromEntries(puzzle.blanks.map(index => [index, copy(puzzle.cells[index])]));
    assert.equal(engine.validatePattern(puzzle, answer).correct, true, puzzle.id);
    assert.equal(engine.validatePattern(puzzle, {}).missing, true);
    // Independently enumerate every feature candidate. Enforce the actual
    // row/column constraints directly rather than trusting the validator.
    const features = puzzle.kind === 'shapes' ? ['outer','inner','fill'] : ['outer','fill'];
    const domains = { outer: puzzle.kind === 'shapes' ? ['circle','triangle','square'] : ['rectangle','notch','pennant'], inner: ['circle','triangle','square'], fill: ['empty','stripe','solid'] };
    for (const property of features) {
      let solutions = 0;
      function visit(position, values) {
        if (position < puzzle.blanks.length) {
          for (const candidate of domains[property]) visit(position + 1, [...values,candidate]);
          return;
        }
        const all = puzzle.cells.map(cell => cell[property]);
        puzzle.blanks.forEach((index, offset) => { all[index] = values[offset]; });
        for (let line = 0; line < 3; line++) {
          if (new Set(all.slice(line * 3,line * 3 + 3)).size !== 3) return;
          if (new Set([all[line],all[line + 3],all[line + 6]]).size !== 3) return;
        }
        solutions++;
      }
      visit(0, []);
      assert.equal(solutions, 1, `${puzzle.id}: unique ${property}`);
    }
    answer[puzzle.blanks[0]].fill = engine.FILLS.find(fill => fill !== puzzle.cells[puzzle.blanks[0]].fill);
    assert.equal(engine.validatePattern(puzzle, answer).correct, false, 'Reject repeated filling');
  }
  if (puzzle.type === 'table') {
    const answers = Object.fromEntries(puzzle.blanks.map(key => [key, engine.tableAnswer(puzzle, key)]));
    assert.equal(engine.validateTable(puzzle, answers).correct, true, puzzle.id);
    assert.equal(engine.validateTable(puzzle, {}).missing, true);
    for (const key of puzzle.blanks) assert.equal(engine.validateTable(puzzle, { ...answers, [key]: Number(answers[key]) + 1 }).correct, false);
    assert.equal(engine.validateTable(puzzle, { ...answers, [puzzle.blanks[0]]: '2+2' }).correct, false);
    // Independently enumerate all hidden headers in the intended number
    // range. Every revealed total constrains its row+column pair.
    const hiddenHeaders = puzzle.blanks.filter(key => /^[rc]/.test(key));
    let solutions = 0;
    const found = [];
    function visit(index, values) {
      if (index < hiddenHeaders.length) {
        for (let value = 0; value <= 100; value++) visit(index + 1, { ...values, [hiddenHeaders[index]]: value });
        return;
      }
      for (let row = 0; row < puzzle.rows.length; row++) for (let column = 0; column < puzzle.cols.length; column++) {
        if (puzzle.blanks.includes(`v${row}_${column}`)) continue;
        const side = Object.hasOwn(values, `r${row}`) ? values[`r${row}`] : puzzle.rows[row];
        const top = Object.hasOwn(values, `c${column}`) ? values[`c${column}`] : puzzle.cols[column];
        if (side + top !== puzzle.rows[row] + puzzle.cols[column]) return;
      }
      solutions++;
      found.push(values);
    }
    visit(0, {});
    assert.equal(solutions, 1, `${puzzle.id}: unique headers`);
    for (const key of hiddenHeaders) assert.equal(found[0][key], engine.tableAnswer(puzzle, key));
  }
  if (puzzle.type === 'sticks') {
    const initial = engine.makeStickState(puzzle);
    assert.equal(engine.evaluateSticks(puzzle, initial).missing, true);
    const solutions = engine.getStickSolutions(puzzle);
    assert.ok(solutions.length > 0, `${puzzle.id}: solvable`);
    for (const solution of solutions) {
      assert.equal(engine.evaluateSticks(puzzle, solution).correct, true);
      const originalCount = initial.reduce((sum,segments) => sum + segments.length, 0);
      const newCount = solution.reduce((sum,segments) => sum + segments.length, 0);
      assert.equal(newCount, originalCount - (puzzle.action === 'remove' ? 1 : 0));
    }
    const modifiedEquals = copy(initial);
    modifiedEquals[puzzle.symbols.indexOf('=')].pop();
    assert.equal(engine.evaluateSticks(puzzle, modifiedEquals).correct, false);
    const duplicate = copy(solutions[0]);
    duplicate[0].push(duplicate[0][0]);
    assert.equal(engine.evaluateSticks(puzzle, duplicate).correct, false);
    if (puzzle.grade === 3) {
      const equations = solutions.map(state => engine.evaluateSticks(puzzle,state).equation);
      assert.ok(equations.includes('0 + 4 = 4'));
      assert.ok(equations.includes('8 − 4 = 4'));
      assert.equal(solutions.length, 2);
    }
    if (puzzle.grade === 2) assert.equal(solutions.length, 1);
  }
}

assert.equal(engine.evaluateSticks(engine.puzzles.find(p => p.type === 'sticks'), []).correct, false);
console.log('Logic Detectives engine: 8 curated puzzles, unique grids/tables, and all legal one-stick solutions passed.');
