# Browser Back / Forward blank game fix

## Reproduction and cause

The former hub reused one iframe. Leaving a game assigned its `src` to
`about:blank`; reopening assigned the game URL. These navigations created
iframe entries in the browser's shared session history. Browser Back could
restore the blank document while the parent URL remained
`index.html#/games/logic-detectives`. The chrome bar stayed visible, but the
game area remained white. The router saw no changed hash to render, and the
iframe's `src` attribute still named the game.

Reproduced on the isolated static preview server: open Logic Detectives,
return to Hub, traverse history, reopen the game, then use browser Back. The
result matched the reported persistent white page. See
[before](screenshots/browser-back-before.png).

Iframe history is shared with the containing tab, as described by the
[HTML iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).

## Change

- After a confirmed checkpoint, discard the old iframe browsing context by
  replacing its DOM node. Keep its title, class and permission attributes.
- Configure each replacement URL while detached, before insertion. Reopening
  any game therefore creates a fresh document, without blank-page history.
- Bind the new session to the fresh frame. Removed frames cannot send accepted
  progress messages, even if they supply the current session identifiers.
- Preserve failed-save recovery, profile isolation and saved draft delivery.
- Refresh the hub and chrome script cache tokens in the main `index.html`.

No game storage keys, progress schemas, backup formats or launcher behavior
changed. An already-open browser tab needs one reload to load the new scripts.

## Verification

In the in-app Chromium browser on the isolated preview server:

- Back from Logic Detectives returned to Hub in one step.
- Back from Hub restored Logic Detectives; Forward returned to Hub.
- Typed `14` into the first blank of a Grade 3 table, used browser Back, then
  Forward and Continue. The same case and unfinished `14` returned. See
  [recovered game](screenshots/browser-back-fixed.png).
- Opened Cosmic Math Quest and used Back successfully, confirming the shared
  hub lifecycle also works for another game.

Passed automated checks:

```
node tests/smoke-save-session.mjs
node tests/smoke-hub-dashboard.mjs
node tests/smoke-restore-safety.mjs
node tests/smoke-backup-snapshots.mjs
node games/tests/smoke-game-startup.mjs
node games/logic-detectives/tests/smoke-game.mjs
```

The save-session regression harness models distinct iframe window identities,
DOM attachment/removal and detached-only URL assignments. It verifies
checkpoint-before-removal, draft delivery, stale-frame rejection, failed-save
retention and rapid route cancellation. Real Back/Forward behavior was checked
in the browser, rather than inferred from the VM harness.

The running `localhost:8000` server serves both updated script versions
(`20261107-browser-history-r1`), verified with a read-only HTTP request. All
interactive tests used the separate static preview origin; no real family
profile or folder backup was modified. Safari/Firefox were not run live.
