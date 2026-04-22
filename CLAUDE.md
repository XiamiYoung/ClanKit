# CLAUDE.md — ClankAI Project Guide

## Project Overview

ClankAI is a multi-LLM desktop chat application built with **Electron + Vue 3 + Vite**. It supports Anthropic (Claude), OpenRouter, and OpenAI-compatible backends. Features include agent management, MCP server integration, HTTP tools, knowledge base (RAG via local embeddings and vectra vector store), skills, and an agentic tool-use loop.

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

```vue
<script setup>
import { useI18n } from '../i18n/useI18n'

const { t, locale } = useI18n()
</script>

<template>
  <button>{{ t('common.save') }}</button>
  <span>{{ t('nav.chats') }}</span>
</template>
```

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

- `electron/` — Main process (CommonJS)
  - `electron/main.js` — thin shell: createWindow, app lifecycle, delegates to IPC modules
  - `electron/preload.js` — contextBridge to `window.electronAPI`
  - `electron/ipc/` — 18 IPC handler modules + `index.js` registerAll()
    - `agent.js` — agent execution, collaboration loop, memory extraction
    - `store.js`, `tools.js`, `mcp.js`, `knowledge.js`, `models.js`, `skills.js`, `voice.js`, `memory.js`, `claude.js`, `shell.js`, `files.js`, `obsidian.js`, `window.js`, `im.js`, `news.js`, `souls.js`, `tasks.js`
  - `electron/agent/` — agent loop + extracted modules
    - `agentLoop.js` — core LLM loop, tool execution, context management
    - `systemPromptBuilder.js` — builds per-agent system prompt from soul files + skills
    - `messageConverter.js` — tool result serialization for LLM API
    - `toolExecutor.js` — tool execution helpers
    - `chunkAccumulator.js` — accumulates text from streaming chunks (used by collaboration loop)
    - `dataNormalizers.js` — normalizes JSON file formats (agents, tools, MCP)
    - `core/` — LLM clients (AnthropicClient, OpenAIClient, GoogleClient)
    - `tools/` — ShellTool, FileTool, SoulTool, TodoTool, ToolRegistry, BaseTool
    - `mcp/` — MCP server management
    - `voice/` — VoiceSession, WhisperSTT
  - `electron/lib/` — shared utilities: dataStore, memoryHelpers, windowRef, fileHelpers
- `src/` — Vue renderer (ES modules)
  - `src/stores/` — Pinia stores: chats, config, agents, mcp, tools, models, knowledge, news, obsidian, skills, voice
  - `src/composables/` — extracted logic from ChatsView:
    - `useSendMessage.js` — message dispatch, queue, stop, plan approval, compactContext
    - `useChunkHandler.js` — chunk routing, streaming state, collaboration flags
    - `useAgentCollaboration.js` — provider credentials, direct group fire
    - `useChatTree.js` — sidebar tree, drag-drop, rename, search, folders
    - `useMessageOps.js` — copy/delete/quote/resend
    - `useVoiceRecording.js` — voice call system
    - `useGridMode.js`, `useAttachments.js`, `useAvatarTooltip.js`
  - `src/components/chat/` — ChatWindow, ChatHeader, ChatGridPanel, ChatGridLayout, ChatMentionInput, MessageRenderer, ChatSettingsModal, NewChatModal, ContextInspectorModal, ChatTreeNodeView.js
  - `src/components/common/` — AppButton, ComboBox, ConfirmModal, CategoryModal, EmojiPicker
  - `src/components/agents/` — AgentCard, AgentWizard, AvatarPicker, AgentBodyViewer
  - `src/utils/` — mentions.js, tokenEstimate.js, pricing.js, ipcSerialize.js
  - `src/views/` — ChatsView, ConfigView, AgentsView, McpView, ToolsView, KnowledgeView, NotesView, SkillsView, DocsView, NewsView
- `vitest.config.js`, `tailwind.config.js`, `vite.config.js`, `postcss.config.js`, `package.json`

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

- All data stored in `%APPDATA%/clankai/data/` on Windows, `~/.config/clankai/data/` on Linux/macOS (configurable via `CLANKAI_DATA_PATH` in `.env`)
- Files: `config.json`, `agents.json`, `mcp-servers.json`, `tools.json`, `knowledge.json`
- Chats: `chats/index.json` (metadata) + `chats/{id}.json` (per-chat with messages)
- Souls: `souls/{agentId}/{type}.md`

