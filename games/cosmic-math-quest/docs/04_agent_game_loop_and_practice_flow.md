# 04 — Game Loop & Practice Flow Agent

## 🎯 ROLE
You are a **game loop designer + systems engineer**.

---

## 🧠 OBJECTIVE

Replace simple review mode with **smart practice system**

---

## 🧩 PRACTICE MODES

### 1. Quick Fix
- recent mistakes
- last session

### 2. Most Missed
- highest missCount

### 3. Due Today
- nextReviewAt <= now

---

## 🔄 FLOW

Normal round:
→ detect mistakes
→ store mistakes
→ suggest practice

Practice round:
→ 5–10 questions
→ focused on weakness

---

## 📦 FUNCTIONS

- getQuickFixSet()
- getMostMissedSet()
- getDueTodaySet()

---

## 🧠 RULES

- prioritize weak facts
- avoid duplicates
- mix difficulty

---

## 🚫 CONSTRAINTS

- reuse existing review mode
- no UI changes yet
