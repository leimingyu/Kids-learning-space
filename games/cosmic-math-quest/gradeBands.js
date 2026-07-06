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

  global.GradeBands = {
    GRADES: GRADES.slice(),
    RECIPES: RECIPES,
    FAST_FORMATS: FAST_FORMATS,
    buildRoundPlan: buildRoundPlan,
    _internals: {
      shuffle: shuffle,
      expandRecipe: expandRecipe
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
