# Long Division Coach (Prototype)

A kid-friendly, single-page long division learning mini-game.

## What’s included (v1)
- **Explanation section** for the long division cycle: Divide → Multiply → Subtract → Bring down
- **Worked example** (load **96 ÷ 4** and use Watch mode)
- **Interactive practice** with step-by-step checking and immediate feedback
- **Random problem generator** with **Easy / Medium / Hard**
- **Hint**, **Explain**, **Undo**, **Start over**, **New problem**
- **Responsive layout** (stacks nicely on small screens)

## How to run

### Option A (simplest): open the HTML file
1. Open `index.html` in your browser.

### Option B: run a tiny local server (recommended)
Some browsers are stricter about local file behavior. A local server avoids that.

Using Python:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Files
- `index.html`: page layout + UI
- `style.css`: styles (no frameworks)
- `script.js`: long-division engine + UI logic (no dependencies)

## Architecture (maintainability)
- **Engine (pure)**: problem generation + long-division step engine are pure functions (no DOM access), so they’re easy to test and reason about.
- **App state (controller)**: a single app state object holds mode/difficulty/problem/engine/history and applies state transitions (new problem, undo, check/next).
- **View (render-only)**: `render()` and small render helpers are the only code that touches the DOM; state-changing functions update app state first, then call `render()`.

