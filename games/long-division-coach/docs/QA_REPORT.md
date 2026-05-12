# QA Report — Long Division Coach

Date: 2026-04-09  
Reviewer: QA + Accessibility + Kid UX pass

## Scope
- Files reviewed: `index.html`, `style.css`, `script.js` (+ `PRD.md` for intent)
- App type: single-page static prototype (no build system)
- Focus: broken buttons, state transitions, wording clarity/kindness, contrast, mobile layout, tap targets, empty states, “kid stuck” cases

## Severity rubric
- **S0 Blocker**: prevents progress / makes the app feel broken
- **S1 High**: likely to confuse or frustrate many kids; major a11y issue
- **S2 Medium**: noticeable UX/a11y friction but workaround exists
- **S3 Low**: polish / nice-to-have

## Results summary
- **Good news**: core step engine is consistent and the UI is already mostly “kid-friendly” (big buttons, clear phases, gentle tone).
- **Top risks**: a few “getting stuck” edges around the final Bring down step, small tap targets in the segmented controls on mobile, and missing/unclear empty-state messaging in the Work area.
- **Fixes applied in this pass**: S0/S1/S2 items listed below as **Fixed**.

---

## Issues (ranked by severity)

### S0 — Blockers

#### 1) “Bring down” can look like it needs input when there are no digits left
- **Why it matters**: kids can get stuck thinking they must type something to finish.
- **Where**: `script.js` render + Check handler; phase `bringDown` with `cursorIndex >= dividendDigits.length`.
- **Fix (applied)**:
  - Auto-finish on **Check** with no input required.
  - Disable the input and change placeholder to “No input needed”.

---

### S1 — High severity

#### 2) Segmented controls were below recommended mobile tap target size
- **Why it matters**: tiny targets cause mis-taps and frustration (especially for kids).
- **Where**: `style.css` `.segmented__btn`.
- **Fix (applied)**: enforced **min 44×44px** target sizing.

#### 3) Watch mode still looked like it wanted typing
- **Why it matters**: mode mismatch causes confusion (“Do I type or click Next?”).
- **Where**: `script.js` input area.
- **Fix (applied)**: disable input + placeholder “Watch mode (no typing needed)”.

---

### S2 — Medium severity

#### 4) Work area had no empty-state message
- **Why it matters**: empty panels can feel broken (“Did it register my step?”).
- **Where**: `script.js` Work rows rendering.
- **Fix (applied)**: show “Your work will show up here as you go.” when no rows yet.

#### 5) Some feedback strings were a bit harsh / abrupt
- **Why it matters**: short “Try again” messages can feel scolding without guidance.
- **Where**: `script.js` feedback in several branches.
- **Fix (applied)**: softened “Try again” → “Almost! Try again.” and tweaked a couple of messages to be more supportive/explicit.

#### 6) End-of-problem messaging always said “remainder 0”
- **Why it matters**: can teach kids to always write “remainder 0”, adding noise.
- **Where**: `script.js` done summary.
- **Fix (applied)**: when remainder is 0, show “(No remainder.)”.

#### 7) Keypad “Backspace” and “Clear” relied on symbols/visuals only
- **Why it matters**: screen readers need explicit labels; also helps cognition.
- **Where**: `index.html` keypad buttons.
- **Fix (applied)**: added `aria-label` to Clear and Backspace.

---

### S3 — Low severity / polish

#### 8) Quotient slots and “@ q-slot N” metadata may confuse kids
- **Why it matters**: “q-slot” is internal/dev language.
- **Where**: `script.js` Work row meta text.
- **Recommendation**: replace with kid wording (or hide it entirely) e.g. “Lines up with top digit #N”.

#### 9) “Difficulty set to … Click New problem to start.” can be missed
- **Why it matters**: some kids won’t connect “difficulty changed” with “needs new problem”.
- **Where**: `script.js` difficulty click handler.
- **Recommendation**: optionally auto-generate a new problem when difficulty changes (or show a more prominent call-to-action).

#### 10) Contrast checks are generally strong, but “muted” text is borderline for small sizes on some displays
- **Where**: `style.css` `--muted` on dark panels for 12px labels.
- **Recommendation**: bump label font-size slightly on mobile or brighten `--muted` a touch.

---

## Button/flow checklist (spot-checked from code)
- **New problem**: resets engine/history/feedback; focuses input.
- **Start over**: restarts current problem (or starts a new one if none).
- **Undo**: restores prior engine snapshot; disables when no history.
- **Hint**: nudge → reveal (with input autofill); avoids confusing end-of-problem reveal.
- **Explain**: phase-specific one-liners.
- **Mode switch**:
  - Watch: `Next` shown, `Check` hidden, input disabled (fixed).
  - Practice/Challenge: `Check` shown, input enabled.

## Notes for future kid-UX improvements (not applied)
- Add a tiny “What should I do?” helper when a kid gets 2+ wrong attempts on **multiply/subtract** (similar to the existing divide helper).
- Consider replacing typed **Bring down** answer with a single **“Bring down”** button in Easy, to reduce cognitive load early.