All configuration lives in `config.json`. The `.env` file only stores `CLANKAI_DATA_PATH` (data directory override).

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
| System prompt | `systemPromptBuilder.js` → per-agent soul files + skills |
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

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **No hardcoded provider endpoints**: Never use `|| 'https://api.anthropic.com'`, `|| 'https://openrouter.ai/api'`, or any other provider URL as a fallback in source code. All endpoints must come from user configuration (`config.providers[]` entries). If a baseURL is missing at runtime, throw an error or return early — do not silently fall back to an official URL. Placeholder text in `<input placeholder="...">` UI fields is exempt (display only, not used for requests).

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

- After ANY correction from the user: append the lesson to the **Lessons Learned** section at the bottom of this file
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review the Lessons Learned section at session start

> **Why in this file?** Multiple terminals may be open simultaneously. File-based
> task tracking (`tasks/todo.md`, `tasks/lessons.md`) causes race conditions and
> stale reads across sessions. Lessons live here so every session picks them up
> automatically. Task tracking uses Claude Code's built-in tools instead (see below).

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

<!-- Append lessons here after corrections. Format: date, what went wrong, the rule to follow. -->
<!-- Example: -->
<!-- - **2026-02-25**: Forgot to debounce persist call in tight loop → Always use `debouncedPersistChat()` during streaming, never raw `persistChat()`. -->

- **2026-03-01**: Added a one-time migration block to `main.js` to move path keys from `.env` → `config.json`. Wrong approach — migration code in source is dead weight after first run, requires a restart to execute, and pollutes the codebase with logic that will never run again. **Rule: one-time data migrations must be done by directly editing the data files on disk (e.g. `config.json`), not by adding migration logic to source code.**

- **2026-03-02**: Group chat agent collaboration loop collected ALL @mentions from a agent's response and triggered all mentioned agents immediately. This caused a agent that was only *referenced* (e.g. "then we'll hand to @Reviewer") to respond in the same round as the agent that was *addressed*. **Rule: in the agent→agent collaboration loop (`triggerAgentCollaboration`), apply `resolveAddressees` per source message — the same AI-based disambiguation used in the user→agent path — so only the truly addressed agents respond in each round, not every mentioned name.**

- **2026-03-02**: Multiple agents in a group chat must never share a single message bubble. **Rule: `_applyChunk` in `chats.js` must NOT touch ANY chunk tagged with `agentId` (text, agent_start, agent_end, tool_call, tool_result). All group agent chunk processing — placeholder creation, text routing, streaming flag management — is owned exclusively by `ChatsView.handleChunk` via the `perChatStreamingMsgId` keying system.** The store only handles non-agent chunks (single agent / non-group path) and state flags (isThinking, contextMetrics). Violating this causes: (a) duplicate placeholders, (b) double content writes, (c) `streaming=false` race conditions that reroute text to the wrong agent's bubble.

- **2026-03-02**: `\b` (word boundary) in regex does NOT work for CJK (Chinese/Japanese/Korean) characters. CJK chars are non-`\w`, so `\b` between a CJK char and a space/punctuation (both non-`\w`) never fires. **Rule: always use `(?=\W|$)` instead of `\b` for name-boundary matching in `parseMentions`, `stripMentions`, and the `MessageRenderer` @mention highlighter.** This applies to any regex that must support non-Latin names.

- **2026-03-10**: Used `npx vite build` after every task to verify compilation. **Rule: NEVER run `npx vite build` (or any build command) after completing a task in this project. The user explicitly forbids it. Trust the code changes are correct; only run a build if the user explicitly asks.**

- **2026-03-16**: Delete buttons in sidebar and message bubbles were not working — clicking triggered the click handler but the ConfirmModal dialog never appeared. Root cause: The buttons were rendered inside a container with `opacity: 0` and `pointer-events: none` (used for hover effects), but without sufficient `z-index`. When opacity transitioned to 1 on hover, the click events were being intercepted by an overlapping element. **Rule: When using opacity/pointer-events for hover effects, always ensure buttons have explicit `z-index` AND the parent container has proper z-index stacking context. For sidebar action buttons use `z-index: 10-20`, for message action buttons use `z-index: 100`.**

