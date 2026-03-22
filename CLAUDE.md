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

- `electron/` — Main process (CommonJS): `main.js`, `preload.js`, `logger.js`
  - `electron/agent/` — Agent loop: `agentLoop.js`, `core/` (LLM clients), `managers/`, `mcp/`, `tools/`
- `src/` — Vue renderer (ES modules)
  - `src/main.js`, `src/App.vue`, `src/style.css`, `src/router/index.js`
  - `src/services/storage.js` — storage abstraction (Electron IPC / localStorage)
  - `src/stores/` — `chats.js`, `config.js`, `agents.js`, `mcp.js`, `tools.js`, `models.js`, `knowledge.js`, `news.js`, `obsidian.js`, `skills.js`, `voice.js`
  - `src/components/layout/` — Sidebar, TitleBar
  - `src/components/common/` — AppButton, ComboBox, ConfirmModal, CategoryModal, EmojiPicker
  - `src/components/chat/` — MessageRenderer, RichTextEditor, BabylonViewer
  - `src/components/agents/` — AgentCard, AgentWizard, AvatarPicker, SoulViewer
  - `src/views/` — ChatsView, ConfigView, AgentsView, McpView, ToolsView, KnowledgeView, NotesView, SkillsView, DocsView, NewsView
  - `src/utils/mentions.js`
- `tailwind.config.js`, `vite.config.js`, `postcss.config.js`, `package.json`

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

#### Files involved

- `src/components/agents/AgentWizard.vue` — global model edit (Agents page)
- `src/components/chat/ChatHeader.vue` — per-chat override modal (`draftOverrideProvider`, `setChatModelOverride`)
- `src/stores/chats.js:setChatAgentModelOverride` — write per-chat override
- `src/views/ChatsView.vue:buildAgentRuns` — group chat, per-agent config build (reads override per pid)
- `src/views/ChatsView.vue:sendMessage` (single path, ~line 5152) — single chat config build (reads override)
- `src/views/ChatsView.vue:activeChatModel` — display: override → agent global → fallback
- `src/views/ChatsView.vue:getAgentProviderLabel` — mention popup display, shows override when active

### Data Storage

- All data stored in `~/.clankAI/` (configurable via `CLANKAI_DATA_PATH`)
- Files: `config.json`, `agents.json`, `mcp-servers.json`, `tools.json`, `knowledge.json`
- Chats: `chats/index.json` (metadata) + `chats/{id}.json` (per-chat with messages)
- Souls: `souls/{agentId}/{type}.md`

### `.env` vs `config.json` — What Lives Where

- **`.env`** (at `DATA_DIR/.env`) stores only **`CLANKAI_DATA_PATH`** — the data directory override. It must live outside `config.json` because it determines where `config.json` is.
- **`config.json`** stores everything else, including the three user-configured paths:
  - `skillsPath` — directory of skill folders (default: `~/.claude/skills`)
  - `DoCPath` — documents / vault folder path
  - `artifactPath` — directory where AI artifacts are written during chats
- These paths are read/written via the `store:get-env-paths` / `store:save-env-path` IPC channels (named for historical reasons), but they no longer touch `.env`.
- The renderer accesses them through `configStore.config.skillsPath` etc., populated by `loadEnvPaths()` in `src/stores/config.js`.

## Multi-Agent Collaboration Architecture — Iron Laws

**These rules are non-negotiable. Any change that violates them MUST be confirmed by the user before proceeding. Do not refactor, simplify, or "clean up" this system without explicit sign-off.**

### How the system works

#### 1. Startup flow (`sendMessage` → group path)

1. `parseMentions` detects @mentions → `resolveAddressees` (utility LLM) disambiguates who is *addressed* vs. merely *referenced* (for 2+ mentions)
2. `dispatchGroupTasks` (utility LLM) returns `executionMode: "concurrent" | "sequential"` + per-agent `assignedTask` + `dependsOn[]`
3. `buildAgentRuns(respondingIds)` constructs a fully isolated `agentRun` object per agent (see isolation rules below)
4. `isInCollaborationLoop = true` is set **before** `runGroupAgents` — NOT after
5. `firstRoundRuns` = sequential ? filter out agents with `dependsOn` : all
6. `runGroupAgents()` → main.js `Promise.all` — all first-round agents run **concurrently**
7. `waitForAgentEnd(chatId, agentIds)` — polls until all `agent_end` IPC events are processed
8. `triggerAgentCollaboration(iterationCount=0)` starts the collaboration loop

