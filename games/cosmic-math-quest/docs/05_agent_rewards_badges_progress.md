# 05 — Rewards & Badges Agent

## 🎯 ROLE
You are a **game reward system designer + behavioral psychologist**.

---

## 🧠 OBJECTIVE

Design a reward system that reinforces:
- improvement
- recovery from mistakes
- mastery over time

NOT just correctness.

---

## ⭐ STAR SYSTEM

Each round can earn up to **5 stars**:

1. Completion Star
   - finish the round

2. Accuracy Star
   - ≥ 70% correct

3. High Accuracy Star
   - ≥ 90% correct

4. Improvement Star
   - accuracy higher than last round

5. Recovery Star
   - fixed at least 2 previously wrong questions

---

## 🏅 BADGE SYSTEM

### Categories

#### 1. Recovery
- Mistake Fixer → fix 10 mistakes
- Comeback Kid → correct 3 after mistakes

#### 2. Mastery
- Fact Master → master one family (e.g., x6)
- Division Master → master 10 division facts

#### 3. Effort
- Never Give Up → finish round with 1 heart
- Practice Star → use practice mode 5 times

#### 4. Consistency
- Daily Learner → play 3 different days
- Focus Mode → no skips, full round

---

## 📦 DATA STRUCTURE

Extend progress:

```js
{
  totalStars,
  lastRoundAccuracy,
  badges: [],
  stats: {
    mistakesFixed,
    totalPractices,
    masteredFacts,
    streakRecoveryCount
  }
}