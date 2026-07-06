// Regression test for cosmic-math-quest Fix-It set priority.
//
// Extracts the REAL getFixItSet() and interleavePracticeRecordsByLevel()
// functions out of index.html (via regex, same pattern as
// smoke-wrongs-roundtrip.mjs) and evals them in a sandbox where the three
// source getters (getDueTodaySet / getQuickFixSet / getMostMissedSet) and
// PRACTICE_ROUND_MAX are stubbed. This exercises the actual priority /
// dedupe / cap logic against canned source lists, without needing the full
// game state (wrongAnswerStore, LearningIntel, etc).
//
// Asserts: due-today records are never squeezed out by later sources when
// the merged pool exceeds the cap, keys are deduped across sources, and
// empty sources produce an empty result.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Pull just the first <script>…</script> block that contains the game logic
// (the big game IIFE is the longest inline script — pick by length, same as
// smoke-wrongs-roundtrip.mjs).
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
const interleaveFn = extract(
  /function interleavePracticeRecordsByLevel\(records\)\s*\{[\s\S]*?\n  \}/,
  'interleavePracticeRecordsByLevel'
);
const getFixItSetFn = extract(/function getFixItSet\(\)\s*\{[\s\S]*?\n  \}/, 'getFixItSet');

// Sanity: make sure we actually extracted the priority-cap-then-interleave
// shape, not some stale/alternate version, so this test fails loudly if the
// source is refactored out from under it.
if (!/PRACTICE_ROUND_MAX/.test(getFixItSetFn)) {
  console.error('FAIL: extracted getFixItSet() does not reference PRACTICE_ROUND_MAX — extraction regex likely stale');
  process.exit(1);
}
if (!/interleavePracticeRecordsByLevel\(picked\)/.test(getFixItSetFn)) {
  console.error('FAIL: extracted getFixItSet() does not call interleavePracticeRecordsByLevel(picked) — extraction regex likely stale');
  process.exit(1);
}

function makeSandbox(stubs) {
  const sandbox = {
    console,
    PRACTICE_ROUND_MAX: 10,
    getDueTodaySet: stubs.due,
    getQuickFixSet: stubs.quickfix,
    getMostMissedSet: stubs.mostmissed,
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${interleaveFn}\n${getFixItSetFn}`, sandbox);
  return sandbox;
}

function rec(key, level) {
  return { key: key, questionSnapshot: { level: level }, resolved: false };
}

function keysOf(list) {
  return list.map(function (r) { return r.key; });
}

// === Scenario 1: due-today must survive even when merged pool > cap ===
{
  const due = [
    rec('d0', 'hard'), rec('d1', 'hard'), rec('d2', 'hard'),
    rec('d3', 'hard'), rec('d4', 'hard'), rec('d5', 'hard'),
  ];
  const quickfix = [rec('q0', 'easy'), rec('q1', 'easy'), rec('q2', 'easy'), rec('q3', 'easy')];
  const mostmissed = [rec('m0', 'easy'), rec('m1', 'easy')];

  const sandbox = makeSandbox({
    due: () => due,
    quickfix: () => quickfix,
    mostmissed: () => mostmissed,
  });

  const result = vm.runInContext('getFixItSet()', sandbox);
  const keys = keysOf(result);

  if (result.length !== 10) {
    console.error(`FAIL: scenario 1 expected length 10, got ${result.length}`);
    process.exit(1);
  }
  const dueKeys = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'];
  const missingDue = dueKeys.filter((k) => !keys.includes(k));
  if (missingDue.length) {
    console.error(`FAIL: scenario 1 missing due-today keys: ${missingDue.join(', ')}`);
    process.exit(1);
  }
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    console.error(`FAIL: scenario 1 duplicate keys in result: ${keys.join(', ')}`);
    process.exit(1);
  }
  // Most-missed items are the ones that should be squeezed out (6 due + 4 quickfix = 10, no room for the 2 most-missed).
  const mostMissedSurvivors = ['m0', 'm1'].filter((k) => keys.includes(k));
  if (mostMissedSurvivors.length) {
    console.error(`FAIL: scenario 1 expected most-missed items to be squeezed out, found: ${mostMissedSurvivors.join(', ')}`);
    process.exit(1);
  }
  console.log('smoke-fixit-priority: scenario 1 OK (due-today survives cap, most-missed squeezed out)');
}

// === Scenario 2: overlapping key across sources appears exactly once ===
{
  const due = [rec('shared', 'hard'), rec('d1', 'hard')];
  const quickfix = [rec('shared', 'easy'), rec('q1', 'easy')];
  const mostmissed = [rec('m1', 'medium')];

  const sandbox = makeSandbox({
    due: () => due,
    quickfix: () => quickfix,
    mostmissed: () => mostmissed,
  });

  const result = vm.runInContext('getFixItSet()', sandbox);
  const keys = keysOf(result);
  const sharedCount = keys.filter((k) => k === 'shared').length;
  if (sharedCount !== 1) {
    console.error(`FAIL: scenario 2 expected key "shared" exactly once, found ${sharedCount} times (keys: ${keys.join(', ')})`);
    process.exit(1);
  }
  if (result.length !== 4) {
    console.error(`FAIL: scenario 2 expected length 4 (shared, d1, q1, m1), got ${result.length}`);
    process.exit(1);
  }
  console.log('smoke-fixit-priority: scenario 2 OK (cross-source duplicate key deduped)');
}

// === Scenario 3: empty sources → empty result ===
{
  const sandbox = makeSandbox({
    due: () => [],
    quickfix: () => [],
    mostmissed: () => [],
  });
  const result = vm.runInContext('getFixItSet()', sandbox);
  if (!Array.isArray(result) || result.length !== 0) {
    console.error(`FAIL: scenario 3 expected [], got ${JSON.stringify(result)}`);
    process.exit(1);
  }
  console.log('smoke-fixit-priority: scenario 3 OK (empty sources → [])');
}

console.log('smoke-fixit-priority: OK');