#### 2. IPC ordering — the critical constraint

`ipcMain.handle` (invoke reply) and `event.sender.send` (chunk events: text, tool_call, agent_end) travel on **different Electron IPC channels with NO ordering guarantee**. The invoke reply can arrive in the renderer **before** the last text chunks and `agent_end` have been processed. This means `msg.content` may be incomplete when `triggerAgentCollaboration` scans for @mentions.

**Invariant: always call `waitForAgentEnd(chatId, agentIds)` after every `runGroupAgents()` call — in both `sendMessage` and inside the collaboration loop — before scanning messages for @mentions.** Removing this call silently breaks the entire collaboration chain.

#### 3. Collaboration loop (`triggerAgentCollaboration`)

- Scans only `targetChat.messages.slice(prevMessagesLength)` — only messages from the current round
- Uses `parseMentions` + `resolveAddressees` per message to find the next responders
- **iterationCount === 0** (post-concurrent first round): all mentioned agents are eligible — they haven't seen each other yet
- **iterationCount > 0** (sequential rounds): skips agents who already replied after the @mention
- Each round runs agents **sequentially** (one `await runGroupAgents` + `waitForAgentEnd` per agent)
- Recurses: `triggerAgentCollaboration(iterationCount + 1, nextLength)`
- Termination: `nextRespondingSet.size === 0` (no @mentions) OR `collaborationCancelled` OR `iterationCount >= MAX_ITERATIONS`

#### 4. Lifecycle flags — exact semantics

| Flag | Set to `true` | Set to `false` | Purpose |
|---|---|---|---|
| `isInCollaborationLoop` | Before `runGroupAgents` in `sendMessage` group path; entering `triggerAgentCollaboration` | `sendMessage` finally block; all exit paths of `triggerAgentCollaboration` | Prevents `agent_end` handler from prematurely clearing `isRunning` |
| `collaborationCancelled` | `stopAgent()` | Top of `sendMessage` | **Only** valid user-stop signal for the collaboration loop |
| `targetChat.isRunning` | `sendMessage` start; re-asserted inside collaboration loop before each dispatch | `sendMessage` finally block; `stopAgent` | UI running indicator |
| `runningAgentKeys` | `runningAgentKeys.add(chatId:agentId)` before each `runGroupAgents` | `agent_end` handler | Tracks which agents are actively streaming |

**NEVER check `!targetChat.isRunning` as a stop condition inside `triggerAgentCollaboration`.** `isRunning` can be cleared by `agent_end` race conditions. `collaborationCancelled` is the sole stop signal.

#### 5. Per-agent isolation — invariants

Every `agentRun` object produced by `buildAgentRuns` must be fully isolated and deep-cloned. The following must NEVER be shared between agents in the same run:

| Resource | How isolated |
|---|---|
| Provider credentials + model | `applyProviderCredsToConfig` on a per-agent shallow copy; `customModel = agent.modelId` |
| System prompt | `agent.prompt` → `agentPrompts.systemAgentPrompt` |
| Skills | `filterByRequired(enabledSkillObjects, agent.requiredSkillIds)` |
| MCP servers | `filterByRequired(mcpStore.servers, agent.requiredMcpServerIds)` |
| HTTP tools | `filterByRequired(toolsStore.tools, agent.requiredToolIds)` |
| Knowledge (RAG) | `buildAgentKnowledgeConfig(agent)` → independent Pinecone query per agent |
| Conversation view | Other agents' messages prefixed with `[AgentName]: ` so each agent knows its own voice |
| AgentLoop instance | `new AgentLoop(loopConfig)` per agent, keyed `chatId:agentId` in `activeLoops` |

#### 6. Roleplay truncation — segment preservation

In `agent_end` handler, the multi-turn roleplay truncation (cutting content after the first @OtherAgent mention) **must preserve non-text segments** (tool_call, tool_result, agent_step, image, permission). Only text segments may be truncated. **Never replace `msg.segments` with `[{ type: 'text', content: trimmed }]`** — this destroys all tool output visible in the UI.

#### 7. No-break checklist

Before modifying any of the following, confirm with the user:
- `waitForAgentEnd` — removing or bypassing breaks @mention detection
- `isInCollaborationLoop` pre-set before `runGroupAgents` — removing causes premature `isRunning=false`
- `collaborationCancelled` as the sole stop guard in the loop — adding `isRunning` checks reintroduces the race
- `buildAgentRuns` isolation logic — sharing config between agents causes identity confusion and credential leaks
- `agent_end` segment handling — replacing segments wholesale destroys tool output

