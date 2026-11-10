import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../engine.js',import.meta.url),'utf8');
function load() { const context = vm.createContext({window:{}}); vm.runInContext(source,context); return context.window.LogicDetectivesEngine; }
const E = load(), plain = value => JSON.parse(JSON.stringify(value));
assert.equal(E.puzzles.length,60,'Original cases keep their 60 puzzles');
assert.equal(E.cases.length,12);
assert.deepEqual(plain(E.concepts),[
  {type:'magic',title:'Magic Square Lab'},
  {type:'parentheses',title:'Parentheses Workshop'},
  {type:'rule',title:'Rule Detective'}
]);
assert.equal(E.conceptPuzzles.length,36);
assert.equal(new Set([...E.puzzles,...E.conceptPuzzles].map(p => p.id)).size,96,'Concept IDs never collide with legacy case IDs');
assert.deepEqual(plain(E.conceptPuzzles),plain(load().conceptPuzzles),'Content is deterministic');
assert.ok(Object.isFrozen(E) && Object.isFrozen(E.conceptPuzzles) && Object.isFrozen(E.concepts));

const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const apply = (a,sign,b) => sign === '+' ? a+b : a-b;
const correctAnswers = p => Object.fromEntries(p.blanks.map(key => [key,String(E.conceptAnswer(p,key))]));
const validate = (p,answers) => ({magic:E.validateMagic,parentheses:E.validateParentheses,rule:E.validateRule})[p.type](p,answers);

// A full-rank linear system proves uniqueness over ALL real numbers, and
// therefore over nonnegative integers too. No unstated 1–9 number bank or
// enumeration limit can accidentally make an ambiguous square seem unique.
function rank(rows) {
  const matrix = rows.map(row => [...row]);
  let pivotRow = 0;
  for (let column = 0; column < matrix[0].length && pivotRow < matrix.length; column++) {
    const pivot = matrix.findIndex((row,index) => index >= pivotRow && Math.abs(row[column]) > 1e-9);
    if (pivot < 0) continue;
    [matrix[pivotRow],matrix[pivot]] = [matrix[pivot],matrix[pivotRow]];
    const divisor = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map(value => value/divisor);
    for (let index = 0; index < matrix.length; index++) if (index !== pivotRow) {
      const factor = matrix[index][column];
      matrix[index] = matrix[index].map((value,position) => value-factor*matrix[pivotRow][position]);
    }
    pivotRow++;
  }
  return pivotRow;
}
function uniqueMagicCompletion(p) {
  // Unknowns are the 9 cells plus the magic sum; printed clues add equations.
  const equations = lines.map(line => {
    const row = Array(11).fill(0);
    for (const position of line) row[position] = 1;
    row[9] = -1;
    return row;
  });
  p.cells.forEach((value,index) => {
    if (p.blanks.includes('m'+index)) return;
    const row = Array(11).fill(0); row[index] = 1; row[10] = value; equations.push(row);
  });
  if (!p.blanks.includes('sum')) { const row = Array(11).fill(0); row[9] = 1; row[10] = p.magicSum; equations.push(row); }
  assert.equal(rank(equations.map(row => row.slice(0,10))),10,`${p.id}: printed clues determine all 10 unknowns`);
  assert.equal(rank(equations),10,`${p.id}: every equation agrees with the same completion`);
}

