# SparkAI — Architecture & Implementation Reference

> **Purpose**: Comprehensive reference for developers and AI assistants continuing work on this project.
> **Last updated**: 2026-02-24

---

## 1. Project Overview

**SparkAI** (package name: `sparkai`) is a **multi-LLM desktop chat application** built with **Electron + Vue 3**. It provides an agentic AI assistant powered by the Anthropic Claude API, with tool use, sub-agent delegation, background task management, file attachments, an Obsidian vault editor, a persona system, and a filesystem-based skills system.

**Key capabilities**:
- Streaming chat with Claude models (Sonnet, Opus, Haiku)
- Agentic tool loop — the AI can read/write files, execute shell commands, manage git repos, fetch web pages, analyze data
- Sub-agent delegation for parallel/focused subtasks
- Background task management for long-running operations
- Todo/task list planning for complex multi-step work
- File/image/folder attachments via drag-drop or picker
- Obsidian vault browsing and markdown editing
- Persona system (system + user persona prompts per chat)
- Skills system — filesystem-based markdown skill files that extend the system prompt
- Context window tracking with automatic compaction (Opus 4.6 beta API, local trim for other models)
- WSL2/WSLg-aware — native Windows file picker via PowerShell, path conversion, emoji font loading

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 31 |
| Frontend framework | Vue 3.4 (Composition API, `<script setup>`) |
| State management | Pinia |
| Router | vue-router 4 (hash history) |
| Build tool | Vite 5 |
| CSS | Tailwind CSS 3.4 + custom CSS variables |
| Markdown rendering | marked 12 + DOMPurify |
| Rich text editor | TipTap (vue-3 adapter + starter-kit + placeholder) |
| HTML→Markdown | Turndown |
| AI SDK | @anthropic-ai/sdk 0.39 |
| IDs | uuid v9 |
| Fonts | Google Fonts: Figtree (headings), Noto Sans (body), JetBrains Mono (code), Segoe UI Emoji (bundled for WSL2) |

---

## 3. Directory Structure

```
sparkai/
├── electron/                    # Electron main process (Node.js)
│   ├── main.js                  # App entry, BrowserWindow, ALL IPC handlers
│   ├── preload.js               # contextBridge → window.electronAPI
│   ├── logger.js                # File + console logger (daily rotation)
│   ├── fonts.conf               # Fontconfig for WSL2 emoji support
│   └── agent/                   # Agent loop subsystem
│       ├── agentLoop.js         # Main agentic loop (streaming, tool dispatch)
│       ├── core/
│       │   ├── AnthropicClient.js   # SDK wrapper, model resolution
│       │   └── ContextManager.js    # Token tracking, compaction logic
│       ├── managers/
│       │   ├── SubAgentManager.js   # Sub-agent spawning & dispatch
│       │   └── TaskManager.js       # Background task (child process) management
│       └── tools/
│           ├── BaseTool.js      # Abstract base class (name, schema, execute)
│           ├── ToolRegistry.js  # Lazy tool loading & dispatch
│           ├── FileTool.js      # file_operation: read/write/list/search/delete/mkdir
│           ├── ShellTool.js     # execute_shell: run commands via execFile
│           ├── GitTool.js       # git_operation: status/diff/log/commit/branch/etc.
│           ├── WebTool.js       # web_search: fetch URLs via curl
│           ├── DataTool.js      # data_analysis: CSV/JSON stats/filter/head
│           └── TodoTool.js      # todo_manager: in-memory task list
│
├── src/                         # Vue renderer process
│   ├── main.js                  # Vue app bootstrap (Pinia + Router)
│   ├── App.vue                  # Root layout: Sidebar + RouterView
│   ├── style.css                # Global styles, CSS variables, prose classes
│   ├── router/index.js          # Hash-based routes
│   ├── services/
│   │   └── storage.js           # Storage abstraction (Electron IPC or localStorage)
│   ├── stores/
│   │   ├── chats.js             # Chat list, messages, per-chat state
│   │   ├── config.js            # API config (keys, models, base URL)
│   │   ├── personas.js          # System/user persona CRUD
│   │   ├── skills.js            # Skill scanning & prompt loading
│   │   └── obsidian.js          # Obsidian vault state & file ops
│   ├── views/
│   │   ├── ChatsView.vue        # Main chat interface (message list, input, agent loop)
│   │   ├── ConfigView.vue       # API key, model selection, skills path
│   │   ├── PersonasView.vue     # Persona management
│   │   ├── SkillsView.vue       # Skill browser & file tree
│   │   └── ObsidianView.vue     # Obsidian vault file tree + markdown editor
│   └── components/
│       ├── chat/
│       │   ├── MessageRenderer.vue   # Per-message rendering (segments, tools, diffs, wave bars)
│       │   └── RichTextEditor.vue    # TipTap-based input editor
│       ├── layout/
│       │   ├── Sidebar.vue      # Left nav: Chats, Personas, Skills, Obsidian, Config
│       │   └── TitleBar.vue     # Window title bar
│       └── personas/
│           ├── PersonaCard.vue
│           ├── PersonaWizard.vue
│           ├── personaAvatars.js
│           └── personaIcons.js
│
├── index.html                   # Vite entry HTML (loads Google Fonts)
├── package.json                 # Dependencies & scripts
├── vite.config.js               # Vite config (Vue plugin, port 5173)
├── tailwind.config.js           # Tailwind theme extensions
├── postcss.config.js            # PostCSS (Tailwind + Autoprefixer)
└── logs/                        # Runtime logs (sparkai-YYYY-MM-DD.log)
```

