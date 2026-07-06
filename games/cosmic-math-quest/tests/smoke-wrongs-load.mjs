// Regression test for the "MASTERY_STAGES used before initialization wipes
// the wrongs store" bug (Fix wave C, bug #3 in task-17-report.md).
//
// Root cause: `wrongAnswerStore = loadWrongAnswerHistory();` used to run
// BEFORE `var MASTERY_STAGES = [...]` was assigned. Because `loadWrongAnswerHistory()`
// synchronously calls `normalizeWrongAnswerRecord()` -> `isValidMasteryStage()`,
// which reads the (at that point still-`undefined`, only hoisted) MASTERY_STAGES,
// every record with a masteryStage string threw a TypeError. That error was
// swallowed by loadWrongAnswerHistory()'s own try/catch, which returned an
// empty default store — and that empty store was then persisted back to
// localStorage, permanently destroying any previously-saved mistakes.
//
// This test guards two things:
//   (a) TEXTUAL ORDER — `var MASTERY_STAGES` must appear before
//       `wrongAnswerStore = loadWrongAnswerHistory()` in the source, so the
//       assignment has actually run by the time the load call executes.
//   (b) FUNCTIONAL — the real (extracted, unmodified) MASTERY_STAGES +
//       isValidMasteryStage + normalizeWrongAnswerRecord, evaluated together,
//       must normalize a realistic record without throwing and must preserve
//       a valid masteryStage.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ---------- (a) textual order guard ----------

const masteryStagesIdx = indexHtml.indexOf('var MASTERY_STAGES');
const loadCallIdx = indexHtml.indexOf('wrongAnswerStore = loadWrongAnswerHistory()');

if (masteryStagesIdx === -1) {
  console.error('FAIL: could not find "var MASTERY_STAGES" declaration in index.html');
  process.exit(1);
}
if (loadCallIdx === -1) {
  console.error('FAIL: could not find "wrongAnswerStore = loadWrongAnswerHistory()" call in index.html');
  process.exit(1);
}
if (!(masteryStagesIdx < loadCallIdx)) {
  console.error(
    'FAIL: "var MASTERY_STAGES" (index ' + masteryStagesIdx + ') must appear BEFORE ' +
    '"wrongAnswerStore = loadWrongAnswerHistory()" (index ' + loadCallIdx + ') in index.html. ' +
    'If MASTERY_STAGES is declared/assigned AFTER the initial load call, ' +
    'isValidMasteryStage() reads it as undefined (var hoisting), throws, ' +
    'and the catch in loadWrongAnswerHistory() silently returns an empty ' +
    'store which then gets persisted — wiping every saved mistake on reload.'
  );
  process.exit(1);
}
console.log('smoke-wrongs-load: (a) OK — MASTERY_STAGES declared before initial loadWrongAnswerHistory() call');

// ---------- (b) functional guard ----------

// Pull just the first <script>...</script> block that contains the game logic
// (the big game IIFE is the longest inline script — pick by length, same
// pattern as smoke-wrongs-roundtrip.mjs / smoke-fixit-priority.mjs).
const scriptMatches = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length === 0) {
  console.error('FAIL: no inline <script> found');
  process.exit(1);
}
const gameSrc = scriptMatches.map(m => m[1]).sort((a, b) => b.length - a.length)[0];

function extract(re, label) {
  const m = gameSrc.match(re);
  if (!m) {
    console.error(`FAIL: could not extract ${label}`);
    process.exit(1);
  }
  return m[0];
}

// Real source, extracted verbatim from index.html.
const masteryStagesDecl = extract(
  /var MASTERY_STAGES = \[[^\]]*\];/,
  'MASTERY_STAGES declaration'
);
const isValidMasteryStageFn = extract(
  /function isValidMasteryStage\(s\)\s*\{[\s\S]*?\n  \}/,
  'isValidMasteryStage'
);
const inferMasteryStageFromLegacyFn = extract(
  /function inferMasteryStageFromLegacy\(record\)\s*\{[\s\S]*?\n  \}/,
  'inferMasteryStageFromLegacy'
);
const normalizeWrongAnswerRecordFn = extract(
  /function normalizeWrongAnswerRecord\(record\)\s*\{[\s\S]*?\n  \}/,
  'normalizeWrongAnswerRecord'
);

// Sanity: make sure isValidMasteryStage still references MASTERY_STAGES (not
// some renamed/refactored variable) so this test fails loudly instead of
// silently passing against a stale extraction.
if (!/MASTERY_STAGES/.test(isValidMasteryStageFn)) {
  console.error('FAIL: extracted isValidMasteryStage() no longer references MASTERY_STAGES — extraction regex likely stale');
  process.exit(1);
}

// Minimal stubs for the two helpers normalizeWrongAnswerRecord calls that we
// don't need real behavior from for this test (no questionSnapshot is passed
// in, so familyStringFromQuestion is never actually invoked; questionFromSnapshot
// only fires if questionSnapshot is truthy).
const stubs = `
  function questionFromSnapshot(snap) { return snap ? { key: snap.key || null } : null; }
  function familyStringFromQuestion(q) { return ''; }
`;

const sandbox = { console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  `${stubs}\n${masteryStagesDecl}\n${isValidMasteryStageFn}\n${inferMasteryStageFromLegacyFn}\n${normalizeWrongAnswerRecordFn}`,
  sandbox
);

const record = {
  key: 'k1',
  masteryStage: 'new',
  level: 'medium',
  prompt: '6 × 7 = ?',
  correctAnswer: 42,
  childAnswer: 41,
  resolved: false,
  resolvedAt: null,
  successCountInPractice: 0,
  consecutiveCorrect: 0,
  family: '',
};

sandbox.__record = record;
let result;
try {
  result = vm.runInContext('normalizeWrongAnswerRecord(__record)', sandbox);
} catch (e) {
  console.error('FAIL: normalizeWrongAnswerRecord() threw: ' + (e && e.stack || e));
  process.exit(1);
}

if (!result || typeof result !== 'object') {
  console.error('FAIL: normalizeWrongAnswerRecord() did not return an object');
  process.exit(1);
}
if (result.masteryStage !== 'new') {
  console.error(`FAIL: expected masteryStage to stay "new", got "${result.masteryStage}"`);
  process.exit(1);
}
if (result.key !== 'k1' || result.correctAnswer !== 42) {
  console.error('FAIL: normalizeWrongAnswerRecord() lost/corrupted core fields');
  process.exit(1);
}

console.log('smoke-wrongs-load: (b) OK — real normalizeWrongAnswerRecord()/isValidMasteryStage() normalize a fresh record without throwing');
console.log('smoke-wrongs-load: OK');
