# CLAUDE.md — ClanKit Project Guide

## Project Overview

ClanKit is a multi-LLM desktop chat application built with **Electron + Vue 3 + Vite**. It supports Anthropic (Claude), OpenRouter, and OpenAI-compatible backends. Features include agent management, MCP server integration, HTTP tools, knowledge base (RAG via local embeddings and vectra vector store), skills, and an agentic tool-use loop.

## Tech Stack

- **Runtime:** Electron 31 (main process: Node.js/CommonJS, renderer: ES modules)
- **Frontend:** Vue 3.4 (Composition API with `<script setup>`), Pinia 2 (state), Vue Router 4 (hash history)
- **Build:** Vite 5, `@vitejs/plugin-vue`
- **Styling:** Tailwind CSS 3.4 + CSS custom properties + scoped component CSS
- **Markdown:** `marked` + `highlight.js` + `DOMPurify`
- **Rich Text:** TipTap (Vue 3)
- **3D Viewer:** Babylon.js (model preview in chat)
- **Avatars:** DiceBear Avataaars
- **IDs:** `uuid` v9
- **i18n:** Custom lightweight solution (`src/i18n/`)

## i18n Multilingual Support (Prerequisite for All Development)

**All new feature development must support multiple languages.** This is not optional; it is an architectural prerequisite.

### Configuration Layer

- Language settings are stored in the `language` field of `config.json` (`'en'` | `'zh'`)
- Access through `configStore.language` (computed, automatically reacts to config changes)
- Language changes take effect immediately without restart

### Translation File Structure

```
src/i18n/
├── index.js      # Translation dictionary object (en, zh)
└── useI18n.js    # Composable: useI18n() returns { t, locale }
```

### Usage

`useI18n()` (from `src/i18n/useI18n`) returns `{ t, locale }`. Use `{{ t('key') }}` in templates.

### Key Naming Conventions

- `app.*` - Application-level (name, slogan)
- `nav.*` - Navigation items
- `common.*` - Common buttons/labels (Save, Cancel, Delete, Add, Search, etc.)
- `config.*` - Configuration pages
- `agents.*` - Agent-related
- `chats.*` - Chat-related
- `skills.*`, `knowledge.*`, `mcp.*`, `tools.*` - Feature modules

### AI Language

- `config.language` is the AI **default language**
- When creating a new agent, fields such as name and description should be generated in the current language
- Chat-level override: `chat.languageOverride` allows switching AI language within a single chat

### Migration Guide

Existing hardcoded text should be migrated one by one to `t('key')` calls. Prioritize:
1. High-frequency components (NavItem, AppButton, form labels)
2. Main pages (ConfigView, AgentsView, ChatsView)
3. Low-frequency components afterward

## Repository Structure

- `electron/` — Main process (CommonJS). `main.js` is a thin shell; all IPC handlers live in `electron/ipc/` (18 modules registered via `index.js::registerAll()`). Agent runtime in `electron/agent/`: `agentLoop.js` (core LLM loop), `systemPromptBuilder.js`, `messageConverter.js`, `toolExecutor.js`, `chunkAccumulator.js`, `dataNormalizers.js`, plus `core/` (LLM clients), `tools/`, `mcp/`, `voice/`. Shared utilities in `electron/lib/`.
- `src/` — Vue renderer (ES modules). Pinia stores in `src/stores/`, composables extracted from ChatsView in `src/composables/` (`useSendMessage`, `useChunkHandler`, `useAgentCollaboration`, `useChatTree`, `useMessageOps`, `useVoiceRecording`, etc.), components split by feature under `src/components/{chat,common,agents}/`, utilities in `src/utils/`, pages in `src/views/`.
- Root configs: `vitest.config.js`, `tailwind.config.js`, `vite.config.js`, `postcss.config.js`, `package.json`.

> Use Glob/Grep to discover current file names — this section is intentionally high-level, not an inventory.

## Commands

