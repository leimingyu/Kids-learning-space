/**
 * Learning intelligence layer (fact families, weakness signals, follow-up specs).
 * Does not replace the random generator in index.html — remediation builds
 * deterministic raw questions compatible with finalizeQuestion(raw, level, mode).
 */
(function (global) {
  'use strict';

  var FAMILY_FACTORS = [3, 4, 5, 6, 7, 8, 9];
  var FLUENCY_MIN = 2;
  var FLUENCY_MAX = 9;

  function inFamilyRange(n) {
    return typeof n === 'number' && n >= FLUENCY_MIN && n <= FLUENCY_MAX;
  }

  function isFamilyTable(n) {
    return FAMILY_FACTORS.indexOf(n) !== -1;
  }

  function uniq(ids) {
    var o = {};
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (!o[ids[i]]) {
        o[ids[i]] = true;
        out.push(ids[i]);
      }
    }
    return out;
  }

  /**
   * @param {object} q - live question or questionSnapshot (needs operation, type, meta)
   * @returns {{
   *   kind: string,
   *   operation: string|null,
   *   familyIds: string[],
   *   primaryFactors: number[],
   *   meta: object
   * }}
   */
  function getFactFamily(q) {
    if (!q || typeof q !== 'object') {
      return { kind: 'unknown', operation: null, familyIds: [], primaryFactors: [], meta: {} };
    }
    var op = q.operation;
    var type = q.type;
    var m = q.meta || {};

    if (type === 'reasoning') {
      var ids = [];
      if (op === 'multiply' && m.reasoning === 'compare' && m.a != null && m.b != null && m.c != null && m.d != null) {
        [m.a, m.b, m.c, m.d].forEach(function (f) {
          if (isFamilyTable(f)) ids.push('mul:' + f);
        });
      } else if (op === 'multiply' && m.reasoning === 'tf' && m.a != null && m.b != null) {
        if (isFamilyTable(m.a)) ids.push('mul:' + m.a);
        if (isFamilyTable(m.b)) ids.push('mul:' + m.b);
      } else if (op === 'divide' && m.reasoning === 'compare_div') {
        [m.divisor, m.divisor2, m.quotient, m.quotient2].forEach(function (f) {
          if (f != null && isFamilyTable(f)) ids.push('div:' + f);
        });
      } else if (op === 'divide' && m.reasoning === 'tf_div' && m.divisor != null) {
        if (isFamilyTable(m.divisor)) ids.push('div:' + m.divisor);
        if (m.quotient != null && isFamilyTable(m.quotient)) ids.push('div:' + m.quotient);
      }
      return {
        kind: 'reasoning',
        operation: op,
        familyIds: uniq(ids),
        primaryFactors: [],
        meta: { reasoning: m.reasoning },
      };
    }

    if (op === 'multiply') {
      if (m.a != null && m.b != null && m.prod != null) {
        var fac = [];
        if (isFamilyTable(m.a)) fac.push(m.a);
        if (isFamilyTable(m.b)) fac.push(m.b);
        var fids = fac.map(function (n) {
          return 'mul:' + n;
        });
        return {
          kind: 'fact',
          operation: 'multiply',
          familyIds: uniq(fids),
          primaryFactors: fac.slice().sort(function (a, b) {
            return a - b;
          }),
          meta: { a: m.a, b: m.b, prod: m.prod },
        };
      }
      return { kind: 'fact', operation: 'multiply', familyIds: [], primaryFactors: [], meta: {} };
    }

    if (op === 'divide') {
      if (m.dividend != null && m.divisor != null && m.quotient != null) {
        var dIds = [];
        if (isFamilyTable(m.divisor)) dIds.push('div:' + m.divisor);
        if (isFamilyTable(m.quotient)) dIds.push('div:' + m.quotient);
        return {
          kind: 'fact',
          operation: 'divide',
          familyIds: uniq(dIds),
          primaryFactors: [m.divisor, m.quotient].filter(inFamilyRange).sort(function (a, b) {
            return a - b;
          }),
          meta: {
            dividend: m.dividend,
            divisor: m.divisor,
            quotient: m.quotient,
          },
        };
      }
      return { kind: 'fact', operation: 'divide', familyIds: [], primaryFactors: [], meta: {} };
    }

    return { kind: 'unknown', operation: op || null, familyIds: [], primaryFactors: [], meta: {} };
  }

  function questionFromRecord(rec) {
    if (!rec) return null;
    if (rec.questionSnapshot) return rec.questionSnapshot;
    return null;
  }

  function weaknessFromMastery(familyId, stats) {
    if (!stats || !stats.families || !stats.families[familyId]) return 0;
    var f = stats.families[familyId];
    var m = typeof f.masteryPct === 'number' ? f.masteryPct : 0;
    if (m >= 1) return 0;
    return 1 - m;
  }

  /**
   * @param {object} store - wrong answer store: { wrongAnswersHistory?, recentWrongAnswers? }
   * @param {object} [familyStats] - optional output of createEmptyFamilyStats() merged with session data
   * @returns {Array<{ familyId: string, weaknessScore: number, missWeight: number, distinctMistakes: number, masteryGap: number }>}
   */
  function getWeakFamilies(store, familyStats) {
    store = store || {};
    var hist = Array.isArray(store.wrongAnswersHistory) ? store.wrongAnswersHistory : [];
    var agg = {};

    for (var i = 0; i < hist.length; i++) {
      var rec = hist[i];
      if (rec.resolved) continue;
      var q = questionFromRecord(rec);
      if (!q) continue;
      var ff = getFactFamily(q);
      var miss = typeof rec.missCount === 'number' ? rec.missCount : 1;
      var nFam = ff.familyIds.length;
      var share = nFam ? miss / nFam : miss;
      for (var j = 0; j < ff.familyIds.length; j++) {
        var fid = ff.familyIds[j];
        if (!agg[fid]) {
          agg[fid] = { missWeight: 0, keys: {} };
        }
        agg[fid].missWeight += share;
        agg[fid].keys[rec.key || rec.id || j + '_' + i] = true;
      }
    }

    var out = [];
    for (var fid2 in agg) {
      if (!Object.prototype.hasOwnProperty.call(agg, fid2)) continue;
      var distinct = 0;
      for (var k in agg[fid2].keys) {
        if (Object.prototype.hasOwnProperty.call(agg[fid2].keys, k)) distinct++;
      }
      var mg = weaknessFromMastery(fid2, familyStats);
      var score = agg[fid2].missWeight + 0.25 * distinct + 2 * mg;
      out.push({
        familyId: fid2,
        weaknessScore: score,
        missWeight: agg[fid2].missWeight,
        distinctMistakes: distinct,
        masteryGap: mg,
      });
    }

    out.sort(function (a, b) {
      return b.weaknessScore - a.weaknessScore;
    });
    return out;
  }

  function hintsForMult(a, b) {
    var prod = a * b;
    return {
      hintEasy: 'Picture ' + a + ' groups with ' + b + ' in each. Skip-count by ' + b + '.',
      hintMed: a + ' × ' + b + ' — which fact is it?',
      hintHard: 'Recall ' + a + ' × ' + b + '.',
    };
  }

  function hintsForDiv(dividend, divisor, quotient) {
    return {
      hintEasy: 'Split ' + dividend + ' into ' + divisor + ' equal shares.',
      hintMed: 'What times ' + divisor + ' equals ' + dividend + '?',
      hintHard: '? × ' + divisor + ' = ' + dividend + '.',
    };
  }

  function rawMultBasic(a, b, tag) {
    tag = tag || 'fu';
    var prod = a * b;
    var h = hintsForMult(a, b);
    return {
      key: 'bm|' + a + 'x' + b + '|' + tag,
      type: 'basic',
      operation: 'multiply',
      prompt: a + ' × ' + b + ' = ?',
      answer: prod,
      meta: { a: a, b: b, prod: prod, anchor: b },
      visualSpec: { kind: 'array', a: a, b: b },
      hintEasy: h.hintEasy,
      hintMed: h.hintMed,
      hintHard: h.hintHard,
    };
  }

  function rawDivBasic(dividend, divisor, quotient, tag) {
    tag = tag || 'fu';
    var h = hintsForDiv(dividend, divisor, quotient);
    return {
      key: 'bd|' + dividend + '/' + divisor + '|' + tag,
      type: 'basic',
      operation: 'divide',
      prompt: dividend + ' ÷ ' + divisor + ' = ?',
      answer: quotient,
      meta: { dividend: dividend, divisor: divisor, quotient: quotient, anchor: divisor },
      visualSpec: { kind: 'groups', groups: divisor, per: quotient },
      hintEasy: h.hintEasy,
      hintMed: h.hintMed,
      hintHard: h.hintHard,
    };
  }

  /**
   * Ordered pool of remediation raw questions for a missed item.
   * @returns {object[]}
   */
  function getFollowUpRawPool(baseQuestion) {
    var q = baseQuestion;
    if (!q || !q.meta) return [];
    var m = q.meta;
    var pool = [];

    if (q.operation === 'multiply' && m.a != null && m.b != null && m.prod != null) {
      var a = m.a;
      var b = m.b;
      var prod = m.prod;
      if (a * b !== prod) return [];

      if (b > FLUENCY_MIN) pool.push(rawMultBasic(a, b - 1, 'nb'));
      if (b < FLUENCY_MAX) pool.push(rawMultBasic(a, b + 1, 'na'));
      if (a > FLUENCY_MIN) pool.push(rawMultBasic(a - 1, b, 'pa'));
      if (a < FLUENCY_MAX) pool.push(rawMultBasic(a + 1, b, 'pb'));

      pool.push(rawDivBasic(prod, a, b, 'ida'));
      pool.push(rawDivBasic(prod, b, a, 'idb'));
      return pool;
    }

    if (q.operation === 'divide' && m.dividend != null && m.divisor != null && m.quotient != null) {
      var dividend = m.dividend;
      var divisor = m.divisor;
      var quotient = m.quotient;
      if (divisor * quotient !== dividend) return [];

      pool.push(rawMultBasic(divisor, quotient, 'inv'));
      if (quotient >= FLUENCY_MIN && quotient <= FLUENCY_MAX && dividend % quotient === 0) {
        var altQ = dividend / quotient;
        if (altQ >= FLUENCY_MIN && altQ <= FLUENCY_MAX && altQ !== divisor) {
          pool.push(rawDivBasic(dividend, quotient, altQ, 'swap'));
        }
      }
      if (divisor < FLUENCY_MAX) {
        var dN = divisor + 1;
        if (dividend % dN === 0) {
          var qN = dividend / dN;
          if (qN >= FLUENCY_MIN && qN <= FLUENCY_MAX) pool.push(rawDivBasic(dividend, dN, qN, 'nd'));
        }
      }
      if (divisor > FLUENCY_MIN) {
        var dP = divisor - 1;
        if (dP >= 2 && dividend % dP === 0) {
          var qP = dividend / dP;
          if (qP >= FLUENCY_MIN && qP <= FLUENCY_MAX) pool.push(rawDivBasic(dividend, dP, qP, 'pd'));
        }
      }
      return pool.filter(function (r) {
        return (
          r &&
          typeof r.answer === 'number' &&
          Number.isFinite(r.answer) &&
          r.meta &&
          (r.operation !== 'divide' || r.meta.dividend === r.meta.divisor * r.meta.quotient)
        );
      });
    }

    return [];
  }

  /**
   * One deterministic follow-up raw question (stable choice for same base).
   * @returns {object|null} raw question for finalizeQuestion, or null
   */
  function generateFollowUpQuestion(baseQuestion) {
    var pool = getFollowUpRawPool(baseQuestion);
    if (!pool.length) return null;
    var key = String((baseQuestion && baseQuestion.key) || '');
    var sum = 0;
    for (var i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    var idx = sum % pool.length;
    return pool[idx];
  }

  /**
   * @returns {object} persistent-friendly family tracking shell (merge with localStorage in data agent).
   */
  function createEmptyFamilyStats() {
    return {
      version: 1,
      updatedAt: null,
      families: {},
    };
  }

  /**
   * @param {string} familyId - e.g. mul:6 or div:7
   * @returns {object} single family record template
   */
  function defaultFamilyRecord(familyId) {
    return {
      familyId: familyId,
      attempts: 0,
      correctCount: 0,
      accuracy: 0,
      masteryPct: 0,
      lastPracticedAt: null,
    };
  }

  /**
   * Merge attempt into stats (call after each graded answer targeting a family).
   * @param {object} stats - createEmptyFamilyStats().families map host — pass full stats object
   * @param {string} familyId
   * @param {boolean} correct
   */
  function recordFamilyAttempt(stats, familyId, correct) {
    if (!stats || !stats.families) return;
    if (!stats.families[familyId]) stats.families[familyId] = defaultFamilyRecord(familyId);
    var f = stats.families[familyId];
    f.attempts += 1;
    if (correct) f.correctCount += 1;
    f.accuracy = f.attempts ? f.correctCount / f.attempts : 0;
    f.masteryPct = computeMasteryPct(f);
    f.lastPracticedAt = new Date().toISOString();
    stats.updatedAt = f.lastPracticedAt;
  }

  function computeMasteryPct(f) {
    if (!f.attempts) return 0;
    var acc = f.correctCount / f.attempts;
    var n = Math.min(f.attempts / 20, 1);
    return Math.round(100 * acc * (0.5 + 0.5 * n)) / 100;
  }

  global.LearningIntel = {
    getFactFamily: getFactFamily,
    getWeakFamilies: getWeakFamilies,
    generateFollowUpQuestion: generateFollowUpQuestion,
    getFollowUpRawPool: getFollowUpRawPool,
    createEmptyFamilyStats: createEmptyFamilyStats,
    defaultFamilyRecord: defaultFamilyRecord,
    recordFamilyAttempt: recordFamilyAttempt,
    FAMILY_FACTORS: FAMILY_FACTORS.slice(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