- **2026-03-22**: In the group chat sequential flow, `agent_end` IPC events fire during `await nextTick()` between `runGroupAgents` and `triggerAgentCollaboration`. At that point `isInCollaborationLoop.value` is still `false`, so the `agent_end` handler sees an empty `runningAgentKeys`, sets `isRunning=false`, and the collaboration loop bails out immediately — the next mentioned agent never runs. **Root cause is deeper: `ipcMain.handle` invoke-reply and `event.sender.send` agent chunks travel on DIFFERENT Electron IPC channels with NO ordering guarantee. The invoke can resolve in the renderer BEFORE the last text chunks + agent_end have been delivered, so `msg.content` is incomplete when `triggerAgentCollaboration` scans for @mentions.** Rule: (1) After `runGroupAgents` resolves, always call `waitForAgentEnd()` which polls `perChatStreamingMsgId` until all agent keys are deleted (agent_end handler deletes them). (2) `triggerAgentCollaboration` must NOT check `!targetChat.isRunning` — use `collaborationCancelled` as the sole stop signal. (3) Re-assert `targetChat.isRunning = true` inside the collaboration loop before dispatching agents.

- **2026-03-22**: The multi-turn roleplay truncation in `agent_end` replaced `msg.segments` with `[{ type: 'text', content: trimmed }]`, destroying all non-text segments (tool_call, tool_result, agent_step, image, permission). This caused the entire todo list and tool output to vanish from the UI. **Rule: when truncating message content, iterate over existing segments — keep all non-text segments (tool, image, permission, etc.) and only truncate text segments to match the trimmed content length.**

- **2026-03-22**: Applied Chinese-to-English replacement too broadly without first separating functional multilingual content from replaceable text. **Rule: before replacing non-English text, classify occurrences into (1) functional/required multilingual data to keep (i18n dictionaries, language-sensitive parsing examples, CJK stopwords/regex, hallucination blocklists) and (2) non-functional comments or hardcoded UI copy that can be translated without logic changes.**

- **2026-03-22**: Replaced multilingual literals with hardcoded English/Unicode escapes in runtime logic and view templates (e.g., `\u65b0\u5efa\u5bf9\u8bdd`, inline labels in Config/Skills). **Rule: never hardcode translatable UI text or language-dependent title checks in views/stores; always source them from `src/i18n/index.js` via `t('...')` in components and shared i18n constants in stores.**

- **2026-03-24**: Chat logic bugs were fixed without a hard project rule to run the existing chat regression suite, so routing/provider/chunk regressions could slip back in later. **Rule: any change touching chat logic, group orchestration, chunk handling, or chat-side provider/model resolution must run the chat regression suite before completion: `npm test -- electron/ipc/__tests__/agentRuntimeUtils.test.js src/composables/__tests__/useChunkHandler.test.js src/composables/__tests__/useSendMessage.test.js electron/ipc/__tests__/agentDataNormalization.test.js`.**

- **2026-03-29**: `testUtilityModel()` in ConfigView used `form[provider]` (legacy flat structure like `form.openai`) to look up credentials, but the codebase migrated to `config.providers[]` array. Developer with old data never hit the bug; new users got "Missing required fields" every time. **Rule: when migrating data structures (e.g. flat config → array-based providers), (1) always ask the user whether backward compatibility is needed, (2) if yes, write a one-time data migration that converts old format → new format, then delete ALL old code paths — never leave both old and new paths coexisting silently, (3) if no, delete old code paths immediately. Dual code paths that "work with old data" are invisible landmines for new users. After any structural migration, grep the entire codebase for references to the old field names/patterns and remove or update them.**

- **2026-04-22**: `agent:doc-run` (AI Doc panel) handler hand-rolled its own provider resolution from `config.defaultProvider` and never set `customModel`, completely ignoring the selected agent's `providerId` / `modelId`. A user whose 文档大师 was configured for Qwen watched requests hit dashscope with model `deepseek-chat` (the hardcoded fallback in `OpenAIClient.resolveModel()`). **Rule: any new IPC handler that spawns an `AgentLoop` MUST (1) resolve provider/model via `_normalizeLoopConfig(loopConfig, agentId)` from `electron/ipc/agentRuntimeUtils.js` — never reimplement provider resolution, and (2) run `_validateLoopConfig(loopConfig)` so missing credentials surface as a clean error instead of a cryptic 404. The chat path already does this; every new path (doc edit, inline edit, utility model, task scheduler, IM bridge) must mirror it.**

- **2026-04-22**: `_applyReplacement` in `DocsView.vue` fell through to whole-file overwrite (`editorContent.value = newText`) when `content.indexOf(targetText) === -1`. This made stale selections (user typed after selecting, then hit Apply) silently destroy the document. **Rule: any find-and-replace operation that targets a SUBSTRING (not the whole file) must REFUSE when the find fails — return a failure signal to the caller, never silently fall back to whole-file replacement. Distinguish `isWholeFileEdit = !targetText || targetText === currentFullContent` from a substring edit; only the former is allowed to overwrite everything. Surface the refusal in the UI so the user knows to reselect.**

