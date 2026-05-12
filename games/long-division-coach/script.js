/* Long Division Coach — v1
   Maintainability refactor (no behavior changes):
   - Engine: pure functions (math + long-division step state)
   - App: state transitions + history
   - View: DOM-only render helpers
*/

(() => {
  "use strict";

  /**
   * @typedef {'easy'|'medium'|'hard'} Difficulty
   * @typedef {'demo'|'guided'|'independent'} Mode
   * @typedef {'divide'|'multiply'|'subtract'|'bringDown'|'done'} Phase
   *
   * @typedef {Object} Problem
   * @property {number} dividend
   * @property {number} divisor
   * @property {Difficulty} difficulty
   * @property {number} expectedQuotient
   * @property {number} expectedRemainder
   *
   * @typedef {'product'|'subtractionResult'|'broughtDown'|'note'} WorkRowType
   * @typedef {'normal'|'active'|'error'|'success'} WorkRowStatus
   *
   * @typedef {Object} WorkRow
   * @property {WorkRowType} type
   * @property {number|string} value
   * @property {number} alignedToQuotientIndex
  * @property {number} startCol
  * @property {number} endCol
   * @property {WorkRowStatus} status
   *
   * @typedef {Object} EngineState
   * @property {Phase} phase
   * @property {number[]} dividendDigits
   * @property {number} divisor
   * @property {number} cursorIndex
   * @property {number} currentValue
   * @property {number} activeStartIndex
   * @property {number} activeEndIndex
   * @property {number} activeQuotientIndex
   * @property {Array<number|null>} quotientDigits
   * @property {number|null} qDigit
   * @property {number|null} product
   * @property {number|null} remainder
   * @property {WorkRow[]} rows
   * @property {boolean} usedGrabOneMoreDigit
   */

  /**
   * @typedef {Object} Feedback
   * @property {'none'|'success'|'error'|'neutral'} kind
   * @property {string} message
   */

  /**
   * @typedef {Object} UIState
   * @property {Mode} mode
   * @property {Difficulty} difficulty
   * @property {Problem|null} problem
   * @property {EngineState|null} engine
   * @property {string} inputValue
   * @property {Feedback} feedback
   * @property {number} attemptsThisStep
   * @property {number} hintsUsedThisProblem
   * @property {{problemsDone:number, stepsCorrect:number, streak:number, stars:number}} sessionStats
   * @property {EngineState[]} history
   */

  // -----------------------
  // Utilities (pure)
  // -----------------------

  /** @param {number} n */
  function toInt(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  }

  /** @param {number} min @param {number} max */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** @param {number} n */
  function digitsOf(n) {
    const s = String(Math.abs(n));
    return Array.from(s).map((ch) => Number(ch));
  }

  /** @param {EngineState} e */
  function cloneEngineState(e) {
    return {
      ...e,
      dividendDigits: [...e.dividendDigits],
      quotientDigits: [...e.quotientDigits],
      rows: e.rows.map((r) => ({ ...r })),
    };
  }

  /** @param {Difficulty} difficulty */
  function getDifficultyLabel(difficulty) {
    if (difficulty === "easy") return "Easy";
    if (difficulty === "medium") return "Medium";
    return "Hard";
  }

  // -----------------------
  // Problem generator (pure)
  // -----------------------

  /** @param {Difficulty} difficulty @returns {Problem} */
  function generateProblem(difficulty) {
    // v1 approach:
    // - Easy: always divisible, 1-digit divisor, 2–3 digit dividend, avoid quotient zeros
    // - Medium: allow remainder, 1–2 digit divisor, 3–4 digit dividend, some quotient zeros
    // - Hard: 2-digit divisor, 4–5 digit dividend, remainder common, zeros common

    if (difficulty === "easy") {
      const divisor = randInt(2, 9);
      // Choose a quotient that won't create a quotient digit 0 and keeps dividend 2–3 digits.
      // Prefer 2-digit quotient (to practice the cycle more than once).
      let quotient = 0;
      for (let tries = 0; tries < 500; tries++) {
        quotient = randInt(12, 99);
        const qDigits = digitsOf(quotient);
        if (qDigits.includes(0)) continue;
        const dividend = divisor * quotient;
        const dLen = String(dividend).length;
        if (dLen < 2 || dLen > 3) continue;
        return {
          dividend,
          divisor,
          difficulty,
          expectedQuotient: quotient,
          expectedRemainder: 0,
        };
      }
      // Fallback (should be rare)
      const fallbackDividend = divisor * 24;
      return {
        dividend: fallbackDividend,
        divisor,
        difficulty,
        expectedQuotient: 24,
        expectedRemainder: 0,
      };
    }

    if (difficulty === "medium") {
      const divisor = randInt(2, 12);
      const dividend = randInt(120, 9999); // 3–4 digits typical
      const expectedQuotient = Math.floor(dividend / divisor);
      const expectedRemainder = dividend % divisor;
      return {
        dividend,
        divisor,
        difficulty,
        expectedQuotient,
        expectedRemainder,
      };
    }

    // hard
    const divisor = randInt(10, 99);
    const dividend = randInt(1000, 99999); // 4–5 digits typical
    const expectedQuotient = Math.floor(dividend / divisor);
    const expectedRemainder = dividend % divisor;
    return {
      dividend,
      divisor,
      difficulty: "hard",
      expectedQuotient,
      expectedRemainder,
    };
  }

  // -----------------------
  // Engine (pure functions)
  // -----------------------

  /**
   * Choose the smallest left chunk of dividend digits that is >= divisor.
   * @param {number[]} dividendDigits
   * @param {number} divisor
   */
  function pickInitialChunk(dividendDigits, divisor) {
    let value = 0;
    let end = -1;
    for (let i = 0; i < dividendDigits.length; i++) {
      value = value * 10 + dividendDigits[i];
      end = i;
      if (value >= divisor) break;
    }
    // If still smaller than divisor even after consuming all digits, we still "start" at full number.
    return { value, endIndex: end };
  }

  /** @param {Problem} problem @returns {EngineState} */
  function createEngine(problem) {
    const dividendDigits = digitsOf(problem.dividend);
    const divisor = problem.divisor;
    const { value: startValue, endIndex } = pickInitialChunk(dividendDigits, divisor);
    const quotientDigits = Array.from({ length: dividendDigits.length }, () => null);
    const activeStartIndex = 0;
    const activeEndIndex = Math.max(0, endIndex);
    const activeQuotientIndex = activeEndIndex; // place the quotient digit above the last digit used

    /** @type {EngineState} */
    const e = {
      phase: "divide",
      dividendDigits,
      divisor,
      cursorIndex: activeEndIndex + 1,
      currentValue: startValue,
      activeStartIndex,
      activeEndIndex,
      activeQuotientIndex,
      quotientDigits,
      qDigit: null,
      product: null,
      remainder: null,
      rows: [],
      usedGrabOneMoreDigit: activeEndIndex > 0,
    };

    // If dividend < divisor (rare with our generators), quotient is 0 and we are "done".
    if (problem.dividend < divisor) {
      e.phase = "done";
      e.quotientDigits[e.activeQuotientIndex] = 0;
      e.remainder = problem.dividend;
    }

    return e;
  }

  /** @param {Phase} phase */
  function getPhaseLabel(phase) {
    if (phase === "divide") return "Divide";
    if (phase === "multiply") return "Multiply";
    if (phase === "subtract") return "Subtract";
    if (phase === "bringDown") return "Bring down";
    return "Done";
  }

  /**
   * Multiples of divisor from divisor through maxInclusive, for kid-friendly “count by” hints.
   * @param {number} divisor
   * @param {number} maxInclusive
   * @returns {string[]}
   */
  function countByMultiples(divisor, maxInclusive) {
    const parts = [];
    for (let v = divisor; v <= maxInclusive; v += divisor) {
      parts.push(String(v));
    }
    return parts;
  }

  /**
   * Returns expected answer for the current phase + a kid-friendly prompt.
   * @param {EngineState} e
   * @param {Mode} mode
   * @param {Difficulty} [difficulty]
   * @returns {{ expectedValue: number, kidMessage: string, kidHint: string|null }}
   */
  function getStepExpectation(e, mode, difficulty = "medium") {
    const divisor = e.divisor;
    const current = e.currentValue;

    if (e.phase === "divide") {
      const expectedValue = Math.floor(current / divisor);
      const kidMessage =
        mode === "independent"
          ? `Divide: ${current} ÷ ${divisor} = ?`
          : `Divide: How many ${divisor}s are in ${current}?`;
      let kidHint = null;
      if (difficulty === "easy" && current >= divisor) {
        const parts = countByMultiples(divisor, current);
        if (parts.length > 0) {
          const maxList = 12;
          kidHint =
            parts.length <= maxList
              ? `Hint: Count by ${divisor}s: ${parts.join(", ")}`
              : `Hint: Count by ${divisor}s until you get to ${parts[parts.length - 1]}.`;
        }
      }
      return { expectedValue, kidMessage, kidHint };
    }

    if (e.phase === "multiply") {
      const qDigit = e.qDigit ?? 0;
      const expectedValue = qDigit * divisor;
      const kidMessage =
        mode === "independent"
          ? `Multiply: ${qDigit} × ${divisor} = ?`
          : `Multiply: ${qDigit} × ${divisor} = ? (This is what we subtract.)`;
      return { expectedValue, kidMessage, kidHint: null };
    }

    if (e.phase === "subtract") {
      const expectedValue = e.currentValue - (e.product ?? 0);
      const kidMessage =
        mode === "independent"
          ? `Subtract: ${e.currentValue} − ${e.product ?? "?"} = ?`
          : `Subtract: ${e.currentValue} − ${e.product ?? "?"} = ? (What’s left?)`;
      return { expectedValue, kidMessage, kidHint: null };
    }

    if (e.phase === "bringDown") {
      if (e.cursorIndex >= e.dividendDigits.length) {
        return { expectedValue: -1, kidMessage: "No more digits to bring down. We’re finished!", kidHint: null };
      }
      const nextDigit = e.dividendDigits[e.cursorIndex];
      const expectedValue = (e.remainder ?? 0) * 10 + nextDigit;
      const kidMessage =
        mode === "independent"
          ? `Bring down the next digit`
          : `Bring down: bring down the next digit (${nextDigit}) to make a new number.`;
      return { expectedValue, kidMessage, kidHint: null };
    }

    return { expectedValue: -1, kidMessage: "Done!", kidHint: null };
  }

  /** @param {WorkRowType} type */
  function getWorkRowBadge(type) {
    if (type === "product") return "Multiply";
    if (type === "subtractionResult") return "Subtract";
    if (type === "broughtDown") return "Bring down";
    return "Note";
  }

  /**
   * @param {number} cols
   */
  function makeWorkGrid(cols) {
    const row = document.createElement("div");
    row.className = "workGrid";
    row.style.setProperty("--digit-cols", String(cols));
    return row;
  }

  /**
   * Render a digit row that is right-aligned within [startCol..endCol].
   * Pads with empty cells so every row has the same number of columns as the dividend.
   *
   * @param {number} cols
   * @param {number} startCol
   * @param {number} endCol
   * @param {string} text
   * @param {'product'|'remainder'|'bringDown'} kind
   */
  function renderDigitTextRow(cols, startCol, endCol, text, kind) {
    const row = makeWorkGrid(cols);
    const digits = Array.from(String(text));
    const rightAlignedStart = Math.max(0, Math.min(startCol, endCol - digits.length + 1));

    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "workCell";

      const isInSpan = c >= rightAlignedStart && c <= endCol;
      if (!isInSpan) {
        cell.classList.add("workCell--empty");
        cell.textContent = "";
      } else {
        const idx = c - rightAlignedStart;
        cell.textContent = digits[idx] ?? "";
        if (kind === "product") cell.classList.add("workCell--product");
        if (kind === "remainder") cell.classList.add("workCell--remainder");
        if (kind === "bringDown") cell.classList.add("workCell--bringDown");
      }

      row.appendChild(cell);
    }

    return row;
  }

  /**
   * Render a subtraction line under the product, aligned to the same span.
   * Still renders the full column grid (empty padded cells).
   *
   * @param {number} cols
   * @param {number} startCol
   * @param {number} endCol
   */
  function renderSubtractionLineRow(cols, startCol, endCol) {
    const row = makeWorkGrid(cols);
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.textContent = "";
      if (c >= startCol && c <= endCol) {
        cell.className = "workCell workCell--line";
      } else {
        cell.className = "workCell workCell--empty";
      }
      row.appendChild(cell);
    }
    return row;
  }

  /**
   * @typedef {'digits'|'line'} DisplayRowType
   * @typedef {'product'|'remainder'|'bringDown'} DisplayDigitKind
   *
   * @typedef {Object} DisplayRow
   * @property {DisplayRowType} type
   * @property {number} startCol
   * @property {number} endCol
   * @property {string=} text
   * @property {DisplayDigitKind=} kind
   * @property {number|null=} highlightCol
   */

  /**
   * Transform engine rows into *display* rows.
   * This is where we can compress intermediate steps for a cleaner board:
   * - If a `subtractionResult` is immediately followed by a `broughtDown`, hide the standalone remainder row
   *   and show only the brought-down partial dividend.
   *
   * @param {WorkRow[]} rows
   * @returns {DisplayRow[]}
   */
  function buildDisplayRows(rows) {
    /** @type {DisplayRow[]} */
    const out = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const next = rows[i + 1] ?? null;

      if (row.type === "product") {
        out.push({
          type: "digits",
          startCol: row.startCol,
          endCol: row.endCol,
          text: String(row.value),
          kind: "product",
          highlightCol: null,
        });
        out.push({ type: "line", startCol: row.startCol, endCol: row.endCol });
        continue;
      }

      if (row.type === "subtractionResult") {
        const isImmediatelyFollowedByBringDown = next?.type === "broughtDown";
        if (isImmediatelyFollowedByBringDown) {
          // Compression rule: hide this remainder row; the next brought-down row will be the visible merged partial dividend.
          continue;
        }

        out.push({
          type: "digits",
          startCol: row.startCol,
          endCol: row.endCol,
          text: String(row.value),
          kind: "remainder",
          highlightCol: null,
        });
        continue;
      }

      if (row.type === "broughtDown") {
        out.push({
          type: "digits",
          startCol: row.startCol,
          endCol: row.endCol,
          text: String(row.value),
          kind: "bringDown",
          // Optional visual emphasis: highlight the newly brought-down digit (rightmost digit).
          highlightCol: row.endCol,
        });
        continue;
      }
    }

    return out;
  }

  /**
   * @param {EngineState} e
   * @param {number} userValue
   * @returns {{nextEngine: EngineState, correct: boolean, feedback: Feedback, stepCorrect: boolean}}
   */
  function applyAnswerAndAdvance(e, userValue) {
    const next = cloneEngineState(e);
    const divisor = next.divisor;

    /** @type {Feedback} */
    let feedback = { kind: "none", message: "" };
    let correct = false;
    let stepCorrect = false;

    if (next.phase === "done") {
      return { nextEngine: next, correct: true, feedback: { kind: "neutral", message: "All done!" }, stepCorrect: false };
    }

    if (next.phase === "divide") {
      const expected = Math.floor(next.currentValue / divisor);
      if (userValue === expected) {
        correct = true;
        stepCorrect = true;
        next.qDigit = userValue;
        next.quotientDigits[next.activeQuotientIndex] = userValue;
        next.phase = "multiply";
        feedback = { kind: "success", message: "Nice dividing! Now multiply to check." };
      } else {
        const tooBig = userValue > expected;
        const tooSmall = userValue < expected;
        if (tooBig) feedback = { kind: "error", message: "Almost! That’s a little too big. Try a smaller number." };
        else if (tooSmall) feedback = { kind: "error", message: "Almost! It can fit more times. Try a bigger number." };
        else feedback = { kind: "error", message: "Almost! Try again." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }

    if (next.phase === "multiply") {
      const qDigit = next.qDigit ?? 0;
      const expected = qDigit * divisor;
      if (userValue === expected) {
        correct = true;
        stepCorrect = true;
        next.product = userValue;
        const productStr = String(userValue);
        const productEndCol = next.activeEndIndex;
        const productStartCol = Math.max(0, productEndCol - productStr.length + 1);
        next.rows.push({
          type: "product",
          value: userValue,
          alignedToQuotientIndex: next.activeQuotientIndex,
          startCol: productStartCol,
          endCol: productEndCol,
          status: "success",
        });
        next.phase = "subtract";
        feedback = { kind: "success", message: "Great multiply check! Now subtract." };
      } else {
        feedback = { kind: "error", message: "Check: divisor × your quotient digit." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }

    if (next.phase === "subtract") {
      const expected = next.currentValue - (next.product ?? 0);
      if (userValue === expected && userValue >= 0) {
        correct = true;
        stepCorrect = true;
        next.remainder = userValue;
        const remStr = String(userValue);
        const remEndCol = next.activeEndIndex;
        const remStartCol = Math.max(0, remEndCol - remStr.length + 1);
        next.rows.push({
          type: "subtractionResult",
          value: userValue,
          alignedToQuotientIndex: next.activeQuotientIndex,
          startCol: remStartCol,
          endCol: remEndCol,
          status: "success",
        });
        next.phase = "bringDown";
        feedback = { kind: "success", message: "Nice subtracting! Time to bring down (if there’s a digit left)." };
      } else if (expected < 0) {
        // This only happens if the earlier divide step was too big (or product wrong).
        feedback = {
          kind: "error",
          message: "We can’t go below 0 here. That usually means the divide number is a bit too big—try a smaller one.",
        };
      } else {
        feedback = { kind: "error", message: "Check: current number − product." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }

    if (next.phase === "bringDown") {
      if (next.cursorIndex >= next.dividendDigits.length) {
        // No digit to bring down: finish.
        next.phase = "done";
        correct = true;
        stepCorrect = true;
        feedback = { kind: "success", message: "No more digits — you’re done!" };
        return { nextEngine: next, correct, feedback, stepCorrect };
      }

      const nextDigit = next.dividendDigits[next.cursorIndex];
      const expected = (next.remainder ?? 0) * 10 + nextDigit;
      if (userValue === expected) {
        correct = true;
        stepCorrect = true;

        // Commit bring down
        const bringStr = String(userValue);
        const bringEndCol = next.cursorIndex;
        const bringStartCol = Math.max(0, bringEndCol - bringStr.length + 1);
        next.rows.push({
          type: "broughtDown",
          value: userValue,
          alignedToQuotientIndex: next.activeQuotientIndex,
          startCol: bringStartCol,
          endCol: bringEndCol,
          status: "success",
        });

        // Move "window" to the new current value.
        next.currentValue = userValue;
        next.activeStartIndex = next.cursorIndex - String(next.remainder ?? 0).length + 1; // best-effort highlight
        next.activeEndIndex = next.cursorIndex;
        next.cursorIndex += 1;
        next.activeQuotientIndex = next.activeEndIndex;

        // Reset step fields for next cycle
        next.qDigit = null;
        next.product = null;
        next.remainder = null;
        next.phase = "divide";

        // If no digits remain after bringing down, the next loop might end with remainder.
        feedback = { kind: "success", message: "Good! Now divide again with the new number." };
      } else {
        feedback = { kind: "error", message: "Bring down the next digit from the top number (write it next to your remainder)." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }

    return { nextEngine: next, correct: false, feedback: { kind: "error", message: "Almost! Try again." }, stepCorrect: false };
  }

  /**
   * Hint ladder:
   * - Explain: just a reminder sentence (no state changes)
   * - Hint: nudge once, then reveal by autofilling the expected value (and optionally advancing in demo)
   * @param {EngineState} e
   * @param {Mode} mode
   * @param {number} hintCountForThisStep
   */
  function applyHint(e, mode, hintCountForThisStep, difficulty = "medium") {
    const { expectedValue, kidMessage } = getStepExpectation(e, mode, difficulty);

    if (e.phase === "done") {
      return { kind: "neutral", message: "You’re already finished!" };
    }

    // Special-case: in bring-down, sometimes there truly is no next digit.
    // Avoid “revealing” a confusing -1 value.
    if (e.phase === "bringDown" && expectedValue === -1) {
      return { kind: "neutral", message: "No more digits to bring down. You’re finished!" };
    }

    if (hintCountForThisStep === 0) {
      // Nudge
      if (e.phase === "divide") {
        return { kind: "neutral", message: "Try a number so that (divisor × your number) is close to the current number, but not over." };
      }
      if (e.phase === "multiply") {
        return { kind: "neutral", message: "Multiply the divisor by your quotient digit." };
      }
      if (e.phase === "subtract") {
        return { kind: "neutral", message: "Subtract: current number − product." };
      }
      if (e.phase === "bringDown") {
        const nextDigit = e.cursorIndex < e.dividendDigits.length ? e.dividendDigits[e.cursorIndex] : null;
        return { kind: "neutral", message: nextDigit === null ? "No more digits to bring down." : `Look at the next digit: ${nextDigit}. Bring it down next.` };
      }
      return { kind: "neutral", message: kidMessage };
    }

    // Reveal (v1): we reveal the exact next answer, but we do not auto-advance in guided/independent.
    return { kind: "neutral", message: `Here’s the next answer: ${expectedValue}. (${kidMessage})` };
  }

  // -----------------------
  // Demo helper (auto-step)
  // -----------------------

  /** @param {EngineState} e @param {Mode} mode */
  function getAutoAnswer(e, mode) {
    const { expectedValue } = getStepExpectation(e, mode);
    if (e.phase === "bringDown" && expectedValue === -1) return null;
    return expectedValue;
  }

  // -----------------------
  // DOM (wiring)
  // -----------------------

  /** @param {string} id */
  function mustGetEl(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }

  const dom = {
    divisorText: mustGetEl("divisorText"),
    dividendText: mustGetEl("dividendText"),
    streakText: mustGetEl("streakText"),
    starsText: mustGetEl("starsText"),

    quotientSlots: mustGetEl("quotientSlots"),
    divisorBoxValue: mustGetEl("divisorBoxValue"),
    dividendDigits: mustGetEl("dividendDigits"),
    workRows: mustGetEl("workRows"),

    doneSummary: mustGetEl("doneSummary"),
    doneSummaryText: mustGetEl("doneSummaryText"),

    phaseBadge: mustGetEl("phaseBadge"),
    stepPrompt: mustGetEl("stepPrompt"),
    answerInput: /** @type {HTMLInputElement} */ (mustGetEl("answerInput")),

    checkBtn: /** @type {HTMLButtonElement} */ (mustGetEl("checkBtn")),
    nextBtn: /** @type {HTMLButtonElement} */ (mustGetEl("nextBtn")),
    hintBtn: /** @type {HTMLButtonElement} */ (mustGetEl("hintBtn")),
    explainBtn: /** @type {HTMLButtonElement} */ (mustGetEl("explainBtn")),
    undoBtn: /** @type {HTMLButtonElement} */ (mustGetEl("undoBtn")),
    newProblemBtn: /** @type {HTMLButtonElement} */ (mustGetEl("newProblemBtn")),
    startOverBtn: /** @type {HTMLButtonElement} */ (mustGetEl("startOverBtn")),
    feedback: mustGetEl("feedback"),
  };

  /** @type {UIState} */
  const app = {
    mode: "guided",
    difficulty: "easy",
    problem: null,
    engine: null,
    inputValue: "",
    feedback: { kind: "none", message: "" },
    attemptsThisStep: 0,
    hintsUsedThisProblem: 0,
    sessionStats: { problemsDone: 0, stepsCorrect: 0, streak: 0, stars: 0 },
    history: [],
  };

  /** @param {Feedback['kind']} kind @param {string} message */
  function setAppFeedback(kind, message) {
    app.feedback = { kind, message };
  }

  function setSelectedSegment(containerSelector, pressedValue, attrName) {
    const buttons = Array.from(document.querySelectorAll(containerSelector));
    for (const btn of buttons) {
      const v = btn.getAttribute(attrName);
      btn.setAttribute("aria-pressed", String(v === pressedValue));
    }
  }

  /** @param {string} value */
  function setInputValue(value) {
    app.inputValue = value;
    dom.answerInput.value = value;
  }

  function focusInputSoon() {
    window.setTimeout(() => {
      try {
        dom.answerInput.focus();
        dom.answerInput.select();
      } catch {
        // ignore
      }
    }, 0);
  }

  /** @param {EngineState} e */
  function pushHistory(e) {
    app.history.push(cloneEngineState(e));
    // Keep history modest for v1
    if (app.history.length > 50) app.history.shift();
  }

  function clearPerStepCounts() {
    app.attemptsThisStep = 0;
  }

  function newProblem(problem) {
    app.problem = problem;
    app.engine = createEngine(problem);
    app.history = [];
    app.hintsUsedThisProblem = 0;
    app.attemptsThisStep = 0;
    setInputValue("");
    setAppFeedback("neutral", "Let’s go! We’ll do one small step at a time.");
    render();
    focusInputSoon();
  }

  function startGeneratedProblem() {
    const p = generateProblem(app.difficulty);
    newProblem(p);
  }

  function startOver() {
    if (!app.problem) {
      startGeneratedProblem();
      return;
    }
    newProblem({ ...app.problem });
  }

  function undo() {
    if (app.history.length === 0) {
      setAppFeedback("neutral", "Nothing to undo yet.");
      render();
      return;
    }
    const prev = app.history.pop();
    if (!prev) return;
    app.engine = prev;
    clearPerStepCounts();
    setInputValue("");
    setAppFeedback("neutral", "Undo! You can try that step again.");
    render();
    focusInputSoon();
  }

  /** @param {Feedback} feedback */
  function renderFeedback(feedback) {
    dom.feedback.textContent = feedback.message;
    dom.feedback.classList.remove("feedback--success", "feedback--error", "feedback--neutral");
    if (feedback.kind === "success") dom.feedback.classList.add("feedback--success");
    if (feedback.kind === "error") dom.feedback.classList.add("feedback--error");
    if (feedback.kind === "neutral") dom.feedback.classList.add("feedback--neutral");
  }

  /** @param {EngineState} e @param {boolean} done */
  function renderQuotientSlots(e, done) {
    dom.quotientSlots.innerHTML = "";
    dom.quotientSlots.style.setProperty("--digit-cols", String(e.dividendDigits.length));
    for (let i = 0; i < e.quotientDigits.length; i++) {
      const slot = document.createElement("div");
      slot.className = "digitCell slot";
      const v = e.quotientDigits[i];
      if (v !== null) slot.classList.add("slot--filled");
      if (i === e.activeQuotientIndex && !done) slot.classList.add("slot--active");
      slot.textContent = v === null ? "" : String(v);
      slot.title = `Quotient position ${i + 1}`;
      dom.quotientSlots.appendChild(slot);
    }
  }

  /** @param {EngineState} e @param {boolean} done */
  function renderDividendDigits(e, done) {
    dom.dividendDigits.innerHTML = "";
    dom.dividendDigits.style.setProperty("--digit-cols", String(e.dividendDigits.length));
    const nextIndex = e.cursorIndex;
    for (let i = 0; i < e.dividendDigits.length; i++) {
      const d = document.createElement("div");
      d.className = "digitCell digit";
      d.textContent = String(e.dividendDigits[i]);
      if (!done && i >= e.activeStartIndex && i <= e.activeEndIndex) d.classList.add("digit--active");
      if (!done && i === nextIndex) d.classList.add("digit--next");
      dom.dividendDigits.appendChild(d);
    }
  }

  /** @param {EngineState} e @param {boolean} done */
  function renderWorkRows(e, done) {
    dom.workRows.innerHTML = "";
    const cols = e.dividendDigits.length;
    if (e.rows.length === 0 && !done) {
      const hint = document.createElement("div");
      hint.className = "workRowHint";
      hint.textContent = "Work will appear right under the dividend digits as you go.";
      dom.workRows.appendChild(hint);
      return;
    }

    const displayRows = buildDisplayRows(e.rows);
    for (const row of displayRows) {
      if (row.type === "line") {
        dom.workRows.appendChild(renderSubtractionLineRow(cols, row.startCol, row.endCol));
        continue;
      }

      const grid = renderDigitTextRow(cols, row.startCol, row.endCol, row.text ?? "", row.kind ?? "remainder");
      if (row.highlightCol !== null && row.highlightCol !== undefined) {
        const idx = row.highlightCol;
        const cell = grid.children.item(idx);
        if (cell instanceof HTMLElement) cell.classList.add("workCell--broughtDigit");
      }
      dom.workRows.appendChild(grid);
    }
  }

  function render() {
    // Settings buttons
    setSelectedSegment("[data-difficulty]", app.difficulty, "data-difficulty");
    setSelectedSegment("[data-mode]", app.mode, "data-mode");

    // Stats
    dom.streakText.textContent = String(app.sessionStats.streak);
    dom.starsText.textContent = String(app.sessionStats.stars);

    // Feedback
    renderFeedback(app.feedback);

    // Problem labels
    if (!app.problem || !app.engine) {
      dom.divisorText.textContent = "—";
      dom.dividendText.textContent = "—";
      dom.divisorBoxValue.textContent = "—";
      dom.quotientSlots.innerHTML = "";
      dom.dividendDigits.innerHTML = "";
      dom.workRows.innerHTML = "";
      dom.doneSummary.hidden = true;
      dom.phaseBadge.textContent = "—";
      dom.stepPrompt.textContent = "Choose a mode and start a problem.";
      dom.checkBtn.disabled = true;
      dom.hintBtn.disabled = true;
      dom.explainBtn.disabled = true;
      dom.undoBtn.disabled = true;
      dom.nextBtn.hidden = true;
      dom.checkBtn.hidden = false;
      return;
    }

    const e = app.engine;
    dom.divisorText.textContent = String(app.problem.divisor);
    dom.dividendText.textContent = String(app.problem.dividend);
    dom.divisorBoxValue.textContent = String(app.problem.divisor);

    // Mode-specific buttons:
    if (app.mode === "demo") {
      dom.nextBtn.hidden = false;
      dom.checkBtn.hidden = true;
    } else {
      dom.nextBtn.hidden = true;
      dom.checkBtn.hidden = false;
    }

    const done = e.phase === "done";
    dom.checkBtn.disabled = done;
    dom.nextBtn.disabled = done;
    dom.hintBtn.disabled = done;
    dom.explainBtn.disabled = done;
    dom.undoBtn.disabled = app.history.length === 0;

    // Input enablement:
    // - In Watch mode, the input is not used (Next drives the experience).
    // - In Bring down with no digits left, we can finish without input.
    const bringDownNoDigits = e.phase === "bringDown" && e.cursorIndex >= e.dividendDigits.length;
    dom.answerInput.disabled = done || app.mode === "demo" || bringDownNoDigits;
    dom.answerInput.placeholder = app.mode === "demo" ? "Watch mode (no typing needed)" : bringDownNoDigits ? "No input needed" : "Type a number";

    // Phase/prompt
    dom.phaseBadge.textContent = getPhaseLabel(e.phase);
    const { kidMessage, kidHint } = getStepExpectation(e, app.mode, app.difficulty);
    if (done) {
      dom.stepPrompt.textContent = "Done! 🎉";
    } else {
      dom.stepPrompt.replaceChildren();
      dom.stepPrompt.appendChild(document.createTextNode(kidMessage));
      if (kidHint) {
        const hintEl = document.createElement("span");
        hintEl.className = "stepPrompt__hint";
        hintEl.textContent = kidHint;
        dom.stepPrompt.appendChild(hintEl);
      }
    }

    renderQuotientSlots(e, done);
    renderDividendDigits(e, done);
    renderWorkRows(e, done);

    // Done summary (final quotient/remainder)
    if (done) {
      const quotientStr = e.quotientDigits.filter((x) => x !== null).join("") || "0";
      const remainder = e.remainder ?? 0;
      dom.doneSummary.hidden = false;
      dom.doneSummaryText.textContent =
        remainder === 0
          ? `Answer: ${app.problem.dividend} ÷ ${app.problem.divisor} = ${quotientStr}. (No remainder.)`
          : `Answer: ${app.problem.dividend} ÷ ${app.problem.divisor} = ${quotientStr} remainder ${remainder}.`;
    } else {
      dom.doneSummary.hidden = true;
    }
  }

  function handleCheckOrAdvance(userValueRaw) {
    if (!app.engine || !app.problem) return;
    const e = app.engine;
    if (e.phase === "done") return;

    const userValue = toInt(userValueRaw);
    pushHistory(e);
    const { nextEngine, correct, feedback, stepCorrect } = applyAnswerAndAdvance(e, userValue);
    app.engine = nextEngine;

    if (correct) {
      setInputValue("");
      clearPerStepCounts();
      app.sessionStats.stepsCorrect += 1;
      app.sessionStats.streak += 1;
      app.sessionStats.stars += 1;
      setAppFeedback(feedback.kind, feedback.message);

      if (nextEngine.phase === "done") {
        app.sessionStats.problemsDone += 1;
        // Store final remainder (for display)
        if (app.engine && app.engine.remainder === null) {
          // If we ended right after bringDown with no remaining digits, remainder is last subtraction result (if any).
          // v1 safety: compute it from real division result.
          app.engine.remainder = app.problem.expectedRemainder;
        }
        setAppFeedback("success", "Finished! Want a new problem?");
      }
    } else {
      app.attemptsThisStep += 1;
      app.sessionStats.streak = 0;
      setAppFeedback(feedback.kind, feedback.message);

      // Friendly stronger help after 2 tries on divide
      if (app.attemptsThisStep >= 2 && e.phase === "divide") {
        const divisor = e.divisor;
        const current = e.currentValue;
        const q = Math.floor(current / divisor);
        const a = Math.max(0, q - 1);
        const b = q;
        const c = q + 1;
        setAppFeedback(
          "neutral",
          `Helper: ${divisor}×${a}=${divisor * a}, ${divisor}×${b}=${divisor * b}, ${divisor}×${c}=${divisor * c}. Pick the one that fits!`
        );
      }
    }

    render();
    focusInputSoon();
  }

  function handleHint() {
    if (!app.engine) return;
    app.hintsUsedThisProblem += 1;

    // We track hint count per step using attemptsThisStep as a lightweight proxy for “need more help”.
    const hintCountForThisStep = Math.min(2, app.attemptsThisStep);
    const hint = applyHint(app.engine, app.mode, hintCountForThisStep, app.difficulty);
    setAppFeedback(hint.kind, hint.message);

    // If this is a “reveal”, autofill the input to reduce friction.
    if (hintCountForThisStep >= 1) {
      const auto = getAutoAnswer(app.engine, app.mode);
      if (auto !== null) setInputValue(String(auto));
      focusInputSoon();
    }

    render();
  }

  function handleExplain() {
    if (!app.engine) return;
    const phase = app.engine.phase;
    if (phase === "divide") {
      setAppFeedback("neutral", "Divide: think how many groups of the divisor fit in the current number. Use multiplication to check.");
      render();
      return;
    }
    if (phase === "multiply") {
      setAppFeedback("neutral", "Multiply: divisor × your quotient digit. That’s the number you subtract next.");
      render();
      return;
    }
    if (phase === "subtract") {
      setAppFeedback("neutral", "Subtract: current number − product = remainder. It should not go below 0.");
      render();
      return;
    }
    if (phase === "bringDown") {
      setAppFeedback("neutral", "Bring down: copy the next digit from the dividend to the bottom, next to your remainder.");
      render();
      return;
    }
    setAppFeedback("neutral", "Done means there are no more digits to bring down.");
    render();
  }

  function handleNextDemoStep() {
    if (!app.engine) return;
    const e = app.engine;
    if (e.phase === "done") return;
    const auto = getAutoAnswer(e, app.mode);
    if (auto === null) {
      // bringDown with no digits: finish
      pushHistory(e);
      const { nextEngine } = applyAnswerAndAdvance(e, 0);
      app.engine = nextEngine;
      render();
      return;
    }
    setInputValue(String(auto));
    handleCheckOrAdvance(auto);
  }

  // -----------------------
  // Event listeners
  // -----------------------

  // Difficulty buttons
  document.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement|null} */ (ev.target instanceof HTMLElement ? ev.target : null);
    if (!target) return;

    const diff = target.getAttribute("data-difficulty");
    if (diff === "easy" || diff === "medium" || diff === "hard") {
      app.difficulty = diff;
      setAppFeedback("neutral", `Difficulty set to ${getDifficultyLabel(diff)}. Click “New problem” to start.`);
      render();
      return;
    }

    const mode = target.getAttribute("data-mode");
    if (mode === "demo" || mode === "guided" || mode === "independent") {
      app.mode = mode;
      setAppFeedback(
        "neutral",
        mode === "demo"
          ? "Watch mode: click Next to see each step."
          : mode === "guided"
            ? "Practice mode: type the next tiny answer, then press Check."
            : "Challenge mode: fewer hints in the prompt, but you can still use Hint if you need it."
      );
      render();
      focusInputSoon();
      return;
    }
  });

  // Controls
  dom.newProblemBtn.addEventListener("click", () => startGeneratedProblem());
  dom.startOverBtn.addEventListener("click", () => startOver());
  dom.undoBtn.addEventListener("click", () => undo());
  dom.hintBtn.addEventListener("click", () => handleHint());
  dom.explainBtn.addEventListener("click", () => handleExplain());
  dom.checkBtn.addEventListener("click", () => {
    const raw = dom.answerInput.value.trim();
    if (app.engine && app.engine.phase === "bringDown" && app.engine.cursorIndex >= app.engine.dividendDigits.length) {
      // Finishing step: no input required.
      handleCheckOrAdvance(0);
      return;
    }
    if (raw === "") {
      setAppFeedback("neutral", "Type a number first (or use Hint to reveal).");
      render();
      focusInputSoon();
      return;
    }
    handleCheckOrAdvance(Number(raw));
  });
  dom.nextBtn.addEventListener("click", () => handleNextDemoStep());

  // Input behavior
  dom.answerInput.addEventListener("input", () => {
    // Keep it numeric-only (v1).
    const clean = dom.answerInput.value.replace(/[^\d]/g, "");
    if (clean !== dom.answerInput.value) dom.answerInput.value = clean;
    app.inputValue = clean;
  });

  dom.answerInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      if (app.mode === "demo") {
        handleNextDemoStep();
      } else {
        dom.checkBtn.click();
      }
    }
  });

  // Keypad
  document.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement|null} */ (ev.target instanceof HTMLElement ? ev.target : null);
    if (!target) return;
    if (!target.classList.contains("keypad__btn")) return;

    const key = target.getAttribute("data-key");
    if (!key) return;

    if (key === "clear") {
      setInputValue("");
      focusInputSoon();
      return;
    }
    if (key === "back") {
      setInputValue(app.inputValue.slice(0, -1));
      focusInputSoon();
      return;
    }
    if (/^\d$/.test(key)) {
      setInputValue((app.inputValue + key).slice(0, 6));
      focusInputSoon();
    }
  });

  // Collapsible lesson panel (layout only; does not touch game state)
  const lessonToggle = document.getElementById("lessonToggle");
  const lessonBody = document.getElementById("lessonBody");
  if (lessonToggle && lessonBody) {
    lessonToggle.addEventListener("click", () => {
      const expanded = lessonToggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      lessonToggle.setAttribute("aria-expanded", String(next));
      lessonBody.hidden = !next;
    });
  }

  // -----------------------
  // Boot
  // -----------------------

  // Default selections
  setSelectedSegment("[data-difficulty]", app.difficulty, "data-difficulty");
  setSelectedSegment("[data-mode]", app.mode, "data-mode");

  // Start with an easy generated problem so the prototype is immediately usable.
  startGeneratedProblem();
})();