---

## UI/UX Design System

### Color Palette

| Token               | Value                         | Usage                             |
|----------------------|-------------------------------|-----------------------------------|
| `--primary`          | `#1A1A1A`                     | Primary text, dark surfaces       |
| `--primary-hover`    | `#333333`                     | Hover state for primary           |
| `--accent`           | `#007AFF`                     | Links, accent highlights          |
| `--accent-hover`     | `#0056CC`                     | Accent hover state                |
| `--accent-light`     | `rgba(0, 122, 255, 0.08)`    | Inline code background            |
| `--bg-main`          | `#F2F2F7`                     | App background (light gray)       |
| `--bg-card`          | `#FFFFFF`                     | Card/panel surfaces               |
| `--bg-sidebar`       | `#FFFFFF`                     | Sidebar background                |
| `--bg-hover`         | `#F5F5F5`                     | Hover state backgrounds           |
| `--text-primary`     | `#1A1A1A`                     | Primary body text                 |
| `--text-secondary`   | `#6B7280`                     | Secondary/supporting text         |
| `--text-muted`       | `#9CA3AF`                     | Captions, hints, placeholders     |
| `--border`           | `#E5E5EA`                     | Default borders                   |
| `--border-light`     | `#F0F0F0`                     | Subtle dividers                   |
| Danger               | `#EF4444` / `#DC2626`         | Delete actions, error states      |
| Danger ghost         | `rgba(255,59,48,0.08)` text `#FF3B30` | Soft danger buttons       |

### Signature Black Gradient

The project's distinctive visual identity is a **dark gradient** used across all primary interactive elements:

```css
/* Primary gradient (default state) */
background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);

/* Primary gradient (hover state) */
background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
```

This gradient appears on:
- **AppButton** (`variant="primary"`) — all primary action buttons
- **Back buttons** — all "back" / "return" navigation buttons
- **ComboBox chips** — selected value chips (single and multi-select)
- **ComboBox dropdown hover/selected** — option hover and selected states
- **Sidebar active nav item** — currently selected navigation link
- **ConfirmModal** primary action button
- **Empty state icons** — large icon containers on empty pages
- **Section icons** — agent type section headers
- **Dark dialogs/dropdowns** — floating panels (header icons, hover states, search focus)

Text on gradient surfaces is always `#FFFFFF`. Secondary text on gradients uses `rgba(255,255,255,0.6)`.

### Typography

| Token               | Size        | Usage                        |
|----------------------|-------------|------------------------------|
| `--fs-page-title`    | `1.5rem`    | Page headings                |
| `--fs-section`       | `1.25rem`   | Section headers              |
| `--fs-subtitle`      | `1.0625rem` | Card titles, strong labels   |
| `--fs-body`          | `0.9375rem` | Primary body text            |
| `--fs-secondary`     | `0.875rem`  | Secondary / supporting text  |
| `--fs-caption`       | `0.8125rem` | Captions, badges, hints      |
| `--fs-small`         | `0.75rem`   | Fine print                   |

- **Base font size:** `html { font-size: 125%; }` (20px base, all rem scales from this)
- **Body font:** `'Inter', 'Noto Sans', system-ui, -apple-system, sans-serif` + emoji fonts
- **Heading font:** `'Inter', 'Figtree', system-ui, -apple-system, sans-serif`
- **Monospace font:** `'JetBrains Mono', 'Fira Code', monospace`
- **Letter spacing:** Body `-0.01em`, Headings `-0.02em`
- **Font weight:** Body text `400-500`, Labels/titles `600-700`

### Border Radius Scale

| Token          | Value  |
|----------------|--------|
| `--radius-sm`  | `8px`  |
| `--radius-md`  | `12px` |
| `--radius-lg`  | `16px` |
| `--radius-xl`  | `20px` |
| `--radius-full`| `9999px` |

### Shadow Scale

| Name          | Value                                                  | Usage            |
|---------------|--------------------------------------------------------|------------------|
| `card`        | `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)` | Card resting |
| `card-hover`  | `0 4px 12px rgba(0,0,0,0.08)`                          | Card hover       |
| `card-lg`     | `0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)` | Elevated panels |
| Gradient shadow | `0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)` | On dark gradient elements |
| Dropdown      | `0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06)` | Floating menus |
| Modal         | `0 25px 60px rgba(0,0,0,0.18)`                         | Modal dialogs    |

