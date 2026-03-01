# CLAUDE.md — SparkAI Project Guide

## Project Overview

SparkAI is a multi-LLM desktop chat application built with **Electron + Vue 3 + Vite**. It supports Anthropic (Claude), OpenRouter, and OpenAI-compatible backends. Features include persona management, MCP server integration, HTTP tools, knowledge base (RAG via Pinecone), skills, and an agentic tool-use loop.

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

## Repository Structure

```
spark_ai/
├── electron/                 # Electron main process (CommonJS)
│   ├── main.js               # App entry, IPC handlers, window management
│   ├── preload.js            # contextBridge → window.electronAPI
│   ├── logger.js             # File-based logger
│   └── agent/                # Agentic AI loop
│       ├── agentLoop.js      # Core agent orchestration
│       ├── core/             # LLM clients
│       │   ├── AnthropicClient.js
│       │   ├── OpenAIClient.js
│       │   └── ContextManager.js
│       ├── managers/         # Sub-agent & task management
│       │   ├── SubAgentManager.js
│       │   └── TaskManager.js
│       ├── mcp/              # MCP protocol client/manager
│       │   ├── McpClient.js
│       │   └── McpManager.js
│       └── tools/            # Agent tools (file, shell, git, web, etc.)
│           ├── BaseTool.js
│           ├── ToolRegistry.js
│           ├── FileTool.js, ShellTool.js, GitTool.js, WebTool.js
│           ├── DataTool.js, TodoTool.js, SoulTool.js
│           └── ...
├── src/                      # Vue renderer (ES modules)
│   ├── main.js               # Vue app bootstrap (Pinia, Router)
│   ├── App.vue               # Root layout (sidebar + router-view)
│   ├── style.css             # Global styles, CSS variables, prose classes
│   ├── router/index.js       # Hash-based routes
│   ├── services/storage.js   # Storage abstraction (Electron IPC / localStorage)
│   ├── stores/               # Pinia stores
│   │   ├── chats.js          # Chat CRUD, lazy message loading, chunk listener
│   │   ├── config.js         # API keys, model config, data paths
│   │   ├── personas.js       # System & user persona management
│   │   ├── mcp.js            # MCP server config
│   │   ├── tools.js          # HTTP tool config
│   │   ├── models.js         # Model lists (Anthropic/OpenRouter/OpenAI)
│   │   └── knowledge.js      # Pinecone RAG integration
│   ├── components/
│   │   ├── layout/           # Sidebar, TitleBar
│   │   ├── common/           # AppButton, ComboBox, ConfirmModal
│   │   ├── chat/             # MessageRenderer, RichTextEditor, BabylonViewer
│   │   └── personas/         # PersonaCard, PersonaWizard, AvatarPicker, SoulViewer
│   ├── views/                # Route pages
│   │   ├── ChatsView.vue, ConfigView.vue, PersonasView.vue
│   │   ├── McpView.vue, ToolsView.vue, KnowledgeView.vue
│   │   ├── NotesView.vue, SkillsView.vue
│   │   └── ...
│   └── utils/mentions.js
├── tailwind.config.js
├── vite.config.js
├── postcss.config.js
└── package.json
```

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
- Routes: `/chats`, `/personas`, `/skills`, `/knowledge`, `/mcp`, `/tools`, `/notes`, `/config`
- Default redirect: `/` → `/chats`

### Data Storage

- All data stored in `~/.sparkai/` (configurable via `SPARKAI_DATA_PATH`)
- Files: `config.json`, `personas.json`, `mcp-servers.json`, `tools.json`, `knowledge.json`
- Chats: `chats/index.json` (metadata) + `chats/{id}.json` (per-chat with messages)
- Souls: `souls/{personaId}/{type}.md`

### `.env` vs `config.json` — What Lives Where

- **`.env`** (at `DATA_DIR/.env`) stores only **`SPARKAI_DATA_PATH`** — the data directory override. It must live outside `config.json` because it determines where `config.json` is.
- **`config.json`** stores everything else, including the three user-configured paths:
  - `skillsPath` — directory of skill folders (default: `~/.claude/skills`)
  - `DoCPath` — documents / vault folder path
  - `artyfactPath` — directory where AI artifacts are written during chats
- These paths are read/written via the `store:get-env-paths` / `store:save-env-path` IPC channels (named for historical reasons), but they no longer touch `.env`.
- The renderer accesses them through `configStore.config.skillsPath` etc., populated by `loadEnvPaths()` in `src/stores/config.js`.

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
- **Section icons** — persona type section headers
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
- All modals are **true modals** — they do NOT close on backdrop click. Users must explicitly dismiss via Cancel, X button, or Escape key.
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
- Grouped sections: "AI Agent" (Chats, Skills, Knowledge, MCP, Tools, Personas), "Workspace" (Notes), "System" (Configuration)

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

#### Back Buttons

All "back" / "return" navigation buttons use the **black gradient** style to stay visually consistent with other primary interactive elements:

```css
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 6px 10px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.back-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
```

- Include a chevron-left SVG icon (14–16px) before the label text
- Label should be short and descriptive (e.g., "Single View", "Skills")
- Examples: grid-to-single-view button (`ChatGridLayout`), skill-detail-to-catalog button (`SkillsView`)

#### Refresh / Action Buttons

All toolbar action buttons (refresh, new file, new folder) use the **black gradient** style, matching the app's signature look:

