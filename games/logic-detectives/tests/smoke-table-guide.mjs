import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({window:{}});
for(const file of ['engine.js','table-guide.js'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
const E=context.window.LogicDetectivesEngine,G=context.window.LogicDetectivesTableGuide;
const plain=value=>JSON.parse(JSON.stringify(value));
const puzzle=(rows,cols,blanks)=>({type:'table',operation:'+',rows,cols,blanks});

// A missing total follows its two printed inputs; a missing header is an
// unknown addend, rather than an incorrect instruction to add to the total.
const pictured=puzzle([9,6],[7,11,14],['c1','v1_2']);
assert.deepEqual(plain(G.chooseRelation(pictured,'c1').keys),['r0','c1','v0_1']);
assert.equal(G.describe(pictured,'c1').prompt,'9 + what number makes 20?');
assert.deepEqual(plain(G.describe(pictured,'c1').terms.map(t=>t.value)),['9','','20']);
assert.deepEqual(plain(G.describe(pictured,'v1_2').terms.map(t=>t.value)),['6','14','']);
assert.equal(G.describe(pictured,'v1_2').prompt,'Add 6 and 14. Type the total in the outlined box.');
const missingRow=puzzle([12,17],[4,9,18],['r1','v0_2']);
assert.equal(G.describe(missingRow,'r1').prompt,'What number + 4 makes 21?');

// Linked blanks prefer a printed total and identify the necessary label.
const linked=puzzle([19,27],[12,18,25],['r0','c0','v1_0']);
assert.deepEqual(plain(G.chooseRelation(linked,'c0').keys),['r0','c0','v0_0']);
assert.deepEqual(plain(G.describe(linked,'c0').prerequisites),['r0']);
assert.match(G.describe(linked,'c0').prompt,/starting number on the left/);
assert.deepEqual(plain(G.describe(linked,'c0',{r0:'19'}).prerequisites),[]);
assert.equal(G.describe(linked,'c0',{r0:'19'}).prompt,'19 + what number makes 31?');
assert.deepEqual(plain(G.chooseRelation(linked,'c0')),plain(G.describe(linked,'c0',{r0:'19'}).relation),'Typing cannot silently change the chosen computation path');
assert.deepEqual(plain(G.describe(linked,'v1_0').prerequisites),['c0']);

// Empty or invalid child entries cannot expose the authored value; a typed
// incorrect value is represented honestly without grading it during typing.
assert.equal(G.describe(pictured,'c1',{c1:'<img>'}).terms[1].value,'');
assert.equal(G.describe(pictured,'c1',{c1:'12'}).terms[1].value,'12');
const allMissing=puzzle([91],[82],['r0','c0','v0_0']);
for(const key of allMissing.blanks){
  const guide=G.describe(allMissing,key);
  assert(guide.terms.every(term=>term.value===''));
  assert(!/91|82|173/.test(guide.prompt),'No missing value may appear in prompt text');
}
assert.equal(G.getExample(allMissing),null);
assert.equal(G.chooseRelation(pictured,'r9'),null);
assert.equal(G.chooseRelation(pictured,'c3'),null);
assert.equal(G.chooseRelation(pictured,'v0_8'),null);
assert.equal(G.describe(pictured,'unknown'),null);
assert.equal(G.getExample({type:'pattern'}),null);

// Every bank table offers a fully printed worked example. Every guide uses
// exactly one relation, the fewest missing prerequisites, and only visible data.
const tables=E.puzzles.filter(p=>p.type==='table');
assert.equal(tables.length,20);
for(const p of tables){
  const example=G.getExample(p);
  assert(example,p.id+' has a complete example');
  assert(example.keys.every(key=>!p.blanks.includes(key)));
  const exampleTerms=G.describe(p,example.totalKey).terms;
  assert.equal(Number(exampleTerms[0].value)+Number(exampleTerms[1].value),Number(exampleTerms[2].value));
  for(const key of p.blanks){
    const guide=G.describe(p,key);
    assert(guide,p.id+' '+key);
    assert(guide.relation.keys.includes(key));
    assert.equal(guide.terms.length,3);
    assert.equal(guide.terms.filter(t=>t.selected).length,1);
    for(const term of guide.terms){
      if(p.blanks.includes(term.key))assert.equal(term.value,'',p.id+' does not leak '+term.key);
      else assert.equal(Number(term.value),E.tableAnswer(p,term.key));
    }
    const {row,col}=guide.relation;
    const candidateKeys=key[0]==='r'?p.cols.map((_,c)=>['r'+row,'c'+c,`v${row}_${c}`]):key[0]==='c'?p.rows.map((_,r)=>['r'+r,'c'+col,`v${r}_${col}`]):[guide.relation.keys];
    const minimum=Math.min(...candidateKeys.map(keys=>keys.filter(k=>k!==key&&p.blanks.includes(k)).length));
    assert.equal(guide.prerequisites.length,minimum,p.id+' chooses the least dependent relation');
    assert.deepEqual(plain(G.describe(p,key)),plain(G.describe(p,key)),'Guide is deterministic');
  }
}
console.log('Logic Detectives table guidance: 20 tables, visible-only paths, unknown addends, linked prerequisites, and printed examples passed.');