### Component Patterns

#### AppButton (`src/components/common/AppButton.vue`)
- Variants: `primary` (black gradient), `secondary` (gray), `ghost` (transparent), `danger` (red), `danger-ghost` (soft red)
- Sizes: `default`, `compact`, `save`, `modal`
- Supports `loading` state with spinner, `disabled` state with 0.5 opacity
- Always uses `font-weight: 600`, Inter font

#### ComboBox (`src/components/common/ComboBox.vue`)
- Supports single-select (chip display) and multi-select (chip bar) modes
- Selected values shown as black gradient chips with white text
- Dropdown options gain black gradient on hover/selected
- Focus ring: `border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06)`
- Chip remove buttons: semi-transparent white `rgba(255,255,255,0.15)` background

#### ConfirmModal (`src/components/common/ConfirmModal.vue`)
- Teleported to `<body>`, backdrop with `blur(6px)`
- Scale+fade entry animation (200ms ease-out)
- Footer: gray background `#F9F9F9` with border-top
- `confirmClass="danger"` for destructive actions, `"primary"` for non-destructive

#### Modals (General Rules)
- **Modal-first rule**: All dialogs, pickers, confirmations, and configuration panels MUST be implemented as proper centered modals. **Never use inline popovers, anchored dropdowns, or absolutely-positioned panels attached to trigger elements.** If UI needs to float over content, it is a modal.
- All modals are **true modals** — they do **NOT** close on backdrop click. **Never add `@click.self` or any click handler to the backdrop div.** Users must explicitly dismiss via Cancel, X button, or Escape key. No exceptions — this applies to every dialog including cost overview, settings panels, pickers, and confirmations.
- Use `<Teleport to="body">` with `position: fixed` + `z-index: 200`
- Dark themed: `#0F0F0F` background, `#2A2A2A` borders, white text
- Header: icon in gradient container + title + close button
- Footer: `#0A0A0A` background with border-top, Cancel (dark gray) + primary action (black gradient)
- Inputs: `#1A1A1A` background, `#2A2A2A` border, focus `#4B5563` border
- Teleported elements require an **unscoped** `<style>` block (scoped styles don't apply outside the component DOM)
- Entry animation: `scale(0.95) translateY(8px) → scale(1) translateY(0)` with opacity fade, 200ms ease-out

#### Sidebar (`src/components/layout/Sidebar.vue`)
- Collapsible (260px expanded, 64px collapsed) with smooth transition
- Active item: black gradient background with white text
- Inactive item: `#6B7280` text, hover `#F5F5F5` bg transitioning to `#1A1A1A` text
- Section labels: uppercase, `letter-spacing: 0.06em`, `#9CA3AF`
- Grouped sections: "AI Agent" (Chats, Skills, Knowledge, MCP, Tools, Agents), "Workspace" (Notes), "System" (Configuration)

#### Cards
- White background, `1px solid var(--border)`, `border-radius: var(--radius-lg)` (16px)
- Subtle shadow: `card` shadow from Tailwind config

#### Form Fields
- Text inputs: `border: 1px solid var(--border)`, `border-radius: var(--radius-sm)` (8px)
- Focus: `border-color: var(--text-primary)` with subtle box-shadow ring
- Mono inputs: `font-family: 'JetBrains Mono'` for API keys, paths, model IDs

#### Empty States
- Centered layout with large icon in 80x80 rounded-2xl black gradient container
- Title: `--fs-section`, weight 700
- Description: `--fs-body`, color `#9CA3AF`, line-height 1.6

#### Sidebar / Nav Item Action Buttons (Rename, Delete, etc.)

Nav hover icon buttons: transparent bg, no box-shadow/border on the action group. Icon color `rgba(26,26,26,0.4)` on light rows, `rgba(255,255,255,0.5)` on active/dark rows. Hover fills: `rgba(26,26,26,0.08)` light / `rgba(255,255,255,0.15)` dark. Danger hover: `rgba(239,68,68,0.10)` / `#EF4444` light; `rgba(255,59,48,0.25)` / `#FF6B6B` dark. Action group invisible until row hover (`opacity: 0` → `1`).

#### Left Nav Category Rows (Full-Row Hover Background)

Outer `nav-cat-wrap` div gets the dark gradient on hover/`:has(.active)` — **never the inner `<button>` alone**. Inner button: `background: transparent !important`. Count badge and action buttons are **flex siblings** of the button (not children) — so clicking actions doesn't trigger the nav button's click handler. Hide count badge on hover (opacity→0), show action buttons instead. Use CSS `:has(.nav-item.active)` to detect active state on the wrapper. Action icon buttons are always white-tinted (they only appear on the dark gradient bg).

#### Back Buttons

Back/return navigation buttons: black gradient (`linear-gradient(135deg,#0F0F0F,#1A1A1A,#374151)`) + white text, `font-weight:600`, chevron-left SVG icon. Hover: lighter stops (#1A1A1A → #2D2D2D → #4B5563). Examples: `ChatGridLayout` (grid→single), `SkillsView` (detail→catalog).

#### Page-Level Action Buttons (Standard)

All page-level action buttons (Refresh, Add, New, etc.) in view headers **must use `<AppButton size="compact">`**. Do NOT use custom `.action-btn` CSS classes — those are obsolete.

```vue
<!-- ✅ Correct -->
<AppButton size="compact" @click="refresh" :loading="isRefreshing">
  <svg style="width:14px;height:14px;" .../>
  Refresh
</AppButton>

<AppButton size="compact" @click="openAdd">
  <svg style="width:14px;height:14px;" .../>
  Add Item
</AppButton>

<!-- ❌ Wrong — do not use custom button classes -->
<button class="action-btn" @click="refresh">...</button>
```

**`compact` size spec** (defined in `AppButton.vue`):
- `padding: 0.375rem 0.875rem`
- `border-radius: var(--radius-sm)`
- `font-size: var(--fs-secondary)`
- SVG icons: `14px × 14px`
- Loading state: use `:loading` prop (built-in spinner), not custom `.btn-spinner`
- Disabled state: use `:disabled` prop (built-in 0.5 opacity)

Pages using this standard: ToolsView, McpView, AgentsView, KnowledgeView, SkillsView, NewsView.

**Exception — NotesView tree toolbar**: Uses raw `<button class="action-btn">` because that toolbar is inside the notes file tree sidebar, not a page header. This is acceptable for that specific dense/icon-only context.

#### Dark Dialogs / Dropdowns

Floating panels over dark/mixed content: `background:#0F0F0F`, `border:1px solid #2A2A2A`, `border-radius:16px`, heavy box-shadow. Header: `#FFFFFF` weight 700, icon in gradient container. Search: `#1A1A1A` bg, focus `#4B5563` border, placeholder `#6B7280`. List items: `#9CA3AF`, hover gets dark gradient + `#FFFFFF`. Use `<Teleport to="body">` + unscoped `<style>` + `z-index:9999` when escaping `overflow:hidden` containers. Entry: `scale(0.96) translateY(4px)→1/0` 150ms ease-out. Examples: swap-chat dropdown (`ChatGridPanel`), chat settings (`ChatHeader`).

### Animations & Transitions

- **Default transition:** `all 0.15s ease` (buttons, nav items, inputs)
- **Message enter:** `translateY(8px) → 0` + `opacity 0 → 1` over 200ms ease-out
- **Modal enter:** `scale(0.95) translateY(8px)` → `scale(1) translateY(0)` over 200ms
- **Sidebar collapse:** `width 0.2s ease, min-width 0.2s ease`
- **Busy indicator:** Bouncing dots with `busyBounce 1s ease-in-out infinite`
- **Streaming indicator:** Equalizer bars with `eqPulse 0.8s ease-in-out infinite alternate`
- Respects `prefers-reduced-motion: reduce`

### Scrollbar

- Thin minimal style: 6px width
- Track: transparent
- Thumb: `#D1D1D6`, hover `#A1A1AA`, active `#71717A`, fully rounded

### Chat Bubbles

- **User messages:** Black gradient background (`linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)`), all text forced to `#FFFFFF !important` via `.user-content` class
- **Assistant messages:** White/light card background with prose-clankai styling
- **Code blocks:** Dark background `#1C1C1E` with `#E5E5EA` text, 12px border-radius, 1px `#2C2C2E` border
- **Inline code:** `var(--accent-light)` background, `var(--accent)` text color

### Markdown Prose (`prose-clankai`)

- Line height: 1.65
- Links: `var(--accent)` with underline
- Blockquotes: 3px left border, muted italic text
- Tables: bordered cells, `#F9F9F9` header background
- Images: rounded `var(--radius-md)`

### Search Bars (Catalog Pattern)

Views like MCP, Tools use a consistent search bar:
- Search icon left-aligned inside the input wrapper
- Input with placeholder text, no visible border (integrated into header card)
- Clear button (X icon) appears when search has value

### Count Badges

- Small pill showing item count: `{N} tool(s)`, `{N} server(s)`, `{N} agent(s)`
- Typically styled as a subtle rounded badge near the page header

### Page Layout Pattern

All views follow a consistent structure:
1. **Header** — Title (h1, `--fs-page-title`), subtitle, action buttons in top-right
2. **Tab bar** (optional) — Horizontal button group for sub-sections
3. **Scrollable content** — Cards, grids, or lists in a padded container
4. **Save row** (config pages) — Bottom-aligned save button with status indicator

### Configuration Page Layout

ConfigView uses a **two-level navigation** pattern — do not flatten it back to a single tab bar:

- **Level 1 (top):** 2 primary tabs — `General` | `AI` — styled with bottom-border active indicator (not gradient)
- **Level 2 (left column, 176px):** vertical sub-nav per primary tab, same visual style as the main Sidebar `NavItem` (black gradient active, gray inactive)
- **Content area (right, flex-1):** max-width 860px (1000px on 4K), independently scrollable

**Tab → Sub-tab mapping:**

| Primary Tab | Sub-tabs |
|-------------|---------|
| General | Paths · Security · Email |
| AI | Models · Voice · Knowledge · Pricing |

**Sub-nav status dots:** each sub-nav item has a 7px right-aligned dot — green (`#10B981`) when the section has data configured, gray (`#D1D5DB`) when empty. Active item dot uses `#34D399` / `rgba(255,255,255,0.3)`.

**Content placement rules:**
- Filesystem paths (Data, Artifact, Skills) → General → Paths — each path in its own `config-card`
- Global model settings (Max Output Tokens) → AI → Models → **Global Model Settings** card (provider-agnostic settings go here)
- DeepSeek-specific limits (Max Output Tokens 8192 cap) → DeepSeek provider card → **Limits** section
- Pinecone/RAG → AI → Knowledge (label: "Knowledge", not "RAG" or "AI Knowledge")

#### Section Card Pattern

Each `config-card` starts with a `form-section-header`: `section-icon-sm` (28×28px black gradient square with white icon) + `form-section-title` (weight 700, `var(--fs-body)`) + optional `form-label-hint` (monospace caption for env var names or counts). Then the fields follow.

**Provider card internal sections** (each separated by `form-divider`):

| Section | Icon | Applies to |
|---------|------|------------|
| Credentials | lock | all providers |
| Models | box/package | Anthropic only (Sonnet/Opus/Haiku model IDs) |
| Available Models | box/package + inline Fetch button | OpenRouter, OpenAI, DeepSeek |
| Utility Model | sun/gear | all providers |
| Limits | list | DeepSeek (provider-specific hard limits) |
| Test | signal/pulse | all providers — always last |

**Rule:** Settings that are **provider-specific** (e.g. DeepSeek's 8192 token cap) go in a dedicated section inside that provider's card, **before** the Test section. Settings that apply to **all providers** (e.g. global max output tokens) go in the Global Model Settings card above the provider tab selector.

---

## Responsive Design System

ClankAI targets **1920×1080 (HD)** as the primary resolution and **2560px+ (4K)** as the secondary. Design all UI for HD first; 4K gets proportional scaling via the global font-size step.

### Breakpoints

| Name | `min-width` | `html font-size` | Description |
|------|-------------|------------------|-------------|
| base | (default) | `100%` = 16px | < 1920px — graceful fallback |
| `hd` | `1920px` | `112.5%` = 18px | 1080p — **primary target** |
| `4k` | `2560px` | `125%` = 20px | 4K / large display |

Tailwind custom screens `hd:` and `4k:` are registered. Use them instead of ad-hoc `@media` where possible.

### Font Scale Strategy — Breakpoint Steps (not `clamp()`)

`html { font-size }` steps at two breakpoints (100% base → 112.5% at 1920px → 125% at 2560px). All `rem` and `var(--fs-*)` values auto-scale with it — no per-component media queries needed for typography.

### Spacing Unit Rule — `rem` not `px`

**All spacing must use `rem`, not `px`.** This is mandatory so that padding, gaps, border-radius, and element sizes scale automatically with the font-size breakpoints.

| Situation | Rule |
|-----------|------|
| `padding`, `gap`, `margin` | Always `rem` |
| `width`, `height` for UI elements (buttons, avatars, icons containers) | Always `rem` |
| `border-radius` | Use `var(--radius-*)` token or `rem` |
| `font-size` | Use `var(--fs-*)` token (never raw `px`) |
| `border: 1px solid` | Exception — `1px` stays `px` |
| SVG `width`/`height` attributes | Exception — SVG attributes stay `px` |
| Scrollbar `width: 6px` | Exception — stays `px` |
| Decorative stripes `height: 3px` | Exception — stays `px` |

Conversion: divide `px` by 16 (e.g. 8px = 0.5rem, 16px = 1rem, 24px = 1.5rem).

### Card Grid Columns

Card grids (MCP, Tools, Skills, Knowledge, Agents) use `min-width` breakpoints — never `max-width`: 2 cols base → 3 cols at 1920px → 4 cols at 2560px.

### Sidebar Behavior

- **Auto-collapse** when `window.innerWidth < 1920` (no user override set)
- **Manual toggle** locks the state (`userOverride` ref) — subsequent auto-resize respects the override
- Expanded: 200px · Collapsed: 64px · No drawer/overlay mode

### Config Form Width Cap

Config page inner content is capped to prevent fields from stretching uncomfortably wide on large screens:
- HD: `max-width: 860px; margin: 0 auto`
- 4K: `max-width: 1000px`

## Coding Guidelines

- Use `var(--token)` CSS custom properties for all colors, radii, and font sizes
- Prefer scoped `<style scoped>` in components; global styles only in `style.css`
- Keep Tailwind for layout utilities (`flex`, `gap`, `p-*`); use CSS variables for theming
- Always apply the black gradient for primary interactive elements — this is the visual signature
- All IPC calls are `async` (invoke/handle pattern)
- Never store sensitive keys in the renderer; they live in `.env` or `config.json` on disk
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

- **2026-03-01**: Added a one-time migration block to `main.js` to move path keys from `.env` → `config.json`. Wrong approach — migration code in source is dead weight after first run, requires a restart to execute, and pollutes the codebase with logic that will never run again. **Rule: one-time data migrations must be done by directly editing the data files on disk (e.g. `config.json`, `.env`), not by adding migration logic to source code.**

- **2026-03-02**: Group chat agent collaboration loop collected ALL @mentions from a agent's response and triggered all mentioned agents immediately. This caused a agent that was only *referenced* (e.g. "then we'll hand to @Reviewer") to respond in the same round as the agent that was *addressed*. **Rule: in the agent→agent collaboration loop (`triggerAgentCollaboration`), apply `resolveAddressees` per source message — the same AI-based disambiguation used in the user→agent path — so only the truly addressed agents respond in each round, not every mentioned name.**

- **2026-03-02**: Multiple agents in a group chat must never share a single message bubble. **Rule: `_applyChunk` in `chats.js` must NOT touch ANY chunk tagged with `agentId` (text, agent_start, agent_end, tool_call, tool_result). All group agent chunk processing — placeholder creation, text routing, streaming flag management — is owned exclusively by `ChatsView.handleChunk` via the `perChatStreamingMsgId` keying system.** The store only handles non-agent chunks (single agent / non-group path) and state flags (isThinking, contextMetrics). Violating this causes: (a) duplicate placeholders, (b) double content writes, (c) `streaming=false` race conditions that reroute text to the wrong agent's bubble.

- **2026-03-02**: `\b` (word boundary) in regex does NOT work for CJK (Chinese/Japanese/Korean) characters. CJK chars are non-`\w`, so `\b` between a CJK char and a space/punctuation (both non-`\w`) never fires. **Rule: always use `(?=\W|$)` instead of `\b` for name-boundary matching in `parseMentions`, `stripMentions`, and the `MessageRenderer` @mention highlighter.** This applies to any regex that must support non-Latin names.

- **2026-03-10**: Used `npx vite build` after every task to verify compilation. **Rule: NEVER run `npx vite build` (or any build command) after completing a task in this project. The user explicitly forbids it. Trust the code changes are correct; only run a build if the user explicitly asks.**

- **2026-03-16**: Delete buttons in sidebar and message bubbles were not working — clicking triggered the click handler but the ConfirmModal dialog never appeared. Root cause: The buttons were rendered inside a container with `opacity: 0` and `pointer-events: none` (used for hover effects), but without sufficient `z-index`. When opacity transitioned to 1 on hover, the click events were being intercepted by an overlapping element. **Rule: When using opacity/pointer-events for hover effects, always ensure buttons have explicit `z-index` AND the parent container has proper z-index stacking context. For sidebar action buttons use `z-index: 10-20`, for message action buttons use `z-index: 100`.**

- **2026-03-22**: In the group chat sequential flow, `agent_end` IPC events fire during `await nextTick()` between `runGroupAgents` and `triggerAgentCollaboration`. At that point `isInCollaborationLoop.value` is still `false`, so the `agent_end` handler sees an empty `runningAgentKeys`, sets `isRunning=false`, and the collaboration loop bails out immediately — the next mentioned agent never runs. **Root cause is deeper: `ipcMain.handle` invoke-reply and `event.sender.send` agent chunks travel on DIFFERENT Electron IPC channels with NO ordering guarantee. The invoke can resolve in the renderer BEFORE the last text chunks + agent_end have been delivered, so `msg.content` is incomplete when `triggerAgentCollaboration` scans for @mentions.** Rule: (1) After `runGroupAgents` resolves, always call `waitForAgentEnd()` which polls `perChatStreamingMsgId` until all agent keys are deleted (agent_end handler deletes them). (2) `triggerAgentCollaboration` must NOT check `!targetChat.isRunning` — use `collaborationCancelled` as the sole stop signal. (3) Re-assert `targetChat.isRunning = true` inside the collaboration loop before dispatching agents.

- **2026-03-22**: The multi-turn roleplay truncation in `agent_end` replaced `msg.segments` with `[{ type: 'text', content: trimmed }]`, destroying all non-text segments (tool_call, tool_result, agent_step, image, permission). This caused the entire todo list and tool output to vanish from the UI. **Rule: when truncating message content, iterate over existing segments — keep all non-text segments (tool, image, permission, etc.) and only truncate text segments to match the trimmed content length.**

- **2026-03-22**: Applied Chinese-to-English replacement too broadly without first separating functional multilingual content from replaceable text. **Rule: before replacing non-English text, classify occurrences into (1) functional/required multilingual data to keep (i18n dictionaries, language-sensitive parsing examples, CJK stopwords/regex, hallucination blocklists) and (2) non-functional comments or hardcoded UI copy that can be translated without logic changes.**

- **2026-03-22**: Replaced multilingual literals with hardcoded English/Unicode escapes in runtime logic and view templates (e.g., `\u65b0\u5efa\u5bf9\u8bdd`, inline labels in Config/Skills). **Rule: never hardcode translatable UI text or language-dependent title checks in views/stores; always source them from `src/i18n/index.js` via `t('...')` in components and shared i18n constants in stores.**

## App Icon

### Icon Design

ClankAI uses a custom **black-theme icon** — a metallic gold lightning bolt on a pure black background with a gold orbit ring. Designed to match the app's signature dark aesthetic.

- **Style:** Flat + glow, dark premium (Linear/Raycast-inspired)
- **Colors:** Pure black `#0a0a0a` background · Metallic gold bolt (#FFD700 → #FFA500) · Gold ring with shimmer
- **Shape:** Rounded square (rx=80), 512×512 canvas
- **Source:** `build/icons/icon.svg`

### Icon Files

```
public/
├── icon.svg          # Favicon source (Vite dev server)
└── icon.png          # Favicon PNG fallback

build/icons/
├── icon.svg          # Master SVG
├── icon.png          # Master PNG (1024x1024)
├── icon-16x.png      # 16×16
├── icon-32x.png      # 32×32
├── icon-48x.png      # 48×48
├── icon-64x.png      # 64×64
├── icon-128x.png     # 128×128
├── icon-256x.png     # 256×256
└── icon-512x.png     # 512×512
```

### Electron / Builder / Sidebar

- **BrowserWindow icon:** `path.join(__dirname, '../public/icon.png')` in `electron/main.js`
- **Electron Builder** (`package.json`): `appId: "com.clankai.app"`, `productName: "ClankAI"`, icon path `build/icons/icon.png` for win/mac/linux targets
- **Sidebar logo:** `<img src="/icon.png">`, 32px expanded / 28px collapsed, `border-radius:8px`/`6px`