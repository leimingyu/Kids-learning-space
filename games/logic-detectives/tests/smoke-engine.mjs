import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../engine.js',import.meta.url),'utf8');
function load(){const context=vm.createContext({window:{}});vm.runInContext(source,context);return context.window.LogicDetectivesEngine;}
const E=load(), plain=value=>JSON.parse(JSON.stringify(value)), clone=plain;
assert.equal(E.puzzles.length,60);assert.equal(E.cases.length,12);
assert.equal(new Set(E.puzzles.map(p=>p.id)).size,60);
assert.equal(new Set(E.cases.map(c=>c.id)).size,12);
assert.deepEqual(plain(E.puzzles),plain(load().puzzles),'The complete bank is deterministic');
assert.ok(Object.isFrozen(E.puzzles));
const signatures=new Set();
for(const grade of [2,3]){
  const puzzles=E.puzzles.filter(p=>p.grade===grade),cases=E.cases.filter(c=>c.grade===grade);
  assert.equal(puzzles.length,30);assert.equal(cases.length,6);
  for(const type of ['pattern','table','sticks'])assert.equal(puzzles.filter(p=>p.type===type).length,10);
  for(const kind of ['shapes','flags'])assert.equal(puzzles.filter(p=>p.kind===kind).length,5);
  for(const [index,c]of cases.entries()){
    assert.equal(c.id,`g${grade}-case-${index+1}`);assert.equal(c.number,index+1);
    assert.equal(c.puzzleIds.length,5);assert.ok(c.title&&c.scene&&c.finish);
    const members=c.puzzleIds.map(id=>puzzles.find(p=>p.id===id));
    assert.equal(new Set(members.map(p=>p.type)).size,3);
    members.forEach(p=>{assert.equal(p.caseId,c.id);assert.equal(p.difficulty,c.number);});
  }
}