---

## 4. Architecture

### 4.1 Process Model

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process  (electron/main.js)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │ Storage   │  │ File I/O │  │ AgentLoop                │  │
│  │ (JSON)    │  │ Obsidian │  │  ├─ AnthropicClient      │  │
│  │ ~/.sparkai│  │ Skills   │  │  ├─ ContextManager       │  │
│  │           │  │ Attach.  │  │  ├─ ToolRegistry         │  │
│  │           │  │          │  │  │   ├─ FileTool         │  │
│  │           │  │          │  │  │   ├─ ShellTool        │  │
│  │           │  │          │  │  │   ├─ GitTool          │  │
│  │           │  │          │  │  │   ├─ WebTool          │  │
│  │           │  │          │  │  │   ├─ DataTool         │  │
│  │           │  │          │  │  │   └─ TodoTool         │  │
│  │           │  │          │  │  ├─ SubAgentManager      │  │
│  │           │  │          │  │  └─ TaskManager          │  │
│  └──────────┘  └──────────┘  └──────────────────────────┘  │
│        ▲              ▲                ▲                     │
│        │   IPC (ipcMain.handle)        │                     │
│        └──────────┬────────────────────┘                     │
└───────────────────┼──────────────────────────────────────────┘
                    │ contextBridge (preload.js)
                    │ window.electronAPI.*
┌───────────────────┼──────────────────────────────────────────┐
│ Electron Renderer Process  (Vue App)                          │
│                    │                                          │
│  ┌────────────┐   │   ┌──────────────────────────────────┐  │
│  │ Pinia      │◄──┘   │ Views                            │  │
│  │ Stores     │        │  ChatsView  (main chat UI)      │  │
│  │  chats     │◄──────►│  ConfigView (settings)           │  │
│  │  config    │        │  PersonasView                    │  │
│  │  personas  │        │  SkillsView                     │  │
│  │  skills    │        │  ObsidianView                   │  │
│  │  obsidian  │        └──────────────────────────────────┘  │
│  └────────────┘                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Security Model

- `contextIsolation: true` — renderer has no direct Node access
- `nodeIntegration: false` — no `require()` in renderer
- All filesystem/shell access goes through IPC → main process
- `preload.js` exposes a controlled `window.electronAPI` surface via `contextBridge`
- Shell commands use `execFile` (not `exec`) to prevent shell injection — command and args are always separated
- Markdown rendering uses DOMPurify sanitization
- Links in rendered markdown open in external browser via `target="_blank" rel="noopener noreferrer"`

---

## 5. Data Flow: Chat Message Lifecycle

### 5.1 User Sends a Message

