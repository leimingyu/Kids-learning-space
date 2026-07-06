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

  // ---------- generation entry ----------
  // Permissive stub — replaced with real band rules in Task 5.
  function validateBandQuestion(q, grade) {
    return !!q && typeof q === 'object';
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

  global.GradeBands = {
    GRADES: GRADES.slice(),
    RECIPES: RECIPES,
    FAST_FORMATS: FAST_FORMATS,
    buildRoundPlan: buildRoundPlan,
    generateForSlot: generateForSlot,
    validateBandQuestion: validateBandQuestion,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe,
      levelForFormat: levelForFormat,
      BUILDERS: BUILDERS
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
