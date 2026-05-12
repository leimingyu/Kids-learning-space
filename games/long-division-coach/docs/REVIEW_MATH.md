# Math & Teaching Review — Long Division Coach

This review covers `PRD.md`, `TASKS.md`, `index.html`, `style.css`, and `script.js`, focusing on:
- step correctness (Divide → Multiply → Subtract → Bring down)
- kid-facing explanations (grades ~3–5)
- hint correctness (teaches the *next* right step)
- remainder handling
- bring-down logic
- difficulty tuning

## What’s mathematically correct right now

- **Core step engine matches standard long division**:
  - **Divide** uses \(q=\lfloor \text{current} / \text{divisor}\rfloor\).
  - **Multiply** uses \(q \times \text{divisor}\).
  - **Subtract** uses \(\text{current} - \text{product}\) and requires non-negative results.
  - **Bring down** uses \(\text{remainder}\times 10 + \text{nextDigit}\).
- **Bring-down logic is correct** in the engine for the next numeric value the student should form (`expected = remainder*10 + nextDigit`).
- **Remainders are computed correctly** as long as the cycle ends after a final Subtract (the normal path).
- **Quotient zeros are handled correctly by the math**:
  - If `currentValue < divisor`, the engine expects `qDigit = 0` and continues normally (multiply 0, subtract unchanged, then bring down again).

## Issues found (with concrete fixes)

### 1) Hint system can “reveal” a confusing fake answer at the end of bring-down

- **Problem**: When you are in **Bring down** but there are *no digits left*, `getExpected()` returns `expectedValue: -1`. The hint system could display “Reveal: the next answer is -1…”, which is mathematically meaningless to a child.
- **Fix applied (small + obvious)**: In `script.js`, `applyHint()` now special-cases this situation and says “No more digits to bring down. You’re finished!” instead of revealing `-1`.

### 2) Remainder presentation is correct, but wording is not ideal for grade 3–5

- **Problem**: The done message always displays: `= quotient remainder R`, even when \(R=0\). Kids often interpret “remainder 0” as something special they must always write.
- **Suggested fix** (UI text only):
  - If remainder is 0, show: **“Answer: … = quotient (no remainder).”**
  - If remainder is not 0, keep: **“… = quotient remainder R.”**

### 3) “Grab one more digit” is taught, but the app never forces the student to reason about *when* to grab more

- **Observation**: The PRD emphasizes “If it’s too small, grab one more digit.” The engine automatically chooses the starting chunk internally, which is fine for v1, but kids don’t get practice deciding whether to start with 1 digit or 2.
- **Suggested fix** (pedagogy / future enhancement):
  - Add a short prompt the first time `currentValue` uses 2 digits:  
    - “The first digit was too small, so we grabbed one more digit to make **__**.”
  - (Optional) Add a mini-step in Easy/Medium that asks: “Do we start with 1 digit or 2 digits?” (tap choice), then proceed.

### 4) Bring-down explanation is mostly age-appropriate, but can be more precise

- **Problem**: Some kids think “bring down” means subtracting or moving digits around randomly.
- **Suggested fix** (copy tweak):
  - Use consistent phrasing like: **“Bring down the next digit and write it next to your remainder.”**
  - In the bring-down hint/nudge, explicitly point to both parts: **remainder** and **next digit**.

### 5) Difficulty tuning is mostly aligned with PRD, with two gaps

#### Easy
- **Good**: single-digit divisors 2–9, 2–3 digit dividends, remainder always 0, quotient digits avoid 0.
- **Gap**: Easy currently tends to use **2-digit quotients** (good for practice), but it can still generate some problems that start with a 2-digit chunk; that’s fine, but it slightly raises cognitive load for early grade 3.
- **Suggested tweak** (optional):
  - Bias Easy toward cases where the **first digit is already ≥ divisor** more often (not required, but makes the first experience smoother).

#### Medium
- **Good**: 3–4 digit dividend range, divisor 2–12, remainders allowed, quotient zeros naturally possible.
- **Gap**: Medium currently allows *any* dividend in 120–9999, which can produce very “busy” problems (e.g., 9973 ÷ 11) that feel closer to Hard.
- **Suggested tweak**:
  - Narrow Medium dividends (example): **300–3999** and/or limit divisor to **2–9** more often, with 10–12 less frequent.

#### Hard
- **Good**: 2-digit divisor, 4–5 digit dividend, remainder common, quotient zeros common.
- **Note**: This is appropriate for grade 5 / strong grade 4 students.

## Bring-down logic check (explicit)

- **Correct in engine**: after a subtract, the next bring-down expected value is computed as:
  - `remainder * 10 + nextDigit`
- **Correct step sequencing**: subtract always precedes bring-down, and the engine cannot “bring down” unless the subtract remainder has been established.

## Remainder handling check (explicit)

- **Correct**: when there are no digits left to bring down, the engine ends and the final remainder is the last subtraction remainder.
- **Minor robustness note**: there is extra “safety” code that sets remainder from `expectedRemainder` if remainder is null at the end; it’s harmless, but ideally the engine should always carry remainder deterministically without needing that fallback.

## Summary of changes applied

- **Applied**: Prevent hint “Reveal” from showing `-1` when there are no digits left to bring down (`script.js`, `applyHint()`).

