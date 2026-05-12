# 01 — Coordinator Master Plan
## Cosmic Math Quest — Mastery Engine Upgrade (Approach 2)

---

## 🎯 ROLE

You are a **Principal Engineer + Learning Scientist + Game System Architect**.

Your job is to **upgrade the existing HTML math game** into a **mastery-driven learning system** while:

- Preserving existing architecture
- Improving teaching effectiveness
- Increasing engagement for kids age 8–10
- Avoiding unnecessary rewrites

---

## 🧠 CORE STRATEGY

We are implementing:

> **Approach 2 — Mastery Trainer (as the engine)**

This means:

- The game is no longer just "10 questions per round"
- The system tracks **learning progress per concept**
- Mistakes become **structured learning opportunities**
- Progress is based on **improvement, not just correctness**

---

## 🚫 IMPORTANT CONSTRAINTS

DO NOT:

- Rewrite the entire app
- Break existing gameplay loop
- Remove current features (hearts, streaks, hints, review mode)
- Overcomplicate UI

DO:

- Extend existing systems
- Reuse current data structures where possible
- Build incrementally
- Keep performance lightweight (no backend)

---

## 🧩 CURRENT SYSTEM (FROM CODE)

The existing game already includes:

- Difficulty levels (easy / medium / hard)
- Mode switching (multiply / divide / mixed)
- Adaptive difficulty (simple tiering)
- Wrong answer persistence (`localStorage`)
- Review mode (practice wrong answers)
- Score, streak, hearts
- Stars + badges storage
- Question generator with strong validation

👉 This is a strong base. We are **enhancing**, not replacing.

---

## 🧱 TARGET SYSTEM (WHAT WE ARE BUILDING)

### 1. Mastery-Based Learning Engine

Each math fact becomes a **trackable learning unit**

Instead of:
- "You got 7/10"

We move to:
- "You are improving on ×6 facts"
- "You mastered ÷8"
- "You still need practice on 7×8"

---

### 2. Smart Mistake System

Replace flat mistake storage with:

| Stage | Meaning |
|------|--------|
| new | first mistake |
| practicing | seen again |
| stable | correct once |
| mastered | correct multiple times over time |

---

### 3. Practice Modes (Replace single “Practice” button)

We introduce 3 learning modes:

- **Quick Fix** → recent mistakes
- **Most Missed** → high error frequency
- **Due Today** → spaced repetition

---

### 4. Progress Tracking by Concept

Track:
- multiplication families (×3, ×4, ×6…)
- division families
- missing-factor reasoning
- comparison / reasoning types

---

### 5. Reward System Upgrade

Stars are no longer only for score.

We reward:

- accuracy
- improvement
- recovery from mistakes
- consistency

Badges reflect **learning behavior**, not just performance.

---

## ⚙️ SYSTEM COMPONENTS TO BUILD

You will coordinate implementation across these areas:

---

### A. DATA MODEL

We need:

- `mistakeStore` (enhanced)
- `fact mastery tracking`
- `review scheduling`

---

### B. GAME LOOP EXTENSION

Enhance flow:

1. Play round
2. Detect weak areas
3. Route to practice intelligently
4. Reinforce learning
5. Update mastery

---

### C. PRACTICE ENGINE

New system to:

- prioritize mistakes
- repeat intelligently
- confirm mastery over time

---

### D. REWARD SYSTEM

New logic for:

- improvement-based stars
- recovery-based badges
- mastery milestones

---

### E. UI / UX LAYER

Update wording and presentation:

- “Practice” → “Fix tricky questions”
- “Mistakes” → “Things to improve”
- show progress visually

---

## 🧭 IMPLEMENTATION PLAN (PHASED)

---

### PHASE 1 — Data Foundation

Agent: `data_model`

Build:

- enhanced mistake schema
- mastery tracking structure
- review scheduling fields

---

### PHASE 2 — Practice Engine

Agent: `game_loop`

Build:

- Quick Fix
- Most Missed
- Due Today

Replace simple review queue.

---

### PHASE 3 — Learning Intelligence

Agent: `product_design`

Build:

- fact-family tracking
- adaptive reinforcement logic
- smarter follow-up questions

---

### PHASE 4 — Rewards & Progress

Agent: `rewards`

Build:

- improvement-based stars
- mastery badges
- progress tracking UI

---

### PHASE 5 — UI / UX Improvements

Agent: `ui_content`

Update:

- wording
- feedback messages
- progress display

---

### PHASE 6 — Integration

Agent: `integration`

Ensure:

- all systems work together
- no regression in existing features

---

### PHASE 7 — Testing

Agent: `qa`

Validate:

- learning flow
- data persistence
- edge cases
- kid usability

---

## 🧪 SUCCESS CRITERIA

The upgrade is successful if:

### Learning
- Mistakes are revisited intelligently
- Repeated mistakes become mastered
- Child sees improvement over time

### Engagement
- Child feels rewarded even after mistakes
- Game encourages retry, not frustration

### System
- No performance issues
- No data corruption
- Works fully in browser

---

## 📌 FINAL OUTPUT EXPECTATION

Each agent must produce:

- Clear code changes
- Minimal disruption to existing logic
- Comments explaining logic
- Reusable functions (not hacks)

---

## 🧠 COORDINATION RULE

All agents must:

- Respect existing architecture
- Avoid duplicate logic
- Use shared data structures
- Keep system consistent