# Long Division Learning Webpage for Kids

## Goal
Teach elementary school kids how to do long division step by step.

## Users
- Kids around grades 3–5
- Parents or teachers helping them

## What success looks like
- A kid can explain and use the repeating cycle:
  - **Divide → Multiply → Subtract → Bring Down**
- A kid can solve problems by answering **one small step at a time**, not all at once.
- The page feels encouraging and clear, even when the kid makes mistakes.

## Learning objectives (kid-friendly)
By the end, a kid should be able to:
- **Pick the right chunk** of the dividend to start with (1 digit or more if needed).
- **Divide**: decide “how many times does the divisor fit?”
- **Multiply**: multiply the divisor by that number.
- **Subtract**: subtract to see what’s left.
- **Bring down**: bring down the next digit to make a new number.
- Repeat until there are no more digits to bring down.

## Key idea explained simply
Long division is like a repeating mini-game:
- **Divide**: Guess how many times it fits.
- **Multiply**: Check by multiplying.
- **Subtract**: See what’s left.
- **Bring down**: Grab the next digit and keep going.

## Vocabulary (keep consistent everywhere)
- **Dividend**: the number inside the division box (the big number).
- **Divisor**: the number outside the box (the number you divide by).
- **Quotient**: the answer on top.
- **Remainder**: what’s left at the end (introduced later).

## Core learning flow (progressive)
The product should guide kids through 3 modes. Each mode uses the same visual layout so the kid’s eyes learn “where to look”.

### 1) Demonstration mode (Watch)
Goal: show the cycle with a narrated, animated worked example.
- The app highlights one action at a time (Divide, Multiply, Subtract, Bring Down).
- The kid clicks **Next** to proceed (no typing needed).
- Each step shows a short sentence like:
  - “**Divide:** How many times does 4 go into 9?”
  - “**Multiply:** 2 × 4 = 8”
  - “**Subtract:** 9 − 8 = 1”
  - “**Bring down:** bring down the 6 to make 16”

### 2) Guided practice (Practice)
Goal: kid fills in each micro-answer; app provides hints and guardrails.
- The app asks for **one field** at a time.
- The kid can use:
  - **Hint** (“Show me the next step”)
  - **Explain** (one-sentence reminder)
  - **Undo** (fix a slip)
- The app highlights the exact digits involved.

### 3) Independent practice (Challenge)
Goal: kid can solve with minimal help, but still gets feedback.
- Same UI, fewer prompts.
- Hints are allowed but tracked (optional reward reduction).
- End summary:
  - “You used the cycle X times.”
  - “You got Y steps correct in a row!”

## Divide–Multiply–Subtract–Bring Down (step rules)
The app must follow standard long division. The UI should always say what to do in kid language, but the checking uses the exact math.

### Step A: Choose the current number (what we divide right now)
Kid wording:
- “Start at the left. If it’s too small, grab one more digit.”
Rules:
- The **current value** is the smallest left chunk of the dividend that is \(\ge\) divisor.
- After each “Bring down”, the current value becomes: `remainder` with the next digit attached.

### Step B: Divide (pick the next quotient digit)
Kid wording:
- “How many times does the divisor fit?”
Rules:
- `qDigit = floor(currentValue / divisor)`

### Step C: Multiply (make the number to subtract)
Kid wording:
- “Multiply the divisor by your answer.”
Rules:
- `product = qDigit * divisor`

### Step D: Subtract (find what’s left)
Kid wording:
- “Subtract to see what’s left.”
Rules:
- `remainder = currentValue - product` (must be \(\ge 0\))

### Step E: Bring down (bring the next digit)
Kid wording:
- “Bring down the next digit.”
Rules:
- If digits remain: `currentValue = remainder * 10 + nextDigit`
- If no digits remain: we are done; final remainder is `remainder`

## UX / UI design (kid-friendly)
### Page layout (single page)
1. **Header**
   - Title: “Long Division Coach”
   - Difficulty: Easy / Medium / Hard
   - Mode: Watch / Practice / Challenge
2. **Main workspace**
   - **Division board** (long division bracket)
     - Divisor (left), dividend (inside), quotient (top)
     - Stacked work area for multiply/subtract/bring-down rows
   - **Step card**
     - Big label: “Step: Divide” (or Multiply/Subtract/Bring Down)
     - One short instruction sentence
     - Input (single field) or a button (for bring down in easy)
3. **Controls**
   - Primary: **Check**
   - Secondary: **Hint**, **Explain**, **Undo**
   - Tertiary: **Start over**, **New problem**
4. **Feedback + reward**
   - Friendly message area
   - Stars/points meter (nice-to-have but recommended)

### Highlighting rules
- Always highlight:
  - The **current value** being divided
  - The **next digit** to bring down (ghost highlight)
  - The **spot** where the next quotient digit goes
- When multiplying/subtracting, highlight aligned digits/rows to prevent place-value confusion.

### Input interactions
- Prefer a digit keypad for touch devices; support keyboard on desktop.
- Ask for one number at a time (qDigit, then product, then remainder, then bring down).