```css
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm, 8px);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.action-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
```

- Icon-only variants use `padding: 6px` (square) instead of `6px 14px`
- Text+icon variants include a 14-16px SVG icon before the label
- Examples: NotesView tree toolbar (File, Folder, Refresh), SkillsView catalog refresh, SkillsView sidebar refresh

#### Dark Dialogs / Dropdowns

Floating panels that appear over dark or mixed content (swap-chat dropdown, settings popovers) use a **dark theme** consistent with the app's dark gradient identity:

```css
.dark-dialog {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.2);
  animation: dialogEnter 0.15s ease-out;
}
/* Header */
.dark-dialog-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid #1F1F1F;
  font-weight: 700;
  color: #FFFFFF;
}
/* Header icon */
.dark-dialog-header-icon {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
/* Search bar */
.dark-dialog-search {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  color: #FFFFFF;
}
.dark-dialog-search:focus-within { border-color: #4B5563; }
.dark-dialog-search::placeholder { color: #6B7280; }
/* List items */
.dark-dialog-item {
  color: #9CA3AF;
  border-radius: 10px;
}
.dark-dialog-item:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  color: #FFFFFF;
}
/* Scrollbar */
scrollbar-width: thin;
::-webkit-scrollbar-thumb { background: #374151; }
```

- Use `<Teleport to="body">` with `position: fixed` + `z-index: 9999` when the dialog must escape `overflow: hidden` containers (e.g., grid cells)
- Move CSS for teleported elements to an **unscoped** `<style>` block (scoped styles don't apply outside the component DOM)
- Entry animation: `scale(0.96) translateY(4px) → scale(1) translateY(0)` with opacity fade, 150ms ease-out
- Examples: swap-chat dropdown (`ChatGridPanel`), Chat Settings tooltip (`ChatHeader`)

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
- **Assistant messages:** White/light card background with prose-sparkai styling
- **Code blocks:** Dark background `#1C1C1E` with `#E5E5EA` text, 12px border-radius, 1px `#2C2C2E` border
- **Inline code:** `var(--accent-light)` background, `var(--accent)` text color

### Markdown Prose (`prose-sparkai`)

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

- Small pill showing item count: `{N} tool(s)`, `{N} server(s)`, `{N} persona(s)`
- Typically styled as a subtle rounded badge near the page header

### Page Layout Pattern

All views follow a consistent structure:
1. **Header** — Title (h1, `--fs-page-title`), subtitle, action buttons in top-right
2. **Tab bar** (optional) — Horizontal button group for sub-sections
3. **Scrollable content** — Cards, grids, or lists in a padded container
4. **Save row** (config pages) — Bottom-aligned save button with status indicator

## Coding Guidelines

- Use `var(--token)` CSS custom properties for all colors, radii, and font sizes
- Prefer scoped `<style scoped>` in components; global styles only in `style.css`
- Keep Tailwind for layout utilities (`flex`, `gap`, `p-*`); use CSS variables for theming
- Always apply the black gradient for primary interactive elements — this is the visual signature
- All IPC calls are `async` (invoke/handle pattern)
- Never store sensitive keys in the renderer; they live in `.env` or `config.json` on disk
- WSL2 compatibility: fontconfig for emoji, path handling in preload
- Chat persistence is debounced (300ms) — don't call `persistChat` in tight loops
- **Restart notification:** When any change touches files that require an app restart to take effect (anything under `electron/` — `main.js`, `preload.js`, `agent/`, etc.), end your message to the user with a **red-colored** notice: <span style="color:#EF4444;">**⟳ This change requires restarting the app to take effect.**</span>

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

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
- Run tests, check logs, demonstrate correctness

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

## App Icon

### Icon Design

SparkAI uses a custom **black-theme icon** — a metallic gold lightning bolt on a pure black background with a gold orbit ring. Designed to match the app's signature dark aesthetic.

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

### Electron Window Icon

Set in `electron/main.js` `BrowserWindow` config:

```js
const { app, BrowserWindow } = require('electron')
const path = require('path')

new BrowserWindow({
  icon: path.join(__dirname, '../public/icon.png'),
  // ...
})
```

### Electron Builder Config (`package.json`)

```json
"build": {
  "appId": "com.sparkai.app",
  "productName": "SparkAI",
  "icon": "build/icons/icon.png",
  "win": { "icon": "build/icons/icon.png", "target": ["nsis", "portable"] },
  "mac": { "icon": "build/icons/icon.png", "target": "dmg" },
  "linux": { "icon": "build/icons", "target": "AppImage" }
}
```

### Sidebar Logo

The sidebar logo uses the icon image directly:

```vue
<!-- Expanded state -->
<img src="/icon.png" alt="SparkAI" style="width:32px;height:32px;border-radius:8px;" />

<!-- Collapsed state -->
<img src="/icon.png" alt="SparkAI" style="width:28px;height:28px;border-radius:6px;" />
```

### Regenerating Icons

If you need to regenerate PNG sizes from the SVG source:

```bash
# Using sharp (already in devDependencies)
node scripts/generate-icons.js
```

Or manually with cairosvg (Python):

```bash
pip install cairosvg
python3 -c "
import cairosvg
for size in [16,32,48,64,128,256,512,1024]:
    cairosvg.svg2png(url='build/icons/icon.svg', write_to=f'build/icons/icon-{size}x.png', output_width=size, output_height=size)
"
```
