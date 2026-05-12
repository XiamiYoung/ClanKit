# Auto-review committee (`Stop` hook)

When a Claude Code task finishes, `auto-review.mjs` runs an automated, closed-loop
code review of the change before the agent is allowed to stop. Wired via the `Stop`
hook in `../settings.json`.

## How it works

1. **Gate** — runs only if the diff (vs the base branch's merge-base, plus
   uncommitted changes) is ≥ `MIN_DIFF_LINES` lines, and `.claude/.no-auto-review`
   does not exist. Trivial changes and "the agent just asked a question" are skipped.
2. **Round 1** — a single Opus reviewer (fresh process, zero conversation history,
   adversarial "find what's wrong" prompt) lists findings. They're injected back to
   the builder, which must **fix each one or reject it with reasoning** — the builder
   is expected to push back on points it believes are wrong, not rubber-stamp.
3. **Round 2** — the same reviewer re-reads the updated diff (+ the builder's recent
   reasoning, pulled from the transcript) and rules each finding `RESOLVED` or
   `DISPUTED`. The reviewer is expected to withdraw findings when the pushback is sound.
4. **Committee** (only if disputes remain) — three panelists (`opus`, `sonnet`,
   `haiku`) each vote per disputed finding: builder or reviewer. The script tallies;
   2-of-3 wins. Reviewer-won findings are injected to the builder as **final**
   must-fixes (no further pushback). Builder-won findings are dropped.
5. **Summary** — a Haiku pass writes `REVIEW.md` (repo root, gitignored): a
   plain-language summary of what was reviewed and what happened, for a human who
   didn't read the diff.

State for the in-progress review thread lives in `.claude/.review-state.json`
(gitignored), keyed by session id; it resets when the diff goes empty or the
session changes.

## Disable it

- **For one session:** `New-Item .claude/.no-auto-review` (or `touch` on bash).
- **Permanently:** remove the `Stop` block from `../settings.json`.

## Cost / time

Each review pass is a real `claude -p` invocation. Common path (round 1, no
disputes) ≈ one Opus call. Worst case (full committee) ≈ five sequential calls
(round-2 reviewer + 3 panelists + summarizer). The `MIN_DIFF_LINES` gate keeps it
off small changes. Tune the knobs at the top of `auto-review.mjs`.

## Knobs (`auto-review.mjs` CONFIG block)

`MIN_DIFF_LINES`, `REVIEWER_MODEL`, `PANEL_MODELS`, `SUMMARY_MODEL`,
`SUBAGENT_TIMEOUT_MS`, `BASE_BRANCHES`.

## Known v1 limitations

- The first-pass reviewer is a single agent — if it misses something, the committee
  never sees it (the committee only adjudicates what's disputed, by design).
- Panelists run sequentially, not in parallel — slower on the committee path.
- "Builder's reasoning" is a best-effort excerpt of recent assistant prose from the
  transcript, not a per-finding structured record.
- Sub-agents run with `--dangerously-skip-permissions` but a tight read-only tool
  allowlist (`Read`, `Grep`, `Glob`, read-only `git`). The summarizer additionally
  may `Write` only `REVIEW.md`.
