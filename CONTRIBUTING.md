# Contributing to ClanKit

Thanks for your interest in contributing. This document covers what you need to know before opening a pull request.

## Before you start

### License terms attached to contributions

ClanKit is distributed under the **ClanKit Community License** (see [LICENSE](./LICENSE)) — a source-available license, **not** an OSI-approved open-source license. Please read it.

By submitting a contribution (pull request, patch, or any other form), you agree that:

1. You are the original author of the contribution, or you have the right to submit it under the project license;
2. Your contribution will be licensed under the same ClanKit Community License as the rest of the project; and
3. You grant the project maintainers the right to relicense your contribution if the project's license terms change in the future.

This is a lightweight inbound license grant in lieu of a formal CLA. If you cannot agree to these terms, please do not submit a contribution.

### Discuss non-trivial changes first

For anything beyond a typo fix, small bug fix, or doc improvement, please **open an issue first** describing what you want to change and why. This avoids the disappointment of submitting a 1000-line PR that gets rejected because the design doesn't match the project's direction.

Specifically discuss before starting:

- New features or new pages
- Changes to the agent execution pipeline, IPC protocol, or chunk format
- Changes to any of the "Iron Laws" documented in source comments (collaboration loop, AgentLoop entry-point invariants)
- Changes to data file schemas (`config.json`, `agents.json`, chat storage)
- New external dependencies

## Development setup

```bash
git clone https://github.com/XiamiYoung/ClanKit.git
cd ClanKit
npm install
npm run dev
```

You don't need any cloud credentials to develop locally — the optional backend (auth, telemetry) gracefully no-ops when `electron/build-config.dev.json` is absent. See `electron/build-config.example.json` for the schema.

**Requirements:** Node.js 18+, npm.

## Coding conventions

- **Vue components** use `<script setup>` Composition API. No Options API. Pinia stores are setup-style (function-based `defineStore`).
- **Code, config files, and source-code comments are English-only.** UI strings go through the i18n dictionary at `src/i18n/index.js` via `useI18n().t('key')`.
- **Styling:** Tailwind for layout utilities (`flex`, `gap`, `p-*`); CSS variables (`var(--token)`) for colors, radii, font sizes — see [`UI_DESIGN_SYSTEM.md`](./UI_DESIGN_SYSTEM.md).
- **Spacing in `rem`**, not `px` (exceptions: `1px` borders, SVG attributes, scrollbar width).
- **Modals** are true modals — never close on backdrop click; always use `<Teleport to="body">`.
- **No hardcoded provider endpoints.** Provider base URLs come from user configuration. If a `baseURL` is missing at runtime, throw or return early — do not silently fall back to an official provider URL.
- **Multi-language support is a prerequisite.** Every new feature must work in both English and Chinese.

## Testing

```bash
npm test          # Run the full Vitest suite once
npm run test:watch
```

Every PR must pass `npm test`. CI runs the suite on Node 20 and Node 24 across Linux and Windows.

If you add a new feature, **add at least one test case** in the relevant domain suite. Test files live next to the code under `__tests__/` directories.

## Commit and PR format

- One logical change per PR. Refactors and feature work go in separate PRs.
- Commit messages: short imperative subject, body explaining the *why*.
- The PR description should explain what changed and how to verify it. Link to the issue if there is one.
- Keep diffs surgical — don't reformat unrelated code.

## Reporting bugs

When opening a bug report, include:

- ClanKit version (`Help → About` or `package.json` `version`)
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Any relevant log output (Electron main process logs in your terminal if running `npm run dev`; renderer console logs from DevTools)

For **security vulnerabilities**, do not open a public issue — see [SECURITY.md](./SECURITY.md).

## Review process

The maintainers will:

- Aim to acknowledge new PRs within a week
- Run CI and review code style, design fit, and test coverage
- Ask for changes via PR review comments
- Squash-merge approved PRs into `master`

We may decline PRs that don't fit the project's direction even if the code is good. Discussing the change in an issue first usually prevents this.

Thanks again for contributing.