const signatures = new Set(), signPatterns = new Map(), positions = new Set();
let inverseCount = 0, sumDiscoveryCount = 0;
for (const type of ['magic','parentheses','rule']) {
  const members = E.conceptPuzzles.filter(p => p.type === type);
  assert.equal(members.length,12);
  for (const stage of ['discover','connect','challenge']) assert.equal(members.filter(p => p.conceptStage === stage).length,4);
}
for (const p of E.conceptPuzzles) {
  assert.equal(p.grade,3);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.blanks),p.id);
  assert.ok(p.title && p.scene && p.rule && p.instruction && p.explanationShort && p.explanation,p.id);
  assert.equal(p.hints.length,3); assert.equal(new Set(p.hints).size,3);
  assert.ok(p.hints.every(hint => typeof hint === 'string' && hint.length > 10));
  assert.ok(p.blanks.length && p.blanks.every(key => typeof key === 'string'));
  assert.equal(new Set(p.blanks).size,p.blanks.length);
  const answers = correctAnswers(p);
  assert.equal(validate(p,answers).correct,true,p.id);
  assert.equal(validate(p,{}).missing,true,`${p.id}: incomplete is neutral`);
  assert.equal(validate(p,null).missing,true);
  if (p.blanks.length > 1) {
    const incompleteWithTypo = {...answers,[p.blanks[0]]:'not an answer'};
    delete incompleteWithTypo[p.blanks.at(-1)];
    assert.equal(validate(p,incompleteWithTypo).missing,true,`${p.id}: any missing field keeps the whole submission neutral`);
  }
  for (const key of p.blanks) {
    assert.notEqual(E.conceptAnswer(p,key),undefined,`${p.id}: ${key} has an answer`);
    const incomplete = {...answers}; delete incomplete[key];
    assert.equal(validate(p,incomplete).missing,true,`${p.id}: ${key} cannot be omitted`);
    assert.equal(validate(p,{...answers,[key]:'   '}).missing,true);
    assert.equal(validate(p,{...answers,[key]:null}).missing,true);
    const wrong = key === 'sign' ? (answers[key] === '+' ? '-' : '+') : String(Number(answers[key])+1);
    const result = validate(p,{...answers,[key]:wrong});
    assert.equal(result.correct,false,`${p.id}: wrong ${key} is rejected`);
    assert.equal(result.missing,false,`${p.id}: a complete wrong answer is not missing`);
    if (key === 'sign') {
      assert.equal(validate(p,{...answers,sign:'?'}).missing,true);
      for (const malformed of ['×','plus',0,{},['+']]) assert.equal(validate(p,{...answers,sign:malformed}).correct,false);
      if (answers.sign === '-') assert.equal(validate(p,{...answers,sign:'−'}).correct,true);
    } else {
      for (const malformed of [0,Number(answers[key]),true,{},[],['1'],'2+2','-1','1.5','1e2','Infinity','NaN','9007199254740992']) {
        const bad = validate(p,{...answers,[key]:malformed});
        assert.equal(bad.correct,false,`${p.id}: malformed ${key} ${JSON.stringify(malformed)}`);
        assert.equal(bad.missing,false);
      }
    }
  }

  let signature;
  if (p.type === 'magic') {
    assert.equal(p.cells.length,9);
    assert.ok(p.cells.every(value => Number.isSafeInteger(value) && value >= 0));
    for (const line of lines) assert.equal(line.reduce((sum,index) => sum+p.cells[index],0),p.magicSum);
    assert.ok(p.blanks.every(key => key === 'sum' || /^m[0-8]$/.test(key)));
    uniqueMagicCompletion(p);
    assert.equal(p.solutionSteps.length,p.blanks.length,`${p.id}: hints give a complete sequence of deductions`);
    assert.deepEqual([...new Set(p.solutionSteps.map(step => step.key))].sort(),[...p.blanks].sort());
    if (p.blanks.includes('sum')) sumDiscoveryCount++;
    signature = JSON.stringify({type:p.type,cells:p.cells,blanks:p.blanks});
  } else if (p.type === 'parentheses') {
    assert.deepEqual(plain(p.blanks),['sign'],'Exactly one sign space keeps the equation clean');
    assert.ok([0,1].includes(p.signIndex)); positions.add(p.signIndex);
    const sourceValue = apply(p.a,p.outer,apply(p.b,p.inner,p.c));
    const expectedSigns = [p.outer,p.outer === '+' ? p.inner : p.inner === '+' ? '-' : '+'];
    assert.deepEqual(plain(p.rewriteSigns),expectedSigns,`${p.id}: independently derive sign changes`);
    assert.equal(apply(apply(p.a,p.rewriteSigns[0],p.b),p.rewriteSigns[1],p.c),sourceValue);
    assert.ok(sourceValue >= 0 && apply(p.b,p.inner,p.c) >= 0);
    const pattern = p.outer+p.inner; signPatterns.set(pattern,(signPatterns.get(pattern) || 0)+1);
    signature = JSON.stringify({type:p.type,a:p.a,b:p.b,c:p.c,outer:p.outer,inner:p.inner,signIndex:p.signIndex});
  } else {
    assert.equal(p.blanks.filter(key => key === 'sign').length,1);
    assert.ok(p.blanks.includes('amount'));
    assert.ok(p.blanks.every(key => ['sign','amount'].includes(key) || /^[xy]\d+$/.test(key)));
    assert.ok(p.ruleAmount > 0 && Number.isSafeInteger(p.ruleAmount));
    assert.ok(p.pairs.length >= 4);
    assert.ok(p.pairs.every(pair => pair.y === apply(pair.x,p.ruleSign,p.ruleAmount)));
    // Two fully printed, different inputs determine one +/-constant rule.
    const printed = p.pairs.filter((_,index) => !p.blanks.includes('x'+index) && !p.blanks.includes('y'+index));
    assert.ok(printed.length >= 2); assert.notEqual(printed[0].x,printed[1].x);
    const change = printed[0].y-printed[0].x;
    assert.notEqual(change,0,'A positive amount avoids +/-zero ambiguity');
    assert.ok(printed.every(pair => pair.y-pair.x === change));
    assert.equal(Math.abs(change),p.ruleAmount); assert.equal(change > 0 ? '+' : '-',p.ruleSign);
    for (const key of p.blanks.filter(key => /^[xy]/.test(key))) {
      const pair = p.pairs[Number(key.slice(1))];
      const solved = key[0] === 'x' ? apply(pair.y,p.ruleSign === '+' ? '-' : '+',p.ruleAmount) : apply(pair.x,p.ruleSign,p.ruleAmount);
      assert.equal(solved,E.conceptAnswer(p,key)); if (key[0] === 'x') inverseCount++;
    }
    signature = JSON.stringify({type:p.type,pairs:p.pairs,blanks:p.blanks});
  }
  assert.ok(!signatures.has(signature),`${p.id}: original question signature`); signatures.add(signature);
}
assert.equal(sumDiscoveryCount,4);
assert.deepEqual([...signPatterns.entries()].sort(),[['++',3],['+-',3],['-+',3],['--',3]]);
assert.equal(positions.size,2,'Practice both positions without adding a second sign selector');
assert.ok(inverseCount >= 8,'Work backward throughout the sequence');
const photoInverse = E.conceptPuzzles.find(p => p.type === 'rule' && p.ruleSign === '-' && p.ruleAmount === 40);
assert.ok(photoInverse);
const inverseKey = photoInverse.blanks.find(key => /^x/.test(key) && photoInverse.pairs[Number(key.slice(1))].y === 340);
assert.ok(inverseKey); assert.equal(E.conceptAnswer(photoInverse,inverseKey),380,'Undo subtraction to recover X');

