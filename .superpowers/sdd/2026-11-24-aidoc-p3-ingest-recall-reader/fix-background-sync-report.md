# Background Sync wiki - report

Changes
- Store (src/stores/aidoc.js): ingestDialogVisible flag; confirmIngest closes the dialog immediately and runs in the background; a busy backend response is not an error (clears plan, re-syncs via status snapshot); real start failures reopen the dialog; restoreIngestStatus() (toolbar mount and setRoot); openIngestResult(); a `complete` progress event finishes runs that have no local invoke promise (de-duplicated; error variant maps to aidoc.requestFailed).
- Main (electron/ipc/aidoc.js): `aidoc:ingest-status` snapshot (scoped by root and owner sender); every run emits a final `complete` progress event with summary {done, failed, stopped, aborted, warnings, indexError, overflow, remaining}, or `error: true` if the run ended without a result. Preload exposes getIngestStatus.
- Toolbar: sync button disabled + aria-disabled while running, thin progress bar, tooltip "Organizing i/n - name - pct%", Stop icon button (loading while stopping), result badge (check+count or warning) that opens the result modal; dismiss clears it.
- Modal: running section and stop button removed (dialog is never visible while running); Start disabled once a run is active.
- i18n en+zh: syncInProgress, syncRunning, syncStop, syncStopping, syncResult, syncResultStopped, syncResultAborted.
- No toast utility exists in the app, so none was used.

Tests: full suite 105 files / 1449 tests pass.