```
User types → inputText (ref)
     │
     ▼
sendMessage() in ChatsView.vue
     │
     ├─ 1. Add user message to chatsStore (persisted to ~/.sparkai/chats.json)
     ├─ 2. Add streaming assistant placeholder (streaming: true, streamingStartedAt: Date.now())
     ├─ 3. Build apiMessages from chat history (filter out streaming)
     ├─ 4. Resolve persona prompts (system + user)
     ├─ 5. Serialize config, skills, attachments
     │
     ▼
window.electronAPI.runAgent({chatId, messages, config, enabledSkills, currentAttachments, personaPrompts})
     │  IPC invoke
     ▼
ipcMain.handle('agent:run') in main.js
     │
     ├─ Creates new AgentLoop(config)
     ├─ Stores in activeLoops Map (chatId → loop)
     │
     ▼
AgentLoop.run()  in agentLoop.js
     │
     ├─ toolRegistry.loadForAgents(enabledAgents)
     ├─ buildSystemPrompt(agents, skills, personas)
     ├─ _buildConversationMessages(messages, attachments)
     │
     ▼
  ┌──────── AGENTIC LOOP (max 200 iterations) ────────┐
  │                                                     │
  │  1. Check context exhaustion (>90%)                │
  │  2. Apply compaction if needed                     │
  │  3. Stream API call → Anthropic SDK                │
  │  4. For each streaming event:                      │
  │     - text_delta → onChunk({type:'text'})          │
  │     - thinking_delta → onChunk({type:'thinking'})  │
  │     - tool_use → collect tool calls                │
  │  5. If stop_reason === 'tool_use':                 │
  │     - Execute each tool                            │
  │     - onChunk({type:'tool_call'})                  │
  │     - onChunk({type:'tool_result'})                │
  │     - Push tool results as user message            │
  │     - Continue loop                                │
  │  6. If stop_reason === 'end_turn': break           │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

### 5.2 Streaming Chunks Flow

```
AgentLoop  ──onChunk──►  ipcMain  ──event.sender.send──►  ipcRenderer.on('agent:chunk')
                                                                    │
                                                                    ▼
                                                          handleChunk() in ChatsView
                                                                    │
                         ┌──────────────────────────────────────────┤
                         │                                          │
                    chunk.type === 'text'                   chunk.type === 'tool_call'
                         │                                          │
                    Append to last text segment             Push new tool segment
                         │                                   (output: undefined = running)
                         ▼                                          │
                    flushSegments()                         chunk.type === 'tool_result'
                         │                                          │
                    msg.segments = [...segments]            Set tool segment output
                    msg.content = text join                          │
                    msg.streaming = true                    flushSegments()
                         │                                          │
                         └────────────────┬─────────────────────────┘
                                          │
                                          ▼
                              MessageRenderer.vue re-renders
                              (segments loop: text→markdown, tools→cards)
```

### 5.3 Message Object Structure

```javascript
// User message
{
  id: "uuid",
  role: "user",
  content: "Hello, can you help?",
  timestamp: 1708000000000,
  attachments: [                    // optional
    { id, name, type: "image"|"text"|"folder", path, size, preview, mediaType }
  ]
}

// Assistant message (while streaming)
{
  id: "uuid",
  role: "assistant",
  content: "partial text...",
  timestamp: 1708000000000,
  streaming: true,
  streamingStartedAt: 1708000000000,
  segments: [
    { type: "text", content: "Here's what I found..." },
    { type: "tool", name: "file_operation", input: {...}, output: undefined },  // running
    { type: "tool", name: "file_operation", input: {...}, output: "..." },      // done
    { type: "text", content: "Based on the file..." }
  ]
}