```bash
# Development (Vite dev server + Electron, no hot reload for Electron main process)
npm run dev

# Build Vue frontend
npm run build

# Run Electron standalone (after build)
npm run electron
```

> **No Electron hot reload:** The dev script does **not** auto-restart the Electron main process when files in `electron/` change. Vue renderer changes are still picked up by Vite HMR. Changes to `electron/main.js`, `electron/preload.js`, or any file under `electron/agent/` require a manual app restart.

## Architecture & Conventions

### Electron IPC Pattern

- Main process exposes IPC handlers via `ipcMain.handle('channel', ...)` in `electron/ipc/` modules
- Preload script (`electron/preload.js`) bridges channels to `window.electronAPI` via `contextBridge`
- Renderer accesses IPC through `window.electronAPI.methodName()`
- Namespaced IPC channels: `store:*`, `mcp:*`, `tools:*`, `agent:*`, `skills:*`, `knowledge:*`, `files:*`

### Vue Component Patterns

- **Always** use `<script setup>` Composition API (no Options API)
- Stores are Pinia setup stores (function-based `defineStore`)
- Props validated with `defineProps()`, events with `defineEmits()`
- Use `defineOptions({ inheritAttrs: false })` when forwarding `$attrs`
- Inline SVG icons defined as render-function components (see `Sidebar.vue`)
- Deep-clone reactive data before IPC: `JSON.parse(JSON.stringify(toRaw(...)))`

### State Management

- All persistence goes through `src/services/storage.js` which delegates to Electron IPC or localStorage
- Chat messages are lazily loaded per-chat (`messages: null` until accessed)
- Debounced persistence (300ms) for frequent updates (message streaming)
- Streaming chunks flow: `main process → IPC 'agent:chunk' → chats store → UI callback`

### Routing

- Hash-based routing (`createWebHashHistory`) for Electron compatibility
- Routes: `/chats`, `/agents`, `/skills`, `/knowledge`, `/mcp`, `/tools`, `/notes`, `/config`
- Default redirect: `/` → `/chats`

### Agent Model Resolution

Agent model is resolved from `agent.providerId` / `agent.modelId` in `agents.json`, with `config.defaultProvider` as global fallback. **`AgentWizard.vue` is the only place that writes model fields** to `agents.json`.

### Anthropic Context Windows (as of 2026)

Claude Opus 4.6+ and Claude Sonnet 4.6+ both have a **1M token** context window. Haiku 4.5 remains at 200K. The hardcoded values in `src/stores/models.js:_getAnthropicModels()` reflect this — do not "correct" them back to 200K based on outdated documentation.

### Unknown Model Context Windows

When a model is not in the litellm catalog AND the provider API doesn't report `context_length`, the system does NOT silently fall back to a default value. Instead: (1) `modelsStore.getAllContextWindows()` omits the model, (2) UI shows a red `!` next to the compact button, (3) automatic compaction thresholds do not fire, (4) if the provider rejects a request with `context_length_exceeded`, the agent loop triggers one reactive compaction + retry per chat cooldown window. Users are expected to configure the real window via `provider.modelSettings[modelId].contextWindow`.

### Data Storage

- All data stored in `%APPDATA%/clankit/data/` on Windows, `~/.config/clankit/data/` on Linux/macOS (configurable via `CLANKIT_DATA_PATH` in `.env`)
- Files: `config.json`, `agents.json`, `mcp-servers.json`, `tools.json`, `knowledge.json`
- Chats: `chats/index.json` (metadata) + `chats/{id}.json` (per-chat with messages)
- Memory: SQLite at `memory/memory.db` (rows + FTS5) + vectra at `memory/memory-vec/`. Sidecar JSON artifacts (speech / evidence / harness) at `agent-artifacts/{type}/{id}.*.json`

All configuration lives in `config.json`. The `.env` file only stores `CLANKIT_DATA_PATH` (data directory override).

## Electron Agent Architecture

### IPC Module System

