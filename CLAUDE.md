# CLAUDE.md — ClankAI Project Guide

## Project Overview

ClankAI is a multi-LLM desktop chat application built with **Electron + Vue 3 + Vite**. It supports Anthropic (Claude), OpenRouter, and OpenAI-compatible backends. Features include agent management, MCP server integration, HTTP tools, knowledge base (RAG via Pinecone), skills, and an agentic tool-use loop.

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

- Main process exposes IPC handlers via `ipcMain.handle('channel', ...)` in `electron/main.js`
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

### Agent Model Architecture — Global Default vs Per-Chat Override

**This logic is intentional and must not be changed without explicit developer confirmation.**

#### Two separate layers

| Layer | Storage location | Scope | Write path |
|-------|-----------------|-------|------------|
| **Global default** | `agents.json` → `agent.providerId` / `agent.modelId` | All chats that use this agent | Agents page → `AgentWizard.vue` → `agentsStore.saveAgent()` |
| **Per-chat override** | `chats/{id}.json` → `chat.agentModelOverrides[agentId]` = `{ provider, model }` | This chat only | Chat header agent modal → `ChatHeader.vue` → `chatsStore.setChatAgentModelOverride()` |

#### Priority at runtime (both desktop and IM bridge)

```
chat.agentModelOverrides[agentId]   ← highest priority (this chat only)
  → agent.providerId / agent.modelId ← agent global default
    → config.defaultProvider             ← global fallback
```

#### Key invariants — never break these

1. **`AgentWizard.vue` is the only place that writes `agent.providerId` / `agent.modelId`** to `agents.json`. The chat agent modal (`ChatHeader.vue`) must never call `agentsStore.saveAgent()` with model fields.

2. **`setChatAgentModelOverride(chatId, agentId, providerId, modelId)` in `chats.js`** is the only path for per-chat overrides. It writes `chat.agentModelOverrides[agentId] = { provider, model }`. Passing `null, null` clears the override and restores the agent default.

3. **Never write a partial override** (`{ provider: x, model: null }`). The `ChatHeader` modal uses a local `draftOverrideProvider` ref to hold the in-flight provider selection, and only calls `setChatAgentModelOverride` once both provider **and** model are confirmed. See `ChatHeader.vue → openSysAgentConfig / draftOverrideProvider`.

4. **Group chat: each agent has its own independent override.** `buildAgentRuns()` in `ChatsView.vue` iterates each `pid` and reads `targetChat.agentModelOverrides?.[pid]` separately, producing an independent `config` per agent.

5. **Overrides are per-chat, never copied.** `createChatFromHistory()` in `chats.js` intentionally sets `agentModelOverrides: {}` — overrides must not propagate to new chats.

6. **Display must reflect the active override.** `activeChatModel` computed in `ChatsView.vue` and `getAgentProviderLabel()` both read `agentModelOverrides` first, before falling back to `agent.modelId`. Do not simplify these to read only the agent global fields.

### Data Storage

- All data stored in `~/.clankAI/` (configurable via `CLANKAI_DATA_PATH`)
- Files: `config.json`, `agents.json`, `mcp-servers.json`, `tools.json`, `knowledge.json`
- Chats: `chats/index.json` (metadata) + `chats/{id}.json` (per-chat with messages)
- Souls: `souls/{agentId}/{type}.md`

All configuration lives in `config.json`. There is no `.env` file.

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
| Knowledge (RAG) | Independent Pinecone query per agent |
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

- **Framework**: Vitest + happy-dom. Run: `npm test` or `npm run test:watch`
- **83 tests** across 4 files in `__tests__/` directories
- `useChunkHandler.test.js` — chunk routing, agent lifecycle, segment preservation
- `useSendMessage.test.js` — queue management, IPC dispatch, stop, plan approval
- `agentDataNormalization.test.js` — JSON format normalization + chunk accumulation (imports real `dataNormalizers.js` + `chunkAccumulator.js`)
- `agentRuntimeUtils.test.js` — provider/model normalization, loop-config validation, sequential chat dispatch heuristics
- `ipcSerialize.test.js` — Vue proxy → plain object serialization
- **Mandatory chat regression rule:** Any change that touches chat logic, chat orchestration, agent routing/collaboration, message streaming/chunk handling, or chat model/provider resolution MUST run the relevant regression tests before the task is considered done. At minimum run: `npm test -- electron/ipc/__tests__/agentRuntimeUtils.test.js src/composables/__tests__/useChunkHandler.test.js src/composables/__tests__/useSendMessage.test.js electron/ipc/__tests__/agentDataNormalization.test.js`

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
- WSL2 compatibility: fontconfig for emoji, path handling in preload
- Chat persistence is debounced (300ms) — don't call `persistChat` in tight loops
- **Language policy:** In code files, configuration files, and source code comments, use English only. Chinese is not allowed.
- **Restart notification:** When any change touches files that require an app restart to take effect (anything under `electron/` — `main.js`, `preload.js`, `agent/`, etc.), end your message to the user with a **red-colored** notice: <span style="color:#EF4444;">**⟳ This change requires restarting the app to take effect.**</span>

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **No hardcoded provider endpoints**: Never use `|| 'https://api.anthropic.com'`, `|| 'https://openrouter.ai/api'`, or any other provider URL as a fallback in source code. All endpoints must come from user configuration (`config.anthropic.baseURL`, `config.openrouter.baseURL`, `config.openai.baseURL`). If a baseURL is missing at runtime, throw an error or return early — do not silently fall back to an official URL. Placeholder text in `<input placeholder="...">` UI fields is exempt (display only, not used for requests).

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

