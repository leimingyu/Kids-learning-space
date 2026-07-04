/* Long Division Coach — v2
   Adds:
   - Top-level Practice vs Game mode toggle
   - Practice Mode coach features: cycle ring, times-table panel,
     zero-quotient lesson, worked-example replay
   - Game Mode: daily mission (1 warm-up + 2 main), streak with weekly
     freeze, 14-day calendar strip, per-problem 0–3 star rubric
   - Profile-scoped localStorage, hub star/sticker push, Reset button

   Keeps the v1 pure-functional engine intact (createEngine,
   applyAnswerAndAdvance, getStepExpectation, etc.) — all UI changes
   wrap the engine without altering its behavior.
*/

(() => {
  "use strict";

  // ============================================================
  // Utilities (pure)
  // ============================================================

  function toInt(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  }
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function digitsOf(n) {
    return Array.from(String(Math.abs(n))).map((ch) => Number(ch));
  }
  function cloneEngineState(e) {
    return {
      ...e,
      dividendDigits: [...e.dividendDigits],
      quotientDigits: [...e.quotientDigits],
      rows: e.rows.map((r) => ({ ...r })),
    };
  }
  function getDifficultyLabel(d) {
    if (d === "easy") return "Easy";
    if (d === "medium") return "Medium";
    return "Hard";
  }

  // ============================================================
  // Problem generator (pure)
  // ============================================================

  function generateProblem(difficulty) {
    if (difficulty === "easy") {
      const divisor = randInt(2, 9);
      let quotient = 0;
      for (let tries = 0; tries < 500; tries++) {
        quotient = randInt(12, 99);
        const qDigits = digitsOf(quotient);
        if (qDigits.includes(0)) continue;
        const dividend = divisor * quotient;
        const dLen = String(dividend).length;
        if (dLen < 2 || dLen > 3) continue;
        return { dividend, divisor, difficulty, expectedQuotient: quotient, expectedRemainder: 0 };
      }
      const fallbackDividend = divisor * 24;
      return { dividend: fallbackDividend, divisor, difficulty, expectedQuotient: 24, expectedRemainder: 0 };
    }
    if (difficulty === "medium") {
      const divisor = randInt(2, 12);
      const dividend = randInt(120, 9999);
      return {
        dividend, divisor, difficulty,
        expectedQuotient: Math.floor(dividend / divisor),
        expectedRemainder: dividend % divisor,
      };
    }
    const divisor = randInt(10, 99);
    const dividend = randInt(1000, 99999);
    return {
      dividend, divisor, difficulty: "hard",
      expectedQuotient: Math.floor(dividend / divisor),
      expectedRemainder: dividend % divisor,
    };
  }

  // ============================================================
  // Engine (pure)  — unchanged from v1
  // ============================================================

  function pickInitialChunk(dividendDigits, divisor) {
    let value = 0, end = -1;
    for (let i = 0; i < dividendDigits.length; i++) {
      value = value * 10 + dividendDigits[i];
      end = i;
      if (value >= divisor) break;
    }
    return { value, endIndex: end };
  }

  function createEngine(problem) {
    const dividendDigits = digitsOf(problem.dividend);
    const divisor = problem.divisor;
    const { value: startValue, endIndex } = pickInitialChunk(dividendDigits, divisor);
    const quotientDigits = Array.from({ length: dividendDigits.length }, () => null);
    const activeEndIndex = Math.max(0, endIndex);

    const e = {
      phase: "divide",
      dividendDigits,
      divisor,
      cursorIndex: activeEndIndex + 1,
      currentValue: startValue,
      activeStartIndex: 0,
      activeEndIndex,
      activeQuotientIndex: activeEndIndex,
      quotientDigits,
      qDigit: null,
      product: null,
      remainder: null,
      rows: [],
      usedGrabOneMoreDigit: activeEndIndex > 0,
    };
    if (problem.dividend < divisor) {
      e.phase = "done";
      e.quotientDigits[e.activeQuotientIndex] = 0;
      e.remainder = problem.dividend;
    }
    return e;
  }

  function getPhaseLabel(p) {
    if (p === "divide") return "Divide";
    if (p === "multiply") return "Multiply";
    if (p === "subtract") return "Subtract";
    if (p === "bringDown") return "Bring down";
    return "Done";
  }

  function countByMultiples(divisor, maxInclusive) {
    const parts = [];
    for (let v = divisor; v <= maxInclusive; v += divisor) parts.push(String(v));
    return parts;
  }

  function getStepExpectation(e, mode, difficulty = "medium") {
    const divisor = e.divisor;
    const current = e.currentValue;
    if (e.phase === "divide") {
      const expectedValue = Math.floor(current / divisor);
      // Mid-problem zero-quotient: divisor doesn't fit in the current number.
      // The first-chunk picker guarantees current >= divisor at problem start,
      // so this case only fires after a bring-down — exactly the moment the
      // kid needs to be told "write 0 above and bring down again."
      const zeroQuotient = current < divisor;
      let kidMessage;
      if (zeroQuotient) {
        kidMessage = `${divisor} doesn't fit in ${current}. Type 0 — then we'll bring down the next digit.`;
      } else {
        kidMessage = mode === "independent"
          ? `Divide: ${current} ÷ ${divisor} = ?`
          : `Divide: How many ${divisor}s are in ${current}?`;
      }
      let kidHint = null;
      if (difficulty === "easy" && current >= divisor) {
        const parts = countByMultiples(divisor, current);
        if (parts.length > 0) {
          kidHint = parts.length <= 12
            ? `Hint: Count by ${divisor}s: ${parts.join(", ")}`
            : `Hint: Count by ${divisor}s until you get to ${parts[parts.length - 1]}.`;
        }
      }
      return { expectedValue, kidMessage, kidHint, zeroQuotient };
    }
    if (e.phase === "multiply") {
      const qDigit = e.qDigit ?? 0;
      return {
        expectedValue: qDigit * divisor,
        kidMessage: mode === "independent"
          ? `Multiply: ${qDigit} × ${divisor} = ?`
          : `Multiply: ${qDigit} × ${divisor} = ? (This is what we subtract.)`,
        kidHint: null,
      };
    }
    if (e.phase === "subtract") {
      return {
        expectedValue: e.currentValue - (e.product ?? 0),
        kidMessage: mode === "independent"
          ? `Subtract: ${e.currentValue} − ${e.product ?? "?"} = ?`
          : `Subtract: ${e.currentValue} − ${e.product ?? "?"} = ? (What’s left?)`,
        kidHint: null,
      };
    }
    if (e.phase === "bringDown") {
      if (e.cursorIndex >= e.dividendDigits.length) {
        return { expectedValue: -1, kidMessage: "No more digits to bring down. We’re finished!", kidHint: null };
      }
      const nextDigit = e.dividendDigits[e.cursorIndex];
      // Solution 2 + Approach 1: kid types JUST the digit being brought down,
      // not the combined number. Engine combines internally on commit.
      return {
        expectedValue: nextDigit,
        kidMessage: mode === "independent"
          ? `Bring down the next digit`
          : `Bring down: type the next digit (${nextDigit}) to bring it down.`,
        kidHint: null,
      };
    }
    return { expectedValue: -1, kidMessage: "Done!", kidHint: null };
  }

  function makeWorkGrid(cols) {
    const row = document.createElement("div");
    row.className = "workGrid";
    row.style.setProperty("--digit-cols", String(cols));
    return row;
  }

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

  function renderSubtractionLineRow(cols, startCol, endCol) {
    const row = makeWorkGrid(cols);
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.textContent = "";
      cell.className = c >= startCol && c <= endCol ? "workCell workCell--line" : "workCell workCell--empty";
      row.appendChild(cell);
    }
    return row;
  }

  function buildDisplayRows(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const next = rows[i + 1] ?? null;
      if (row.type === "product") {
        out.push({ type: "digits", startCol: row.startCol, endCol: row.endCol, text: String(row.value), kind: "product", highlightCol: null });
        out.push({ type: "line", startCol: row.startCol, endCol: row.endCol });
        continue;
      }
      if (row.type === "subtractionResult") {
        if (next?.type === "broughtDown") continue;
        out.push({ type: "digits", startCol: row.startCol, endCol: row.endCol, text: String(row.value), kind: "remainder", highlightCol: null });
        continue;
      }
      if (row.type === "broughtDown") {
        out.push({ type: "digits", startCol: row.startCol, endCol: row.endCol, text: String(row.value), kind: "bringDown", highlightCol: row.endCol });
        continue;
      }
    }
    return out;
  }

  function applyAnswerAndAdvance(e, userValue) {
    const next = cloneEngineState(e);
    const divisor = next.divisor;
    let feedback = { kind: "none", message: "" };
    let correct = false, stepCorrect = false;

    if (next.phase === "done") {
      return { nextEngine: next, correct: true, feedback: { kind: "neutral", message: "All done!" }, stepCorrect: false };
    }
    if (next.phase === "divide") {
      const expected = Math.floor(next.currentValue / divisor);
      if (userValue === expected) {
        correct = true; stepCorrect = true;
        next.qDigit = userValue;
        next.quotientDigits[next.activeQuotientIndex] = userValue;
        next.phase = "multiply";
        feedback = { kind: "success", message: "Nice dividing! Now multiply to check." };
      } else {
        feedback = userValue > expected
          ? { kind: "error", message: "Almost! That’s a little too big. Try a smaller number." }
          : { kind: "error", message: "Almost! It can fit more times. Try a bigger number." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }
    if (next.phase === "multiply") {
      const qDigit = next.qDigit ?? 0;
      const expected = qDigit * divisor;
      if (userValue === expected) {
        correct = true; stepCorrect = true;
        next.product = userValue;
        const productStr = String(userValue);
        const productEndCol = next.activeEndIndex;
        const productStartCol = Math.max(0, productEndCol - productStr.length + 1);
        next.rows.push({ type: "product", value: userValue, alignedToQuotientIndex: next.activeQuotientIndex, startCol: productStartCol, endCol: productEndCol, status: "success" });
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
        correct = true; stepCorrect = true;
        next.remainder = userValue;
        const remStr = String(userValue);
        const remEndCol = next.activeEndIndex;
        const remStartCol = Math.max(0, remEndCol - remStr.length + 1);
        next.rows.push({ type: "subtractionResult", value: userValue, alignedToQuotientIndex: next.activeQuotientIndex, startCol: remStartCol, endCol: remEndCol, status: "success" });
        next.phase = "bringDown";
        feedback = { kind: "success", message: "Nice subtracting! Time to bring down (if there’s a digit left)." };
      } else if (expected < 0) {
        feedback = { kind: "error", message: "We can’t go below 0 here. That usually means the divide number is a bit too big—try a smaller one." };
      } else {
        feedback = { kind: "error", message: "Check: current number − product." };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }
    if (next.phase === "bringDown") {
      if (next.cursorIndex >= next.dividendDigits.length) {
        next.phase = "done"; correct = true; stepCorrect = true;
        feedback = { kind: "success", message: "No more digits — you’re done!" };
        return { nextEngine: next, correct, feedback, stepCorrect };
      }
      const nextDigit = next.dividendDigits[next.cursorIndex];
      // Approach 1: kid types just the digit being brought down. We validate
      // against that single digit, then internally compute the combined value
      // (remainder * 10 + digit) for the broughtDown row + new currentValue.
      if (userValue === nextDigit) {
        correct = true; stepCorrect = true;
        const combined = (next.remainder ?? 0) * 10 + nextDigit;
        const bringStr = String(combined);
        const bringEndCol = next.cursorIndex;
        const bringStartCol = Math.max(0, bringEndCol - bringStr.length + 1);
        next.rows.push({ type: "broughtDown", value: combined, alignedToQuotientIndex: next.activeQuotientIndex, startCol: bringStartCol, endCol: bringEndCol, status: "success" });
        next.currentValue = combined;
        next.activeStartIndex = next.cursorIndex - String(next.remainder ?? 0).length + 1;
        next.activeEndIndex = next.cursorIndex;
        next.cursorIndex += 1;
        next.activeQuotientIndex = next.activeEndIndex;
        next.qDigit = null; next.product = null; next.remainder = null;
        next.phase = "divide";
        feedback = { kind: "success", message: "Good! Now divide again with the new number." };
      } else {
        feedback = { kind: "error", message: `Type the next digit (${nextDigit}) from the top number to bring it down.` };
      }
      return { nextEngine: next, correct, feedback, stepCorrect };
    }
    return { nextEngine: next, correct: false, feedback: { kind: "error", message: "Almost! Try again." }, stepCorrect: false };
  }

  function applyHint(e, mode, hintCountForThisStep, difficulty = "medium") {
    const { expectedValue, kidMessage } = getStepExpectation(e, mode, difficulty);
    if (e.phase === "done") return { kind: "neutral", message: "You’re already finished!" };
    if (e.phase === "bringDown" && expectedValue === -1) return { kind: "neutral", message: "No more digits to bring down. You’re finished!" };
    if (hintCountForThisStep === 0) {
      if (e.phase === "divide") return { kind: "neutral", message: "Try a number so that (divisor × your number) is close to the current number, but not over." };
      if (e.phase === "multiply") return { kind: "neutral", message: "Multiply the divisor by your quotient digit." };
      if (e.phase === "subtract") return { kind: "neutral", message: "Subtract: current number − product." };
      if (e.phase === "bringDown") {
        const nextDigit = e.cursorIndex < e.dividendDigits.length ? e.dividendDigits[e.cursorIndex] : null;
        return { kind: "neutral", message: nextDigit === null ? "No more digits to bring down." : `The next digit is ${nextDigit}. Type it to bring it down.` };
      }
      return { kind: "neutral", message: kidMessage };
    }
    return { kind: "neutral", message: `Here’s the next answer: ${expectedValue}. (${kidMessage})` };
  }

  function getAutoAnswer(e, mode) {
    const { expectedValue } = getStepExpectation(e, mode);
    if (e.phase === "bringDown" && expectedValue === -1) return null;
    return expectedValue;
  }

  // ============================================================
  // Storage (profile-scoped) + Date helpers
  // ============================================================

  const STORAGE_KEY_BASE = "longDivisionCoach_v1";

  function activeProfileId() {
    if (window.KLS && window.KLS.bridge && typeof window.KLS.bridge.getProfileId === "function") {
      return window.KLS.bridge.getProfileId();
    }
    return null;
  }
  function storageKey() {
    const pid = activeProfileId();
    return pid ? `${STORAGE_KEY_BASE}__${pid}` : STORAGE_KEY_BASE;
  }
  function defaultProgress() {
    return {
      version: 1,
      streak: 0,
      lastMissionDate: null,
      freezesAvailable: 1,
      weekFreezeRefreshed: null,
      calendar: {},   // { 'YYYY-MM-DD': { stars: 0-3, difficulty: 'easy'|'medium'|'hard', freezeUsed?: true } }
      totalStars: 0,
      missionsCompleted: 0,
    };
  }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return defaultProgress();
      const parsed = JSON.parse(raw);
      return { ...defaultProgress(), ...parsed, calendar: parsed.calendar || {} };
    } catch { return defaultProgress(); }
  }
  function saveProgress(p) {
    try { localStorage.setItem(storageKey(), JSON.stringify(p)); } catch {}
  }
  function resetProgressStorage() {
    try { localStorage.removeItem(storageKey()); } catch {}
  }

  // ----- Wrongs store (mistakes + practice replay) -----
  // Separate localStorage key per the cross-game MISTAKES_AND_PRACTICE spec.
  // Shape: { records: [ { questionId, questionShape, attempts, hintsUsed,
  //                       revealUsed, correctAnswer, timestamp } ] }
  const WRONGS_KEY_BASE = "longDivisionCoach_wrongs_v1";
  function wrongsKey() {
    const pid = activeProfileId();
    return pid ? `${WRONGS_KEY_BASE}__${pid}` : WRONGS_KEY_BASE;
  }
  function defaultWrongs() { return { records: [] }; }
  function loadWrongs() {
    try {
      const raw = localStorage.getItem(wrongsKey());
      if (!raw) return defaultWrongs();
      const parsed = JSON.parse(raw);
      return { records: Array.isArray(parsed.records) ? parsed.records : [] };
    } catch { return defaultWrongs(); }
  }
  function saveWrongs(w) {
    try { localStorage.setItem(wrongsKey(), JSON.stringify(w)); } catch {}
  }
  function resetWrongsStorage() {
    try { localStorage.removeItem(wrongsKey()); } catch {}
  }

  /** Push a wrong-completion record for the just-finished problem.
   *  Practice mode only; called from handleCheckOrAdvance when the kid
   *  reached `done` after at least one wrong attempt / hint / reveal.
   *  De-duplicates by questionId — if the same problem was missed before,
   *  bumps `attempts` instead of creating a duplicate. */
  function recordMistake(problem, engineSnapshot, counters) {
    if (!problem) return;
    const id = `${problem.divisor}/${problem.dividend}`;
    const existing = app.wrongs.records.find((r) => r.questionId === id);
    if (existing) {
      existing.attempts   += counters.attempts;
      existing.hintsUsed  += counters.hintsUsed;
      existing.revealUsed = existing.revealUsed || counters.revealUsed;
      existing.timestamp  = new Date().toISOString();
    } else {
      app.wrongs.records.push({
        questionId: id,
        questionShape: {
          dividend: problem.dividend,
          divisor: problem.divisor,
          difficulty: problem.difficulty,
          expectedQuotient: problem.expectedQuotient,
          expectedRemainder: problem.expectedRemainder,
        },
        attempts: counters.attempts,
        hintsUsed: counters.hintsUsed,
        revealUsed: counters.revealUsed,
        correctAnswer: problem.expectedRemainder === 0
          ? String(problem.expectedQuotient)
          : `${problem.expectedQuotient} r ${problem.expectedRemainder}`,
        timestamp: new Date().toISOString(),
      });
      // Cap the active queue — oldest fall out (per the spec's UX advice).
      const MAX = 20;
      if (app.wrongs.records.length > MAX) {
        app.wrongs.records.splice(0, app.wrongs.records.length - MAX);
      }
    }
    saveWrongs(app.wrongs);
  }

  /** Remove a wrong by questionId — called when the kid replays it cleanly
   *  in practice. */
  function resolveMistake(questionId) {
    const i = app.wrongs.records.findIndex((r) => r.questionId === questionId);
    if (i >= 0) {
      app.wrongs.records.splice(i, 1);
      saveWrongs(app.wrongs);
    }
  }

  /** Sync the toolbar pill with the current wrong-queue length. Called from
   *  rebindProfile, recordMistake, resolveMistake, and reset. */
  function updatePracticePillUI() {
    // dom may not exist yet during early boot — defer.
    if (!dom || !dom.practicePillBtn) return;
    const n = app.wrongs ? app.wrongs.records.length : 0;
    dom.practicePillCount.textContent = String(n);
    dom.practicePillBtn.hidden = n === 0;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function dateKeyDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function isoWeekKey() {
    const d = new Date();
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = date.valueOf();
    date.setUTCMonth(0, 1);
    if (date.getUTCDay() !== 4) {
      date.setUTCMonth(0, 1 + ((4 - date.getUTCDay()) + 7) % 7);
    }
    const week = 1 + Math.ceil((firstThursday - date.valueOf()) / 604800000);
    return `${new Date(firstThursday).getUTCFullYear()}-W${pad2(week)}`;
  }
  function diffDays(aKey, bKey) {
    // returns aKey - bKey in days (positive if a is later)
    const a = new Date(aKey + "T00:00:00");
    const b = new Date(bKey + "T00:00:00");
    return Math.round((a - b) / 86400000);
  }

  // ============================================================
  // App state
  // ============================================================

  /** @type {'practice'|'game'} */
  let topMode = "practice";

  const app = {
    mode: "guided",          // sub-mode in Practice: 'demo'|'guided'|'independent'
    difficulty: "easy",
    problem: null,
    engine: null,
    inputValue: "",
    feedback: { kind: "none", message: "" },
    attemptsThisStep: 0,
    attemptsThisProblem: 0,
    hintsUsedThisProblem: 0,
    revealUsedThisProblem: false,
    sessionStats: { problemsDone: 0, stepsCorrect: 0, streak: 0, stars: 0 },
    history: [],
    // Game Mode
    mission: null,
    progress: defaultProgress(),
    // Mistakes-and-practice: persisted wrong records + in-memory "replay this
    // problem" hook so the next generated problem comes from the queue.
    wrongs: defaultWrongs(),
    replayProblem: null,    // when non-null, startGeneratedProblem() uses it
    replayingQuestionId: null, // tracks the questionId we're currently retrying
  };

  // ============================================================
  // DOM lookups
  // ============================================================

  function mustGetEl(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }
  const dom = {
    body: document.body,
    practiceToolbar: mustGetEl("practiceToolbar"),
    missionPanel: mustGetEl("missionPanel"),
    mainInteraction: mustGetEl("mainInteraction"),
    lessonPanel: mustGetEl("lessonPanel"),
    timesTablePanel: mustGetEl("timesTablePanel"),

    divisorText: mustGetEl("divisorText"),
    dividendText: mustGetEl("dividendText"),
    streakText: mustGetEl("streakText"),
    starsText: mustGetEl("starsText"),

    quotientSlots: mustGetEl("quotientSlots"),
    divisorBoxValue: mustGetEl("divisorBoxValue"),
    dividendDigits: mustGetEl("dividendDigits"),
    workRows: mustGetEl("workRows"),
    bringDownArrow: mustGetEl("bringDownArrow"),

    doneSummary: mustGetEl("doneSummary"),
    doneSummaryText: mustGetEl("doneSummaryText"),

    phaseBadge: mustGetEl("phaseBadge"),
    stepPrompt: mustGetEl("stepPrompt"),

    cycleRing: mustGetEl("cycleRing"),
    examplePanel: mustGetEl("examplePanel"),
    exampleBody: mustGetEl("exampleBody"),
    exampleBtn: mustGetEl("exampleBtn"),
    exampleCloseBtn: mustGetEl("exampleCloseBtn"),

    timesTableDivisor: mustGetEl("timesTableDivisor"),
    timesTableList: mustGetEl("timesTableList"),
    timesTableToggle: mustGetEl("timesTableToggle"),
    timesTableBody: mustGetEl("timesTableBody"),

    checkBtn: mustGetEl("checkBtn"),
    nextBtn: mustGetEl("nextBtn"),
    hintBtn: mustGetEl("hintBtn"),
    explainBtn: mustGetEl("explainBtn"),
    undoBtn: mustGetEl("undoBtn"),
    newProblemBtn: mustGetEl("newProblemBtn"),
    startOverBtn: mustGetEl("startOverBtn"),
    resetProgressBtn: mustGetEl("resetProgressBtn"),
    practicePillBtn: mustGetEl("practicePillBtn"),
    practicePillCount: mustGetEl("practicePillCount"),
    feedback: mustGetEl("feedback"),

    // Mission
    missionStart: mustGetEl("missionStart"),
    missionAlreadyDone: mustGetEl("missionAlreadyDone"),
    missionProgress: mustGetEl("missionProgress"),
    missionProblemIndex: mustGetEl("missionProblemIndex"),
    missionProblemTotal: mustGetEl("missionProblemTotal"),
    missionProblemRole: mustGetEl("missionProblemRole"),
    missionDots: mustGetEl("missionDots"),
    missionSummary: mustGetEl("missionSummary"),
    missionSummaryStars: mustGetEl("missionSummaryStars"),
    missionSummaryText: mustGetEl("missionSummaryText"),
    missionNewBtn: mustGetEl("missionNewBtn"),
    missionSwitchPracticeBtn: mustGetEl("missionSwitchPracticeBtn"),
    streakCountText: mustGetEl("streakCountText"),
    freezeCountText: mustGetEl("freezeCountText"),
    calendarStrip: mustGetEl("calendarStrip"),

    // Completion overlay (Practice mode reward)
    completionOverlay: mustGetEl("completionOverlay"),
    completionConfetti: document.querySelector(".completionConfetti"),
    completionAnswer: mustGetEl("completionAnswer"),
    completionStars: mustGetEl("completionStars"),
    completionWhy: mustGetEl("completionWhy"),
    completionAgainBtn: mustGetEl("completionAgainBtn"),
    completionHarderBtn: mustGetEl("completionHarderBtn"),
    completionDismissBtn: mustGetEl("completionDismissBtn"),
  };

  function setAppFeedback(kind, message) { app.feedback = { kind, message }; }
  function setInputValue(value) {
    // Roaming-cursor: the "input" lives on the board's active cell. We just
    // mutate the draft string here; render() will paint it into the right cell.
    app.inputValue = value;
  }
  function focusInputSoon() {
    // No-op under Solution 2: there is no separate input element to focus.
    // (Kept as a callable stub so existing call-sites don't need rewrites.)
  }
  function setSelectedSegment(selector, pressedValue, attrName) {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.getAttribute(attrName) === pressedValue));
    });
  }
  function pushHistory(e) {
    app.history.push(cloneEngineState(e));
    if (app.history.length > 50) app.history.shift();
  }

  // ============================================================
  // Top-level mode switching
  // ============================================================

  function setTopMode(next) {
    hideCompletionOverlay();
    topMode = next;
    dom.body.setAttribute("data-top-mode", next);
    document.querySelectorAll("[data-top-mode]").forEach((btn) => {
      const isMatch = btn.getAttribute("data-top-mode") === next;
      if (btn.tagName === "BUTTON") btn.setAttribute("aria-pressed", String(isMatch));
    });
    if (next === "game") {
      dom.missionPanel.hidden = false;
      enterGameMode();
    } else {
      dom.missionPanel.hidden = true;
      exitGameMode();
    }
    render();
  }

  function enterGameMode() {
    // Decide initial Mission screen state
    refreshStreakState();
    if (!app.mission) {
      showMissionStart();
    }
    renderMissionPanel();
  }
  function exitGameMode() {
    // If a mission was in progress, abandon it (no streak change)
    app.mission = null;
    // Reset to a clean Practice problem
    if (!app.problem) startGeneratedProblem();
  }

  // ============================================================
  // Game Mode: streak + calendar
  // ============================================================

  function refreshStreakState() {
    const p = app.progress;
    const today = todayKey();

    // Weekly freeze refresh: 1 freeze per ISO week
    const wk = isoWeekKey();
    if (p.weekFreezeRefreshed !== wk) {
      p.freezesAvailable = 1;
      p.weekFreezeRefreshed = wk;
    }

    // Streak decay: if last mission was > 1 day ago, optionally consume freeze
    if (p.lastMissionDate) {
      const gap = diffDays(today, p.lastMissionDate);
      if (gap >= 2) {
        // missed at least one day
        if (p.freezesAvailable >= 1 && gap === 2) {
          // burn freeze, mark the missed day as a freeze day, keep streak
          const missedKey = dateKeyDaysAgo(1);
          p.calendar[missedKey] = { stars: 0, difficulty: "freeze", freezeUsed: true };
          p.freezesAvailable -= 1;
          // leave lastMissionDate alone; streak holds
        } else {
          // streak resets
          p.streak = 0;
        }
      }
    }
    saveProgress(p);
  }

  function recordMissionCompletion(totalStars, difficulty) {
    const p = app.progress;
    const today = todayKey();
    const alreadyToday = !!p.calendar[today] && !p.calendar[today].freezeUsed;
    if (!alreadyToday) {
      // first completion today → streak counts
      if (p.lastMissionDate) {
        const gap = diffDays(today, p.lastMissionDate);
        if (gap === 1) p.streak += 1;
        else if (gap === 0) { /* same-day replay shouldn't happen here */ }
        else if (gap >= 2) p.streak = 1;
      } else {
        p.streak = 1;
      }
      p.lastMissionDate = today;
      p.missionsCompleted += 1;
    }
    // Always record best stars for the day
    const prev = p.calendar[today]?.stars ?? 0;
    p.calendar[today] = { stars: Math.max(prev, totalStars), difficulty };
    p.totalStars = Object.values(p.calendar).reduce((s, day) => s + (day.stars || 0), 0);
    saveProgress(p);
  }

  function showMissionStart() {
    dom.missionStart.hidden = false;
    dom.missionProgress.hidden = true;
    dom.missionSummary.hidden = true;
    const doneToday = !!app.progress.calendar[todayKey()] && !app.progress.calendar[todayKey()].freezeUsed;
    dom.missionAlreadyDone.hidden = !doneToday;
  }
  function showMissionInProgress() {
    dom.missionStart.hidden = true;
    dom.missionProgress.hidden = false;
    dom.missionSummary.hidden = true;
  }
  function showMissionSummary(totalStars) {
    dom.missionStart.hidden = true;
    dom.missionProgress.hidden = true;
    dom.missionSummary.hidden = false;
    dom.missionSummaryStars.textContent =
      "★".repeat(totalStars) + "☆".repeat(Math.max(0, 3 - totalStars));
    const lines = [];
    lines.push(`You earned ${totalStars} ${totalStars === 1 ? "star" : "stars"} total.`);
    if (app.progress.streak > 0) lines.push(`Streak: ${app.progress.streak} 🔥`);
    dom.missionSummaryText.textContent = lines.join("  ·  ");
  }

  function renderMissionPanel() {
    const p = app.progress;
    dom.streakCountText.textContent = String(p.streak);
    dom.freezeCountText.textContent = String(p.freezesAvailable);

    // Calendar strip: last 14 days, oldest → today
    dom.calendarStrip.innerHTML = "";
    const today = todayKey();
    for (let i = 13; i >= 0; i--) {
      const key = dateKeyDaysAgo(i);
      const cell = document.createElement("div");
      cell.className = "calendarStrip__day";
      const entry = p.calendar[key];
      if (entry) {
        if (entry.freezeUsed) cell.classList.add("is-freeze");
        else cell.classList.add("is-done");
        cell.textContent = entry.freezeUsed ? "❄" : "★";
      } else {
        cell.textContent = String(new Date(key + "T00:00:00").getDate());
      }
      if (key === today) cell.classList.add("is-today");
      cell.title = key + (entry ? ` · ${entry.freezeUsed ? "freeze" : entry.stars + " stars"}` : " · not played");
      dom.calendarStrip.appendChild(cell);
    }

    // Mission progress dots (only while a problem is actually in progress —
    // currentIndex can briefly point past the last problem at completion).
    if (app.mission && app.mission.problems[app.mission.currentIndex]) {
      dom.missionProblemTotal.textContent = String(app.mission.problems.length);
      dom.missionProblemIndex.textContent = String(app.mission.currentIndex + 1);
      dom.missionProblemRole.textContent =
        app.mission.problems[app.mission.currentIndex].role === "warmup" ? "Warm-up" : "Main";
      dom.missionDots.innerHTML = "";
      app.mission.problems.forEach((pp, i) => {
        const dot = document.createElement("span");
        dot.className = "missionDot";
        if (i < app.mission.currentIndex) dot.classList.add("is-done");
        else if (i === app.mission.currentIndex) dot.classList.add("is-current");
        dom.missionDots.appendChild(dot);
      });
    }
  }

  function startMission(difficulty) {
    // 1 warm-up Easy + 2 main at chosen difficulty
    const problems = [
      { role: "warmup",  problem: generateProblem("easy") },
      { role: "main",    problem: generateProblem(difficulty) },
      { role: "main",    problem: generateProblem(difficulty) },
    ];
    app.mission = {
      difficulty,
      problems,
      currentIndex: 0,
      starsPerProblem: [],
      totalStars: 0,
      isBonus: !!app.progress.calendar[todayKey()] && !app.progress.calendar[todayKey()].freezeUsed,
    };
    showMissionInProgress();
    loadMissionProblem();
    renderMissionPanel();
  }

  function loadMissionProblem() {
    if (!app.mission) return;
    const cur = app.mission.problems[app.mission.currentIndex];
    // Mission uses guided mode by default for clarity. This MUST be set before
    // newProblem() runs — newProblem() calls render(), and if a stale 'demo'
    // (Watch) mode carried over from Practice, the mission would render
    // watch-only (Check hidden, Next shown) and the kid couldn't actually
    // solve it. Setting the mode first makes that render use guided.
    app.mode = "guided";
    newProblem(cur.problem);
  }

  function onProblemCompletedInMission() {
    if (!app.mission) return;
    const stars = scoreProblem();
    app.mission.starsPerProblem.push(stars);
    pushStarsToHub(stars);

    app.mission.currentIndex += 1;
    if (app.mission.currentIndex >= app.mission.problems.length) {
      // Mission complete
      const avg = Math.round(
        app.mission.starsPerProblem.reduce((s, n) => s + n, 0) / app.mission.problems.length
      );
      app.mission.totalStars = avg;

      // Only count toward streak/calendar on the first mission of the day
      if (!app.mission.isBonus) {
        recordMissionCompletion(avg, app.mission.difficulty);
        // First-ever mission sticker
        if (app.progress.missionsCompleted === 1 && window.KLS && window.KLS.bridge) {
          window.KLS.bridge.sticker("ldc-first-mission");
        }
        // Streak milestone stickers
        if ([3, 7, 14, 30].includes(app.progress.streak) && window.KLS && window.KLS.bridge) {
          window.KLS.bridge.sticker(`ldc-streak-${app.progress.streak}`);
        }
      }

      showMissionSummary(avg);
      // Clear the mission BEFORE re-rendering the panel. currentIndex was just
      // pushed past the last problem, so renderMissionPanel()'s dots code would
      // read problems[currentIndex] (undefined) and throw — which also skipped
      // this very reset. Clearing first makes the panel skip the dots and just
      // refresh the calendar/streak for the summary screen.
      app.mission = null;
      renderMissionPanel();
    } else {
      // Load next problem
      setTimeout(() => {
        loadMissionProblem();
        renderMissionPanel();
        render();
      }, 700);
    }
  }

  // ============================================================
  // Star rubric  (problem-level, 0–3)
  // ============================================================

  function scoreProblem() {
    // 3 stars: no hints, no wrong tries, no reveal
    // 2 stars: <=1 hint and <=1 wrong, no reveal
    // 1 star: anything else (still gets credit)
    // 0 stars: never (completing always >=1)
    const wrong = app.attemptsThisProblem;
    const hints = app.hintsUsedThisProblem;
    const revealed = app.revealUsedThisProblem;
    if (!revealed && wrong === 0 && hints === 0) return 3;
    if (!revealed && wrong <= 1 && hints <= 1) return 2;
    return 1;
  }

  function pushStarsToHub(stars) {
    if (!window.KLS || !window.KLS.bridge) return;
    const levelId = topMode === "game"
      ? `mission-${app.mission ? app.mission.difficulty : app.difficulty}`
      : `practice-${app.difficulty}`;
    window.KLS.bridge.stars(levelId, Math.max(0, Math.min(3, stars)));
  }

  // ============================================================
  // Completion overlay (Practice mode reward)
  // ============================================================

  const CONFETTI_COLORS = ["#6ee7ff", "#a7f3d0", "#fbbf24", "#fb7185", "#c084fc", "#ffffff"];

  function generateConfetti(container, count) {
    if (!container) return;
    container.innerHTML = "";
    const n = count || 32;
    for (let i = 0; i < n; i++) {
      const piece = document.createElement("div");
      piece.className = "confettiPiece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.setProperty("--delay", `${(Math.random() * 0.9).toFixed(2)}s`);
      piece.style.setProperty("--dur",   `${(1.8 + Math.random() * 1.6).toFixed(2)}s`);
      // Random initial rotation so pieces don't all start upright.
      piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
      container.appendChild(piece);
    }
  }

  /** Show the celebration overlay with the kid's final answer and star score. */
  function showCompletionOverlay(problem, engine, stars) {
    const ans = engine.quotientDigits.filter((x) => x !== null).join("") || "0";
    const rem = engine.remainder ?? 0;
    dom.completionAnswer.textContent = rem === 0
      ? `${problem.dividend} ÷ ${problem.divisor} = ${ans}`
      : `${problem.dividend} ÷ ${problem.divisor} = ${ans} r ${rem}`;

    // Light up earned stars; reset others.
    const starEls = dom.completionStars.querySelectorAll(".completionStar");
    starEls.forEach((el, i) => {
      el.classList.remove("is-earned");
      // Force reflow so the animation restarts cleanly on consecutive opens.
      void el.offsetWidth;
      if (i < stars) el.classList.add("is-earned");
    });

    dom.completionWhy.textContent =
      stars === 3 ? "Perfect! No hints, no wrong tries." :
      stars === 2 ? "Great work — just a little help needed." :
                    "Nice job finishing it!";

    // Adjust "Try harder" button per current difficulty.
    const nextLabel =
      app.difficulty === "easy"   ? "Try Medium →" :
      app.difficulty === "medium" ? "Try Hard →"   :
                                    "Another Hard →";
    dom.completionHarderBtn.textContent = nextLabel;

    generateConfetti(dom.completionConfetti, 32);
    dom.completionOverlay.hidden = false;
    // Move focus to the primary action for keyboard users.
    setTimeout(() => { try { dom.completionAgainBtn.focus(); } catch {} }, 50);
  }

  function hideCompletionOverlay() {
    dom.completionOverlay.hidden = true;
    if (dom.completionConfetti) dom.completionConfetti.innerHTML = "";
  }

  function playAnotherFromOverlay() {
    hideCompletionOverlay();
    startGeneratedProblem();
  }
  function tryHarderFromOverlay() {
    hideCompletionOverlay();
    if (app.difficulty === "easy")        app.difficulty = "medium";
    else if (app.difficulty === "medium") app.difficulty = "hard";
    // Already at hard → just start another hard.
    startGeneratedProblem();
  }

  // ============================================================
  // Cycle ring + zero-quotient + times-table
  // ============================================================

  const PHASE_ORDER = ["divide", "multiply", "subtract", "bringDown"];

  function renderCycleRing(e, done) {
    const currentIdx = done ? -1 : PHASE_ORDER.indexOf(e.phase);
    const nodes = dom.cycleRing.querySelectorAll(".cycleRing__node");
    nodes.forEach((node) => {
      const phase = node.getAttribute("data-phase");
      const idx = PHASE_ORDER.indexOf(phase);
      node.classList.remove("is-active", "is-done");
      if (done) node.classList.add("is-done");
      else if (idx === currentIdx) node.classList.add("is-active");
      else if (currentIdx > 0 && idx < currentIdx) node.classList.add("is-done");
    });
  }

  function renderTimesTable(e, done) {
    const divisor = e ? e.divisor : null;
    if (!divisor) {
      dom.timesTableDivisor.textContent = "—";
      dom.timesTableList.innerHTML = "";
      return;
    }
    dom.timesTableDivisor.textContent = String(divisor);
    const current = e.currentValue;
    const inDivide = !done && e.phase === "divide";
    const best = inDivide ? Math.floor(current / divisor) : -1;

    dom.timesTableList.innerHTML = "";
    for (let k = 1; k <= 9; k++) {
      const product = divisor * k;
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="timesTable__factor">${divisor} ×</span> ` +
        `<span><strong>${k}</strong> = ${product}</span>`;
      if (inDivide) {
        if (product <= current) li.classList.add("is-fits");
        else li.classList.add("is-over");
        if (k === best) li.classList.add("is-best");
      }
      dom.timesTableList.appendChild(li);
    }
  }

  // (Zero-quotient lesson is now rendered inline in the step prompt via
  //  getStepExpectation + a .stepPrompt--zeroQ modifier toggled in render().)

  // ============================================================
  // Worked example  (for Practice mode, after 2 wrong divides)
  // ============================================================

  function buildWorkedExample(problem) {
    // Build a smaller analogous problem: same divisor, smaller dividend that still divides cleanly.
    const divisor = problem.divisor;
    const quotient = Math.max(2, Math.floor((problem.expectedQuotient || 4) / 10) || 4);
    const dividend = divisor * quotient;
    const steps = [];
    steps.push(`Look at ${dividend} ÷ ${divisor}.`);
    steps.push(`<strong>Divide:</strong> How many ${divisor}s in ${dividend}? Answer: ${quotient}.`);
    steps.push(`<strong>Multiply:</strong> ${quotient} × ${divisor} = ${quotient * divisor}.`);
    steps.push(`<strong>Subtract:</strong> ${dividend} − ${quotient * divisor} = 0.`);
    steps.push(`Done! ${dividend} ÷ ${divisor} = ${quotient}.`);
    steps.push(`Now look at your problem: ${problem.dividend} ÷ ${problem.divisor}. Use the same moves!`);
    return steps;
  }

  function showWorkedExample() {
    if (!app.problem) return;
    const steps = buildWorkedExample(app.problem);
    dom.exampleBody.innerHTML = "";
    steps.forEach((s) => {
      const p = document.createElement("p");
      p.className = "exStep";
      p.innerHTML = s;
      dom.exampleBody.appendChild(p);
    });
    dom.examplePanel.hidden = false;
  }
  function hideWorkedExample() {
    dom.examplePanel.hidden = true;
  }

  // ============================================================
  // Per-problem lifecycle
  // ============================================================

  function clearPerStepCounts() { app.attemptsThisStep = 0; }

  function newProblem(problem) {
    app.problem = problem;
    app.engine = createEngine(problem);
    app.history = [];
    app.hintsUsedThisProblem = 0;
    app.attemptsThisStep = 0;
    app.attemptsThisProblem = 0;
    app.revealUsedThisProblem = false;
    setInputValue("");
    setAppFeedback("neutral", "Let’s go! We’ll do one small step at a time.");
    hideWorkedExample();
    render();
    focusInputSoon();
  }
  function startGeneratedProblem() {
    // Mistakes-and-practice: if a wrong record was queued via the "Practice
    // tricky problems" pill, replay that exact problem instead of generating
    // a fresh one. The shape carries enough to reconstruct the Problem object.
    if (app.replayProblem) {
      const shape = app.replayProblem;
      app.replayingQuestionId = `${shape.divisor}/${shape.dividend}`;
      app.replayProblem = null;
      newProblem({
        dividend: shape.dividend,
        divisor: shape.divisor,
        difficulty: shape.difficulty,
        expectedQuotient: shape.expectedQuotient,
        expectedRemainder: shape.expectedRemainder,
      });
      return;
    }
    app.replayingQuestionId = null;
    newProblem(generateProblem(app.difficulty));
  }

  /** Pop the oldest unresolved wrong and queue it for the next problem. */
  function startNextPracticeReplay() {
    if (app.wrongs.records.length === 0) return false;
    app.replayProblem = app.wrongs.records[0].questionShape;
    startGeneratedProblem();
    setAppFeedback("neutral", "Tricky problem replay — you've seen this one before!");
    return true;
  }
  function startOver() {
    if (!app.problem) return startGeneratedProblem();
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

  // ============================================================
  // Rendering
  // ============================================================

  function renderFeedback(feedback) {
    dom.feedback.textContent = feedback.message;
    dom.feedback.classList.remove("feedback--success", "feedback--error", "feedback--neutral");
    if (feedback.kind === "success") dom.feedback.classList.add("feedback--success");
    if (feedback.kind === "error") dom.feedback.classList.add("feedback--error");
    if (feedback.kind === "neutral") dom.feedback.classList.add("feedback--neutral");
  }

  // Place-value coloring. The quotient slots and dividend digits share one
  // column grid, so column `i` of a `cols`-wide dividend is the place value
  // (cols-1-i): 0 = ones, 1 = tens, 2 = hundreds … The same pv-* class on the
  // quotient slot and the dividend digit lines them up by place, making "the 9
  // sits above the 5 because both are tens" visible instead of memorized.
  // Colors cycle every 5 places for very large dividends; the legend below
  // always names the true place.
  const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands", "millions"];
  function placeClass(colIndex, cols) {
    return "pv-" + ((cols - 1 - colIndex) % 5);
  }
  function placeName(colIndex, cols) {
    const place = cols - 1 - colIndex;
    return PLACE_NAMES[place] || ("10^" + place);
  }
  /** Build the color-keyed legend that names each place (left → right = highest
   *  place → ones), matching the board's columns. */
  function renderPlaceLegend(e) {
    const host = document.getElementById("placeLegend");
    if (!host) return;
    host.innerHTML = "";
    if (!e) { host.hidden = true; return; }
    const cols = e.dividendDigits.length;
    host.hidden = false;
    for (let i = 0; i < cols; i++) {
      const chip = document.createElement("span");
      chip.className = "placeChip " + placeClass(i, cols);
      const dot = document.createElement("i");
      dot.className = "placeChip__dot";
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(placeName(i, cols)));
      host.appendChild(chip);
    }
  }

  function renderQuotientSlots(e, done) {
    dom.quotientSlots.innerHTML = "";
    dom.quotientSlots.style.setProperty("--digit-cols", String(e.dividendDigits.length));
    const editingThisSlot = !done && e.phase === "divide" && app.mode !== "demo";
    for (let i = 0; i < e.quotientDigits.length; i++) {
      const slot = document.createElement("div");
      slot.className = "digitCell slot " + placeClass(i, e.dividendDigits.length);
      const v = e.quotientDigits[i];
      const isActiveSlot = i === e.activeQuotientIndex && !done;
      if (v !== null) slot.classList.add("slot--filled");
      if (isActiveSlot) slot.classList.add("slot--active");

      let text = v === null ? "" : String(v);
      // Solution 2: during divide, the active slot shows the kid's draft + caret.
      if (isActiveSlot && editingThisSlot) {
        slot.classList.add("slot--editing");
        text = app.inputValue || "";
      }
      slot.textContent = text;
      slot.title = `Quotient position ${i + 1}`;
      dom.quotientSlots.appendChild(slot);
    }
  }
  function renderDividendDigits(e, done) {
    dom.dividendDigits.innerHTML = "";
    dom.dividendDigits.style.setProperty("--digit-cols", String(e.dividendDigits.length));
    const nextIndex = e.cursorIndex;
    const inBringDown = !done && e.phase === "bringDown" && nextIndex < e.dividendDigits.length;
    for (let i = 0; i < e.dividendDigits.length; i++) {
      const d = document.createElement("div");
      d.className = "digitCell digit " + placeClass(i, e.dividendDigits.length);
      d.textContent = String(e.dividendDigits[i]);
      if (!done && i >= e.activeStartIndex && i <= e.activeEndIndex) d.classList.add("digit--active");
      if (!done && i === nextIndex) {
        d.classList.add("digit--next");
        if (inBringDown) d.classList.add("is-bringDownSource");
      }
      dom.dividendDigits.appendChild(d);
    }
  }

  /** Render the dotted target slot below the work area showing where the
   *  brought-down digit will land. Only during bringDown phase. */
  function renderGhostTargetRow(cols, cursorIndex) {
    const row = makeWorkGrid(cols);
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      if (c === cursorIndex) {
        cell.className = "workCell workCell--ghostTarget";
        cell.textContent = "?";
        cell.setAttribute("data-bringdown-target", "1");
      } else {
        cell.className = "workCell workCell--empty";
        cell.textContent = "";
      }
      row.appendChild(cell);
    }
    return row;
  }

  /** Draw a curved SVG arrow from the next-dividend digit to the ghost
   *  target slot. Recomputed on every render and on window resize.
   *  No-ops when not in bringDown phase or when source/target aren't laid out.
   *
   *  The SVG itself is always present and laid out (pointer-events:none) so
   *  its bounding rect is always measurable — we toggle the arrow on/off by
   *  adding or removing the path child, NOT by hiding the SVG element. This
   *  sidesteps the [hidden] safety rule that would otherwise collapse the
   *  SVG to 0×0 and break getBoundingClientRect. */
  function renderBringDownArrow(e, done) {
    const svg = dom.bringDownArrow;
    if (!svg) return;
    // Always reset content first.
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const shouldShow =
      !done && e && e.phase === "bringDown" && e.cursorIndex < e.dividendDigits.length;
    if (!shouldShow) return; // SVG stays present but empty.

    const sourceEl = dom.dividendDigits.children[e.cursorIndex];
    const targetEl = dom.workRows.querySelector('[data-bringdown-target="1"]');
    // Container is the SVG's offset parent (.bracket). Use the SVG's own rect
    // as the coordinate origin so positions are independent of scroll.
    const containerRect = svg.getBoundingClientRect();
    if (!sourceEl || !targetEl || containerRect.width === 0) return;
    const s = sourceEl.getBoundingClientRect();
    const t = targetEl.getBoundingClientRect();

    // Source: bottom-center of the dividend digit. Target: top-center of the slot.
    const x1 = s.left + s.width / 2 - containerRect.left;
    const y1 = s.bottom - containerRect.top - 2;
    const x2 = t.left + t.width / 2 - containerRect.left;
    const y2 = t.top - containerRect.top + 1;

    // Smooth cubic Bezier — bulges sideways so the arrow doesn't overlap text.
    const sideways = Math.max(18, Math.abs(x2 - x1) * 0.4);
    const dir = x2 >= x1 ? 1 : -1;
    const c1x = x1 + sideways * dir * 0.4;
    const c1y = y1 + (y2 - y1) * 0.55;
    const c2x = x2 - sideways * dir * 0.2;
    const c2y = y2 - (y2 - y1) * 0.25;
    const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} ` +
              `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ` +
              `${c2x.toFixed(1)} ${c2y.toFixed(1)}, ` +
              `${x2.toFixed(1)} ${y2.toFixed(1)}`;

    const NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", `0 0 ${containerRect.width} ${containerRect.height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    // Arrowhead marker
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML =
      `<marker id="bringDownArrowHead" viewBox="0 0 10 10" refX="7" refY="5"
               markerWidth="7" markerHeight="7" orient="auto-start-reverse">
         <path d="M 0 0 L 10 5 L 0 10 z" class="bringDownHead" />
       </marker>`;
    svg.appendChild(defs);

    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "bringDownPath");
    path.setAttribute("marker-end", "url(#bringDownArrowHead)");
    svg.appendChild(path);
  }
  /** Render a pending phase row showing the kid's current draft, right-aligned
   *  to endCol. The rightmost cell carries the workCell--active class so it
   *  pulses and shows the caret. Used for multiply / subtract phases. */
  function renderPendingRow(cols, endCol, draft, kind) {
    const row = makeWorkGrid(cols);
    const digits = String(draft || "").split("");
    const startCol = Math.max(0, endCol - Math.max(1, digits.length) + 1);
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      if (c >= startCol && c <= endCol) {
        cell.className = `workCell workCell--${kind}`;
        if (c === endCol) cell.classList.add("workCell--active");
        cell.textContent = digits[c - startCol] ?? "";
      } else {
        cell.className = "workCell workCell--empty";
        cell.textContent = "";
      }
      row.appendChild(cell);
    }
    return row;
  }

  function renderWorkRows(e, done) {
    dom.workRows.innerHTML = "";
    const cols = e.dividendDigits.length;
    const willRenderPending =
      !done && app.mode !== "demo" && (e.phase === "multiply" || e.phase === "subtract");
    if (e.rows.length === 0 && !done && !willRenderPending) {
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
        const cell = grid.children.item(row.highlightCol);
        if (cell instanceof HTMLElement) cell.classList.add("workCell--broughtDigit");
      }
      dom.workRows.appendChild(grid);
    }

    // Solution 2: render a "pending" row for the in-progress phase so the kid
    // sees their draft right where it'll land — no separate input box needed.
    if (!done && app.mode !== "demo") {
      if (e.phase === "multiply") {
        dom.workRows.appendChild(renderPendingRow(cols, e.activeEndIndex, app.inputValue, "product"));
      } else if (e.phase === "subtract") {
        dom.workRows.appendChild(renderPendingRow(cols, e.activeEndIndex, app.inputValue, "remainder"));
      } else if (e.phase === "bringDown" && e.cursorIndex < e.dividendDigits.length) {
        // Ghost target on the SAME row as the remainder (paper-style), at the
        // cursorIndex column. When the kid types, the cell becomes the active
        // editing cell and shows the draft; otherwise it shows "?".
        const lastRow = dom.workRows.lastElementChild;
        const draft = app.inputValue || "";
        if (lastRow) {
          const targetCell = lastRow.children.item(e.cursorIndex);
          if (targetCell instanceof HTMLElement) {
            targetCell.className = "workCell workCell--ghostTarget";
            if (draft) targetCell.classList.add("workCell--active");
            targetCell.textContent = draft || "?";
            targetCell.setAttribute("data-bringdown-target", "1");
          } else {
            dom.workRows.appendChild(renderGhostTargetRow(cols, e.cursorIndex));
          }
        } else {
          dom.workRows.appendChild(renderGhostTargetRow(cols, e.cursorIndex));
        }
      }
    }
  }

  function render() {
    setSelectedSegment("[data-difficulty]", app.difficulty, "data-difficulty");
    setSelectedSegment("[data-mode]", app.mode, "data-mode");

    dom.streakText.textContent = String(app.sessionStats.streak);
    dom.starsText.textContent = String(app.sessionStats.stars);
    renderFeedback(app.feedback);

    if (!app.problem || !app.engine) {
      dom.divisorText.textContent = "—";
      dom.dividendText.textContent = "—";
      dom.divisorBoxValue.textContent = "—";
      dom.quotientSlots.innerHTML = "";
      dom.dividendDigits.innerHTML = "";
      dom.workRows.innerHTML = "";
      dom.doneSummary.hidden = true;
      dom.phaseBadge.textContent = "—";
      dom.stepPrompt.textContent = topMode === "game"
        ? "Pick a level above to start today's mission."
        : "Choose a mode and start a problem.";
      dom.checkBtn.disabled = true;
      dom.hintBtn.disabled = true;
      dom.explainBtn.disabled = true;
      dom.undoBtn.disabled = true;
      dom.nextBtn.hidden = true;
      dom.checkBtn.hidden = false;
      dom.exampleBtn.hidden = true;
      renderCycleRing(null, false);
      renderTimesTable(null, false);
      renderPlaceLegend(null);
      dom.body.setAttribute("data-input", "off");
      dom.stepPrompt.classList.remove("stepPrompt--zeroQ");
      return;
    }

    const e = app.engine;
    dom.divisorText.textContent = String(app.problem.divisor);
    dom.dividendText.textContent = String(app.problem.dividend);
    dom.divisorBoxValue.textContent = String(app.problem.divisor);

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

    // Solution 2: input lives on the board cell — nothing to disable here.

    dom.phaseBadge.textContent = getPhaseLabel(e.phase);
    const { kidMessage, kidHint, zeroQuotient } = getStepExpectation(e, app.mode, app.difficulty);
    if (done) {
      dom.stepPrompt.textContent = "Done! 🎉";
      dom.stepPrompt.classList.remove("stepPrompt--zeroQ");
    } else {
      dom.stepPrompt.replaceChildren();
      dom.stepPrompt.appendChild(document.createTextNode(kidMessage));
      if (kidHint) {
        const hintEl = document.createElement("span");
        hintEl.className = "stepPrompt__hint";
        hintEl.textContent = kidHint;
        dom.stepPrompt.appendChild(hintEl);
      }
      dom.stepPrompt.classList.toggle("stepPrompt--zeroQ", !!zeroQuotient);
    }

    renderQuotientSlots(e, done);
    renderDividendDigits(e, done);
    renderWorkRows(e, done);
    renderCycleRing(e, done);
    renderTimesTable(e, done);
    renderPlaceLegend(e);
    // Input affordances (keypad + "type here" help) only make sense when the
    // kid is actually entering a digit — not while watching a demo or after the
    // problem is solved. CSS keys off this attribute.
    dom.body.setAttribute("data-input", !done && app.mode !== "demo" ? "on" : "off");
    // Arrow positioning depends on layout — defer to next frame so the rows
    // just appended above have their final bounding rects.
    requestAnimationFrame(() => renderBringDownArrow(e, done));

    // Example button: show in Practice mode, after 2+ wrong divides
    const inDivideStruggle = !done && e.phase === "divide" && app.attemptsThisStep >= 2;
    dom.exampleBtn.hidden = !(topMode === "practice" && inDivideStruggle);

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

  // ============================================================
  // Step handlers
  // ============================================================

  function handleCheckOrAdvance(userValueRaw) {
    if (!app.engine || !app.problem) return;
    const e = app.engine;
    if (e.phase === "done") return;

    const userValue = toInt(userValueRaw);
    pushHistory(e);
    const { nextEngine, correct, feedback } = applyAnswerAndAdvance(e, userValue);
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
        if (app.engine.remainder === null) app.engine.remainder = app.problem.expectedRemainder;
        setAppFeedback("success", topMode === "game" ? "Problem complete!" : "Finished! Want a new problem?");

        if (topMode === "game" && app.mission) {
          render();
          onProblemCompletedInMission();
          return;
        } else {
          // Practice: push stars to the hub, then celebrate with the overlay.
          // Brief delay so the kid sees the final answer commit before the
          // overlay takes over the screen.
          const earned = scoreProblem();
          pushStarsToHub(earned);

          // Mistakes-and-practice: record the wrong (if the kid struggled) or
          // resolve it (if they were replaying a queued problem and got it
          // clean). A 3-star clean run on a fresh problem records nothing.
          const counters = {
            attempts: app.attemptsThisProblem,
            hintsUsed: app.hintsUsedThisProblem,
            revealUsed: app.revealUsedThisProblem,
          };
          const struggled = counters.attempts > 0 || counters.hintsUsed > 0 || counters.revealUsed;
          if (struggled) {
            recordMistake(app.problem, app.engine, counters);
          } else if (app.replayingQuestionId) {
            // Replay completed cleanly → remove from queue.
            resolveMistake(app.replayingQuestionId);
          }
          app.replayingQuestionId = null;
          updatePracticePillUI();

          const finalProblem = app.problem;
          const finalEngine = app.engine;
          setTimeout(() => {
            // Guard: don't pop the overlay if the kid already moved on
            // (e.g., clicked New problem in the meantime).
            if (app.problem === finalProblem && app.engine === finalEngine) {
              showCompletionOverlay(finalProblem, finalEngine, earned);
            }
          }, 450);
        }
      }
    } else {
      app.attemptsThisStep += 1;
      app.attemptsThisProblem += 1;
      app.sessionStats.streak = 0;
      setAppFeedback(feedback.kind, feedback.message);

      if (app.attemptsThisStep >= 2 && e.phase === "divide") {
        const d = e.divisor, cur = e.currentValue;
        const q = Math.floor(cur / d), a = Math.max(0, q - 1), b = q, c = q + 1;
        setAppFeedback(
          "neutral",
          `Helper: ${d}×${a}=${d * a}, ${d}×${b}=${d * b}, ${d}×${c}=${d * c}. Pick the one that fits!`
        );
      }
    }

    render();
    focusInputSoon();
  }

  function handleHint() {
    if (!app.engine) return;
    app.hintsUsedThisProblem += 1;
    const hintCount = Math.min(2, app.attemptsThisStep);
    const hint = applyHint(app.engine, app.mode, hintCount, app.difficulty);
    setAppFeedback(hint.kind, hint.message);
    if (hintCount >= 1) {
      app.revealUsedThisProblem = true;
      const auto = getAutoAnswer(app.engine, app.mode);
      if (auto !== null) setInputValue(String(auto));
      focusInputSoon();
    }
    render();
  }
  function handleExplain() {
    if (!app.engine) return;
    const p = app.engine.phase;
    if (p === "divide") setAppFeedback("neutral", "Divide: think how many groups of the divisor fit in the current number. Use multiplication to check.");
    else if (p === "multiply") setAppFeedback("neutral", "Multiply: divisor × your quotient digit. That’s the number you subtract next.");
    else if (p === "subtract") setAppFeedback("neutral", "Subtract: current number − product = remainder. It should not go below 0.");
    else if (p === "bringDown") setAppFeedback("neutral", "Bring down: copy the next digit from the dividend to the bottom, next to your remainder.");
    else setAppFeedback("neutral", "Done means there are no more digits to bring down.");
    render();
  }
  function handleNextDemoStep() {
    if (!app.engine) return;
    const e = app.engine;
    if (e.phase === "done") return;
    const auto = getAutoAnswer(e, app.mode);
    if (auto === null) {
      pushHistory(e);
      const { nextEngine } = applyAnswerAndAdvance(e, 0);
      app.engine = nextEngine;
      render();
      return;
    }
    setInputValue(String(auto));
    handleCheckOrAdvance(auto);
  }

  // ============================================================
  // Reset
  // ============================================================

  function handleResetProgress() {
    const ok = window.confirm(
      "Erase Long Division Coach progress for this profile?\n\n" +
      "This wipes your streak, calendar, and star history. Other games and other profiles are not affected."
    );
    if (!ok) return;
    hideCompletionOverlay();
    resetProgressStorage();
    resetWrongsStorage();
    app.progress = defaultProgress();
    app.wrongs = defaultWrongs();
    app.mission = null;
    app.replayProblem = null;
    app.replayingQuestionId = null;
    app.sessionStats = { problemsDone: 0, stepsCorrect: 0, streak: 0, stars: 0 };
    updatePracticePillUI();
    if (window.KLS && window.KLS.bridge && window.KLS.bridge.resetProgress) {
      window.KLS.bridge.resetProgress();
    }
    setAppFeedback("neutral", "Progress reset. Fresh start!");
    if (topMode === "game") {
      showMissionStart();
      renderMissionPanel();
    }
    render();
  }

  // ============================================================
  // Event listeners
  // ============================================================

  // Top-level mode toggle
  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target.closest("[data-top-mode]") : null;
    if (!target) return;
    const v = target.getAttribute("data-top-mode");
    if (v === "practice" || v === "game") setTopMode(v);
  });

  // Mission difficulty pick
  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target.closest("[data-mission-difficulty]") : null;
    if (!target) return;
    const d = target.getAttribute("data-mission-difficulty");
    if (d === "easy" || d === "medium" || d === "hard") startMission(d);
  });

  // Difficulty + sub-mode (Practice toolbar)
  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
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
      setAppFeedback("neutral",
        mode === "demo" ? "Watch mode: click Next to see each step."
        : mode === "guided" ? "Practice mode: type the next tiny answer, then press Check."
        : "Challenge mode: fewer hints in the prompt, but you can still use Hint if you need it.");
      render();
      focusInputSoon();
      return;
    }
  });

  dom.newProblemBtn.addEventListener("click", () => { hideCompletionOverlay(); startGeneratedProblem(); });
  dom.startOverBtn.addEventListener("click", () => { hideCompletionOverlay(); startOver(); });
  dom.practicePillBtn.addEventListener("click", () => {
    hideCompletionOverlay();
    startNextPracticeReplay();
    render();
  });

  // Completion overlay actions
  dom.completionAgainBtn.addEventListener("click", playAnotherFromOverlay);
  dom.completionHarderBtn.addEventListener("click", tryHarderFromOverlay);
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && t.getAttribute("data-completion-dismiss") === "1") {
      hideCompletionOverlay();
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !dom.completionOverlay.hidden) {
      hideCompletionOverlay();
    }
  });
  dom.undoBtn.addEventListener("click", () => undo());
  dom.hintBtn.addEventListener("click", () => handleHint());
  dom.explainBtn.addEventListener("click", () => handleExplain());
  dom.resetProgressBtn.addEventListener("click", () => handleResetProgress());
  dom.exampleBtn.addEventListener("click", () => showWorkedExample());
  dom.exampleCloseBtn.addEventListener("click", () => hideWorkedExample());

  function commitDraft() {
    const raw = (app.inputValue || "").trim();
    if (app.engine && app.engine.phase === "bringDown" && app.engine.cursorIndex >= app.engine.dividendDigits.length) {
      handleCheckOrAdvance(0);
      return;
    }
    if (raw === "") {
      setAppFeedback("neutral", "Type a digit first (or use Hint to reveal).");
      render();
      return;
    }
    handleCheckOrAdvance(Number(raw));
  }

  dom.checkBtn.addEventListener("click", commitDraft);
  dom.nextBtn.addEventListener("click", () => handleNextDemoStep());

  // Mission summary buttons
  dom.missionNewBtn.addEventListener("click", () => {
    showMissionStart();
    renderMissionPanel();
  });
  dom.missionSwitchPracticeBtn.addEventListener("click", () => setTopMode("practice"));

  // Solution 2 — document-level keydown captures input for the roaming cursor.
  // Skip when a button is focused so Enter/Space still activates the button.
  document.addEventListener("keydown", (ev) => {
    if (!app.engine) return;
    if (app.engine.phase === "done") return;
    if (app.mode === "demo") {
      if (ev.key === "Enter") { ev.preventDefault(); handleNextDemoStep(); }
      return;
    }
    const t = ev.target;
    const onButton = t instanceof HTMLElement && (t.tagName === "BUTTON" || t.tagName === "A");
    // Let Space activate a focused button natively (standard keyboard behavior).
    // Do NOT pass Enter through, though: there is no real input element to hold
    // focus (see focusInputSoon — it's a no-op), so focus stays on whatever
    // button the kid last clicked (New problem, Start over, difficulty, mode…).
    // Passing Enter through would silently re-run that button instead of
    // checking the answer — the kid types a digit, presses Enter, and "nothing
    // happens". Enter must always mean "check my answer". preventDefault() below
    // also suppresses any native click when the Check button itself is focused,
    // so there's no double-check. Digits and Backspace still fall through so the
    // kid can always type into the cell even with a button focused.
    if (onButton && (ev.key === " " || ev.key === "Spacebar")) return;

    if (ev.key === "Enter") {
      ev.preventDefault();
      commitDraft();
      return;
    }
    if (ev.key === "Backspace") {
      ev.preventDefault();
      setInputValue((app.inputValue || "").slice(0, -1));
      render();
      return;
    }
    if (/^[0-9]$/.test(ev.key)) {
      ev.preventDefault();
      const next = ((app.inputValue || "") + ev.key).slice(0, 6);
      setInputValue(next);
      render();
      return;
    }
  });

  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (!target) return;
    if (!target.classList.contains("keypad__btn")) return;
    const key = target.getAttribute("data-key");
    if (!key) return;
    if (key === "clear") { setInputValue(""); render(); return; }
    if (key === "back")  { setInputValue((app.inputValue || "").slice(0, -1)); render(); return; }
    if (/^\d$/.test(key)) { setInputValue(((app.inputValue || "") + key).slice(0, 6)); render(); }
  });

  // Collapsible lesson panel
  const lessonToggle = document.getElementById("lessonToggle");
  const lessonBody = document.getElementById("lessonBody");
  if (lessonToggle && lessonBody) {
    lessonToggle.addEventListener("click", () => {
      const expanded = lessonToggle.getAttribute("aria-expanded") === "true";
      lessonToggle.setAttribute("aria-expanded", String(!expanded));
      lessonBody.hidden = expanded;
    });
  }
  // Collapsible times-table panel
  dom.timesTableToggle.addEventListener("click", () => {
    const expanded = dom.timesTableToggle.getAttribute("aria-expanded") === "true";
    dom.timesTableToggle.setAttribute("aria-expanded", String(!expanded));
    dom.timesTableBody.hidden = expanded;
  });

  // Reposition the bring-down arrow on resize (layout-dependent).
  let _resizeTimer = 0;
  window.addEventListener("resize", () => {
    if (_resizeTimer) cancelAnimationFrame(_resizeTimer);
    _resizeTimer = requestAnimationFrame(() => {
      if (app.engine) renderBringDownArrow(app.engine, app.engine.phase === "done");
    });
  });

  // ============================================================
  // Profile lifecycle (load progress when profile arrives)
  // ============================================================

  function rebindProfile() {
    app.progress = loadProgress();
    app.wrongs = loadWrongs();
    updatePracticePillUI();
    if (topMode === "game") {
      refreshStreakState();
      renderMissionPanel();
    }
    render();
  }

  if (window.KLS && window.KLS.bridge) {
    if (window.KLS.bridge.onProfileReady) {
      window.KLS.bridge.onProfileReady(() => rebindProfile());
    }
    if (window.KLS.bridge.onHubMessage) {
      window.KLS.bridge.onHubMessage("setProfile", () => rebindProfile());
      // Chrome bar's "🏠 Home" button — return to the game's default state
      // (top-level Practice mode with a fresh problem). Cancels any active
      // mission, replay queue, and overlay.
      window.KLS.bridge.onHubMessage("goHome", () => goToGameHome());

      // Resume-blob contract.
      // requestState: chrome bar's Save button → reply with current snapshot.
      // resumeState:  hub pushed a saved blob → STASH it (don't auto-restore).
      //               The kid picks Continue or New on the resume overlay.
      window.KLS.bridge.onHubMessage("requestState", () => {
        try {
          window.KLS.bridge.saveState(captureSessionBlob());
        } catch (e) { /* never throw inside a message handler */ }
      });
      window.KLS.bridge.onHubMessage("resumeState", (msg) => {
        try {
          if (msg && msg.state) showResumeChoice(msg.state);
        } catch (e) { /* corrupted blob — leave game in default state */ }
      });
    }
  }

  /** Capture enough state to drop the kid back at the exact same problem,
   *  same phase, same partial answer they were in. Engine objects are plain
   *  data already (see `cloneEngineState`), so they serialize cleanly. */
  function captureSessionBlob() {
    return {
      v: 1,
      topMode: topMode,
      mode: app.mode,
      difficulty: app.difficulty,
      problem: app.problem ? Object.assign({}, app.problem) : null,
      engine: app.engine ? cloneEngineState(app.engine) : null,
      inputValue: app.inputValue || "",
      attemptsThisProblem: app.attemptsThisProblem,
      hintsUsedThisProblem: app.hintsUsedThisProblem,
      revealUsedThisProblem: !!app.revealUsedThisProblem,
      // Mission state is intentionally NOT captured for v1 — restoring
      // mid-mission is a future enhancement.
    };
  }

  /** Approach 4: stash the resume blob and show a two-button overlay so the
   *  kid explicitly picks Continue or New. Saves were happening on every
   *  game-state change anyway; this just makes the choice explicit. */
  let _pendingResumeBlob = null;
  function showResumeChoice(blob) {
    if (!blob || blob.v !== 1) return;
    _pendingResumeBlob = blob;
    const overlay = document.getElementById("resumeOverlay");
    if (overlay) overlay.hidden = false;
  }
  function hideResumeOverlay() {
    const overlay = document.getElementById("resumeOverlay");
    if (overlay) overlay.hidden = true;
  }
  function onResumeContinue() {
    hideResumeOverlay();
    if (_pendingResumeBlob) {
      const blob = _pendingResumeBlob;
      _pendingResumeBlob = null;
      restoreSessionBlob(blob);
    }
  }
  function onResumeFresh() {
    hideResumeOverlay();
    _pendingResumeBlob = null;
    if (window.KLS && window.KLS.bridge && window.KLS.bridge.clearState) {
      window.KLS.bridge.clearState();
    }
    startGeneratedProblem();
  }

  function restoreSessionBlob(blob) {
    if (!blob || blob.v !== 1 || !blob.problem || !blob.engine) return;
    hideCompletionOverlay();
    app.mission = null;
    app.replayProblem = null;
    app.replayingQuestionId = null;
    if (blob.difficulty === "easy" || blob.difficulty === "medium" || blob.difficulty === "hard") {
      app.difficulty = blob.difficulty;
    }
    if (blob.mode === "demo" || blob.mode === "guided" || blob.mode === "independent") {
      app.mode = blob.mode;
    }
    setTopMode(blob.topMode === "game" ? "game" : "practice");
    app.problem = blob.problem;
    app.engine = blob.engine; // already a clone — safe to use directly
    app.history = [];
    app.attemptsThisStep = 0;
    app.attemptsThisProblem = blob.attemptsThisProblem | 0;
    app.hintsUsedThisProblem = blob.hintsUsedThisProblem | 0;
    app.revealUsedThisProblem = !!blob.revealUsedThisProblem;
    setInputValue(blob.inputValue || "");
    setAppFeedback("neutral", "Resumed where you left off!");
    render();
  }

  function goToGameHome() {
    hideCompletionOverlay();
    app.mission = null;
    app.replayProblem = null;
    app.replayingQuestionId = null;
    setTopMode("practice");
    startGeneratedProblem();
  }

  // ============================================================
  // Boot
  // ============================================================

  // Resume choice overlay buttons.
  (function wireResumeOverlay() {
    const c = document.getElementById("resumeContinueBtn");
    const f = document.getElementById("resumeFreshBtn");
    if (c) c.addEventListener("click", onResumeContinue);
    if (f) f.addEventListener("click", onResumeFresh);
  })();

  // Standalone or pre-profile: load whatever's at the un-scoped key
  app.progress = loadProgress();
  app.wrongs = loadWrongs();
  updatePracticePillUI();

  setSelectedSegment("[data-difficulty]", app.difficulty, "data-difficulty");
  setSelectedSegment("[data-mode]", app.mode, "data-mode");
  dom.body.setAttribute("data-top-mode", topMode);

  // Practice mode default: start with a generated problem.
  startGeneratedProblem();
})();