// Assistant message (final)
{
  id: "uuid",
  role: "assistant",
  content: "full text content",
  timestamp: 1708000000000,
  streaming: false,
  durationMs: 5432,
  segments: [...]
}
```

---

## 6. Key Subsystems

### 6.1 Agent Loop (`electron/agent/agentLoop.js`)

The core agentic loop that manages multi-turn conversations with Claude.

**Flow per iteration**:
1. Build request params (model, system prompt, messages, tools, thinking config)
2. Check context exhaustion — break if >90% used
3. Apply compaction if >75% used (Opus 4.6: beta API; others: local trim)
4. Stream the response, collecting text blocks and tool_use blocks
5. If `stop_reason === 'tool_use'`: execute each tool, push results, continue loop
6. If `stop_reason === 'end_turn'`: break

**Thinking configuration**:
- Opus 4.6: `thinking: { type: 'adaptive' }` (model decides when to think)
- Sonnet 4+: `thinking: { type: 'enabled', budget_tokens: 8192 }`
- Other models: no thinking

**System prompt assembly** (`buildSystemPrompt`):
1. Base identity ("You are SparkAI...")
2. Core tools description (todo_manager, dispatch_subagent, background_task)
3. Active agents list (from user toggles)
4. Active skills list (name + summary, not full content)
5. Guidelines for behavior
6. Persona prompts (system + user) if assigned

**Skill loading**: Skills are loaded lazily. The system prompt lists only skill names/summaries. When the AI needs a skill's full content, it calls the `load_skill` tool which returns the complete markdown from `this.skillPrompts` Map.

### 6.2 Tool System (`electron/agent/tools/`)

All tools extend `BaseTool` which requires `schema()` and `execute(input)` methods. The `definition()` method returns the Anthropic tool definition format.

**ToolRegistry** manages tool lifecycle:
- Maps agent IDs to tool classes (lazy loading)
- `loadForAgents()` instantiates tools for enabled agents
- `TodoTool` is always registered regardless of agent selection

| Agent ID | Tool Class | Tool Name | Purpose |
|---|---|---|---|
| (always) | TodoTool | `todo_manager` | Task planning & tracking |
| `code-executor` | ShellTool | `execute_shell` | Shell command execution |
| `file-manager` | FileTool | `file_operation` | File CRUD + search |
| `web-search` | WebTool | `web_search` | URL fetching |
| `git-agent` | GitTool | `git_operation` | Git operations |
| `data-analyst` | DataTool | `data_analysis` | CSV/JSON analysis |
| (built-in) | — | `dispatch_subagent` | Sub-agent delegation |
| (built-in) | — | `background_task` | Background process management |
| (built-in) | — | `load_skill` | Lazy skill content loading |

### 6.3 Context Management (`electron/agent/core/ContextManager.js`)

Tracks token usage from API response `usage` fields and triggers compaction when context grows large.

| Constant | Value | Purpose |
|---|---|---|
| `MAX_CONTEXT_TOKENS` | 200,000 | Claude context window size |
| `COMPACT_TRIGGER` | 150,000 | Trigger compaction at 75% |
| `LOCAL_TRIM_TARGET` | 100,000 | After local trim, aim for this |

**Compaction strategies**:
- **Opus 4.6**: Uses the beta compaction API (`compact-2026-01-12` beta header) with `context_management.edits`
- **Other models**: Local truncation — keeps first message + last 60% of messages, inserts a "[trimmed]" marker

### 6.4 Sub-Agent Manager (`electron/agent/managers/SubAgentManager.js`)

Spawns focused sub-agents with narrower system prompts and limited turns (max 10).

**Specializations**: `researcher`, `coder`, `analyst`, `reviewer` — each has a tailored system prompt.

Sub-agents share the parent's `AnthropicClient` and `ToolRegistry` but run their own independent message history.

### 6.5 Background Task Manager (`electron/agent/managers/TaskManager.js`)

Manages long-running child processes via `spawn`. Actions: `start`, `status`, `output`, `stop`, `list`. Tasks have a 5-minute timeout and output is truncated to 10KB.

---

## 7. Frontend Architecture

### 7.1 Routing

Hash-based routing (`createWebHashHistory`) with 5 routes:

| Path | View | Description |
|---|---|---|
| `/chats` | ChatsView | Main chat interface (default) |
| `/personas` | PersonasView | Persona management |
| `/skills` | SkillsView | Skill browser with file tree |
| `/obsidian` | ObsidianView | Obsidian vault editor |
| `/config` | ConfigView | API keys, models, paths |

### 7.2 Pinia Stores

**`chats`** — Chat list with full message history
- `chats: ref([])` — Array of chat objects
- `activeChatId: ref(null)` — Currently selected chat
- Per-chat runtime state: `isRunning`, `isThinking`, `contextMetrics`
- Per-chat persona assignments: `systemPersonaId`, `userPersonaId`
- Persistence: `~/.sparkai/chats.json` via IPC

**`config`** — Application configuration
- API key, base URL, model IDs (sonnet/opus/haiku), active model selector, skills path
- Persistence: `~/.sparkai/config.json` via IPC
- Defaults come from `.env.development` (main process) or `import.meta.env` (browser fallback)

**`personas`** — System and user personas
- Each persona: `{ id, type: 'system'|'user', name, prompt, isDefault, avatar, icon }`
- Per-chat assignment (override default) or global defaults
- Persistence: `~/.sparkai/personas.json` via IPC

**`skills`** — Filesystem-based skill definitions
- Scanned from `~/.claude/skills/` (or custom path)
- Each skill directory must contain `SKILL.md` (or any `.md` file)
- YAML frontmatter parsed for `name`, `description`
- Full prompt content loaded lazily via `loadSkillPrompts()`

**`obsidian`** — Obsidian vault state
- Vault path (stored in `.env.development` as `OBSIDIAN_VAULT_PATH`)
- File tree (recursive `.md` files)
- Active file content with dirty tracking

### 7.3 Storage Layer (`src/services/storage.js`)

Dual-mode abstraction:
- **Electron mode**: Proxies to `window.electronAPI.*` (IPC to main process → JSON files)
- **Browser mode**: Falls back to `localStorage` with `sparkai:*` keys

### 7.4 Key Components

**`MessageRenderer.vue`** — The most complex component. Renders a single message (user or assistant) with:
- User messages: plain text + attachment badges
- Assistant messages with a **segments loop**:
  - `text` segments → rendered as markdown (via `marked` + `DOMPurify`)
  - `tool` segments → specialized cards per tool type:
    - `file_operation` (write/append) → **diff viewer** with LCS-based diff algorithm, line numbers, color-coded add/remove/update markers
    - `background_task` → status card with stdout preview
    - `dispatch_subagent` → sub-agent card with specialization badge
    - Generic tools → collapsible input/output panels
  - `todo_manager` → **live task list panel** at the top (aggregated from all todo_manager segments)
- **File path detection**: Regex-based extraction of file paths from text, with interactive "Open" and "Show in Folder" buttons
- **Wave bar streaming indicator**: 5 animated bars with CSS `scaleY` oscillation + hue-rotate
- **Duration timer**: Live "cooking for Xs..." during streaming, "cooked for Xs" after completion
- Copy-to-clipboard buttons on all code/input/output blocks

**`ChatsView.vue`** — The main chat view. Handles:
- Chat list sidebar (create, rename, delete)
- Message list with auto-scroll (detects user scroll-up to pause)
- Input area with TipTap rich text editor or plain textarea
- File attachment via drag-drop + picker (WSL-aware PowerShell picker)
- Agent loop lifecycle: send → stream chunks → finalize
- Prompt queue (queues messages if agent is already running)
- Context metrics display (token usage bar)
- Per-chat persona selectors
- Compact context button

**`Sidebar.vue`** — Main navigation sidebar (dark theme, 270px fixed). Links to all 5 views.

---

## 8. IPC API Surface

All IPC communication goes through `window.electronAPI` (defined in `preload.js`).

### Storage
| Method | IPC Channel | Description |
|---|---|---|
| `getChats()` | `store:get-chats` | Load all chats |
| `saveChats(chats)` | `store:save-chats` | Persist all chats |
| `getConfig()` | `store:get-config` | Load config (merged with defaults) |
| `saveConfig(config)` | `store:save-config` | Save config |
| `getPersonas()` | `store:get-personas` | Load personas |
| `savePersonas(personas)` | `store:save-personas` | Save personas |

### Agent Loop
| Method | IPC Channel | Description |
|---|---|---|
| `runAgent(params)` | `agent:run` | Start agent loop for a chat |
| `stopAgent(chatId)` | `agent:stop` | Stop agent loop |
| `compactContext(chatId)` | `agent:compact` | Request manual compaction |
| `compactContextStandalone(params)` | `agent:compact-standalone` | One-shot compaction |
| `getContextSnapshot(chatId)` | `agent:get-context` | Get context inspector data |
| `onAgentChunk(callback)` | `agent:chunk` | Listen for streaming chunks |

### File Attachments
| Method | IPC Channel | Description |
|---|---|---|
| `pickFiles()` | `files:pick` | Open file/folder picker |
| `readFileForAttachment(path)` | `files:read-for-attachment` | Read file for attachment |
| `resolveDropPaths(paths)` | `files:resolve-drop-paths` | Resolve drag-drop paths |
| `onFileDropped(callback)` | `file-dropped` | Listen for navigation-intercepted file drops |

### Shell
| Method | IPC Channel | Description |
|---|---|---|
| `execShell(cmd, args)` | `shell:exec` | Execute shell command |
| `openFile(path)` | `shell:open-file` | Open file in default app |
| `showInFolder(path)` | `shell:show-in-folder` | Reveal in file explorer |

### Skills
| Method | IPC Channel | Description |
|---|---|---|
| `skills.scanDir(path)` | `skills:scan-dir` | Scan skills directory |
| `skills.readTree(path)` | `skills:read-tree` | Read skill file tree |
| `skills.readFile(path)` | `skills:read-file` | Read skill file content |
| `skills.loadAllPrompts(path)` | `skills:load-all-prompts` | Load all SKILL.md contents |

### Obsidian
| Method | IPC Channel | Description |
|---|---|---|
| `obsidian.getConfig()` | `obsidian:get-config` | Get vault path |
| `obsidian.saveConfig(config)` | `obsidian:save-config` | Save vault path |
| `obsidian.pickFolder()` | `obsidian:pick-folder` | Folder picker dialog |
| `obsidian.readTree(dir)` | `obsidian:read-tree` | Read vault file tree |
| `obsidian.readFile(path)` | `obsidian:read-file` | Read markdown file |
| `obsidian.writeFile(path, content)` | `obsidian:write-file` | Write markdown file |
| `obsidian.createFile(dir, name)` | `obsidian:create-file` | Create new `.md` file |
| `obsidian.createFolder(dir, name)` | `obsidian:create-folder` | Create new folder |
| `obsidian.deleteFile(path)` | `obsidian:delete-file` | Delete file or folder |
| `obsidian.rename(old, new)` | `obsidian:rename` | Rename file or folder |

---

## 9. Configuration & Environment

### 9.1 Data Directory

All persistent data lives in `~/.sparkai/`:
- `chats.json` — Chat history
- `config.json` — User config (API key, models, etc.)
- `personas.json` — Persona definitions



### 9.2 Environment Variables

Set in `.env.development` (loaded by main process on startup):

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-3-5
OBSIDIAN_VAULT_PATH=/mnt/d/Notes
```

