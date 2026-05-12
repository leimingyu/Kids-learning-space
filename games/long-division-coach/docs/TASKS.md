# Development Task Breakdown (Long Division Coach)

This file breaks the PRD into buildable engineering tasks. It assumes a single-page frontend app with a deterministic “step engine” for Divide → Multiply → Subtract → Bring Down.

## Milestone 0 — Project scaffold (no feature logic yet)
- [ ] Create basic app shell (single page layout)
- [ ] Add simple styling system (CSS modules / Tailwind / vanilla CSS — pick one)
- [ ] Add a minimal design system:
  - [ ] Buttons (primary/secondary/tertiary)
  - [ ] Card
  - [ ] Number input + keypad (touch-friendly)
  - [ ] Feedback banner (success/error/neutral)
- [ ] Add routing only if needed (prefer no routing for v1)

## Milestone 1 — Data models + pure long-division engine (core correctness)
Goal: implement and test the state machine and validation without UI polish.

### 1.1 Define types / interfaces
- [ ] `Problem` type (dividend, divisor, difficulty, expectedQuotient, expectedRemainder, seed?)
- [ ] `EngineState` type:
  - [ ] phase (`divide|multiply|subtract|bringDown|done`)
  - [ ] dividendDigits, cursorIndex, currentValue
  - [ ] quotientDigits, activeQuotientIndex
  - [ ] qDigit, product, remainder
  - [ ] rows (`WorkRow[]`)
- [ ] `WorkRow` type (type, value, alignedToQuotientIndex, status)
- [ ] `UIState` type (mode, difficulty, inputTarget, inputValue, feedback, attempts, hints, sessionStats)

### 1.2 Implement engine functions (pure)
- [ ] `generateProblem(difficulty, seed?)`
  - [ ] Easy constraints (single-digit divisor, 2–3 digit dividend, remainder 0, avoid quotient zeros)
  - [ ] Medium constraints (allow remainder, allow some quotient zeros)
  - [ ] Hard constraints (2-digit divisor, 4–5 digit dividend, remainder common, quotient zeros common)
- [ ] `initEngine(problem)`
  - [ ] Choose starting chunk (smallest left chunk ≥ divisor)
  - [ ] Initialize quotientDigits length and activeQuotientIndex rules
- [ ] `getExpected(engine)`
  - [ ] For each phase, compute expected value and return a kid-friendly prompt
- [ ] `checkAndAdvance(engine, userValue)`
  - [ ] Divide: validate qDigit (floor rule); handle “too big” detection
  - [ ] Multiply: validate product
  - [ ] Subtract: validate remainder; if negative, convert into “qDigit too big” feedback
  - [ ] Bring down: advance cursorIndex; set currentValue; append appropriate WorkRow
  - [ ] Done: final quotient + remainder ready
- [ ] `applyHint(engine, level)`
  - [ ] Level 1 explain (no state changes)
  - [ ] Level 2 nudge (highlight metadata only)
  - [ ] Level 4 reveal (autofill current step and advance)

### 1.3 Engine correctness checks (lightweight tests)
- [ ] Add a small suite of deterministic cases (fixed seed/problems):
  - [ ] Easy exact division (e.g., 96 ÷ 4)
  - [ ] Medium with remainder (e.g., 95 ÷ 4 → remainder 3)
  - [ ] Medium with quotient zero (e.g., 105 ÷ 5)
  - [ ] Hard 2-digit divisor (e.g., 1444 ÷ 12)
- [ ] Ensure rows align correctly with quotient index (place value)

## Milestone 2 — UI: Division Board + Step Card wired to engine
Goal: kid can complete a whole problem step-by-step in Guided mode.

### 2.1 Layout + sections
- [ ] Header: title, difficulty picker, mode picker
- [ ] Division board component:
  - [ ] Render divisor, dividend, quotient digits
  - [ ] Render work rows (product/subtraction/broughtDown)
  - [ ] Visual alignment by quotient index
- [ ] Step card component:
  - [ ] Shows current phase label and one-sentence instruction
  - [ ] Shows input field or bring-down button depending on phase/difficulty
- [ ] Controls: Check / Hint / Explain / Undo / New problem
- [ ] Feedback banner + simple reward meter (optional in v1)

### 2.2 Highlighting + focus management
- [ ] Highlight currentValue digits region on board
- [ ] Highlight next digit to bring down (ghost highlight)
- [ ] Highlight active quotient slot
- [ ] Auto-focus input on phase changes

### 2.3 Validation loop
- [ ] “Check” calls `checkAndAdvance`
- [ ] On correct:
  - [ ] Commit value to board, show success feedback, advance phase
- [ ] On incorrect:
  - [ ] Keep input, show error feedback, increment attemptsThisStep
- [ ] After 2 incorrect attempts:
  - [ ] Offer stronger hint UI (multiples helper / subtraction reminder)

## Milestone 3 — Modes: Watch (Demo), Practice (Guided), Challenge (Independent)
Goal: three distinct experiences using the same engine + UI shell.

### 3.1 Watch mode (Demo)
- [ ] No typing; Next advances
- [ ] Step card text shows the math being done
- [ ] Smooth highlight animations between phases

### 3.2 Practice mode (Guided)
- [ ] One-field-at-a-time inputTarget enforced
- [ ] Hints and Explain fully available
- [ ] Optional: bring-down as a button in Easy

### 3.3 Challenge mode (Independent)
- [ ] Less instructional text
- [ ] Hints still available, but tracked (and optionally affect stars)
- [ ] End-of-problem summary card

## Milestone 4 — Difficulty tuning + content polish
- [ ] Ensure Easy generator truly avoids quotient zeros and remainders
- [ ] Teach quotient zero cases in Medium/Hard:
  - [ ] Add a micro-lesson panel that appears when a 0 quotient digit is expected
- [ ] Ensure 2-digit divisor problems don’t jump too hard (tune ranges)
- [ ] Tune kid wording for consistency and brevity across all phases

## Milestone 5 — Feedback, rewards, and “gentle coaching”
- [ ] Build a feedback message library keyed by phase + error type
- [ ] Add streak tracking (per-step correct streak)
- [ ] Add simple rewards (stars/points)
- [ ] Add optional sound toggle (nice-to-have)

## Milestone 6 — Responsiveness + accessibility
- [ ] Mobile layout: stack board above step card and controls
- [ ] Large tap targets for keypad/buttons
- [ ] Accessible color contrast and non-color cues for highlight states
- [ ] Respect reduced-motion preference for animations

## Milestone 7 — QA checklist (release readiness)
- [ ] Solve at least 10 random problems per difficulty without engine/UI desync
- [ ] Verify tricky cases:
  - [ ] quotient zero in the middle
  - [ ] remainder at end
  - [ ] starting chunk needs 2 digits (divisor larger than first digit)
- [ ] Verify Undo works across phases
- [ ] Verify New problem resets all per-problem state