- **2026-04-22**: `sendAiDoc` auto-applied "the latest AI edit that isn't applied yet" after every send — scoped to the entire message list, not just the current turn. When the user clicked Revert on a prior turn's edit (`applied` flips back to `false`), the NEXT send would re-apply the reverted edit as a side effect. **Rule: when scanning for "the latest X that hasn't been Y" in a post-send hook, always scope the scan to `messages.slice(beforeTurnCount)` so only messages produced by the CURRENT turn are eligible. Reverting is a durable user intent that must not be undone by unrelated subsequent actions.**

- **2026-04-22**: Chats store agent references by ID (`chat.userAgentId`, `chat.systemAgentId`, `msg.userAgentId`). When the referenced agent gets deleted + recreated with a new UUID, callers that use `chat.userAgentId ? getAgentById(chat.userAgentId) : defaultUserAgent` break — the ternary only falls back when the ID is *falsy*, not when it resolves to null. Users see "no user agent" in old chats after a persona is deleted and recreated. **Rule: ID resolvers for chat/message references must use `getAgentById(id) || defaultAgent`, not `id ? getAgentById(id) : defaultAgent`. The former handles both empty ID and dangling reference; the latter silently breaks when the target is deleted. Applies to `ChatGridPanel.vue`, `ChatsView.vue`, `useVoiceRecording.js`, and any future site that resolves agent refs from stored data. Better yet: add `resolveChatUserAgent(chat)` / `resolveChatSystemAgent(chat)` to the agents store so the fallback is centralized.**

- **2026-04-22**: `preload.js::onEditChunk` called `ipcRenderer.removeAllListeners('agent:edit-chunk')` on every subscription, wiping every other subscriber of the same channel. The `edit-chunk` channel is shared by `agent:edit-text` (inline edit) and `agent:doc-run` (AI Doc panel) — either one subscribing would silently starve the other of chunks. **Rule: IPC subscription helpers in `preload.js` must use per-callback listeners: `const listener = (_, data) => cb(data); ipcRenderer.on(ch, listener); return () => ipcRenderer.removeListener(ch, listener)`. Never call `removeAllListeners` in a per-subscriber helper — that's a global hammer that breaks sibling features without any log trail.**

- **2026-04-22**: `agent:doc-run` built its system prompt from scratch (not via `systemPromptBuilder`) and forgot the LANGUAGE directive, so the AI replied in English even when the user's `config.language` was `zh`. **Rule: any custom-built system prompt for a feature IPC handler MUST include an explicit language directive sourced from `config.language` (pass `fullCfg.language` into the prompt template). LLMs do not reliably infer response language from the user's input language — especially when the user mixes English technical terms into Chinese prompts. Mirror what `systemPromptBuilder.js` does for chat agents, and distinguish task-level language (e.g. "translate to French" → output French in `<replacement>`) from the always-on UI language for explanations.**

- **2026-04-22**: For in-editor AI assistants (AI Doc panel), the agent could invoke `file_operation` with `write/edit/append` on the currently open file — bypassing the `<replacement>` tag flow that drives the Apply/Revert UI. The file got changed but no Revert button appeared, and there was no undo path. **Rule: (1) The system prompt must explicitly instruct the AI to prefer `<replacement>` tags for edits to the CURRENT file, reserving `file_operation` for reading or writing OTHER files. (2) If a tool-based write to the current file happens anyway, the handler must snapshot `activeFile.content` BEFORE calling the agent loop, detect post-run whether the tool touched the current file (see `_currentFileChangedByToolRun`), and attach a `toolEdit` metadata block to the latest AI message so the UI can render a separate Revert pill. The pre-edit snapshot is the contract — without it there's no recovery path.**

- **2026-04-22**: Editors that receive programmatic content updates (Vue `editorContent.value = newText`, `store.updateContent(...)`) do NOT enter the native textarea / contenteditable undo stack. Ctrl+Z after an AI edit undoes the last *manually typed* character instead of the AI's change. **Rule: for editor components that accept programmatic writes, maintain a separate AI-edit history stack of `{ preContent, postContent, source, msgId }` entries, pushed on every AI-driven change. Intercept Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z at `document.addEventListener('keydown', ..., true)` (capture phase) but ONLY `preventDefault + stopPropagation` when `currentContent === top.postContent`. Otherwise pass through to native undo so user keystrokes are undone first. Clear both undo and redo stacks on file switch. This avoids fighting the browser's native stack for text the user typed directly.**