Config priority: `.env.development` values populate `DEFAULT_CONFIG`. User-saved config overrides non-empty values. Empty saved values fall back to env defaults.

### 9.3 Model Configuration

Three model slots configurable in settings:

| Slot | Default | Notes |
|---|---|---|
| `sonnetModel` | `claude-sonnet-4-5` | Default active model |
| `opusModel` | `claude-opus-4-6` | Supports adaptive thinking + compaction |
| `haikuModel` | `claude-haiku-3-5` | Fastest/cheapest |

`activeModel` is one of `'sonnet'`, `'opus'`, `'haiku'` — maps to the corresponding model ID at runtime.

### 9.4 Skills Directory

Default: `~/.claude/skills/` (Linux/WSL) or `%APPDATA%\Claude\skills` (Windows). Each skill is a subdirectory containing a `SKILL.md` file with optional YAML frontmatter:

```markdown
---
name: My Skill
description: Does something useful
---

Full skill instructions here...
```

---

## 10. Styling System

### 10.1 CSS Variables (`src/style.css`)

Global font-size scale (base: `html { font-size: 125% }` = 20px):

| Variable | Value | Usage |
|---|---|---|
| `--fs-page-title` | 1.5rem | Page headings |
| `--fs-section` | 1.25rem | Section headers |
| `--fs-subtitle` | 1.0625rem | Card titles |
| `--fs-body` | 0.9375rem | Primary body text |
| `--fs-secondary` | 0.875rem | Supporting text |
| `--fs-caption` | 0.8125rem | Captions, badges |
| `--fs-small` | 0.75rem | Fine print |

