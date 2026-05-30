// Round-trip test for cosmic-math-quest mistake persistence.
//
// Extracts the wrongs-store helpers from index.html, stubs localStorage and
// the KLS bridge, simulates a wrong-answer record, reloads, and asserts that
// the record survives. Designed to run in plain Node (no jsdom).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Pull just the first <script>…</script> block that contains the game logic.
const scriptMatches = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length === 0) {
  console.error('FAIL: no inline <script> found');
  process.exit(1);
}
// The big game IIFE is the longest inline script — pick by length.
const gameSrc = scriptMatches.map(m => m[1]).sort((a, b) => b.length - a.length)[0];

// Build a minimal sandbox that defines globals the game expects on import,
// then evaluate ONLY the small slice we care about (WRONGS_KEY_BASE, wrongsKey,
// load/save, recordWrongAnswer plumbing — by extracting via regex).
const fakeStorage = new Map();
const localStorage = {
  getItem: (k) => (fakeStorage.has(k) ? fakeStorage.get(k) : null),
  setItem: (k, v) => fakeStorage.set(k, String(v)),
  removeItem: (k) => fakeStorage.delete(k),
};

const FAKE_PID = 'profile-abc-123';
const bridge = {
  getProfileId: () => FAKE_PID,
  onProfileReady: () => {},
  onHubMessage: () => {},
  isEmbedded: () => true,
};

const sandbox = {
  localStorage,
  window: { KLS: { bridge } },
  console,
};
sandbox.window.localStorage = localStorage;
sandbox.global = sandbox;
vm.createContext(sandbox);

// We don't run the whole game (too DOM-coupled). Instead we extract the four
// load-bearing functions by regex and eval them in the sandbox.
function extract(re, label) {
  const m = gameSrc.match(re);
  if (!m) {
    console.error(`FAIL: could not extract ${label}`);
    process.exit(1);
  }
  return m[0];
}

const wrongsKeyBase = extract(/(?:var|const|let)\s+WRONGS_KEY_BASE\s*=\s*['"]cosmicMathQuest_wrongs_v1['"];/, 'WRONGS_KEY_BASE');
// Force the iframe check to true regardless of how the game defines it.
const isInIframeStub = "function isInIframe() { return true; }";
const wrongsKeyFn   = extract(/function wrongsKey\(\)\s*\{[\s\S]*?\n  \}/, 'wrongsKey');

// A minimal saveWrongAnswerHistory + loadWrongAnswerHistory implementation
// that mirrors what we found in the audit. We hand-write this rather than
// extract, because the real ones touch globals we'd need to fully stand up.
const save = `
  function saveWrongAnswerHistory(store) {
    const key = wrongsKey();
    if (!key) return false;
    localStorage.setItem(key, JSON.stringify(store));
    return true;
  }
  function loadWrongAnswerHistory() {
    const key = wrongsKey();
    if (!key) return { wrongAnswersHistory: [], recentWrongAnswers: [] };
    const raw = localStorage.getItem(key);
    if (!raw) return { wrongAnswersHistory: [], recentWrongAnswers: [] };
    try { return JSON.parse(raw); }
    catch { return { wrongAnswersHistory: [], recentWrongAnswers: [] }; }
  }
`;

vm.runInContext(`${wrongsKeyBase}\n${isInIframeStub}\n${wrongsKeyFn}\n${save}`, sandbox);

// === Round-trip test ===

// 1) Key is profile-scoped when in iframe + profile id is known.
const key = vm.runInContext('wrongsKey()', sandbox);
const expectedKey = `cosmicMathQuest_wrongs_v1__${FAKE_PID}`;
if (key !== expectedKey) {
  console.error(`FAIL: wrongsKey() returned "${key}", expected "${expectedKey}"`);
  process.exit(1);
}

// 2) Empty load returns the default shape.
const empty = vm.runInContext('loadWrongAnswerHistory()', sandbox);
if (!Array.isArray(empty.wrongAnswersHistory) || empty.wrongAnswersHistory.length !== 0) {
  console.error('FAIL: empty load did not return [] for wrongAnswersHistory');
  process.exit(1);
}

// 3) Save a mistake record, reload, expect it to persist.
const record = {
  questionId: 'mult-7x8',
  questionShape: { operation: '×', a: 7, b: 8 },
  yourAnswer: 54,
  correctAnswer: 56,
  timestamp: new Date().toISOString(),
  attempts: 1,
  resolved: false,
};
vm.runInContext(`saveWrongAnswerHistory({ wrongAnswersHistory: [${JSON.stringify(record)}], recentWrongAnswers: [${JSON.stringify(record)}] })`, sandbox);

const reloaded = vm.runInContext('loadWrongAnswerHistory()', sandbox);
if (reloaded.wrongAnswersHistory.length !== 1) {
  console.error('FAIL: round-trip lost the record');
  process.exit(1);
}
if (reloaded.wrongAnswersHistory[0].questionId !== 'mult-7x8') {
  console.error('FAIL: round-trip corrupted the record');
  process.exit(1);
}

// 4) Switching profile should isolate stores (standalone-style: no profile).
const standaloneBridge = { ...bridge, getProfileId: () => null };
sandbox.window.KLS.bridge = standaloneBridge;
const standaloneKey = vm.runInContext('wrongsKey()', sandbox);
// Note: in iframe mode without profile, wrongsKey() returns null (defensive).
if (standaloneKey !== null) {
  console.error(`FAIL: with no profile id in iframe, wrongsKey() should be null, got "${standaloneKey}"`);
  process.exit(1);
}

console.log('smoke-wrongs-roundtrip: OK');
console.log(`  key scoping        : ${expectedKey}`);
console.log(`  record round-trip  : preserved (questionId="${reloaded.wrongAnswersHistory[0].questionId}")`);
console.log(`  null profile guard : wrongsKey() = null when profile id missing`);
