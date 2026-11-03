/* Original, deterministic puzzle bank. No network, storage, or UI dependencies. */
(function (root) {
  'use strict';
  const SHAPES = ['circle', 'triangle', 'square'];
  const FLAGS = ['rectangle', 'notch', 'pennant'];
  const FILLS = ['empty', 'stripe', 'solid'];
  const SEGMENTS = Object.freeze({
    '0': ['a','b','c','d','e','f'], '1': ['b','c'], '2': ['a','b','d','e','g'],
    '3': ['a','b','c','d','g'], '4': ['b','c','f','g'], '5': ['a','c','d','f','g'],
    '6': ['a','c','d','e','f','g'], '7': ['a','b','c'], '8': ['a','b','c','d','e','f','g'],
    '9': ['a','b','c','d','f','g'], '+': ['h','v'], '-': ['h'], '=': ['h1','h2']
  });
  const canonical = segments => [...segments].sort().join(',');
  const DIGIT_SYMBOLS = new Map(Object.keys(SEGMENTS).filter(x => /^\d$/.test(x)).map(x => [canonical(SEGMENTS[x]), x]));
  const OP_SYMBOLS = new Map([['h','-'], ['h,v','+']]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const makeStickState = puzzle => puzzle.symbols.map(symbol => [...SEGMENTS[symbol]]);
  const possibleSegments = symbol => /^\d$/.test(symbol) ? ['a','b','c','d','e','f','g'] : symbol === '=' ? ['h1','h2'] : ['h','v'];

  function decodeSticks(puzzle, state) {
    if (!Array.isArray(state) || state.length !== puzzle.symbols.length) return null;
    const result = [];
    for (let index = 0; index < state.length; index++) {
      const active = state[index];
      if (!Array.isArray(active) || new Set(active).size !== active.length || active.some(segment => !possibleSegments(puzzle.symbols[index]).includes(segment))) return null;
      const encoded = canonical(active), original = puzzle.symbols[index];
      const symbol = /^\d$/.test(original) ? DIGIT_SYMBOLS.get(encoded) : original === '=' ? (encoded === 'h1,h2' ? '=' : undefined) : OP_SYMBOLS.get(encoded);
      if (symbol === undefined) return null;
      result.push(symbol);
    }
    return result;
  }
  function equationParts(symbols) {
    // Leading zeroes are not a loophole for multi-digit stick puzzles.
    const matched = symbols.join('').match(/^(0|[1-9]\d*)([+-])(0|[1-9]\d*)=(0|[1-9]\d*)$/);
    if (!matched) return null;
    const a = Number(matched[1]), b = Number(matched[3]), right = Number(matched[4]);
    return { left: matched[2] === '+' ? a + b : a - b, right, equation: `${matched[1]} ${matched[2] === '-' ? '−' : '+'} ${matched[3]} = ${matched[4]}` };
  }
  function evaluateSticks(puzzle, state) {
    if (!puzzle || puzzle.type !== 'sticks') return { correct: false, message: 'Choose a stick puzzle first.', equation: '' };
    const initial = makeStickState(puzzle);
    if (!Array.isArray(state) || state.length !== initial.length || state.some(segments => !Array.isArray(segments))) return { correct: false, message: 'Keep all the equation symbols on the board.', equation: '' };
    let removed = 0, added = 0;
    for (let index = 0; index < initial.length; index++) {
      if (puzzle.symbols[index] === '=' && canonical(initial[index]) !== canonical(state[index])) return { correct: false, message: 'The equals sign stays fixed. Try a digit or the operation sign.', equation: '' };
      removed += initial[index].filter(segment => !state[index].includes(segment)).length;
      added += state[index].filter(segment => !initial[index].includes(segment)).length;
    }
    const decoded = decodeSticks(puzzle, state), parts = decoded ? equationParts(decoded) : null;
    const equation = parts?.equation || '';
    if (removed === 0 && added === 0) return { correct: false, missing: true, message: 'Try a stick change before checking.', equation };
    const legal = puzzle.action === 'remove' ? removed === 1 && added === 0 : removed === 1 && added === 1;
    if (!legal) return { correct: false, message: puzzle.action === 'remove' ? 'Remove exactly one stick. Use Undo to try a different stick.' : 'Move exactly one stick: take one away and place that same stick in an empty position.', equation };
    if (!decoded) return { correct: false, message: 'Every digit and sign must still be recognizable. Try a different stick position.', equation };
    if (!parts) return { correct: false, message: 'Keep a complete equation. A two-digit number cannot start with zero.', equation };
    if (parts.left !== parts.right) return { correct: false, message: `The left side equals ${parts.left}, but the right side equals ${parts.right}. Try another stick change.`, equation };
    return { correct: true, message: `You repaired it: ${equation}. Both sides equal ${parts.right}!`, equation, value: parts.right };
  }
  function getStickSolutions(puzzle) {
    if (!puzzle || puzzle.type !== 'sticks') return [];
    const initial = makeStickState(puzzle), results = [], seen = new Set();
    for (let source = 0; source < initial.length; source++) {
      if (puzzle.symbols[source] === '=') continue;
      for (const segment of initial[source]) {
        const removed = copy(initial);
        removed[source] = removed[source].filter(value => value !== segment);
        const candidates = [];
        if (puzzle.action === 'remove') candidates.push(removed);
        else for (let target = 0; target < removed.length; target++) {
          if (puzzle.symbols[target] === '=') continue;
          for (const destination of possibleSegments(puzzle.symbols[target])) {
            if (removed[target].includes(destination)) continue;
            const moved = copy(removed); moved[target].push(destination); candidates.push(moved);
          }
        }
        for (const candidate of candidates) {
          const key = candidate.map(canonical).join('|');
          if (!seen.has(key) && evaluateSticks(puzzle, candidate).correct) { seen.add(key); results.push(candidate); }
        }
      }
    }
    return results;
  }
  function validatePattern(puzzle, answers) {
    if (!puzzle || puzzle.type !== 'pattern') return { correct: false, message: 'Choose a pattern puzzle first.' };
    const properties = puzzle.kind === 'shapes' ? ['outer','inner','fill'] : ['outer','fill'];
    const cells = puzzle.cells.map((cell, index) => puzzle.blanks.includes(index) ? answers?.[index] : cell);
    const names = { outer: puzzle.kind === 'flags' ? 'flag shape' : 'outside shape', inner: 'inside shape', fill: 'filling' };
    for (const index of puzzle.blanks) for (const property of properties) {
      if (!cells[index]?.[property]) return { correct: false, missing: true, message: `Choose the ${names[property]} for row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}.` };
      const valid = property === 'fill' ? FILLS : property === 'outer' && puzzle.kind === 'flags' ? FLAGS : SHAPES;
      if (!valid.includes(cells[index][property])) return { correct: false, message: `Choose one of the pictured ${names[property]} options.` };
    }
    for (const property of properties) for (let line = 0; line < 3; line++) {
      const row = cells.slice(line * 3, line * 3 + 3).map(cell => cell[property]);
      if (new Set(row).size !== 3) return { correct: false, message: `Row ${line + 1} repeats a ${names[property]}. Each one must appear exactly once.`, line: { axis: 'row', index: line }, property };
      const column = [cells[line], cells[line + 3], cells[line + 6]].map(cell => cell[property]);
      if (new Set(column).size !== 3) return { correct: false, message: `Column ${line + 1} repeats a ${names[property]}. Each one must appear exactly once.`, line: { axis: 'column', index: line }, property };
    }
    return { correct: true, message: 'Every row and column follows the rule. Excellent detective work!' };
  }
  function tableAnswer(puzzle, key) {
    if (!puzzle || puzzle.type !== 'table' || typeof key !== 'string') return undefined;
    let matched = key.match(/^r(\d+)$/); if (matched) return puzzle.rows[Number(matched[1])];
    matched = key.match(/^c(\d+)$/); if (matched) return puzzle.cols[Number(matched[1])];
    matched = key.match(/^v(\d+)_(\d+)$/);
    if (matched) { const row = puzzle.rows[Number(matched[1])], column = puzzle.cols[Number(matched[2])]; return Number.isFinite(row) && Number.isFinite(column) ? row + column : undefined; }
    return undefined;
  }
  function validateTable(puzzle, answers) {
    if (!puzzle || puzzle.type !== 'table') return { correct: false, message: 'Choose a number-table puzzle first.' };
    for (const key of puzzle.blanks) {
      const answer = answers?.[key];
      if (answer === undefined || answer === null || String(answer).trim() === '') return { correct: false, missing: true, key, message: 'Fill every missing number before checking.' };
      if (!/^\d+$/.test(String(answer).trim())) return { correct: false, key, message: 'Use a whole number for each answer.' };
      if (Number(answer) !== tableAnswer(puzzle, key)) return { correct: false, key, message: /^[rc]/.test(key) ? 'Check that missing header. A side number plus a top number equals the inside total. Try working backward.' : 'Check that total. Add its side number and its top number.' };
    }
    return { correct: true, message: 'Every missing number fits its row and column.' };
  }

  // Case order deliberately alternates which family gets the extra puzzle.
  const caseOrders = ['PTSPT','TSPTS','PSTPS','PTSPT','TSPTS','PSTPS'];
  const caseStories = {
    2: [
      ['The Mixed-Up Parade','The parade cart has mixed-up flags and a locked gate. Help Pip get the celebration ready.','The flags are sorted and the gate is open. Let the parade begin!','parade cart'],
      ['The Lantern Library','The library lanterns went out. Follow the shelf clues to bring back their glow.','The lanterns glow and every book is back in place. The library is ready for story time!','library shelf'],
      ['The Garden Gate','The community garden has lost its signs. Restore the clues so everyone can find their plants.','The garden signs are restored and the gate is ready. The gardeners can get growing!','garden shed'],
      ['The Robot Post Office','The delivery robots mixed up their labels. Repair their sorting station before the mail leaves.','The sorting station works! Every robot knows which letters to deliver.','robot sorting station'],
      ['The Riverside Fair','The riverside fair needs its bunting, ticket machine, and entrance locks checked.','The fair is open! Your careful checks helped every stall get ready.','fairground booth'],
      ['The Museum of Missing Clues','The museum is opening a new detective exhibit. Put its final tricky displays back together.','Your detective exhibit is complete. You have earned your place on the museum team!','museum display']
    ],
    3: [
      ['The Clocktower Code','The clocktower workshop has gone quiet. Connect the clues and restart its clever machines.','The clocktower is ticking again. You connected every clue in its workshop!','clocktower workshop'],
      ['The Observatory Signal','The observatory cannot send its evening signal. Rebuild the missing parts of its code.','The signal shines across the town. The observatory team thanks its newest detective!','observatory desk'],
      ['The Railway Riddle','The miniature railway has mixed up its route board. Make its clues agree before the train departs.','The route board is ready and the train can depart. All aboard for careful thinking!','railway office'],
      ['The Inventor’s Secret','An inventor left a trail of unfinished puzzles. Follow it to unlock a surprising new machine.','The invention is awake! You worked backward and tested your ideas to unlock its secret.','inventor’s workbench'],
      ['The Lighthouse Ledger','The lighthouse team lost labels from its supply ledger and signal plan. Help them check every connection.','The ledger is repaired and the lighthouse signal is ready to guide the boats.','lighthouse office'],
      ['The Grand Detective Challenge','Pip has gathered the town’s trickiest clues. Use every detective tool to finish the final case.','You completed the Grand Detective Challenge. Patterns, numbers, and careful checks are your detective tools!','detective headquarters']
    ]
  };
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const blankPlans = {
    2: [[4],[2],[6],[1,7],[0,1],[4,7],[2,5],[3,4],[0,8],[1,4]],
    3: [[3,4],[0,1],[2,5],[0,1,4],[1,2,5],[0,3,4],[0,1,7],[1,2,4,5],[0,1,3,4],[3,4,6,7]]
  };
  const numberPlans = {
    2: [
      [[8,12],[3,7,15],['v0_1','v1_2']], [[14,9],[6,13,20],['v0_0','v1_1']],
      [[9,6],[7,11,14],['c1','v1_2']], [[12,17],[4,9,18],['r1','v0_2']],
      [[16,23],[8,12,19],['c0','v1_0','v0_2']], [[25,18],[7,14,22],['r0','v1_1','v0_2']],
      [[28,35],[9,16,24],['c2','v0_0','v1_2']], [[19,27],[12,18,25],['r0','c0','v1_0']],
      [[24,31,18],[8,17,29],['r1','c2','v1_2','v0_0']], [[37,26,45],[14,23,32],['r0','c1','v1_1','v2_2']]
    ],
    3: [
      [[19,23],[12,18,25],['r0','c0','v1_0','v1_2']], [[16,28],[9,17,31],['r1','c2','v0_2']],
      [[27,34,18],[14,22,35],['r0','c0','v1_0','v2_2']], [[38,24,45],[16,29,33],['r1','c1','v0_1','v2_2']],
      [[46,31,58],[17,26,39],['r0','c2','v1_0','v2_2']], [[64,37,52],[28,19,43],['r1','c0','v1_0','v2_2']],
      [[47,68,35],[24,36,58],['r0','c0','r2','v0_0','v1_2']], [[56,73,42],[27,48,35],['r0','r2','c1','v0_0','v2_1']],
      [[83,57,69],[18,34,46],['r0','c0','c2','v0_2','v2_0']], [[76,49,92],[25,38,57],['r1','r2','c0','v0_1','v1_0','v2_2']]
    ]
  };
  const stickPlans = {
    2: [['remove','9+5=4'],['remove','7+2=3'],['remove','8-3=6'],['remove','9-3=0'],['remove','8-1=5'],['remove','51+3=48'],['move','6+4=4'],['move','9+3=5'],['move','6+1=8'],['move','18+3=15']],
    3: [['remove','38-9=27'],['move','16+4=14'],['move','37+5=32'],['move','25+7=30'],['move','42-3=49'],['move','25+5=28'],['move','29-5=28'],['move','52+8=68'],['move','41+9=56'],['move','27+5=33']]
  };
  const shapeNames = {circle:'circle',triangle:'triangle',square:'square',rectangle:'rectangle flag',notch:'notched flag',pennant:'triangular flag'};
  const fillingNames = {empty:'empty',stripe:'striped',solid:'solid'};
  function describePiece(piece, kind) { return kind === 'flags' ? `${fillingNames[piece.fill]} ${shapeNames[piece.outer]}` : `${shapeNames[piece.outer]} outside with ${piece.fill === 'empty' ? 'an' : 'a'} ${fillingNames[piece.fill]} ${shapeNames[piece.inner]} inside`; }
  function pieceWithArticle(piece, kind) { return `${kind === 'flags' && piece.fill === 'empty' ? 'an' : 'a'} ${describePiece(piece, kind)}`; }
  function cellPosition(index) { return `Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}`; }
  function lineIndices(index) { const r = Math.floor(index / 3), c = index % 3; return [...new Set([r*3,r*3+1,r*3+2,c,c+3,c+6])]; }
  function makePattern(grade, index, caseNumber) {
    const kind = index % 2 ? 'flags' : 'shapes', outside = kind === 'flags' ? FLAGS : SHAPES;
    const rp = permutations[(index + grade) % 6], cp = permutations[(index * 5 + grade + 1) % 6];
    const cells = Array.from({length:9}, (_, position) => {
      const r = rp[Math.floor(position / 3)], c = cp[position % 3];
      const cell = {outer:outside[(r+c+index)%3],fill:FILLS[(r+(index%2 ? 2 : 1)*c+index+grade)%3]};
      if (kind === 'shapes') cell.inner = SHAPES[(r+(caseNumber >= 4 ? 2 : 1)*c+index+1)%3];
      return cell;
    });
    const blanks = [...blankPlans[grade][index]], first = blanks[0], row = Math.floor(first / 3)+1, col = first%3+1;
    return {
      type:'pattern',kind,inputMode:grade===2 && caseNumber<=2?'choose':'build', cells,blanks,
      title:kind==='flags' ? ['Find the missing flag','Restore the signal flags','Sort the bunting','Rebuild the route flags','The final flag board'][Math.floor(index/2)] : ['The missing picture clue','The badge drawer','Rebuild the symbol board','The mixed-up evidence','The final picture code'][Math.floor(index/2)],
      instruction:`${blanks.length===1?'Complete the missing picture':'Build the missing pictures'}. Each row and column needs every ${kind==='flags'?'flag shape and filling':'outside shape, inside shape, and filling'} exactly once.`,
      hints:[
        blanks.length===1 ? `Look at row ${row} and column ${col}. Check one feature at a time.` : 'Find a useful row or column. Compare the shapes and fillings separately; a clue in one direction can help in the other.',
        `${cellPosition(first)} needs a ${shapeNames[cells[first].outer]}${kind==='flags'?'':' outside'}. Check its row and column to find the ${kind==='flags'?'filling':'inside shape and filling'}.`,
        blanks.map(i=>`${cellPosition(i)}: ${pieceWithArticle(cells[i],kind)}.`).join(' ')
      ],
      explanationShort:`Row ${row} and column ${col} need ${pieceWithArticle(cells[first],kind)}.`,
      explanation:blanks.map(i=>`${cellPosition(i)}: ${pieceWithArticle(cells[i],kind)}.`).join(' ')+' Each completed row and column has every feature exactly once.',
      visualTrace:{patternIndices:lineIndices(first)}
    };
  }
  function numberSteps(puzzle) {
    const known = {}, missing = puzzle.blanks.filter(key=>/^[rc]/.test(key)), steps=[];
    puzzle.rows.forEach((n,i)=>{if(!missing.includes('r'+i))known['r'+i]=n;});
    puzzle.cols.forEach((n,i)=>{if(!missing.includes('c'+i))known['c'+i]=n;});
    let progress=true;
    while(progress) {
      progress=false;
      for(const key of missing) {
        if(known[key]!==undefined)continue;
        const isRow=key[0]==='r', n=Number(key.slice(1)), other=isRow?puzzle.cols:puzzle.rows;
        for(let j=0;j<other.length;j++) {
          const opposite=(isRow?'c':'r')+j, totalKey=isRow?`v${n}_${j}`:`v${j}_${n}`;
          if(known[opposite]===undefined || puzzle.blanks.includes(totalKey))continue;
          const total=tableAnswer(puzzle,totalKey), value=total-known[opposite];
          known[key]=value; steps.push({key,equation:`${total} − ${known[opposite]} = ${value}`,clues:[totalKey,opposite,key]}); progress=true;break;
        }
      }
    }
    for(const key of puzzle.blanks.filter(k=>k[0]==='v')) {
      const [r,c]=key.slice(1).split('_').map(Number);
      steps.push({key,equation:`${puzzle.rows[r]} + ${puzzle.cols[c]} = ${tableAnswer(puzzle,key)}`,clues:['r'+r,'c'+c,key]});
    }
    return steps;
  }
  function makeTable(grade,index) {
    const [rows,cols,blanks]=numberPlans[grade][index], p={type:'table',operation:'+',rows:[...rows],cols:[...cols],blanks:[...blanks]};
    const steps=numberSteps(p), first=steps[0], header=/^[rc]/.test(first.key);
    return Object.assign(p,{
      title:['Wake the number machine','The missing labels','Repair the tally board','Find the hidden header','Follow the number trail','The sorting machine','The label puzzle','Connect the number clues','The ledger repair','The final number code'][index],
      instruction:'Fill the missing labels and totals. A side number plus a top number equals the inside total. You choose where to begin.',
      hints:[header?'Look for a missing header with a visible total and another header you know. Work backward.':'Start with a missing total. Find its side number and its top number.',
        `For ${header?'a missing header':'a missing total'}, ${header?'subtract the known header from the total':'add the two headers'}. Try ${first.equation.split(' = ')[0]}.`,
        steps.map(step=>step.equation).join('; ')+'.'],
      explanationShort:(header?'Work backward to find a header: ':'Add the two headers: ')+first.equation+'.',
      explanation:steps.map(step=>step.equation).join('; ')+'. Every inside total equals its side number plus its top number.',
      visualTrace:{tableKeys:first.clues}, solutionSteps:steps
    });
  }
  const segmentNames={a:'top',b:'upper-right',c:'lower-right',d:'bottom',e:'lower-left',f:'upper-left',g:'middle',h:'horizontal',v:'vertical'};
  function symbolLocation(symbols,index) {
    if(symbols[index]==='+' || symbols[index]==='-')return 'operation sign';
    const op=symbols.findIndex(s=>s==='+'||s==='-'), eq=symbols.indexOf('=');
    const start=index<op?0:index<eq?op+1:eq+1, end=index<op?op:index<eq?eq:symbols.length;
    const group=index<op?'first number':index<eq?'second number':'answer';
    if(end-start===1)return group;
    return `${group}'s ${index===end-1?'ones':'tens'} digit`;
  }
  function stickChange(puzzle,solution) {
    const initial=makeStickState(puzzle);let from,to;
    initial.forEach((segments,i)=>{
      const removed=segments.find(s=>!solution[i].includes(s));if(removed)from={i,segment:removed};
      const added=solution[i].find(s=>!segments.includes(s));if(added)to={i,segment:added};
    });
    const location=symbolLocation(puzzle.symbols,from.i);
    if(!to)return `Remove the ${segmentNames[from.segment]} stick from the ${location}.`;
    return from.i===to.i ? `Move the ${segmentNames[from.segment]} stick of the ${location} to its ${segmentNames[to.segment]} space.` : `Move the ${segmentNames[from.segment]} stick from the ${location} to the ${segmentNames[to.segment]} space of the ${symbolLocation(puzzle.symbols,to.i)}.`;
  }
  function makeSticks(grade,index) {
    const [action,text]=stickPlans[grade][index], p={type:'sticks',action,symbols:[...text]}, solutions=getStickSolutions(p);
    if(!solutions.length)throw new Error('Unsolvable stick puzzle: '+text);
    const chosen=solutions[0], equation=evaluateSticks(p,chosen).equation, change=stickChange(p,chosen);
    const source=makeStickState(p).findIndex((segments,i)=>segments.some(s=>!chosen[i].includes(s)));
    return Object.assign(p,{
      title:['The gate lock','The crooked number sign','The lantern switch','The clue-box lock','The bridge control','The workshop repair','The ticket gate','The signal switch','The display lock','The final stick code'][index],
      instruction:`${action==='remove'?'Remove':'Move'} exactly ONE stick to make the equation true. Keep every digit valid and leave the equals sign fixed.`,
      hints:['Read the whole equation. The numbers and the operation sign can both be clues.',`Look closely at the ${symbolLocation(p.symbols,source)}. Which stick could change it?`,`${change} This gives ${equation}.`],
      explanationShort:`${equation} makes both sides equal.`,
      explanation:solutions.length===1?`${change} The repaired equation is ${equation}.`:`${change} One repair is ${equation}. ${solutions.length} different repairs work; every legal true equation counts.`,
      solutionCount:solutions.length
    });
  }
  const puzzles=[], cases=[];
  for(const grade of [2,3]) {
    const counts={P:0,T:0,S:0};
    caseStories[grade].forEach(([title,scene,finish,place],caseIndex)=>{
      const number=caseIndex+1, id=`g${grade}-case-${number}`, puzzleIds=[];
      [...caseOrders[caseIndex]].forEach((family,slot)=>{
        const index=counts[family]++, content=family==='P'?makePattern(grade,index,number):family==='T'?makeTable(grade,index):makeSticks(grade,index);
        const puzzleId=`${id}-clue-${slot+1}`;
        const localScene=content.type==='pattern'?`Pip found a picture board at the ${place}. Some of its pieces are missing.`:content.type==='table'?`The ${place} has a number machine with missing labels. Help Pip repair it.`:`A lock at the ${place} shows a false equation. Repair it to collect the next clue.`;
        puzzles.push(Object.assign({id:puzzleId,grade,caseId:id,difficulty:number,scene:localScene},content));puzzleIds.push(puzzleId);
      });
      cases.push({id,grade,number,title,scene,finish,puzzleIds});
    });
  }
  function deepFreeze(value) { if(value && typeof value==='object' && !Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value; }
  deepFreeze(puzzles);deepFreeze(cases);
  root.LogicDetectivesEngine=Object.freeze({puzzles,cases,SEGMENTS,SHAPES,FLAGS,FILLS,possibleSegments,makeStickState,evaluateSticks,getStickSolutions,validatePattern,tableAnswer,validateTable});
})(typeof window==='undefined'?globalThis:window);