`electron/main.js` is a thin shell. All IPC handlers live in `electron/ipc/` (18 modules), loaded via `registerAll()` in `electron/ipc/index.js`. Key module: `agent.js`.

### Agent Execution Pipeline (`agent:send-message`)

The entire orchestration runs **in Electron** (Node.js). Vue is fire-and-forget.

```
Vue: sendMessage() → window.electronAPI.sendMessage(payload) → returns immediately
                                    ↓
Electron: agent:send-message handler (async IIFE, non-blocking)
  1. Read from disk: config, agents, MCP, tools, knowledge (via dataNormalizers.js)
  2. Parse @mentions → resolveAddressees (2+ mentions → utility model call)
  3. Determine execution mode: dispatchGroupTasks → concurrent/sequential + dependsOn
  4. Build isolated agentRuns[] via _buildAgentRuns()
  5. Run first round: runGroupRound(firstRoundRuns) → Promise.all (concurrent)
  6. Collaboration loop: triggerCollaboration() → scan @mentions → sequential rounds → recurse
  7. Emit send_message_complete with stickyTargetIds
                                    ↓
Vue: useChunkHandler.handleChunk() receives chunks → updates UI
```

### Chunk Protocol

AgentLoop emits raw chunks. IPC wraps them with `{ agentId, agentName }` for group chat.

| Chunk Type | Source | Purpose |
|---|---|---|
| `text` | AgentLoop | Streaming text delta (`chunk.text`, NOT `chunk.content`) |
| `tool_call` | AgentLoop | Tool about to execute |
| `tool_result` | AgentLoop | Tool completed |
| `tool_output` | AgentLoop via onUpdate | **Live** stdout/stderr from running tool (e.g. shell) |
| `agent_start` | IPC wrapper | Agent begins responding (group chat) |
| `agent_end` | IPC wrapper | Agent finished (group chat) |
| `send_message_complete` | IPC | All agents done; carries `stickyTargetIds` |
| `send_message_error` | IPC | Orchestration failed |
| `collaboration_round_done` | IPC | One sequential round completed |
| `collaboration_summary` | IPC | MAX_ITERATIONS reached |
| `context_update` | AgentLoop | Token usage snapshot |
| `permission_request` | AgentLoop | Tool needs user approval |

**Critical**: Text chunks use `chunk.text` (not `chunk.content`). `chunkAccumulator.js` ensures this — the collaboration loop depends on accumulated text to find @mentions. Using the wrong property silently breaks all multi-agent collaboration.

### Data Normalization (`dataNormalizers.js`)

JSON files have different formats. Normalizers convert to consistent arrays:

| File | Formats | Normalizer |
|---|---|---|
| `agents.json` | `{ categories, agents: [] }` or plain `[]` | `normalizeAgents()` |
| `tools.json` | dict `{ "id": config }` or `[]` | `normalizeTools()` — filters `__deletedBuiltins` |
| `mcp-servers.json` | `[]` or legacy dict `{ "name": config }` | `normalizeMcpServers()` |

### Per-Agent Isolation — invariants

Every `agentRun` from `_buildAgentRuns()` must be fully isolated. NEVER share between agents:

| Resource | How isolated |
|---|---|
| Provider credentials + model | Per-agent config copy; `customModel = agent.modelId` |
| System prompt | `systemPromptBuilder.js` → per-agent memory + skills |
| Skills | Filtered by `agent.requiredSkillIds` |
| MCP servers | Filtered by `agent.requiredMcpServerIds` |
| HTTP tools | Filtered by `agent.requiredToolIds` |
| Knowledge (RAG) | Independent local vector store query per agent |
| Conversation view | Other agents' messages prefixed with `[AgentName]: ` |
| AgentLoop instance | `new AgentLoop(loopConfig)` per agent, keyed `chatId:agentId` |

### Tool Streaming (`ShellTool.js`)

