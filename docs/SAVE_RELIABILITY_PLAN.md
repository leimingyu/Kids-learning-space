# Reliable local saving — option 1

Date: 2026-10-08. Keep the static/offline app, registered storage keys, and
version-1 JSON backups. No profile may inherit standalone legacy progress.

1. Validate complete import structure and raw game JSON before mutation.
2. Persist and verify a staged restore journal containing old and proposed
   raw values. Apply only progress-owned keys, verify writes, then commit.
   Roll back failures and recover interrupted operations before app startup.
   Retain a durable Undo copy even when IndexedDB is unavailable.
3. Make snapshot health reflect actual storage success. Preview restoration
   scope and expose Undo on the Parent page. Preserve device preferences.
4. Correlate save requests with frame, profile, session, and request identity.
   Show success only after confirmed persistence; show timeout/failure.
   Flush and stop an iframe before navigation or profile switching.
5. Give each game a versioned exact checkpoint with child-controlled Continue,
   including active question/problem, score, help flags, and mode state.
6. Serialize disk saves, use immutable unique history names, publish latest
   only after history succeeds, retry discovery/fallback, and distinguish
   acknowledged backups from best-effort exit/download requests.
7. Verify invalid imports, write/quota errors, rollback/recovery, Undo,
   snapshot errors, profile races, checkpoints, server failures, old backup
   round trips, and standalone behavior using isolated test data.

The staged restore uses existing browser keys and a persistent journal;
it provides rollback/crash recovery rather than pretending localStorage
supports a multi-key database transaction. If recovery cannot write, startup
stops with the journal intact. Every old backup importer path remains.

All implementation steps are complete. See SAVE_RELIABILITY_RELEASE.md for
verification, compatibility details, and the browser test limitation.