// These tests solve the actual constraints independently of the game's validators.
function countFeatureSolutions(p,property){
  const domain=property==='fill'?['empty','stripe','solid']:property==='outer'&&p.kind==='flags'?['rectangle','notch','pennant']:['circle','triangle','square'];
  const values=p.cells.map(cell=>cell[property]);let solutions=0;
  function visit(position){
    if(position<p.blanks.length){for(const value of domain){values[p.blanks[position]]=value;visit(position+1);}return;}
    for(let line=0;line<3;line++){
      if(new Set(values.slice(line*3,line*3+3)).size!==3)return;
      if(new Set([values[line],values[line+3],values[line+6]]).size!==3)return;
    }
    solutions++;
  }
  visit(0);return solutions;
}
function independentlySolveTable(p){
  const known={}, allKeys=[];
  p.rows.forEach((value,i)=>{const key='r'+i;allKeys.push(key);if(!p.blanks.includes(key))known[key]=value;});
  p.cols.forEach((value,i)=>{const key='c'+i;allKeys.push(key);if(!p.blanks.includes(key))known[key]=value;});
  // A connected component with at least one known header has a unique value
  // at every vertex. Each visible total is an edge: row + column = total.
  let changed=true;
  while(changed){changed=false;
    for(let r=0;r<p.rows.length;r++)for(let c=0;c<p.cols.length;c++){
      if(p.blanks.includes(`v${r}_${c}`))continue;
      const row='r'+r,col='c'+c,total=p.rows[r]+p.cols[c];
      if(known[row]!==undefined&&known[col]===undefined){known[col]=total-known[row];changed=true;}
      if(known[col]!==undefined&&known[row]===undefined){known[row]=total-known[col];changed=true;}
      if(known[row]!==undefined&&known[col]!==undefined)assert.equal(known[row]+known[col],total);
    }
  }
  for(const key of allKeys)assert.notEqual(known[key],undefined,`${p.id}: every missing header is anchored, so no free variable remains`);
  return known;
}
const independentSegments={0:'ab cdef'.replaceAll(' ',''),1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg','+':'hv','-':'h','=':'xy'};
const mask=segments=>[...segments].sort().join('');
const ownDigits=new Map(Object.entries(independentSegments).filter(([symbol])=>/^\d$/.test(symbol)).map(([symbol,segments])=>[mask(segments),symbol]));
function ownInitial(p){return p.symbols.map(symbol=>[...independentSegments[symbol==='='?'=':symbol]].map(s=>s==='x'?'h1':s==='y'?'h2':s));}
function ownDomain(symbol){return /^\d$/.test(symbol)?[...'abcdefg']:symbol==='='?['h1','h2']:['h','v'];}
function ownTrueEquation(p,state){
  if(state.length!==p.symbols.length)return false;let text='';
  for(let i=0;i<state.length;i++){
    const segments=state[i];if(new Set(segments).size!==segments.length||segments.some(s=>!ownDomain(p.symbols[i]).includes(s)))return false;
    const bits=mask(segments),original=p.symbols[i];
    const digit=/^\d$/.test(original)?ownDigits.get(bits):original==='='?(bits==='h1h2'?'=':undefined):bits==='h'?'-':bits==='hv'?'+':undefined;
    if(digit===undefined)return false;text+=digit;
  }
  const match=text.match(/^(0|[1-9]\d*)([+-])(0|[1-9]\d*)=(0|[1-9]\d*)$/);if(!match)return false;
  return (match[2]==='+'?Number(match[1])+Number(match[3]):Number(match[1])-Number(match[3]))===Number(match[4]);
}
function allStickEdits(p){
  const initial=ownInitial(p),edits=[];
  for(let source=0;source<initial.length;source++)if(p.symbols[source]!=='=')for(const segment of initial[source]){
    const removed=clone(initial);removed[source]=removed[source].filter(s=>s!==segment);
    if(p.action==='remove')edits.push(removed);
    else for(let target=0;target<removed.length;target++)if(p.symbols[target]!=='=')for(const destination of ownDomain(p.symbols[target])){
      if(removed[target].includes(destination)||(target===source&&destination===segment))continue;
      const moved=clone(removed);moved[target].push(destination);edits.push(moved);
    }
  }
  return edits;
}
let checkedEdits=0,multipleSolutionPuzzles=0;
for(const p of E.puzzles){
  assert.ok(p.title&&p.scene&&p.instruction&&p.explanation&&p.explanationShort,p.id);
  assert.equal(p.hints.length,3);assert.equal(new Set(p.hints).size,3);
  assert.ok(p.hints.every(h=>typeof h==='string'&&h.length>10));
  let signature;
  if(p.type==='pattern'){
    assert.equal(p.cells.length,9);assert.equal(new Set(p.blanks).size,p.blanks.length);
    assert.ok(p.blanks.length>0&&p.blanks.length<=4);
    const properties=p.kind==='shapes'?['outer','inner','fill']:['outer','fill'];
    for(const property of properties)assert.equal(countFeatureSolutions(p,property),1,`${p.id}: unique ${property}`);
    const answers=Object.fromEntries(p.blanks.map(i=>[i,clone(p.cells[i])]));
    assert.equal(E.validatePattern(p,answers).correct,true,p.id);assert.equal(E.validatePattern(p,{}).missing,true);
    const wrong=clone(answers);wrong[p.blanks[0]].fill=E.FILLS.find(fill=>fill!==wrong[p.blanks[0]].fill);
    assert.equal(E.validatePattern(p,wrong).correct,false);
    wrong[p.blanks[0]].fill='rainbow';assert.equal(E.validatePattern(p,wrong).correct,false);
    if(p.grade===2)assert.equal(p.inputMode,p.difficulty<=2?'choose':'build');else assert.equal(p.inputMode,'build');
    assert.ok(p.visualTrace.patternIndices.includes(p.blanks[0]));
    signature=JSON.stringify({type:p.type,kind:p.kind,cells:p.cells,blanks:p.blanks});
  }else if(p.type==='table'){
    const known=independentlySolveTable(p);
    for(const [key,value]of Object.entries(known))assert.equal(value,E.tableAnswer(p,key));
    const answers={};
    for(const key of p.blanks){
      assert.match(key,/^(?:[rc]\d+|v\d+_\d+)$/);const value=E.tableAnswer(p,key);
      assert.ok(Number.isSafeInteger(value)&&value>=0);answers[key]=String(value);
    }
    assert.equal(new Set(p.blanks).size,p.blanks.length);
    assert.equal(E.validateTable(p,answers).correct,true,p.id);assert.equal(E.validateTable(p,{}).missing,true);
    for(const key of p.blanks)assert.equal(E.validateTable(p,{...answers,[key]:Number(answers[key])+1}).correct,false);
    for(const bad of ['2+2','-1','3.5','Infinity'])assert.equal(E.validateTable(p,{...answers,[p.blanks[0]]:bad}).correct,false);
    for(const r of p.rows)for(const c of p.cols){assert.ok(Number.isSafeInteger(r)&&r>=0);assert.ok(Number.isSafeInteger(c)&&c>=0);assert.ok(r+c<=(p.grade===2?100:200));}
    assert.equal(p.solutionSteps.length,p.blanks.length);
    for(const step of p.solutionSteps){const m=step.equation.match(/^(\d+) ([+−]) (\d+) = (\d+)$/);assert.ok(m);assert.equal(m[2]==='+'?Number(m[1])+Number(m[3]):Number(m[1])-Number(m[3]),Number(m[4]));}
    assert.ok(p.visualTrace.tableKeys.every(key=>Number.isFinite(E.tableAnswer(p,key))));
    signature=JSON.stringify({type:p.type,rows:p.rows,cols:p.cols,blanks:p.blanks});
  }else{
    const initial=ownInitial(p),solutions=E.getStickSolutions(p);
    assert.equal(ownTrueEquation(p,initial),false,`${p.id}: the initial equation must need repair`);
    assert.equal(E.evaluateSticks(p,initial).missing,true);assert.ok(solutions.length>0,p.id);
    const expected=new Set(),stateKey=state=>state.map(mask).join('|');
    for(const edit of allStickEdits(p)){
      const valid=ownTrueEquation(p,edit);assert.equal(E.evaluateSticks(p,edit).correct,valid,`${p.id}: independently grade every legal edit`);
      if(valid)expected.add(stateKey(edit));checkedEdits++;
    }
    assert.deepEqual([...new Set(solutions.map(stateKey))].sort(),[...expected].sort(),`${p.id}: accept every valid alternative`);
    assert.equal(solutions.length,p.solutionCount);if(solutions.length>1)multipleSolutionPuzzles++;
    for(const solution of solutions){
      const changed=clone(solution),eq=p.symbols.indexOf('=');changed[eq].pop();assert.equal(E.evaluateSticks(p,changed).correct,false);
      const duplicate=clone(solution);duplicate[0].push(duplicate[0][0]);assert.equal(E.evaluateSticks(p,duplicate).correct,false);
      const extra=clone(solution);const addedIndex=extra.findIndex((segments,i)=>p.symbols[i]!=='='&&ownDomain(p.symbols[i]).some(s=>!segments.includes(s)));
      extra[addedIndex].push(ownDomain(p.symbols[addedIndex]).find(s=>!extra[addedIndex].includes(s)));assert.equal(E.evaluateSticks(p,extra).correct,false);
    }
    signature=JSON.stringify({type:p.type,action:p.action,symbols:p.symbols});
  }
  assert.ok(!signatures.has(signature),`${p.id}: no duplicate question signature`);signatures.add(signature);
}
assert.ok(multipleSolutionPuzzles>=4,'Keep several deliberately open-ended stick challenges');
const g2Patterns=E.puzzles.filter(p=>p.grade===2&&p.type==='pattern'),g3Patterns=E.puzzles.filter(p=>p.grade===3&&p.type==='pattern');
assert.equal(g2Patterns[0].blanks.length,1);assert.equal(g2Patterns.at(-1).blanks.length,2);
assert.equal(g3Patterns[0].blanks.length,2);assert.equal(g3Patterns.at(-1).blanks.length,4);
assert.equal(E.evaluateSticks(E.puzzles.find(p=>p.type==='sticks'),[]).correct,false);
console.log(`Logic Detectives: 60 unique puzzles, 12 balanced cases, unique grid/table completions, and ${checkedEdits} independently checked stick edits passed.`);