Tools receive an `onUpdate` callback for live output:
```
ShellTool.execute(toolCallId, params, signal, onUpdate)
  → spawn() + child.stdout.on('data') → onUpdate({ type: 'stdout', text })
  → ToolRegistry passes onUpdate through
  → AgentLoop relays as tool_output chunk to Vue
  → useChunkHandler accumulates into seg.streamingOutput
  → MessageRenderer shows live terminal output, auto-collapses when done
```

### Collaboration Loop — Iron Laws

**These rules are non-negotiable. Confirm with user before modifying.**

1. **`collaborationCancelled`** is the **sole stop signal** for the loop — never check `!isRunning`
2. **`isInCollaborationLoop = true`** must be set in Vue **before** IPC call — prevents `agent_end` from clearing `isRunning` prematurely
3. **Roleplay truncation** in `agent_end` handler must preserve non-text segments (tool_call, tool_result, image, permission) — only truncate text segments
4. **`waitForAgentEnd()`** must be called after every agent round in Vue — ensures @mention content is complete before scanning
5. **`_buildAgentRuns` isolation** — sharing config between agents causes identity confusion and credential leaks
6. **`chunk.text` not `chunk.content`** — `chunkAccumulator.js` enforces this; wrong property = silent collaboration break

### Vue Lifecycle Flags

| Flag | Location | Purpose |
|---|---|---|
| `isInCollaborationLoop` | useChunkHandler | Prevents `agent_end` from clearing `isRunning` |
| `collaborationCancelled` | useChunkHandler | User stop signal; checked by Vue queue logic |
| `runningAgentKeys` | useChunkHandler | Set of `chatId:agentId` — tracks active streams |
| `perChatStreamingMsgId` | useChunkHandler | Map: `chatId:agentId` → streaming message ID |

## Testing

- **Framework**: Vitest + happy-dom + @vue/test-utils. Run: `npm test` or `npm run test:watch`
- **304 tests** across 28 files — Pinia stores (11), composables (8), Vue components (8), views (7), page-level integration (1), utilities (2), backend (1)
- **Dev-mode chunk recorder**: `chats.js` captures all `agent:chunk` events in memory when `import.meta.env.DEV` is true. Access via `useChatsStore().getChunkLog()` from devtools to export scenarios for replay tests.

### Test Suites by Domain

| Domain | Test Command | When to Run |
|--------|-------------|-------------|
| **Chat logic** | `npm test -- src/stores/__tests__/chats.test.js src/composables/__tests__/ src/components/chat/__tests__/ electron/ipc/__tests__/agentDataNormalization.test.js` | Any change to chat orchestration, chunk handling, message streaming, agent routing, collaboration, or provider/model resolution |
| **Agent management** | `npm test -- src/views/__tests__/AgentsView.test.js src/components/agents/__tests__/` | Changes to agent CRUD, import wizard, agent body editor, agent categories |
| **Configuration** | `npm test -- src/stores/__tests__/config.test.js src/views/__tests__/ConfigView.test.js` | Changes to provider config, model setup, language, paths |
| **Skills / Knowledge / MCP / Tools** | `npm test -- src/views/__tests__/SkillsView.test.js src/views/__tests__/RemainingViews.test.js` | Changes to skill/knowledge/MCP/tool management pages |
| **Docs (AI Doc)** | `npm test -- src/views/__tests__/DocsView.test.js` | Changes to the document editor or AI edit features |
| **Utilities** | `npm test -- src/utils/__tests__/` | Changes to IPC serialization, token estimation, mentions parsing |
| **Full suite** | `npm test -- src/ electron/ipc/__tests__/agentDataNormalization.test.js` | Before any PR merge or when unsure of blast radius |

### Mandatory Regression Rules

