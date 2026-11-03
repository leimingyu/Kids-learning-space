(function (root) {
  'use strict';

  const SHAPES = ['circle', 'triangle', 'square'];
  const FLAGS = ['rectangle', 'notch', 'pennant'];
  const FILLS = ['empty', 'stripe', 'solid'];
  const INSIDE = { circle: 'triangle', triangle: 'square', square: 'circle' };
  const grid = (outside, fills, kind) => outside.flat().map((outer, index) => {
    const cell = { outer, fill: fills.flat()[index] };
    if (kind === 'shapes') cell.inner = INSIDE[outer];
    return cell;
  });
  const puzzles = [
    {
      id: 'g2-robot-badge', grade: 2, type: 'pattern', kind: 'shapes',
      title: 'The missing robot badge',
      scene: 'Pip found the robot workshop! One badge is missing from its drawer.',
      instruction: 'Fill the empty pocket. In every row AND column, each outside shape, inside shape, and filling appears exactly once.',
      cells: grid([['circle','triangle','square'],['triangle','square','circle'],['square','circle','triangle']], [['solid','empty','stripe'],['stripe','solid','empty'],['empty','stripe','solid']], 'shapes'),
      blanks: [4],
      hints: ['Look at the middle row. Which outside shape is missing?', 'The outside must be a square. Now check which inside shape is missing.', 'Choose a square outside, a circle inside, and a solid filling. Check its row and column.'],
      explanation: 'The middle row needs a square outside, a circle inside, and a solid filling. That badge also completes the middle column.',
      reasonOptions: [{ text: 'I checked the missing outside shape, inside shape, and filling in the row and column.', correct: true }, { text: 'I picked the badge that looks most like its neighbor.', correct: false }, { text: 'Every badge in a row must look the same.', correct: false }]
    },
    {
      id: 'g2-flag-delivery', grade: 2, type: 'pattern', kind: 'flags',
      title: 'The flag delivery',
      scene: 'The parade cart is almost packed. Help Pip find the last flag.',
      instruction: 'Fill the empty pocket. Every row AND column needs one rectangle, one notched flag, and one triangular pennant; also one empty, one striped, and one solid flag.',
      cells: grid([['rectangle','notch','pennant'],['notch','pennant','rectangle'],['pennant','rectangle','notch']], [['empty','stripe','solid'],['solid','empty','stripe'],['stripe','solid','empty']], 'flags'),
      blanks: [2],
      hints: ['The top row already has a rectangle and a notched flag.', 'It needs a triangular pennant. Which filling is missing from that row?', 'Choose a triangular pennant with a solid filling. Check the last column too.'],
      explanation: 'The top row needs a triangular pennant and a solid filling. The last column needs those same missing features.',
      reasonOptions: [{ text: 'The row and column are both missing a solid triangular pennant.', correct: true }, { text: 'I copied the flag directly below the empty pocket.', correct: false }, { text: 'The top row should contain three rectangles.', correct: false }]
    },
    {
      id: 'g2-number-machine', grade: 2, type: 'table', operation: '+',
      title: 'Wake the number machine',
      scene: 'The workshop machine adds a side number to a top number. Two labels fell off!',
      instruction: 'Type the missing numbers. Each inside box equals its row number plus its column number. Press Enter to check.',
      rows: [9, 6], cols: [7, 11, 14], blanks: ['c1','v1_2'],
      hints: ['Use a filled box underneath the missing top number. Its total is 20 and its side number is 9.', '9 + ? = 20, so the missing top number is 20 − 9.', 'The top number is 11. For the other blank, add the side number 6 and the top number 14.'],
      explanation: 'The missing top number is 11 because 9 + 11 = 20. The other blank is 20 because 6 + 14 = 20.',
      reasonOptions: [{ text: 'I subtracted to find a missing header, then added to find the missing total.', correct: true }, { text: 'I added the two numbers above each other in the same column.', correct: false }, { text: 'I filled every blank with the same number.', correct: false }]
    },
    {
      id: 'g2-stick-lock', grade: 2, type: 'sticks', action: 'remove',
      title: 'The workshop lock',
      scene: 'The door lock has a false number sentence. Pip can take away exactly one stick.',
      instruction: 'Remove exactly ONE stick to make the equation true. Click a stick, then check. The equals sign stays fixed.',
      symbols: ['9','+','5','=','4'],
      hints: ['Look at the whole number sentence, including its operation sign.', 'The answer 4 is smaller than 9. Could subtraction help?', 'Remove the vertical stick from the plus sign. It becomes a minus sign.'],
      explanation: 'Taking the vertical stick from + changes addition to subtraction: 9 − 5 = 4.',
      reasonOptions: [{ text: 'I changed addition to subtraction, and then checked that both sides equal 4.', correct: true }, { text: 'Removing any stick makes an equation correct.', correct: false }, { text: 'The equals sign means the right side must be bigger.', correct: false }]
    },
    {
      id: 'g3-badge-evidence', grade: 3, type: 'pattern', kind: 'shapes',
      title: 'Two missing pieces of evidence',
      scene: 'Two badges vanished from the evidence drawer. The columns can help you reconstruct them.',
      instruction: 'Build both missing badges. In every row AND column, each outside shape, inside shape, and filling appears exactly once.',
      cells: grid([['square','circle','triangle'],['circle','triangle','square'],['triangle','square','circle']], [['empty','stripe','solid'],['solid','empty','stripe'],['stripe','solid','empty']], 'shapes'),
      blanks: [3,4],
      hints: ['The middle row has two spaces. Try a column with just one space first.', 'The first column is missing a circle outside, a triangle inside, and a solid filling.', 'The middle pocket needs a triangle outside, a square inside, and an empty filling. Check all three features in each column.'],
      explanation: 'The first column forces a solid triangle inside a circle. The second column forces an empty square inside a triangle. Together they complete the middle row.',
      reasonOptions: [{ text: 'I used columns with one missing badge, then checked the completed row.', correct: true }, { text: 'With two blanks, there cannot be enough information.', correct: false }, { text: 'The two missing badges should be identical.', correct: false }]
    },
    {
      id: 'g3-parade-order', grade: 3, type: 'pattern', kind: 'flags',
      title: 'The parade mix-up',
      scene: 'The parade plan has two empty spaces. Restore the flags without repeating a shape or filling.',
      instruction: 'Complete both spaces. Every row AND column needs each flag shape exactly once and each filling exactly once.',
      cells: grid([['pennant','rectangle','notch'],['rectangle','notch','pennant'],['notch','pennant','rectangle']], [['stripe','solid','empty'],['empty','stripe','solid'],['solid','empty','stripe']], 'flags'),
      blanks: [0,1],
      hints: ['Do not guess from the top row. Inspect the first and second columns separately.', 'The first column needs a triangular pennant and a striped filling.', 'The second column needs a rectangle and a solid filling. Place both flags and check the top row.'],
      explanation: 'The first column forces a striped triangular pennant. The second column forces a solid rectangle. The empty notched flag completes the top row.',
      reasonOptions: [{ text: 'I worked from the columns, checking shape and filling separately.', correct: true }, { text: 'Matching the filling alone is enough.', correct: false }, { text: 'All flags pointing the same way have the same shape.', correct: false }]
    },
    {
      id: 'g3-hidden-headers', grade: 3, type: 'table', operation: '+',
      title: 'The hidden machine labels',
      scene: 'The machine lost a side label, a top label, and two totals. Find a useful clue to start.',
      instruction: 'Find all four missing numbers. Each inside box equals its row number plus its column number. You choose which blank to solve first.',
      rows: [19,23], cols: [12,18,25], blanks: ['r0','c0','v1_0','v1_2'],
      hints: ['In the first row, the total 37 sits under the top number 18. What side number makes that total?', 'The first side number is 37 − 18 = 19. Use 19 + ? = 31 to find the missing top number.', 'The missing top number is 12. The two totals are 23 + 12 = 35 and 23 + 25 = 48.'],
      explanation: 'Work backward: 37 − 18 = 19 gives the missing side label. Then 31 − 19 = 12 gives the top label. Finally, 23 + 12 = 35 and 23 + 25 = 48.',
      reasonOptions: [{ text: 'I found a side label first, used it to find a top label, and then calculated the totals.', correct: true }, { text: 'I had to solve the blanks from left to right.', correct: false }, { text: 'A missing header always equals the total below it.', correct: false }]
    },
    {
      id: 'g3-stick-bridge', grade: 3, type: 'sticks', action: 'move',
      title: 'Repair the clue bridge',
      scene: 'The clue bridge is stuck! Move one stick to make its equation true. There is more than one way.',
      instruction: 'Move exactly ONE stick. Select a lit stick and then an empty position, or drag between them. Keep every symbol valid and leave the equals sign fixed.',
      symbols: ['6','+','4','=','4'],
      hints: ['You can move a stick within a digit or between symbols. Look at the empty upper-right position of 6.', 'Moving the middle stick of 6 to its upper-right position changes 6 into 0.', 'One answer is 0 + 4 = 4. Another moves the vertical stick of + to the upper-right of 6, making 8 − 4 = 4.'],
      explanation: 'Both 0 + 4 = 4 and 8 − 4 = 4 are valid one-stick moves. A valid answer must move one stick, keep every symbol recognizable, and make both sides equal.',
      reasonOptions: [{ text: 'I checked the one-stick rule and that both sides have the same value.', correct: true }, { text: 'I can add a new stick without removing one.', correct: false }, { text: 'Making the left side larger always repairs an equation.', correct: false }]
    }
  ];

  const SEGMENTS = Object.freeze({
    '0': ['a','b','c','d','e','f'], '1': ['b','c'], '2': ['a','b','d','e','g'],
    '3': ['a','b','c','d','g'], '4': ['b','c','f','g'], '5': ['a','c','d','f','g'],
    '6': ['a','c','d','e','f','g'], '7': ['a','b','c'], '8': ['a','b','c','d','e','f','g'],
    '9': ['a','b','c','d','f','g'], '+': ['h','v'], '-': ['h'], '=': ['h1','h2']
  });
  const canonical = segments => [...segments].sort().join(',');
  const DIGIT_SYMBOLS = new Map(Object.keys(SEGMENTS).filter(x => /^\d$/.test(x)).map(x => [canonical(SEGMENTS[x]),x]));
  const OP_SYMBOLS = new Map([['h','-'],['h,v','+']]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const makeStickState = puzzle => puzzle.symbols.map(symbol => [...SEGMENTS[symbol]]);
  const possibleSegments = symbol => /^\d$/.test(symbol) ? ['a','b','c','d','e','f','g'] : symbol === '=' ? ['h1','h2'] : ['h','v'];

  function decodeSticks(puzzle, state) {
    if (!Array.isArray(state) || state.length !== puzzle.symbols.length) return null;
    const result = [];
    for (let index = 0; index < state.length; index++) {
      const active = state[index];
      if (!Array.isArray(active) || new Set(active).size !== active.length || active.some(segment => !possibleSegments(puzzle.symbols[index]).includes(segment))) return null;
      const encoded = canonical(active);
      const original = puzzle.symbols[index];
      const symbol = /^\d$/.test(original) ? DIGIT_SYMBOLS.get(encoded) : original === '=' ? (encoded === 'h1,h2' ? '=' : undefined) : OP_SYMBOLS.get(encoded);
      if (symbol === undefined) return null;
      result.push(symbol);
    }
    return result;
  }

  function equationValue(symbols) {
    const text = symbols.join('');
    const matched = text.match(/^(\d+)([+-])(\d+)=(\d+)$/);
    if (!matched) return null;
    const left = Number(matched[1]);
    const right = Number(matched[3]);
    const target = Number(matched[4]);
    return { left: matched[2] === '+' ? left + right : left - right, right: target };
  }

  function evaluateSticks(puzzle, state) {
    if (!puzzle || puzzle.type !== 'sticks') return { correct: false, message: 'Choose a stick puzzle first.', equation: '' };
    const initial = makeStickState(puzzle);
    if (!Array.isArray(state) || state.length !== initial.length || state.some(segments => !Array.isArray(segments))) return { correct: false, message: 'Keep all of the equation symbols on the board.', equation: '' };
    let removed = 0;
    let added = 0;
    for (let index = 0; index < initial.length; index++) {
      if (puzzle.symbols[index] === '=' && canonical(initial[index]) !== canonical(state[index])) return { correct: false, message: 'The equals sign stays fixed. Try a digit or the operation sign.', equation: '' };
      removed += initial[index].filter(segment => !state[index].includes(segment)).length;
      added += state[index].filter(segment => !initial[index].includes(segment)).length;
    }
    const decoded = decodeSticks(puzzle, state);
    const equation = decoded ? decoded.join(' ').replace(/-/g, '−') : '';
    if (removed === 0 && added === 0) return { correct: false, missing: true, message: 'Try a stick change before checking.', equation };
    const legal = puzzle.action === 'remove' ? removed === 1 && added === 0 : removed === 1 && added === 1;
    if (!legal) return { correct: false, message: puzzle.action === 'remove' ? 'Remove exactly one stick. Use Undo to try a different stick.' : 'Move exactly one stick: take one away and place that same stick in an empty position.', equation };
    if (!decoded) return { correct: false, message: 'Every digit and sign must still be recognizable. Try a different stick position.', equation };
    const values = equationValue(decoded);
    if (!values) return { correct: false, message: 'Keep a complete number sentence with an operation and an equals sign.', equation };
    if (values.left !== values.right) return { correct: false, message: `The left side equals ${values.left}, but the right side equals ${values.right}. Try another stick change.`, equation };
    return { correct: true, message: `You repaired it: ${equation}. Both sides equal ${values.right}!`, equation };
  }

  function getStickSolutions(puzzle) {
    const initial = makeStickState(puzzle);
    const results = [];
    const seen = new Set();
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
            const moved = copy(removed);
            moved[target].push(destination);
            candidates.push(moved);
          }
        }
        for (const candidate of candidates) {
          const key = candidate.map(canonical).join('|');
          if (!seen.has(key) && evaluateSticks(puzzle, candidate).correct) {
            seen.add(key);
            results.push(candidate);
          }
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
    for (const index of puzzle.blanks) {
      for (const property of properties) {
        if (!cells[index]?.[property]) return { correct: false, missing: true, message: `Choose the ${names[property]} for pocket ${index + 1}.` };
        const valid = property === 'fill' ? FILLS : property === 'outer' && puzzle.kind === 'flags' ? FLAGS : SHAPES;
        if (!valid.includes(cells[index][property])) return { correct: false, message: `Choose one of the pictured ${names[property]} options.` };
      }
    }
    for (const property of properties) {
      for (let line = 0; line < 3; line++) {
        const row = cells.slice(line * 3, line * 3 + 3).map(cell => cell[property]);
        if (new Set(row).size !== 3) return { correct: false, message: `Row ${line + 1} repeats a ${names[property]}. Each one must appear exactly once.`, line: { axis: 'row', index: line }, property };
        const column = [cells[line],cells[line + 3],cells[line + 6]].map(cell => cell[property]);
        if (new Set(column).size !== 3) return { correct: false, message: `Column ${line + 1} repeats a ${names[property]}. Each one must appear exactly once.`, line: { axis: 'column', index: line }, property };
      }
    }
    return { correct: true, message: 'Every row and column follows the rule. Excellent detective work!' };
  }

  function tableAnswer(puzzle, key) {
    if (!puzzle || puzzle.type !== 'table' || typeof key !== 'string') return undefined;
    let matched = key.match(/^r(\d+)$/);
    if (matched) return puzzle.rows[Number(matched[1])];
    matched = key.match(/^c(\d+)$/);
    if (matched) return puzzle.cols[Number(matched[1])];
    matched = key.match(/^v(\d+)_(\d+)$/);
    if (matched) {
      const row = puzzle.rows[Number(matched[1])];
      const column = puzzle.cols[Number(matched[2])];
      return Number.isFinite(row) && Number.isFinite(column) ? row + column : undefined;
    }
    return undefined;
  }

  function validateTable(puzzle, answers) {
    if (!puzzle || puzzle.type !== 'table') return { correct: false, message: 'Choose a number-table puzzle first.' };
    for (const key of puzzle.blanks) {
      const answer = answers?.[key];
      if (answer === undefined || answer === null || String(answer).trim() === '') return { correct: false, missing: true, key, message: 'Fill every missing number before checking.' };
      if (!/^\d+$/.test(String(answer).trim())) return { correct: false, key, message: 'Use a whole number for each answer.' };
      if (Number(answer) !== tableAnswer(puzzle, key)) {
        const header = key.startsWith('r') || key.startsWith('c');
        return { correct: false, key, message: header ? 'Check that missing header. A side number plus a top number must equal the inside total. Try working backward.' : 'Check that total. Add its side number and its top number.' };
      }
    }
    return { correct: true, message: 'The number machine works! Every missing number fits its row and column.' };
  }

  root.LogicDetectivesEngine = Object.freeze({ puzzles, SEGMENTS, SHAPES, FLAGS, FILLS, possibleSegments, makeStickState, evaluateSticks, getStickSolutions, validatePattern, tableAnswer, validateTable });
})(typeof window === 'undefined' ? globalThis : window);
