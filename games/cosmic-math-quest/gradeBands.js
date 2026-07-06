/**
 * Grade-band recipes, generators, and band-aware validation for Cosmic Math Quest.
 * Pattern: learningIntelligence.js — an IIFE attaching to window.
 * MUST stay self-contained (no index.html globals) so node smoke tests can eval it.
 */
(function (global) {
  'use strict';

  var GRADES = [2, 3, 4, 5];

  var RECIPES = {
    2: { g2_recall: 7, g2_picture: 2, g2_sharing: 1 },
    3: { g3_recall: 3, g3_missing: 3, g3_divfact: 2, g3_word: 2 },
    4: { g4_multidigit: 3, g4_longdiv: 2, g4_word2: 2, g4_invreason: 2, g4_warmup: 1 },
    5: { g5_bigmult: 2, g5_longdiv2: 2, g5_pattern: 2, g5_orderops: 2, g5_word: 1, g5_reason: 1 }
  };

  var FAST_FORMATS = {
    2: ['g2_recall'], // g2_sharing is a word problem — reading under a timer is unfair (spec §5 Lightning)
    3: ['g3_recall', 'g3_missing', 'g3_divfact'],
    4: ['g4_warmup'],
    5: ['g5_pattern']
  };

  var MAX_GENERATE_ATTEMPTS = 60;

  // ---------- small helpers ----------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Expand a grade's recipe {token: quota} into a flat 10-token array. */
  function expandRecipe(grade) {
    var recipe = RECIPES[grade] || {};
    var tokens = [];
    for (var fmt in recipe) {
      if (!Object.prototype.hasOwnProperty.call(recipe, fmt)) continue;
      for (var i = 0; i < recipe[fmt]; i++) tokens.push(fmt);
    }
    return tokens;
  }

  /**
   * Build a round plan of exactly `size` format tokens.
   * Normal: shuffled quota expansion, cycling a fresh shuffle when size > 10.
   * opts.fastOnly: round-robin over FAST_FORMATS[grade] (Lightning mode).
   */
  function buildRoundPlan(grade, size, opts) {
    opts = opts || {};
    var plan = [];
    if (opts.fastOnly) {
      var fast = FAST_FORMATS[grade] || [];
      if (!fast.length) return plan;
      for (var i = 0; i < size; i++) plan.push(fast[i % fast.length]);
      return plan;
    }
    while (plan.length < size) {
      var cycle = shuffle(expandRecipe(grade));
      if (!cycle.length) break;
      for (var j = 0; j < cycle.length && plan.length < size; j++) plan.push(cycle[j]);
    }
    return plan;
  }

  // ---------- question assembly ----------
  /** Contract: recall/warmup formats -> 'easy', missing -> 'medium', everything else -> 'hard'. */
  function levelForFormat(format) {
    if (format === 'g2_recall' || format === 'g3_recall' || format === 'g4_warmup') return 'easy';
    if (format === 'g3_missing') return 'medium';
    return 'hard';
  }

  /** 'g4_longdiv' -> 4 */
  function gradeOfFormat(format) {
    return parseInt(String(format).slice(1), 10);
  }

  // rows/cols per shared contract; a/b + groups/per aliases keep index.html's
  // renderVisualFromSpec working unchanged.
  function visArray(rows, cols) {
    return { kind: 'array', rows: rows, cols: cols, a: rows, b: cols };
  }

  function visGroups(groups, per) {
    return { kind: 'groups', rows: groups, cols: per, groups: groups, per: per };
  }

  function makeQuestion(fields) {
    var meta = fields.meta || {};
    if (!('baseFact' in meta)) meta.baseFact = null;
    var answerR = fields.answerR != null ? fields.answerR : null;
    if (answerR != null) meta.remainder = true;
    return {
      type: fields.type,
      operation: fields.operation,
      prompt: fields.prompt,
      promptSub: fields.promptSub || null,
      answer: fields.answer,
      answerR: answerR,
      key: fields.key,
      level: levelForFormat(fields.format),
      grade: gradeOfFormat(fields.format),
      format: fields.format,
      meta: meta,
      hintEasy: fields.hintEasy,
      hintMed: fields.hintMed,
      hintHard: fields.hintHard,
      visualSpec: fields.visualSpec || null
    };
  }

  var BUILDERS = {};

  // ---------- Grade 2 ----------
  function g2FactorForTier(tier) {
    if (tier <= -1) return pick([1, 2, 5, 10]);
    if (tier >= 1) return pick([11, 12]);
    return pick([3, 4, 6, 7, 8, 9]);
  }

  BUILDERS.g2_recall = function (tier) {
    var anchor = g2FactorForTier(tier);
    var other = tier >= 1 ? randInt(6, 12) : randInt(1, 12);
    var flip = Math.random() < 0.5;
    var a = flip ? anchor : other;
    var b = flip ? other : anchor;
    var prod = a * b;
    return makeQuestion({
      format: 'g2_recall',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g2:rc:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visArray(a, b),
      hintEasy: 'Picture ' + a + ' rows with ' + b + ' in each row. Count them all.',
      hintMed: 'Skip-count by ' + b + ', ' + a + ' times.',
      hintHard: 'Recall ' + a + ' × ' + b + '.'
    });
  };

  var G2_PICTURE_TEMPLATES = [
    function (a, b) { return 'There are ' + a + ' baskets with ' + b + ' apples in each basket. How many apples in all?'; },
    function (a, b) { return a + ' rows of ' + b + ' stars are on the flag. How many stars is that?'; },
    function (a, b) { return a + ' friends each have ' + b + ' balloons. How many balloons altogether?'; },
    function (a, b) { return 'A sticker sheet has ' + a + ' rows of ' + b + ' stickers. How many stickers?'; }
  ];

  BUILDERS.g2_picture = function (tier) {
    var a = randInt(2, 6);
    var b = tier <= -1 ? pick([2, 5]) : tier >= 1 ? randInt(6, 9) : pick([3, 4, 6]);
    var prod = a * b;
    return makeQuestion({
      format: 'g2_picture',
      type: 'word',
      operation: 'multiply',
      prompt: pick(G2_PICTURE_TEMPLATES)(a, b),
      answer: prod,
      key: 'g2:pic:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visGroups(a, b),
      hintEasy: 'Look at the picture: ' + a + ' equal groups of ' + b + '.',
      hintMed: 'Same as ' + a + ' × ' + b + '.',
      hintHard: 'Multiply groups × how many in each.'
    });
  };

  BUILDERS.g2_sharing = function (tier) {
    var divisor = pick([2, 5, 10]);
    var quotient = tier <= -1 ? randInt(1, 5) : tier >= 1 ? randInt(5, 12) : randInt(2, 8);
    var dividend = divisor * quotient;
    var nouns = pick(['stickers', 'cookies', 'marbles', 'crayons']);
    return makeQuestion({
      format: 'g2_sharing',
      type: 'word',
      operation: 'divide',
      prompt: dividend + ' ' + nouns + ' are shared equally between ' + divisor + ' friends. How many does each friend get?',
      answer: quotient,
      key: 'g2:sh:' + dividend + '/' + divisor,
      meta: { dividend: dividend, divisor: divisor, quotient: quotient, baseFact: { a: divisor, b: quotient, op: 'div' } },
      visualSpec: visGroups(divisor, quotient),
      hintEasy: 'Deal the ' + nouns + ' into ' + divisor + ' piles, one at a time.',
      hintMed: 'Same as ' + dividend + ' ÷ ' + divisor + '.',
      hintHard: '? × ' + divisor + ' = ' + dividend + '.'
    });
  };

  // ---------- Grade 3 ----------
  /** Tier -1 favors tables 2–6; tier +1 favors 7–12 (per spec §3). */
  function g3Pair(tier) {
    var a, b;
    if (tier <= -1) {
      a = randInt(2, 6);
      b = randInt(2, 9);
    } else if (tier >= 1) {
      a = randInt(7, 12);
      b = randInt(6, 12);
    } else {
      a = pick([6, 7, 8, 9, 10, 11, 12]);
      b = randInt(3, 9);
    }
    if (Math.random() < 0.5) { var t = a; a = b; b = t; }
    return { a: a, b: b, prod: a * b };
  }

  BUILDERS.g3_recall = function (tier) {
    var p = g3Pair(tier);
    return makeQuestion({
      format: 'g3_recall',
      type: 'basic',
      operation: 'multiply',
      prompt: p.a + ' × ' + p.b + ' = ?',
      answer: p.prod,
      key: 'g3:rc:' + p.a + 'x' + p.b,
      meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
      visualSpec: visArray(p.a, p.b),
      hintEasy: 'Skip-count by ' + p.b + ', ' + p.a + ' times.',
      hintMed: 'Use a fact you know: ' + p.a + ' × ' + (p.b - 1) + ', then one more ' + p.a + '.',
      hintHard: 'Recall ' + p.a + ' × ' + p.b + '.'
    });
  };

  BUILDERS.g3_missing = function (tier) {
    var p = g3Pair(tier);
    if (Math.random() < 0.5) {
      var hideA = Math.random() < 0.5;
      return makeQuestion({
        format: 'g3_missing',
        type: 'missing',
        operation: 'multiply',
        prompt: hideA ? '? × ' + p.b + ' = ' + p.prod : p.a + ' × ? = ' + p.prod,
        answer: hideA ? p.a : p.b,
        key: 'g3:mm:' + (hideA ? 'a' : 'b') + ':' + p.a + 'x' + p.b,
        meta: { a: p.a, b: p.b, prod: p.prod, hideA: hideA, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintEasy: hideA ? 'How many ' + p.b + 's make ' + p.prod + '?' : 'What times ' + p.a + ' makes ' + p.prod + '?',
        hintMed: 'Which factor is missing?',
        hintHard: 'Try ' + p.prod + ' ÷ ' + (hideA ? p.b : p.a) + '.'
      });
    }
    return makeQuestion({
      format: 'g3_missing',
      type: 'missing',
      operation: 'divide',
      prompt: p.prod + ' ÷ ? = ' + p.b,
      answer: p.a,
      key: 'g3:md:' + p.prod + '/' + p.a,
      meta: { dividend: p.prod, divisor: p.a, quotient: p.b, missing: 'divisor', baseFact: { a: p.a, b: p.b, op: 'div' } },
      visualSpec: visGroups(p.a, p.b),
      hintEasy: '? × ' + p.b + ' = ' + p.prod + '.',
      hintMed: 'What times ' + p.b + ' gives ' + p.prod + '?',
      hintHard: 'Multiply back.'
    });
  };

  BUILDERS.g3_divfact = function (tier) {
    var p = g3Pair(tier);
    return makeQuestion({
      format: 'g3_divfact',
      type: 'basic',
      operation: 'divide',
      prompt: p.prod + ' ÷ ' + p.a + ' = ?',
      answer: p.b,
      key: 'g3:df:' + p.prod + '/' + p.a,
      meta: { dividend: p.prod, divisor: p.a, quotient: p.b, baseFact: { a: p.a, b: p.b, op: 'div' } },
      visualSpec: visGroups(p.a, p.b),
      hintEasy: 'Split ' + p.prod + ' into ' + p.a + ' equal shares.',
      hintMed: 'What times ' + p.a + ' equals ' + p.prod + '?',
      hintHard: '? × ' + p.a + ' = ' + p.prod + '.'
    });
  };

  var G3_WORD_TEMPLATES = [
    function (p) {
      return {
        prompt: 'There are ' + p.a + ' boxes with ' + p.b + ' pencils in each box. How many pencils are there?',
        operation: 'multiply',
        answer: p.prod,
        meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintFact: p.a + ' × ' + p.b
      };
    },
    function (p) {
      return {
        prompt: 'A parking lot has ' + p.a + ' rows of ' + p.b + ' cars. How many cars are parked?',
        operation: 'multiply',
        answer: p.prod,
        meta: { a: p.a, b: p.b, prod: p.prod, baseFact: { a: p.a, b: p.b, op: 'mul' } },
        visualSpec: visArray(p.a, p.b),
        hintFact: p.a + ' × ' + p.b
      };
    },
    function (p) {
      return {
        prompt: p.prod + ' stickers are shared equally among ' + p.a + ' kids. How many does each kid get?',
        operation: 'divide',
        answer: p.b,
        meta: { dividend: p.prod, divisor: p.a, quotient: p.b, baseFact: { a: p.a, b: p.b, op: 'div' } },
        visualSpec: visGroups(p.a, p.b),
        hintFact: p.prod + ' ÷ ' + p.a
      };
    },
    function (p) {
      return {
        prompt: p.prod + ' apples are packed into bags of ' + p.b + ' apples. How many bags are filled?',
        operation: 'divide',
        answer: p.a,
        meta: { dividend: p.prod, divisor: p.b, quotient: p.a, baseFact: { a: p.b, b: p.a, op: 'div' } },
        visualSpec: visGroups(p.b, p.a),
        hintFact: p.prod + ' ÷ ' + p.b
      };
    }
  ];

  BUILDERS.g3_word = function (tier) {
    var p = g3Pair(tier);
    var idx = randInt(0, G3_WORD_TEMPLATES.length - 1);
    var t = G3_WORD_TEMPLATES[idx](p);
    return makeQuestion({
      format: 'g3_word',
      type: 'word',
      operation: t.operation,
      prompt: t.prompt,
      answer: t.answer,
      key: 'g3:w:t' + idx + ':' + p.a + 'x' + p.b,
      meta: t.meta,
      visualSpec: t.visualSpec,
      hintEasy: 'Same as ' + t.hintFact + '.',
      hintMed: t.operation === 'multiply' ? 'Equal groups: multiply.' : 'Equal shares: divide.',
      hintHard: t.hintFact + ' = ?'
    });
  };

  // ---------- Grade 4 ----------
  BUILDERS.g4_multidigit = function (tier) {
    var a, d;
    if (tier <= -1) {
      a = randInt(12, 30);
      d = randInt(2, 4);
    } else if (tier >= 1) {
      a = randInt(102, 399);
      d = randInt(3, 9);
    } else {
      a = randInt(21, 99);
      d = randInt(3, 9);
    }
    var prod = a * d;
    var ones = a % 10;
    var tens = a - ones;
    return makeQuestion({
      format: 'g4_multidigit',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + d + ' = ?',
      answer: prod,
      key: 'g4:md:' + a + 'x' + d,
      meta: { a: a, b: d, prod: prod, baseFact: { a: a, b: d, op: 'mul' } },
      visualSpec: null,
      hintEasy: 'Break ' + a + ' into ' + tens + ' and ' + ones + '. Multiply each part by ' + d + ', then add them.',
      hintMed: tens + ' × ' + d + ' first, then ' + ones + ' × ' + d + '.',
      hintHard: 'Add the two partial products.'
    });
  };

  BUILDERS.g4_longdiv = function (tier) {
    var d = randInt(3, 9);
    var q, r;
    if (tier <= -1) {
      // exact only, 2-digit dividend
      q = randInt(Math.ceil(10 / d) + 1, Math.floor(99 / d));
      r = 0;
    } else if (tier >= 1) {
      // 3-digit dividend, remainders allowed
      q = randInt(Math.ceil(100 / d) + 1, Math.floor(900 / d));
      r = Math.random() < 0.6 ? randInt(1, d - 1) : 0;
    } else {
      // 2-digit dividend, remainders allowed
      q = randInt(Math.ceil(10 / d) + 1, Math.floor(90 / d));
      r = Math.random() < 0.5 ? randInt(1, d - 1) : 0;
    }
    var dividend = d * q + r;
    return makeQuestion({
      format: 'g4_longdiv',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + d + ' = ?',
      promptSub: r > 0 ? 'This one has a remainder — put it in the R box.' : null,
      answer: q,
      answerR: r > 0 ? r : null,
      key: 'g4:ld:' + dividend + '/' + d,
      meta: { dividend: dividend, divisor: d, quotient: q, baseFact: { a: d, b: q, op: 'div' } },
      visualSpec: null,
      hintEasy: 'How many whole ' + d + 's fit into ' + dividend + '?',
      hintMed: 'Find the biggest multiple of ' + d + ' that fits, then count what is left over.',
      hintHard: r > 0 ? 'Check: divisor × answer, then add the leftover to reach ' + dividend + '.' : '? × ' + d + ' = ' + dividend + '.'
    });
  };

  var NAMES = ['Maya', 'Leo', 'Zara', 'Kai', 'Nina', 'Omar'];

  var G4_WORD2_TEMPLATES = [
    function () {
      var a = randInt(3, 9), b = randInt(4, 9), c = randInt(2, 10);
      return {
        prompt: pick(NAMES) + ' buys ' + a + ' packs of ' + b + ' trading cards, then gives ' + c + ' cards to a friend. How many cards are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var a = randInt(3, 9), b = randInt(4, 9), c = randInt(3, 20);
      return {
        prompt: 'A library has ' + a + ' shelves with ' + b + ' books on each shelf. Then ' + c + ' more books arrive. How many books are there now?',
        answer: a * b + c,
        meta: { a: a, b: b, c: c, steps: 'mul_add', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then add ' + c
      };
    },
    function () {
      var d = randInt(2, 6), teams = randInt(3, 8), k = randInt(2, 6);
      var n = d * teams;
      return {
        prompt: n + ' students split into teams of ' + d + '. Each team gets ' + k + ' cones for practice. How many cones are needed?',
        answer: teams * k,
        meta: { d: d, teams: teams, k: k, steps: 'div_mul', baseFact: null },
        hintFact: n + ' ÷ ' + d + ' teams first, then × ' + k
      };
    },
    function () {
      var a = randInt(4, 9), b = randInt(3, 9), c = randInt(2, 10);
      return {
        prompt: pick(NAMES) + ' saves ' + b + ' coins every day for ' + a + ' days, then spends ' + c + ' coins on a snack. How many coins are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var d = randInt(3, 6), boxes = randInt(5, 9), c = randInt(2, 3);
      var n = d * boxes;
      return {
        prompt: 'A baker makes ' + n + ' muffins and packs them into boxes of ' + d + '. She sells ' + c + ' full boxes. How many boxes are left?',
        answer: boxes - c,
        meta: { d: d, boxes: boxes, c: c, steps: 'div_sub', baseFact: { a: d, b: boxes, op: 'div' } },
        hintFact: n + ' ÷ ' + d + ' boxes first, then take away ' + c
      };
    },
    function () {
      var a = randInt(4, 9), b = randInt(5, 9), c = randInt(2, 8);
      return {
        prompt: a + ' rows of ' + b + ' chairs are set up for the show. ' + c + ' chairs are broken and removed. How many chairs are left?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: { a: a, b: b, op: 'mul' } },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    }
  ];

  BUILDERS.g4_word2 = function (tier) {
    // word templates stay at table-fact sizes at every tier
    var idx = randInt(0, G4_WORD2_TEMPLATES.length - 1);
    var t = G4_WORD2_TEMPLATES[idx]();
    t.meta.template = idx;
    return makeQuestion({
      format: 'g4_word2',
      type: 'word',
      operation: t.meta.steps.indexOf('div') === 0 ? 'divide' : 'multiply',
      prompt: t.prompt,
      answer: t.answer,
      key: 'g4:w2:t' + idx + ':' + t.answer + ':' + (t.meta.a || t.meta.d) + 'v' + (t.meta.b || t.meta.boxes || t.meta.teams),
      meta: t.meta,
      visualSpec: null,
      hintEasy: 'Two steps: ' + t.hintFact + '.',
      hintMed: 'Find the total first, then do the second step.',
      hintHard: t.hintFact + '.'
    });
  };

  /** Table-fact pair for G4 inverse/reasoning, factors to 12, biased by tier. */
  function g4Pair(tier) {
    var lo = tier <= -1 ? 3 : tier >= 1 ? 7 : 4;
    var hi = tier <= -1 ? 8 : 12;
    return { a: randInt(lo, hi), b: randInt(lo, hi) };
  }

  BUILDERS.g4_invreason = function (tier) {
    var kind = pick(['inv_mult', 'inv_div', 'compare', 'tf', 'compare_div', 'tf_div']);
    var p = g4Pair(tier);
    var a = p.a, b = p.b, prod = a * b;

    if (kind === 'inv_mult') {
      return makeQuestion({
        format: 'g4_invreason', type: 'inverse', operation: 'multiply',
        prompt: 'If ' + prod + ' ÷ ' + a + ' = ' + b + ', what is ' + a + ' × ' + b + '?',
        answer: prod,
        key: 'g4:ir:im:' + a + 'x' + b,
        meta: { a: a, b: b, prod: prod, dividend: prod, divisor: a, quotient: b, baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'Think about the matching multiply fact.',
        hintMed: a + ' × ' + b + ' = ?',
        hintHard: 'Inverse facts match: divide and multiply.'
      });
    }
    if (kind === 'inv_div') {
      return makeQuestion({
        format: 'g4_invreason', type: 'inverse', operation: 'divide',
        prompt: prod + ' ÷ ' + a + ' = ?',
        promptSub: 'If ' + a + ' × ' + b + ' = ' + prod,
        answer: b,
        key: 'g4:ir:id:' + prod + '/' + a,
        meta: { a: a, b: b, prod: prod, dividend: prod, divisor: a, quotient: b, baseFact: { a: a, b: b, op: 'div' } },
        visualSpec: null,
        hintEasy: 'Think: ' + a + ' × ? = ' + prod + '.',
        hintMed: 'Undo the multiply.',
        hintHard: prod + ' ÷ ' + a + '.'
      });
    }
    if (kind === 'compare') {
      var p2 = g4Pair(tier), guard = 0;
      while (p2.a * p2.b === prod && guard < 30) { p2 = g4Pair(tier); guard++; }
      if (p2.a * p2.b === prod) p2 = { a: a + 1, b: b };
      var prod2 = p2.a * p2.b;
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'multiply',
        prompt: 'Which is larger: ' + a + ' × ' + b + ' or ' + p2.a + ' × ' + p2.b + '? Type the larger value only.',
        answer: Math.max(prod, prod2),
        key: 'g4:ir:rc:' + a + 'x' + b + 'v' + p2.a + 'x' + p2.b,
        meta: { a: a, b: b, prod: prod, c: p2.a, d: p2.b, prod2: prod2, reasoning: 'compare', baseFact: null },
        visualSpec: null,
        hintEasy: 'Figure each side, then pick the bigger total.',
        hintMed: a + ' × ' + b + ' = ' + prod + '. ' + p2.a + ' × ' + p2.b + ' = ' + prod2 + '.',
        hintHard: 'Compare ' + prod + ' and ' + prod2 + '.'
      });
    }
    if (kind === 'tf') {
      var tfTrue = Math.random() < 0.4;
      var shown = tfTrue ? prod : prod + pick([-5, -4, -3, -2, 2, 3, 4, 5, 6]);
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'multiply',
        prompt: 'Is ' + a + ' × ' + b + ' = ' + shown + '? Type 1 for yes, 0 for no.',
        answer: tfTrue ? 1 : 0,
        key: 'g4:ir:tf:' + a + 'x' + b + ':' + shown,
        meta: { a: a, b: b, prod: prod, shown: shown, reasoning: 'tf', baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'What is ' + a + ' × ' + b + ' really?',
        hintMed: 'Work out ' + a + ' × ' + b + ', then compare it to ' + shown + '.',
        hintHard: 'Check the product.'
      });
    }
    if (kind === 'compare_div') {
      var p3 = g4Pair(tier), guard2 = 0;
      while (p3.b === b && guard2 < 30) { p3 = g4Pair(tier); guard2++; }
      if (p3.b === b) p3 = { a: p3.a, b: b === 12 ? 11 : b + 1 };
      var d1 = a * b, d2 = p3.a * p3.b;
      return makeQuestion({
        format: 'g4_invreason', type: 'reasoning', operation: 'divide',
        prompt: 'Which is larger: ' + d1 + ' ÷ ' + a + ' or ' + d2 + ' ÷ ' + p3.a + '? Type the larger value only.',
        answer: Math.max(b, p3.b),
        key: 'g4:ir:rdc:' + d1 + '/' + a + 'v' + d2 + '/' + p3.a,
        meta: { dividend: d1, divisor: a, quotient: b, dividend2: d2, divisor2: p3.a, quotient2: p3.b, reasoning: 'compare_div', baseFact: null },
        visualSpec: null,
        hintEasy: 'Solve both division facts and compare the answers.',
        hintMed: d1 + ' ÷ ' + a + ' = ' + b + '. ' + d2 + ' ÷ ' + p3.a + ' = ' + p3.b + '.',
        hintHard: 'Compare ' + b + ' and ' + p3.b + '.'
      });
    }
    // tf_div
    var tfDivTrue = Math.random() < 0.4;
    var shownQ = b + pick([-3, -2, -1, 1, 2, 3]);
    if (shownQ === b || shownQ < 1) shownQ = b + 1;
    if (tfDivTrue) shownQ = b;
    return makeQuestion({
      format: 'g4_invreason', type: 'reasoning', operation: 'divide',
      prompt: 'Is ' + prod + ' ÷ ' + a + ' = ' + shownQ + '? Type 1 for yes, 0 for no.',
      answer: tfDivTrue ? 1 : 0,
      key: 'g4:ir:rdt:' + prod + '/' + a + ':' + shownQ,
      meta: { dividend: prod, divisor: a, quotient: b, shown: shownQ, reasoning: 'tf_div', baseFact: { a: a, b: b, op: 'div' } },
      visualSpec: null,
      hintEasy: 'Work out the division fact first.',
      hintMed: 'Find ' + prod + ' ÷ ' + a + ', then compare it to ' + shownQ + '.',
      hintHard: 'Check the quotient.'
    });
  };

  BUILDERS.g4_warmup = function (tier) {
    var anchor = Math.random() < 0.7 ? pick([11, 12]) : randInt(6, 12);
    var other = tier <= -1 ? randInt(2, 6) : tier >= 1 ? randInt(6, 12) : randInt(2, 9);
    var flip = Math.random() < 0.5;
    var a = flip ? anchor : other;
    var b = flip ? other : anchor;
    var prod = a * b;
    return makeQuestion({
      format: 'g4_warmup',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g4:wu:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: { a: a, b: b, op: 'mul' } },
      visualSpec: visArray(a, b),
      hintEasy: 'For 11s, the digit repeats: 11 × 4 = 44. For 12s, do ×10 and ×2, then add them.',
      hintMed: 'Use a ×10 fact you know, then adjust.',
      hintHard: 'Recall ' + a + ' × ' + b + '.'
    });
  };

  // ---------- Grade 5 ----------
  BUILDERS.g5_bigmult = function (tier) {
    var a, b;
    if (tier <= -1) {
      a = randInt(11, 19);
      b = randInt(11, 19);
    } else if (tier >= 1) {
      a = randInt(112, 399);
      b = randInt(12, 49);
    } else {
      a = randInt(12, 49);
      b = randInt(12, 49);
    }
    var prod = a * b;
    var bOnes = b % 10;
    var bTens = b - bOnes;
    return makeQuestion({
      format: 'g5_bigmult',
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      key: 'g5:bm:' + a + 'x' + b,
      meta: { a: a, b: b, prod: prod, baseFact: null },
      visualSpec: null,
      hintEasy: 'Split ' + b + ' into ' + bTens + ' and ' + bOnes + '. Multiply ' + a + ' by each part, then add them.',
      hintMed: a + ' × ' + bTens + ' first, then ' + a + ' × ' + bOnes + '.',
      hintHard: 'Add the two partial products.'
    });
  };

  BUILDERS.g5_longdiv2 = function (tier) {
    var d, q, r;
    if (tier <= -1) {
      d = randInt(11, 20);
      q = randInt(2, 9);
      r = 0;
    } else if (tier >= 1) {
      d = randInt(21, 60);
      q = randInt(6, 20);
      r = Math.random() < 0.6 ? randInt(1, d - 1) : 0;
    } else {
      d = randInt(11, 30);
      q = randInt(3, 12);
      r = Math.random() < 0.5 ? randInt(1, d - 1) : 0;
    }
    var dividend = d * q + r;
    return makeQuestion({
      format: 'g5_longdiv2',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + d + ' = ?',
      promptSub: r > 0 ? 'This one has a remainder — put it in the R box.' : null,
      answer: q,
      answerR: r > 0 ? r : null,
      key: 'g5:ld2:' + dividend + '/' + d,
      meta: { dividend: dividend, divisor: d, quotient: q, baseFact: null },
      visualSpec: null,
      hintEasy: 'How many groups of ' + d + ' fit into ' + dividend + '?',
      hintMed: 'Try easy multiples first: ' + d + ' × 5 and ' + d + ' × 10, then zoom in.',
      hintHard: r > 0 ? 'The answer is not exact — the leftover goes in the R box.' : '? × ' + d + ' = ' + dividend + '.'
    });
  };

  BUILDERS.g5_pattern = function (tier) {
    var maxF = tier >= 1 ? 12 : 9;
    var a = randInt(2, maxF);
    var b = randInt(2, maxF);
    var p = a * b;
    var mult = tier <= -1 ? true : Math.random() < 0.5;
    if (mult) {
      var big = tier >= 1 || Math.random() < 0.5; // a0 × b0 vs a0 × b
      var x = a * 10;
      var y = big ? b * 10 : b;
      var ans = x * y;
      return makeQuestion({
        format: 'g5_pattern',
        type: 'basic',
        operation: 'multiply',
        prompt: x + ' × ' + y + ' = ?',
        answer: ans,
        key: 'g5:pat:' + x + 'x' + y,
        meta: { a: x, b: y, prod: ans, baseFact: { a: a, b: b, op: 'mul' } },
        visualSpec: null,
        hintEasy: 'Start with ' + a + ' × ' + b + ' = ' + p + ', then put the zeros back.',
        hintMed: 'Count the zeros in the question.',
        hintHard: 'It is ' + p + ' with the zeros attached.'
      });
    }
    var hundred = tier >= 1 && Math.random() < 0.5;
    var dividend = hundred ? p * 100 : p * 10;
    var divisor = a * 10;
    var ans2 = hundred ? b * 10 : b;
    return makeQuestion({
      format: 'g5_pattern',
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + divisor + ' = ?',
      answer: ans2,
      key: 'g5:pat:' + dividend + '/' + divisor,
      meta: { dividend: dividend, divisor: divisor, quotient: ans2, baseFact: { a: a, b: b, op: 'div' } },
      visualSpec: null,
      hintEasy: 'Start with ' + p + ' ÷ ' + a + ' = ' + b + ', then match the zeros.',
      hintMed: 'Cross off one zero from each side.',
      hintHard: 'It is ' + p + ' ÷ ' + a + ' with zeros.'
    });
  };

  BUILDERS.g5_orderops = function (tier) {
    var maxF = tier >= 1 ? 12 : 9;
    var a = randInt(2, maxF);
    var b = randInt(2, maxF);
    var prod = a * b;
    var useDiv = Math.random() < 0.5;
    var form = pick(['plus', 'minus']);
    var termStr, termVal, baseFact;
    if (useDiv) {
      termStr = prod + ' ÷ ' + a;
      termVal = b;
      baseFact = { a: a, b: b, op: 'div' };
    } else {
      termStr = a + ' × ' + b;
      termVal = prod;
      baseFact = { a: a, b: b, op: 'mul' };
    }
    var c, prompt, answer;
    if (form === 'plus') {
      c = randInt(2, 20);
      answer = termVal + c;
      // tier +1 may lead with the added term: '12 + 4 × 6'
      var leadWithC = tier >= 1 && Math.random() < 0.5;
      prompt = leadWithC ? c + ' + ' + termStr + ' = ?' : termStr + ' + ' + c + ' = ?';
    } else {
      c = termVal < 3 ? 1 : randInt(1, termVal - 1); // keep the result positive
      answer = termVal - c;
      prompt = termStr + ' - ' + c + ' = ?';
    }
    return makeQuestion({
      format: 'g5_orderops',
      type: 'expr',
      operation: 'expr',
      prompt: prompt,
      promptSub: 'Multiply or divide first!',
      answer: answer,
      key: 'g5:oo:' + prompt.replace(/\s+/g, '').replace('=?', ''),
      meta: { a: a, b: b, c: c, form: form, useDiv: useDiv, termVal: termVal, baseFact: baseFact },
      visualSpec: null,
      hintEasy: 'Do ' + termStr + ' first. That makes ' + termVal + '.',
      hintMed: 'Multiplication and division always come before adding or subtracting.',
      hintHard: 'Now just ' + (form === 'plus' ? termVal + ' plus ' + c : termVal + ' minus ' + c) + '.'
    });
  };

  var G5_WORD_TEMPLATES = [
    function () {
      var a = randInt(3, 9), b = randInt(2, 9), d = pick([2, 3, 4, 6]);
      var perBox = b * d;
      return {
        prompt: 'A school orders ' + a + ' boxes of ' + perBox + ' pencils and shares them equally among ' + d + ' classes. How many pencils does each class get?',
        answer: a * b,
        meta: { a: a, perBox: perBox, d: d, steps: 'mul_div', baseFact: null },
        hintFact: a + ' × ' + perBox + ' first, then ÷ ' + d
      };
    },
    function () {
      var k = randInt(2, 5), p1 = randInt(4, 9), m = randInt(2, 4), p2 = randInt(10, 15);
      return {
        prompt: 'Kid tickets cost ' + p1 + ' dollars and adult tickets cost ' + p2 + ' dollars. A family buys ' + k + ' kid tickets and ' + m + ' adult tickets. How many dollars do they pay?',
        answer: k * p1 + m * p2,
        meta: { k: k, p1: p1, m: m, p2: p2, steps: 'mul_mul_add', baseFact: null },
        hintFact: k + ' × ' + p1 + ' and ' + m + ' × ' + p2 + ', then add them'
      };
    },
    function () {
      var a = randInt(6, 12), b = randInt(11, 15), c = randInt(5, 20);
      return {
        prompt: 'A farmer picks ' + a + ' crates of ' + b + ' apples. ' + c + ' apples are rotten and thrown away. How many good apples are there?',
        answer: a * b - c,
        meta: { a: a, b: b, c: c, steps: 'mul_sub', baseFact: null },
        hintFact: a + ' × ' + b + ' first, then take away ' + c
      };
    },
    function () {
      var days = randInt(3, 6), laps = randInt(4, 8), meters = pick([25, 50, 100]);
      return {
        prompt: 'Nina swims ' + laps + ' laps every day for ' + days + ' days. Each lap is ' + meters + ' meters. How many meters does she swim in all?',
        answer: days * laps * meters,
        meta: { days: days, laps: laps, meters: meters, steps: 'mul_mul', baseFact: null },
        hintFact: laps + ' × ' + days + ' laps first, then × ' + meters
      };
    },
    function () {
      var d = pick([4, 6, 8]), boxes = randInt(6, 12), s = randInt(2, 4);
      var n = d * boxes;
      return {
        prompt: 'A baker makes ' + n + ' cupcakes and packs them into boxes of ' + d + '. He sells ' + s + ' full boxes. How many boxes are left?',
        answer: boxes - s,
        meta: { d: d, boxes: boxes, s: s, steps: 'div_sub', baseFact: { a: d, b: boxes, op: 'div' } },
        hintFact: n + ' ÷ ' + d + ' boxes first, then take away ' + s
      };
    },
    function () {
      var bags = randInt(6, 12), choc = randInt(3, 9), candy = randInt(3, 9);
      return {
        prompt: 'Each gift bag gets ' + choc + ' chocolates and ' + candy + ' candies. How many treats are needed to fill ' + bags + ' bags?',
        answer: bags * (choc + candy),
        meta: { bags: bags, choc: choc, candy: candy, steps: 'add_mul', baseFact: null },
        hintFact: choc + ' plus ' + candy + ' treats per bag first, then × ' + bags
      };
    }
  ];

  BUILDERS.g5_word = function (tier) {
    var idx = randInt(0, G5_WORD_TEMPLATES.length - 1);
    var t = G5_WORD_TEMPLATES[idx]();
    t.meta.template = idx;
    return makeQuestion({
      format: 'g5_word',
      type: 'word',
      operation: t.meta.steps.indexOf('div') === 0 ? 'divide' : 'multiply',
      prompt: t.prompt,
      answer: t.answer,
      key: 'g5:w:t' + idx + ':' + t.answer,
      meta: t.meta,
      visualSpec: null,
      hintEasy: 'Two steps: ' + t.hintFact + '.',
      hintMed: 'Break it into steps and write each one down.',
      hintHard: t.hintFact + '.'
    });
  };

  function g5BigFactor(tier) {
    return tier >= 1 ? randInt(31, 99) : randInt(21, 49);
  }

  BUILDERS.g5_reason = function (tier) {
    if (Math.random() < 0.5) {
      var a1 = g5BigFactor(tier), d1 = randInt(3, 9);
      var a2 = g5BigFactor(tier), d2 = randInt(3, 9);
      var guard = 0;
      while (a1 * d1 === a2 * d2 && guard < 30) {
        a2 = g5BigFactor(tier);
        d2 = randInt(3, 9);
        guard++;
      }
      if (a1 * d1 === a2 * d2) a2 = a2 + 1;
      var p1 = a1 * d1, p2 = a2 * d2;
      return makeQuestion({
        format: 'g5_reason',
        type: 'reasoning',
        operation: 'multiply',
        prompt: 'Which is larger: ' + a1 + ' × ' + d1 + ' or ' + a2 + ' × ' + d2 + '? Type the larger value only.',
        answer: Math.max(p1, p2),
        key: 'g5:rs:rc:' + a1 + 'x' + d1 + 'v' + a2 + 'x' + d2,
        meta: { a: a1, b: d1, prod: p1, c: a2, d: d2, prod2: p2, reasoning: 'compare', baseFact: null },
        visualSpec: null,
        hintEasy: 'Work out both products, then pick the bigger one.',
        hintMed: 'Estimate first: round each big number to the nearest ten.',
        hintHard: 'Compare ' + p1 + ' and ' + p2 + '.'
      });
    }
    var a = g5BigFactor(tier), d = randInt(3, 9);
    var prod = a * d;
    var tfTrue5 = Math.random() < 0.4;
    var shown5 = tfTrue5 ? prod : prod + pick([-30, -20, -10, 10, 20, 30]);
    return makeQuestion({
      format: 'g5_reason',
      type: 'reasoning',
      operation: 'multiply',
      prompt: 'Is ' + a + ' × ' + d + ' = ' + shown5 + '? Type 1 for yes, 0 for no.',
      answer: tfTrue5 ? 1 : 0,
      key: 'g5:rs:tf:' + a + 'x' + d + ':' + shown5,
      meta: { a: a, b: d, prod: prod, shown: shown5, reasoning: 'tf', baseFact: { a: a, b: d, op: 'mul' } },
      visualSpec: null,
      hintEasy: 'Work out ' + a + ' × ' + d + ' for real.',
      hintMed: 'Check the ones digit: what does ' + (a % 10) + ' × ' + d + ' end in?',
      hintHard: 'Compare your product to ' + shown5 + '.'
    });
  };

  // ---------- generation entry ----------
  function isTrueFalseQuestion(q) {
    var m = q.meta || {};
    return m.reasoning === 'tf' || m.reasoning === 'tf_div';
  }

  /**
   * Band-aware validation (replaces index.html's global guards for band questions):
   * - G2 allows answer < 2 and trivial facts; grades 3-5 require answer >= 2
   *   (except true/false answers 0/1 and order-of-ops answers >= 1).
   * - answerR only at grades 4/5, with divisor*quotient + r === dividend and 0 < r < divisor.
   * - ASCII '+' / digit-minus-digit prompts only for format 'g5_orderops'.
   * - All answers are non-negative integers.
   */
  function validateBandQuestion(q, grade) {
    if (!q || typeof q !== 'object') return false;
    if (GRADES.indexOf(grade) === -1) return false;
    if (q.grade !== grade) return false;
    if (q.operation !== 'multiply' && q.operation !== 'divide' && q.operation !== 'expr') return false;
    if (typeof q.key !== 'string' || !q.key) return false;
    if (typeof q.prompt !== 'string' || !q.prompt) return false;
    if (q.level !== 'easy' && q.level !== 'medium' && q.level !== 'hard') return false;

    if (typeof q.answer !== 'number' || !Number.isFinite(q.answer) || q.answer !== Math.floor(q.answer)) return false;
    if (q.answer < 0) return false;

    var isOrderOps = q.format === 'g5_orderops';
    if (q.operation === 'expr' && !isOrderOps) return false;
    if (!isOrderOps) {
      if (q.prompt.indexOf('+') !== -1) return false;
      if (/\d\s*[-−]\s*\d/.test(q.prompt)) return false;
    }

    if (q.answerR != null) {
      if (grade !== 4 && grade !== 5) return false;
      var m = q.meta || {};
      if (typeof q.answerR !== 'number' || q.answerR !== Math.floor(q.answerR)) return false;
      if (typeof m.divisor !== 'number' || typeof m.dividend !== 'number') return false;
      if (!(q.answerR > 0 && q.answerR < m.divisor)) return false;
      if (m.divisor * q.answer + q.answerR !== m.dividend) return false;
      if (m.remainder !== true) return false;
    }

    if (isTrueFalseQuestion(q)) {
      if (q.answer !== 0 && q.answer !== 1) return false;
    } else if (isOrderOps) {
      if (q.answer < 1) return false;
    } else if (grade >= 3) {
      if (q.answer < 2) return false;
    }

    return true;
  }

  /** Public entry: build a validated question for a format token, or null after 60 tries. */
  function generateForSlot(formatToken, tier) {
    var builder = BUILDERS[formatToken];
    if (!builder) return null;
    var grade = gradeOfFormat(formatToken);
    var t = typeof tier === 'number' ? tier : 0;
    for (var attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      var q = builder(t);
      if (q && validateBandQuestion(q, grade)) return q;
    }
    return null;
  }

  /**
   * Drift-up bonus: one question from the NEXT band's gentlest format.
   * The caller (index.html, chunk 3) marks it isBonus — no heart loss, no accuracy impact.
   */
  function generateDriftBonus(grade, tier) {
    var t = typeof tier === 'number' ? tier : 0;
    if (grade === 2) return generateForSlot('g3_missing', -1);
    if (grade === 3) {
      for (var i = 0; i < MAX_GENERATE_ATTEMPTS; i++) {
        var q = generateForSlot('g4_multidigit', -1);
        if (q && q.answer <= 100) return q;
      }
      return null;
    }
    if (grade === 4) return generateForSlot('g5_pattern', Math.min(t, 0));
    return null;
  }

  global.GradeBands = {
    GRADES: GRADES.slice(),
    RECIPES: RECIPES,
    FAST_FORMATS: FAST_FORMATS,
    buildRoundPlan: buildRoundPlan,
    generateForSlot: generateForSlot,
    validateBandQuestion: validateBandQuestion,
    generateDriftBonus: generateDriftBonus,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe,
      levelForFormat: levelForFormat,
      BUILDERS: BUILDERS
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
