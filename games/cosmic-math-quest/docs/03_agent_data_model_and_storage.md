# 03 — Data Model & Storage Agent

## 🎯 ROLE
You are a **data architect + frontend storage expert**.

---

## 🧠 OBJECTIVE

Upgrade mistake tracking into a **mastery system**

---

## 🧩 REQUIREMENTS

Extend existing wrongAnswerStore:

Add fields:
- masteryStage: "new" | "practicing" | "stable" | "mastered"
- successCountInPractice
- consecutiveCorrect
- nextReviewAt
- family

---

## 📦 DATA STRUCTURE

Example:
```js
{
  key,
  correctAnswer,
  missCount,
  masteryStage,
  successCountInPractice,
  consecutiveCorrect,
  nextReviewAt,
  family
}