// Row/column checks alone must not accept a semimagic square. These fixtures
// isolate each diagonal: the other seven lines already have the right sum.
const custom = {type:'magic',cells:Array(9).fill(0),magicSum:15,blanks:Array.from({length:9},(_,i) => 'm'+i)};
const semiMagic = [7,3,5,4,6,5,4,6,5];
assert.ok(lines.slice(0,6).every(line => line.reduce((sum,index) => sum+semiMagic[index],0) === 15));
assert.equal(lines[7].reduce((sum,index) => sum+semiMagic[index],0),15);
let diagonalResult = E.validateMagic(custom,Object.fromEntries(semiMagic.map((value,index) => ['m'+index,String(value)])));
assert.equal(diagonalResult.correct,false); assert.equal(diagonalResult.line.axis,'diagonal'); assert.equal(diagonalResult.line.index,0);
const reflected = [semiMagic[2],semiMagic[1],semiMagic[0],semiMagic[5],semiMagic[4],semiMagic[3],semiMagic[8],semiMagic[7],semiMagic[6]];
diagonalResult = E.validateMagic(custom,Object.fromEntries(reflected.map((value,index) => ['m'+index,String(value)])));
assert.equal(diagonalResult.correct,false); assert.equal(diagonalResult.line.index,1);

// The public rule explicitly allows nonnegative whole numbers, including zero
// and values above 9; a hidden digit bank must never narrow that rule.
const shiftedMagic = [8,1,6,3,5,7,4,9,2].map(value => value*2-2);
assert.equal(E.validateMagic({...custom,magicSum:24},Object.fromEntries(shiftedMagic.map((value,index) => ['m'+index,String(value)]))).correct,true);
for (const method of ['validateMagic','validateParentheses','validateRule']) {
  assert.equal(E[method](null,{}).correct,false);
  assert.equal(E[method]({type:'unknown'},{}).correct,false);
}
assert.equal(E.conceptAnswer(null,'sign'),undefined);
assert.equal(E.conceptAnswer(E.conceptPuzzles[0],'m9'),undefined);
assert.equal(E.conceptAnswer(E.conceptPuzzles[0],'not-a-key'),undefined);
console.log('RSM concepts: 36 deterministic puzzles; globally unique magic completions, all 4 sign patterns, both diagonals, inverse rules, and malformed/incomplete answers passed.');