Color scheme: Light theme with dark sidebar (`#0F172A`). Blue primary (`#3B82F6`).

### 10.2 Prose Styling

`.prose-sparkai` — Custom markdown rendering styles used in chat bubbles. Defines heading sizes, list styles, code blocks (dark bg `#0F172A`), tables, blockquotes, links. Also aliased as `.prose-botanic` (legacy).

### 10.3 Animations

- `.wave-bar` — Streaming indicator (5 bars with `scaleY` oscillation + hue rotation) — defined in `MessageRenderer.vue` `<style scoped>`
- `.streaming-bar` — Legacy streaming bars (defined in `style.css`, used in ChatsView but being migrated out)
- `.busy-dot` — Bouncing dots indicator
- `.msg-enter-active` — Message slide-in animation

---

## 11. WSL2 Considerations

The app is designed to run on WSL2 with WSLg. Key adaptations:

1. **Path conversion**: `toWslPath()` / `toLinuxPath()` convert Windows paths (`C:\foo`) to WSL mount paths (`/mnt/c/foo`)
2. **File picker**: On WSL, uses PowerShell `OpenFileDialog` + `FolderBrowserDialog` instead of GTK (which is unreliable on WSLg)
3. **File drop interception**: `will-navigate` event intercepts `file://` URLs from Windows Explorer drops
4. **Emoji fonts**: Bundles `seguiemj.ttf` and sets `FONTCONFIG_FILE` before Chromium init
5. **File reveal**: Uses `explorer.exe` via `wslpath -w` on WSL instead of `shell.showItemInFolder()`

