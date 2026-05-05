# Lessons Learned

Rolling log of rules derived from past mistakes. Loaded into every session via `@LESSONS.md` from `CLAUDE.md`. Long incident war stories live in [`LESSONS-ARCHIVE.md`](./LESSONS-ARCHIVE.md) (NOT auto-imported) — consult on demand.

When appending a new lesson: lead with the rule, give a one-line "why" or example, skip the debugging narrative. If the war story is genuinely useful, put the long form in `LESSONS-ARCHIVE.md` and reference it.

---

## General workflow

- **One-time data migrations** must be done by directly editing the data files on disk (e.g. `config.json`), not by adding migration logic to source code. Migration code in source is dead weight after first run, requires a restart, and pollutes the codebase.

- **NEVER run `npx vite build`** (or any build command) after completing a task. The user explicitly forbids it. Trust code changes are correct; only build if explicitly asked.

- **Persistence policy**: do NOT use Claude Code's auto-memory at `~/.claude/projects/<slug>/memory/`. That path is per-device and creates a split-brain with repo-tracked context. ALL durable context (rules, lessons, project facts) goes into repo-tracked `CLAUDE.md` / `LESSONS.md` / `LESSONS-ARCHIVE.md`.

- **Diagnosing renderer-side state**: DevTools console cannot `await window.electronAPI.xxx(...)` directly in this app — `contextIsolation: true` + the preload bridge block Promise resolution. Symptom: pending forever / undefined errors / silent no-op. Instead add a one-shot `logger.info('[diag] ...', JSON.stringify(...))` in the main process, restart, read terminal. Remove the diag log in a follow-up commit.

- **After any structural data change**: (1) ask if backward compatibility is needed; (2) if yes, write a one-time migration of the data file, then delete ALL old code paths; (3) if no, delete old paths immediately. Never leave dual paths coexisting — they're invisible landmines for new users. Grep for old field names after migrating.

---

## i18n & language

- **`\b` (word boundary) does NOT work for CJK** in regex. CJK chars are non-`\w`, so `\b` between a CJK char and a space/punctuation never fires. Use `(?=\W|$)` for name-boundary matching in `parseMentions`, `stripMentions`, `MessageRenderer` highlighter.

- **Chinese → English migration**: classify first. KEEP functional multilingual data (i18n dictionaries, language-sensitive parsing, CJK stopwords/regex, hallucination blocklists). UI copy must route through `src/i18n/index.js` via `t('...')` — never hardcode translated literals or Unicode escapes in views/stores.

- **Language anchoring**: `systemPromptBuilder.buildSystemPrompt` MUST prepend an `OUTPUT LANGUAGE — HARD RULE` block built from `config.language` ('zh' | 'en'), placed BEFORE the ABOUT THE USER block and persona identity. **Why**: heavily English-coded persona text wins under low-temp sampling even with a Chinese clause inside the persona — anchoring at the envelope level is the only reliable fix. Keep redundant per-persona language clauses too.