## Difficulty levels (definitions)
### Easy
Goal: confidence with clean problems.
- **Divisor**: 2–9 (1 digit)
- **Dividend**: 2–3 digits
- **Final remainder**: always 0
- **Avoid quotient zeros** (no tricky “0 in the middle” cases)
- **Scaffolding**: very strong (step labels + explain always available; bring-down can be a button)

### Medium
Goal: introduce remainders and some tricky structure.
- **Divisor**: 2–12 (1 digit or small 2-digit)
- **Dividend**: 3–4 digits
- **Final remainder**: allowed (0 to divisor−1)
- **Some quotient zeros** allowed (teach carefully with feedback)
- **Scaffolding**: step labels + hints available

### Hard
Goal: worksheet-like problems.
- **Divisor**: 10–99 (2 digits)
- **Dividend**: 4–5 digits
- **Remainders** common
- **Quotient zeros** common and must be handled correctly
- **Scaffolding**: minimal prompts; hints still available

## Feedback rules
Feedback must be immediate, specific, and kind.

### Correct
- Short praise tied to the step (“Nice dividing!”, “Great multiply check!”).
- Lock the step in place and move forward.
- Add stars/points; add streak bonus for several correct steps in a row.

### Incorrect (general)
- Keep tone gentle (“Almost!”, “Not yet—try again.”).
- Tell them what to check and highlight the relevant digits/row.

### Incorrect: Divide
- If too big: “That’s a little too big. Try a smaller number.”
- If too small: “It can fit more times. Try a bigger number.”
- After 2 tries: show nearby multiples (example: “4×2=8, 4×3=12”).

### Incorrect: Multiply
- “Check: divisor × your quotient digit.”
- After 2 tries (easy/medium): show the multiplication fact as a helper.

### Incorrect: Subtract
- “Check: current number − product.”
- If negative result: “We can’t go below 0 here—try a smaller divide number.”

### Incorrect: Bring down
- “Bring down the next digit from the top number.”
- Strongly highlight the next digit to bring down.

### Hint button (“Show me the next step”)
Hint strength ladder:
1. **Explain** (rephrase)
2. **Nudge** (point to digits)
3. **Choices** (2–3 options, optional)
4. **Reveal** (fill the step + one-sentence why; counts as hint used)

## Frontend data structures and app state (needed)
The UI needs deterministic state so every step can be checked and replayed.

### Problem model
- `dividend: number`
- `divisor: number`
- `difficulty: 'easy' | 'medium' | 'hard'`
- `expectedQuotient: number`
- `expectedRemainder: number`
- `seed?: string` (optional for reproducible random problems)

### Engine state (long-division process)
- `phase: 'divide' | 'multiply' | 'subtract' | 'bringDown' | 'done'`
- `dividendDigits: number[]`
- `cursorIndex: number` (next digit to bring down)
- `currentValue: number`
- `activeQuotientIndex: number`
- `quotientDigits: Array<number | null>` (top row; null = not filled yet)
- `qDigit: number | null`
- `product: number | null`
- `remainder: number | null`
- `rows: WorkRow[]` (what we draw under the bracket)

### Work rows (for rendering + highlighting)
- `WorkRow`:
  - `type: 'product' | 'subtractionResult' | 'broughtDown' | 'note'`
  - `value: number | string`
  - `alignedToQuotientIndex: number`
  - `status?: 'normal' | 'active' | 'error' | 'success'`

### UI state
- `mode: 'demo' | 'guided' | 'independent'`
- `difficulty: 'easy' | 'medium' | 'hard'`
- `inputTarget: 'qDigit' | 'product' | 'remainder' | 'bringDown' | null`
- `inputValue: string`
- `feedback: { kind: 'none' | 'success' | 'error'; message: string }`
- `attemptsThisStep: number`
- `hintsUsedThisProblem: number`
- `sessionStats: { problemsDone: number; stepsCorrect: number; streak: number }`

### Suggested pure functions (so UI stays simple)
- `generateProblem(difficulty, seed?) -> Problem`
- `initEngine(problem) -> EngineState`
- `getExpected(engine) -> { expectedValue: number, kidMessage: string }`
- `checkAndAdvance(engine, userValue) -> { nextEngine, correct, feedback }`
- `applyHint(engine, level) -> { nextEngine, hintFeedback }`

## Must-have features
- Single-page website
- Friendly kid UI
- Step-by-step guided solving
- “Show me the next step” hint button
- Random practice problems
- Easy / Medium / Hard levels
- Visual highlighting of current digit / current operation
- Positive feedback
- Responsive layout
- Deterministic step-by-step checking (not just final-answer checking)

## Nice-to-have
- Sounds
- Stickers / stars
- Parent mode
- Progress tracker

## Non-goals (for v1)
- Decimals
- Converting remainder to decimal or fraction
- Accounts / login
- Multiplayer

## Accessibility and safety
- Large tap targets; readable fonts; strong contrast.
- Avoid flashing effects.
- Never use shame language; always use supportive phrasing.