1. **Chat changes**: Any change touching `src/composables/use*.js`, `src/components/chat/`, `src/stores/chats.js`, `electron/ipc/agent.js`, or `electron/agent/` MUST run the **Chat logic** suite before completion.
2. **Agent changes**: Any change touching `src/views/AgentsView.vue`, `src/components/agents/`, `src/stores/agents.js`, or `electron/ipc/agentImport.js` MUST run the **Agent management** suite.
3. **Cross-cutting changes**: Changes to stores used by multiple domains (e.g. `config.js`, `agents.js`) must run ALL affected domain suites.
4. **New features**: Any new feature MUST include at least one test case in the relevant domain suite.

---

## UI/UX Design System

> **Full specifications are in [`UI_DESIGN_SYSTEM.md`](./UI_DESIGN_SYSTEM.md).** Read that file for colors, typography, shadows, component patterns, responsive breakpoints, and config page layout.

**Key rules to always follow (not repeated in the external file):**
- Use `var(--token)` CSS custom properties for all colors, radii, and font sizes
- Always apply the black gradient (`linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151)`) for primary interactive elements
- All spacing uses `rem` not `px` (exceptions: `1px` borders, SVG attributes, scrollbar width)
- Modals are **true modals** — never close on backdrop click, always use `<Teleport to="body">`
- Page action buttons must use `<AppButton size="compact">`, not custom CSS classes

---

## Coding Guidelines

- Use `var(--token)` CSS custom properties for all colors, radii, and font sizes
- Prefer scoped `<style scoped>` in components; global styles only in `style.css`
- Keep Tailwind for layout utilities (`flex`, `gap`, `p-*`); use CSS variables for theming
- Always apply the black gradient for primary interactive elements — this is the visual signature
- All IPC calls are `async` (invoke/handle pattern)
- Never store sensitive keys in the renderer; they live in `config.json` on disk
- Chat persistence is debounced (300ms) — don't call `persistChat` in tight loops
- **Language policy:** In code files, configuration files, and source code comments, use English only. Chinese is not allowed.
- **Restart notification:** When any change touches files that require an app restart to take effect (anything under `electron/` — `main.js`, `preload.js`, `agent/`, etc.), end your message to the user with a **red-colored** notice: <span style="color:#EF4444;">**⟳ This change requires restarting the app to take effect.**</span>

## Engineering Principles

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution over speed; for trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project-Specific Rules

- **No hardcoded provider endpoints**: Never use `|| 'https://api.anthropic.com'`, `|| 'https://openrouter.ai/api'`, or any other provider URL as a fallback in source code. All endpoints must come from user configuration (`config.providers[]` entries). If a baseURL is missing at runtime, throw an error or return early — do not silently fall back to an official URL. Placeholder text in `<input placeholder="...">` UI fields is exempt (display only, not used for requests).
- **No laziness**: Find root causes. No temporary fixes. Senior-developer standards.

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: append a rule to `LESSONS.md` (auto-imported above) that prevents the same mistake
- Write the rule to be actionable at the point of future work, not a retelling of the incident
- Ruthlessly iterate on these lessons until mistake rate drops

> Lessons live in a repo-tracked file (`LESSONS.md`, imported via `@LESSONS.md`) so every session picks them up automatically and multiple concurrent terminals don't race on shared state. Task tracking uses Claude Code's built-in tools instead (see below).

### 4. Task Management (In-Session)

Use Claude Code's built-in task tools — they are per-session, in-memory, and safe across multiple terminals:

1. **Plan First**: Use `TaskCreate` to define checkable items before implementation
2. **Track Progress**: Use `TaskUpdate` to mark items `in_progress` → `completed`
3. **Check State**: Use `TaskList` / `TaskGet` to review what's done and what's next
4. **Dependencies**: Use `addBlockedBy` / `addBlocks` to sequence dependent work

Do NOT write task state to files on disk — it conflicts across concurrent terminals.

### 5. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"

### 6. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 7. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Lessons Learned

The rolling log lives in [`LESSONS.md`](./LESSONS.md) and is imported automatically below. Append new entries there, not here. After any user correction, add a rule to LESSONS.md that prevents the same mistake.

@LESSONS.md