- **User-persona leakage** (digital-persona agents repeatedly grabbing the user's profession to fabricate tech specifics): the offender is usually a single noun in ABOUT THE USER, not the persona body or Speech DNA. Two fixes in tandem: (a) envelope anti-repetition rule must explicitly forbid the user's profession/industry/tech-stack as a recurring topic AND forbid the symmetric "what about you, [user-work-topic]?" ricochet — generic "use sparingly" is too soft; (b) ABOUT THE USER trailer must say "this is a fact card, NOT a chat topic bank" with concrete bad-example free-association. **General rule**: when adding new background/identity blocks, anticipate the model's free-association failure mode and forbid it explicitly with concrete bad examples. When diagnosing prompt-driven behavior, dump the actual prompt via `logger.info` rather than guessing.

---

## Group chat & collaboration loop

(See also "Collaboration Loop — Iron Laws" in CLAUDE.md.)

- **Iron Law disambiguation**: (a) per-source `resolveAddressees` so only addressed (not merely mentioned) agents reply each round; (b) `_applyChunk` in `chats.js` must NEVER touch any chunk tagged with `agentId` — all group chunk processing lives in `ChatsView.handleChunk` via `perChatStreamingMsgId`; (c) sharing a single bubble between agents causes duplicate placeholders, double writes, and `streaming=false` races.

- **Root cause behind Iron Laws #1/#2/#4**: `ipcMain.handle` invoke-reply and `event.sender.send` agent chunks travel on DIFFERENT Electron IPC channels with NO ordering guarantee — invoke can resolve BEFORE the final text chunks + `agent_end`, so `msg.content` is incomplete when `triggerAgentCollaboration` scans @mentions. That's why `waitForAgentEnd()` (poll `perChatStreamingMsgId` until cleared) is mandatory, why `collaborationCancelled` — not `!isRunning` — is the sole stop signal, and why `isRunning` must be re-asserted inside the collaboration loop.

- **Roleplay truncation in `agent_end`** must iterate segments — keep all non-text segments (tool_call, tool_result, image, permission), only truncate text segments to the trimmed length. Replacing `msg.segments` with `[{ type:'text', content:trimmed }]` wipes tool output.

- **Group-chat truncation marker requirement** (`useChunkHandler.js agent_end`): require an explicit speaker-turn marker before cutting — pattern A `^\s*[:：]` immediately after the @-mention, or pattern B `\n\n` followed by `[Name]:` / `@Name` / `Name:`. **Never hard-cap at N chars** — a bare `@Name` followed by the agent's own continuing prose is a salutation/turn-pass, not roleplay.

---

## Vue / chats / agents

- **Chat-agent resolution — three cases**: (a) id empty/null → use `defaultSystemAgent`/`defaultUserAgent` (legitimate "unassigned"); (b) id set but `getAgentById(id)` returns null → agent is **deleted**; surface a tombstone, refuse to send (use `agentsStore.isAgentDeleted(id)`); (c) agent found → use it. The earlier "always use `getAgentById(id) || defaultAgent`" rule was wrong — it masked deletions. Sending is gated in `useSendMessage.js` via `chats.cannotSendDeletedAgent`; `ChatHeader` tooltips render `chats.deletedAgent`. Apply this explicit-tombstone pattern at any new chat-agent display site.

- **Stream-time message timestamps**: every renderer code path that pushes a message into `chat.messages[]` MUST stamp `timestamp: Date.now()` and `createdAt: Date.now()` at push time — `useAgentGreeting.js`, streaming placeholders, error placeholders, system messages (compaction banner, `collaboration_summary`). **Why**: SQL `ORDER BY ts ASC` makes ts the sort key; unstamped placeholders fall back to `Date.now()` at persist time, sorting to the bottom. Symptom: a chat's "first greeting" appears at the end.

- **AI Doc edit flow**: (a) `_applyReplacement` must REFUSE when substring-find fails — never fall back to whole-file overwrite; distinguish `isWholeFileEdit = !targetText || targetText === currentFullContent`. (b) Auto-apply-latest-AI-edit hooks must scope to `messages.slice(beforeTurnCount)`, not the full message list — otherwise a `Revert` on a prior turn gets silently undone by the next send. (c) Tool-based writes to the CURRENT file: snapshot `activeFile.content` BEFORE the agent loop runs and attach `toolEdit` metadata so the UI can show a separate Revert pill. The system prompt should steer the AI toward `<replacement>` for the current file and reserve `file_operation` for OTHER files.

- **Editor undo for programmatic writes** (`editorContent.value = newText`): they don't enter the native undo stack, so Ctrl+Z undoes the user's last keystroke instead of the AI edit. Maintain a separate AI-edit stack of `{preContent, postContent, source, msgId}`. Intercept Ctrl+Z/Y/Shift+Z in capture phase but ONLY `preventDefault` when `currentContent === top.postContent`; otherwise pass through to native. Clear both stacks on file switch.

- **Z-index for hover-controlled buttons**: explicit `z-index` on buttons AND proper stacking context on the parent. Sidebar action buttons `z-index: 10-20`, message action buttons `z-index: 100`. Otherwise click events get intercepted by overlapping elements even when buttons appear visible.

---

## IPC

- **`preload.js` subscription helpers** must use per-callback listeners: `const listener = (_, data) => cb(data); ipcRenderer.on(ch, listener); return () => ipcRenderer.removeListener(ch, listener)`. **Never** call `removeAllListeners` in a per-subscriber helper — it silently starves sibling subscribers (e.g. `agent:edit-chunk` is shared by inline edit and AI Doc panel).

---

## AgentLoop entry-point Iron Law

Every code path that constructs `new AgentLoop(...)` outside the canonical `agent:send-message` IPC handler — IM bridge, task scheduler, doc edit, inline edit, utility model — MUST satisfy ALL of the following. Skip any one and interrupt/visibility/credentials silently break.

**Setup**:
- **Provider/model resolution** via `_normalizeLoopConfig(loopConfig, agentId)` from `agentRuntimeUtils.js`. Never reimplement provider resolution.
- **Credential validation** via `_validateLoopConfig(loopConfig)` so missing credentials surface cleanly rather than as a cryptic 404.
- **Language directive** sourced from `config.language` in the system prompt — LLMs don't reliably infer UI language from mixed-language input.
- **`excludedToolNames`** to `ToolRegistry.loadForAgents` — narrow-scope features must NOT auto-inherit `update_memory` / `execute_shell` / `file_operation` etc. Principle of least privilege.

**Lifecycle / interruption**:
- **Register in `activeLoops`** via `ipcAgent.registerLoop(\`${chatId}:${agentId}\`, loop, meta)` BEFORE `loop.run()`; `unregisterLoop(key)` in `finally`. `agent:stop` IPC iterates `activeLoops` by `chatId` prefix — non-registered loops are unstoppable. Call `consumePendingStop(chatId)` between placeholder creation and `loop.run()` to honor stops that arrived during the race window.
- **Reflect `chat.isRunning` in renderer** by emitting a lifecycle event (e.g. IM bridge uses `im:run-started` / `im:run-ended` mapped to `chat.isRunning` in `ChatsView.vue`). Without this, the interrupt button (`v-if="isRunning"` in `ChatWindow.vue`) never appears.
- **Funnel stop UX through `useInterrupt`** — never invent a parallel stop path. Contract: "OR `_hasActivity` across ALL streaming/waiting assistant msgs in the current turn; if any active → mark + splice empties; if all empty → recall user msg + textarea." **Decision based on the LAST streaming msg alone is the recurring group-chat regression** — `pendingMsgs.some(_hasActivity)`, never `_hasActivity(lastAssistantMsg)`.
- **Sequential per-agent fan-out** needs a chat-level cancellation flag (`ipcAgent.markChatCancelled` / `isChatCancelled`, set by `agent:stop`, cleared at `routeMessage` entry, checked at the top of every iteration to `break`). One Esc must terminate the whole turn — `loop.stop()` only kills the current loop, the for-loop will still construct a fresh AgentLoop for the next agent without this flag.
- **`im:agent-stream-end` with `removed: true`** when `removeMessage(chatId, msgId)` deleted the placeholder — otherwise the renderer keeps an empty assistant bubble in memory ("ghost bubble"), indistinguishable on screen from the disk-orphan bug.
- **`anyActivity` scopes to the current turn** (since the last user msg), not just messages currently streaming. After a previous Esc has marked early agents (now `streaming: false` with interrupt text), a fresh empty placeholder for the next agent must NOT flip the recall path and silently delete the user msg.

---

## Narrow-scope entry points (specific cases)

- **Memory access**: NEVER add a new direct memory read path that bypasses `MemoryStore`. All read paths (`MemoryReadTool`, `systemPromptBuilder.readMemoryFile`, voice / memory / agent IPC sync readers, `AnalyzeAgentTool`) delegate to `MemoryStore.readMarkdown(agentId, agentType)`. Single SQLite db at `{DATA_DIR}/memory/memory.db`; sidecar JSON artifacts at `{DATA_DIR}/agent-artifacts/{type}/`.

- **`config.json` credential encryption**: sensitive fields (`providers[].apiKey`, `smtp.pass`) are transparently encrypted via `electron.safeStorage` (DPAPI / Keychain / libsecret) with `enc:v1:<base64>` prefix. Encrypt/decrypt happens in `dataStore.readJSON`/`writeJSON`/`readJSONAsync`/`writeJSONAtomic` keyed on `_isConfigFile(file)`. **When adding a new credential field**: update both `_decryptConfigSensitive` AND `_encryptConfigSensitive` in `electron/lib/dataStore.js`. **Never bypass dataStore** by writing your own `readJSON`/`writeJSON` for `CONFIG_FILE` — delegate so encryption stays uniform. `encryptString` is idempotent via the prefix check.

---

## IM bridge

- **Two state planes**: **disk** (`chats.db`) and **renderer in-memory** (`chatsStore.chats[].messages`). Disk helpers (`finalizeMessage` / `appendMessage` / `removeMessage`) only touch disk. Renderer is mutated by `im:agent-stream-start` (push placeholder), `im:agent-chunk` (append text + segments), `im:agent-stream-end` (flip streaming, or splice if `removed:true`).

- **Catch / abort paths fire NO chunks** → in-memory msg keeps `content:''` even though disk is correct. Symptom: empty assistant bubble until reload. **Rule**: any catch / abort / error path that wants content in the bubble MUST emit a synthetic `im:agent-chunk` with `chunk: { type:'text', text:'...' }` BEFORE `finalizeMessage` + `im:agent-stream-end`. Order: `im:agent-chunk` (renderer appends) → `finalizeMessage` (disk) → `im:agent-stream-end` (renderer flips streaming).

- **Streaming-placeholder cleanup**: any pre-written `{role:'assistant', content:'', streaming:true}` placeholder must be finalized OR removed in EVERY exit path (success, error, abort), paired with matching `im:agent-stream-end`. Without this, `chats.js::backfillChat` auto-resets `streaming:true → false` on next load, leaving a permanent empty bubble.

- **Polling re-entry guard**: `setInterval(_poll, ms)` does NOT await the async callback. Slow `_poll` re-entered while previous tick runs → both ingest the same incoming msg → duplicate user bubble + duplicate agent turn. Every IM polling loop needs (a) an in-flight boolean lock making overlapping ticks no-ops, AND (b) a TTL'd recently-ingested message-ID set as defense-in-depth.

- **Self-chat dedup** (Teams `48:notes`, Feishu p2p, any future self-mode adapter): tracking only `_sentMessageIds` populated AFTER `await _graphPost(...)` is racy — message ID isn't recorded until response (~200–500ms). Pre-record the expected polled-back text BEFORE the POST as a content-hash fallback dedup with consume-once semantics. Fingerprint MUST strip ALL whitespace (`/\s+/g → ''`) — services like Graph re-normalize HTML (wrap in `<p>`, add whitespace between `<li>`); collapsing-to-single-spaces dedupe-misses on lists/tables.

---

## Skills & tools

- **Skill tools (`{DATA_DIR}/skills/<id>/*.js`) cannot `require()` ANY non-core module**. Not project source files, NOT npm packages from the app's `node_modules`. The user data folder is on a separate filesystem path; module resolution traverses upward and never reaches the app's `node_modules`. Symptom: `[skillToolLoader]` errors with `Cannot find module <pkg>` and tools silently disappear from the LLM's tool list.
  - May only `require()` Node **core** modules (`fs`, `path`, `crypto`, `os`, `url`, etc.).
  - For UUIDs: `const { randomUUID } = require('crypto')` (RFC 4122 v4, available since Node 14.17).
  - Anything beyond core comes via the host-injected `context` object (e.g. `agentStore`, `taskStore`, `localVectorStore`, `getConfig`).
  - When bumping a skill's source code, always bump `manifest.json.version` so `ensureBuiltinSkills` overwrites the deployed copy. Verify `[builtinSkills] upgraded <id>: vN -> vM` in startup logs.

- **ClanKit admin tools live inside `clankit-config-admin` skill**, not as always-on core tools. Auto-included for every agent via `_injectAlwaysOnSkills` in `electron/ipc/agent.js`; bundled tools auto-register through `skillToolLoader`. Host injects deps via `skillCtx`: `agentStore`, `taskStore`, `localVectorStore`, `getConfig: () => this.config`. **When adding a new "manage ClanKit X" capability, bundle it inside `clankit-config-admin`** — keeps workflow docs in `SKILL.md` co-located with the tools, single skill to opt-in/opt-out from. Do NOT reintroduce `ToolRegistry.registerManageTools()`.

- **Narrow-scope entry-point unified rule** (doc edit, inline edit, utility model, task scheduler, IM bridge): see "AgentLoop entry-point Iron Law" above. The four-piece setup (provider resolution, credential validation, language directive, `excludedToolNames`) is non-negotiable.

- **`FileTool.edit` with `oldText=""` is catastrophic**: `body.split("")` splits between every character; `body.split("").join(newText)` inserts `newText` between each char. Validate `oldText !== ''` explicitly — the `oldText == null` guard catches only null/undefined. Direct the LLM to use `operation=write` for whole-file overwrites. **General rule**: any string-replace tool taking an LLM-supplied `find` parameter — empty-string is a footgun, treat like null. Same care for any tool that takes an LLM-supplied separator/delimiter iterated with `split()`/`join()`.

---

## Tests

- **Test hygiene**: (1) When adding methods to a Pinia store consumed by components with tests, grep `src/**/__tests__/**/*.test.js` for `vi.mock.*<store-path>` and update the factory — stale mocks compile fine but crash on first call. (2) When a refactor removes a module, run `git log --diff-filter=D --summary | grep <Name>` and `grep -rn '<Name>' tests/ src/**/__tests__/` before committing — orphan test files that fail at suite-load report as "0 tests" and are easy to miss. Delete orphan tests + stale JSDoc in the SAME commit.

- **Vitest 4.x**: (1) Test files must be ESM — `import { describe, it, expect, vi } from 'vitest'`; `require('vitest')` throws. (2) When code under test is CJS and internally `require()`s a dependency, `vi.mock` often does NOT intercept that `require()`. Instead monkey-patch the CJS singleton: `const ds = require('../../lib/dataStore'); const orig = ds.paths; beforeAll(() => { ds.paths = () => fake }); afterAll(() => { ds.paths = orig })`. `module.exports = {...}` returns the same object to every caller, so method replacement is globally visible.

- **`better-sqlite3` native binding** is compiled for Electron's Node version (NODE_MODULE_VERSION=125 as of Electron 31), not local Node. Vitest runs in local Node, so directly `require('better-sqlite3')` from a test file fails with `ERR_DLOPEN_FAILED`. SQLite-backed code must isolate its DB layer behind a thin facade and unit-test only pure-logic helpers (parse/serialize/diff). DB integration is exercised at runtime, matching the existing `HistoryIndex` pattern. **Do NOT `npm rebuild better-sqlite3` to make tests pass** — it breaks Electron at runtime.