---

## 12. Development

### 12.1 Running

```bash
npm run dev      # Starts Vite dev server (port 5173) + Electron
npm run build    # Vite production build to dist/
npm run electron # Just Electron (expects Vite already running)
```

### 12.2 Logging

Logs written to `logs/sparkai-YYYY-MM-DD.log` with levels: `INFO`, `WARN`, `ERROR`, `DEBUG`, `AGENT`. Also mirrored to terminal. Use `logger.agent()` for agent loop events.

### 12.3 Debugging Tips

- **ChatsView debug output**: `dbg()` function logs to an in-view debug panel (togglable)
- **Context inspector**: `agent:get-context` IPC returns full context snapshot (system prompt, messages, tools, metrics)
- **Streaming state**: Check `msg.streaming`, `msg.streamingStartedAt`, `msg.segments` on assistant messages
- **Agent active**: `activeLoops` Map in main.js tracks running loops per chat

---

## 13. Known Patterns & Conventions

1. **Vue Composition API everywhere** — All components use `<script setup>` with `ref`, `computed`, `reactive`
2. **No TypeScript** — Pure JavaScript throughout
3. **Inline styles + Tailwind** — Most styling uses inline `style=""` attributes with Tailwind utility classes for layout. CSS variables for font sizes.
4. **JSON round-trip for IPC** — `JSON.parse(JSON.stringify(data))` strips Vue reactive Proxy wrappers before passing data to Electron IPC (structured clone doesn't handle Proxies)
5. **Per-chat state** — `isRunning`, `isThinking`, `contextMetrics` are runtime-only fields on chat objects (reset on load, not persisted reliably)
6. **Segments model** — Assistant messages store structured `segments` array alongside flat `content` string. Segments are the source of truth for rendering; content is a text-only join for API calls.
7. **Tool visibility** — `isHiddenTool()` hides read-only operations (`file_operation.read/list/search/exists`, `execute_shell`, `todo_manager`) from the UI to reduce noise
8. **Diff rendering** — MessageRenderer uses an LCS-based diff algorithm to show file changes, with a diffCache to avoid recomputation
9. **Prompt queue** — If user sends a message while agent is running, it's queued in `perChatQueue` and auto-sent when current run completes
10. **Scroll management** — Auto-scroll is paused when user scrolls up >60px; `programmaticScrollCount` prevents scroll events from own scrollToBottom calls from triggering the lock