- **2026-04-22**: `ToolRegistry.loadForAgents(enabledAgents)` always registered `update_soul_memory`, `read_soul_memory`, `fetch_newsfeed`, `knowledge_manage`, `web_fetch`, `todo_manager`, `execute_shell`, `file_operation`. A narrow-scope feature (doc editing) had no way to opt out, so a doc-edit AI could mutate the user's long-term soul memory. **Rule: shared infrastructure that auto-registers "always-on" capabilities must expose an opt-out. Added `excludedToolNames: string[]` parameter to `loadForAgents` (honored after all always-on registrations run). Any future narrow-scope AgentLoop invocation (doc edit, utility-model call, inline edit, task one-shot, memory extractor) should pass an explicit exclude list for tools that don't belong in that context — principle of least privilege applies to LLM tools too.**

- **2026-04-22**: `src/components/agents/__tests__/AgentBodyViewer.test.js` mocked `useModelsStore` with only `{ models, loadModels, getModelLabel }`, but the component had gained calls to `modelsStore.getModelsForProvider(...)` and `modelsStore.isLoading(...)` → `TypeError: ... is not a function` at runtime. **Rule: when adding methods to a Pinia store consumed by components with tests, grep `src/**/__tests__/**/*.test.js` for `vi.mock.*<store-path>` and update those factories to include the new methods. Stale store mocks compile fine but crash at first use; CI catches them but developers running only the tests they touched will miss them.**

- **2026-04-22**: `tests/electron/agent/memoryDateLabel.test.js` had been failing at suite-load time for weeks (`Cannot find module '../../../electron/agent/core/MemoryFlush'`) because the `6d3e1a0` refactor deleted `MemoryFlush.js` and removed the today/yesterday session-log feature from `systemPromptBuilder`. The test's "4 tests" counter became "0 tests", which is easy to miss in the summary. **Rule: when a refactor removes a module, run `git log --diff-filter=D --summary | grep <ModuleName>` and `grep -rn '<ModuleName>' tests/ src/**/__tests__/` before committing. Delete orphan tests in the SAME commit as the module removal. Also drop stale JSDoc that references removed parameter fields (e.g. `memoryContext.todayLogMd`) — out-of-date docs mislead future readers into thinking the feature still exists.**

- **2026-04-22** (persistence policy, not a bug): The user does NOT want me to use Claude Code's auto-memory system at `~/.claude/projects/<slug>/memory/`. That path is private to the user's local Claude Code install and has nothing to do with the ClankAI product or its end users; writing there creates a split-brain between repo-tracked context (visible to collaborators, portable across machines) and machine-local notes (opaque, per-device, easy to forget). **Rule: ALL durable context — rules, lessons learned, project facts, user preferences about how to collaborate — goes into `CLAUDE.md` in the repo root. Do not write to `~/.claude/projects/<slug>/memory/`, do not create `MEMORY.md` there, do not seed `user.md` / `feedback.md` / `project.md` / `reference.md` files in that directory. If something is worth remembering across sessions, it goes in CLAUDE.md; if it's not worth putting in CLAUDE.md, it's not worth persisting at all.**

- **2026-04-22**: Vitest 4.x changed module-loading behavior. The previously-working pattern `const { describe, it } = require('vitest')` now throws `Vitest cannot be imported in a CommonJS module using require()`. More subtly: after switching to ESM `import`, `vi.mock(...)` does NOT reliably intercept `require()` calls made from inside a CJS production module — e.g. mocking `'../../lib/dataStore'` has no effect if `agentRuntimeUtils.js` internally does `const ds = require('../lib/dataStore')`. **Rule: (1) Under vitest 4.x, test files must be ESM (`import { describe, it, expect, vi } from 'vitest'`). (2) When the production code under test is CJS and internally `require()`s a dependency you need to fake, DO NOT rely on `vi.mock` — monkey-patch the exported functions on the CJS singleton in `beforeAll` and restore in `afterAll`. Pattern: `const ds = require('../../lib/dataStore'); const origPaths = ds.paths; beforeAll(() => { ds.paths = () => ({ ...fake }) }); afterAll(() => { ds.paths = origPaths })`. This works because `module.exports = {...}` returns the same object to every caller, so replacing methods on it is globally visible. The sibling test `electron/lib/__tests__/notifier.test.js` appears to use `vi.mock` successfully, but only because its tests never exercise the code path that touches the mocked dependency — absence of failure ≠ presence of working mock.**

