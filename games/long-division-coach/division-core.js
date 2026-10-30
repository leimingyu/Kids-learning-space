(function (global) {
  'use strict';

  const VERSION = 1;
  const PHASES = ['divide', 'multiply', 'subtract', 'bringDown', 'done'];
  const PLACE_NAMES = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands'];

  function integer(value, label, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(label + ' must be a whole number from ' + min + ' to ' + max + '.');
    }
    return value;
  }

  function clone(engine) {
    return {
      ...engine,
      dividendDigits: engine.dividendDigits.slice(),
      quotientDigits: engine.quotientDigits.slice(),
      initialChunk: { ...engine.initialChunk },
      rows: engine.rows.map(function (row) { return { ...row }; }),
      answerLog: engine.answerLog.slice()
    };
  }

  function create(dividend, divisor) {
    integer(dividend, 'Dividend', 0, 99999);
    integer(divisor, 'Divisor', 2, 9);
    const digits = String(dividend).split('').map(Number);
    let current = 0;
    let end = 0;
    for (; end < digits.length; end += 1) {
      current = current * 10 + digits[end];
      if (current >= divisor || end === digits.length - 1) break;
    }
    const engine = {
      version: VERSION,
      dividend: dividend,
      divisor: divisor,
      dividendDigits: digits,
      quotientDigits: digits.map(function () { return null; }),
      initialChunk: { value: current, startCol: 0, endCol: end },
      usedGrabOneMoreDigit: end > 0,
      phase: 'divide',
      currentValue: current,
      activeStartIndex: 0,
      activeEndIndex: end,
      activeQuotientIndex: end,
      cursorIndex: end + 1,
      qDigit: null,
      product: null,
      remainder: null,
      quotient: null,
      rows: [],
      cycle: 0,
      stepsCompleted: 0,
      answerLog: []
    };
    if (dividend < divisor) {
      engine.quotientDigits[end] = 0;
      engine.quotient = 0;
      engine.remainder = dividend;
      engine.phase = 'done';
    }
    return engine;
  }

  function expectation(engine) {
    const phase = engine.phase;
    const divisor = engine.divisor;
    const current = engine.currentValue;
    const power = engine.dividendDigits.length - 1 - engine.activeEndIndex;
    const descriptor = {
      phase: phase,
      expected: null,
      expectedValue: null,
      currentValue: current,
      divisor: divisor,
      column: engine.activeQuotientIndex,
      startCol: engine.activeStartIndex,
      endCol: engine.activeEndIndex,
      placeValue: Math.pow(10, power),
      placeName: PLACE_NAMES[power] || 'places',
      zeroQuotient: false,
      prompt: '',
      operands: []
    };
    if (phase === 'divide') {
      descriptor.expected = Math.floor(current / divisor);
      descriptor.zeroQuotient = current < divisor;
      descriptor.prompt = 'How many ' + divisor + 's fit in ' + current + '?';
      descriptor.operands = [current, divisor];
    } else if (phase === 'multiply') {
      descriptor.expected = divisor * engine.qDigit;
      descriptor.prompt = 'Multiply: ' + divisor + ' × ' + engine.qDigit + ' = ?';
      descriptor.operands = [divisor, engine.qDigit];
    } else if (phase === 'subtract') {
      descriptor.expected = current - engine.product;
      descriptor.prompt = 'Subtract: ' + current + ' − ' + engine.product + ' = ?';
      descriptor.operands = [current, engine.product];
    } else if (phase === 'bringDown') {
      descriptor.expected = engine.dividendDigits[engine.cursorIndex];
      descriptor.prompt = 'Bring down just the next digit from the dividend.';
      descriptor.column = engine.cursorIndex;
      descriptor.endCol = engine.cursorIndex;
      descriptor.placeValue = Math.pow(10, engine.dividendDigits.length - 1 - engine.cursorIndex);
      descriptor.placeName = PLACE_NAMES[engine.dividendDigits.length - 1 - engine.cursorIndex] || 'places';
      descriptor.operands = [engine.remainder, descriptor.expected];
    } else if (phase === 'done') {
      descriptor.prompt = 'Division complete.';
    } else {
      throw new Error('Unknown division phase.');
    }
    descriptor.expectedValue = descriptor.expected;
    return descriptor;
  }

  function row(type, value, endCol, cycle, extra) {
    return {
      type: type,
      value: value,
      text: String(value),
      startCol: Math.max(0, endCol - String(value).length + 1),
      endCol: endCol,
      cycle: cycle,
      ...(extra || {})
    };
  }

  function wrongFeedback(engine, value, expected) {
    if (!Number.isSafeInteger(value) || value < 0) return 'Enter a whole number that is zero or greater.';
    if (engine.phase === 'divide') {
      if (expected === 0) return engine.currentValue + ' is smaller than ' + engine.divisor + '. No whole group fits in this place; we need a zero.';
      if (value > expected) return engine.divisor + ' × ' + value + ' = ' + (engine.divisor * value) + ', which is more than ' + engine.currentValue + '. Try fewer groups.';
      return 'Another group of ' + engine.divisor + ' would still fit. Try a larger digit.';
    }
    if (engine.phase === 'multiply') return 'Check ' + engine.divisor + ' × ' + engine.qDigit + '. This tells us how much has been shared.';
    if (engine.phase === 'subtract') return 'Check ' + engine.currentValue + ' − ' + engine.product + '. How much is left?';
    if (engine.phase === 'bringDown') {
      const combined = engine.remainder * 10 + expected;
      if (combined !== expected && value === combined) return 'Bring down just the next digit, ' + expected + '. The board will combine it with the remainder.';
      return 'Look for the next unused digit in the dividend. Bring down just that digit.';
    }
    return 'Check this step and try again.';
  }

  function submit(engine, value) {
    if (!engine || PHASES.indexOf(engine.phase) < 0) throw new Error('Invalid division state.');
    if (engine.phase === 'done') return { correct: false, next: engine, feedback: { kind: 'neutral', message: 'This problem is already complete.' } };
    const expected = expectation(engine).expected;
    if (!Number.isSafeInteger(value) || value < 0 || value !== expected) {
      return { correct: false, next: engine, feedback: { kind: 'error', message: wrongFeedback(engine, value, expected) } };
    }
    const next = clone(engine);
    next.answerLog.push(value);
    next.stepsCompleted += 1;
    let message = '';
    if (engine.phase === 'divide') {
      next.qDigit = value;
      next.quotientDigits[next.activeQuotientIndex] = value;
      next.rows.push(row('typedigit', value, next.activeQuotientIndex, next.cycle));
      next.phase = 'multiply';
      message = value === 0 ? 'Zero keeps this place in the answer. Now multiply.' : 'That fits! Now multiply to find how much was shared.';
    } else if (engine.phase === 'multiply') {
      next.product = value;
      next.rows.push(row('product', value, next.activeEndIndex, next.cycle));
      next.phase = 'subtract';
      message = 'Good multiplication. Now find what is left.';
    } else if (engine.phase === 'subtract') {
      next.remainder = value;
      next.rows.push(row('subtractionResult', value, next.activeEndIndex, next.cycle));
      if (next.cursorIndex >= next.dividendDigits.length) {
        next.phase = 'done';
        next.quotient = Number(next.quotientDigits.filter(function (digit) { return digit !== null; }).join('')) || 0;
        message = 'You completed every step!';
      } else {
        next.phase = 'bringDown';
        message = 'That is what is left. Bring down the next digit.';
      }
    } else if (engine.phase === 'bringDown') {
      const combined = next.remainder * 10 + value;
      const endCol = next.cursorIndex;
      next.rows.push(row('broughtDown', combined, endCol, next.cycle, { digit: value, sourceColumn: endCol, previousRemainder: next.remainder }));
      next.currentValue = combined;
      next.activeEndIndex = endCol;
      next.activeStartIndex = Math.max(0, endCol - String(combined).length + 1);
      next.activeQuotientIndex = endCol;
      next.cursorIndex = endCol + 1;
      next.qDigit = null;
      next.product = null;
      next.remainder = null;
      next.cycle += 1;
      next.phase = 'divide';
      message = 'The new number is ' + combined + '. Divide again.';
    }
    if (next.phase === 'done' && !checkFinal(next)) throw new Error('Division result did not balance.');
    return { correct: true, next: next, feedback: { kind: 'success', message: message } };
  }

  function displayRows(engine) {
    const rows = [];
    engine.rows.forEach(function (event) {
      if (event.type === 'typedigit') return;
      if (event.type === 'broughtDown' && rows.length && rows[rows.length - 1].type === 'subtractionResult') {
        rows.pop();
      }
      rows.push({ ...event });
    });
    return rows;
  }

  function answer(engine) {
    if (engine.phase !== 'done') return null;
    return {
      quotient: engine.quotient,
      remainder: engine.remainder,
      text: engine.dividend + ' ÷ ' + engine.divisor + ' = ' + engine.quotient + (engine.remainder ? ' remainder ' + engine.remainder : '')
    };
  }

  function checkFinal(engine) {
    return !!engine && engine.phase === 'done' && Number.isSafeInteger(engine.quotient) && Number.isSafeInteger(engine.remainder) && engine.remainder >= 0 && engine.remainder < engine.divisor && engine.quotient * engine.divisor + engine.remainder === engine.dividend;
  }

  function replay(dividend, divisor, answers) {
    if (!Array.isArray(answers) || answers.length > 256) throw new Error('Invalid answer history.');
    let engine = create(dividend, divisor);
    answers.forEach(function (value) {
      const result = submit(engine, value);
      if (!result.correct) throw new Error('Answer history contains an invalid step.');
      engine = result.next;
    });
    return engine;
  }

  function validate(snapshot) {
    try {
      if (!snapshot || snapshot.version !== VERSION) throw new Error('Unknown division state version.');
      const canonical = replay(snapshot.dividend, snapshot.divisor, snapshot.answerLog);
      const keys = Object.keys(canonical);
      const equal = keys.every(function (key) { return JSON.stringify(snapshot[key]) === JSON.stringify(canonical[key]); });
      if (!equal) throw new Error('Stored division state does not match its answer history.');
      return { valid: true, reason: null, canonical: canonical };
    } catch (error) {
      return { valid: false, reason: error.message, canonical: null };
    }
  }

  global.DivisionPracticeCore = Object.freeze({
    version: VERSION,
    create: create,
    expectation: expectation,
    submit: submit,
    displayRows: displayRows,
    replay: replay,
    validate: validate,
    answer: answer,
    checkFinal: checkFinal
  });
})(typeof window !== 'undefined' ? window : globalThis);
