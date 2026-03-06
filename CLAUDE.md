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

#### Sidebar / Nav Item Action Buttons (Rename, Delete, etc.)

Inline icon buttons that appear on hover inside sidebar and left-nav list items (e.g. chat tree rename/delete, persona category rename/delete) follow the **chat tree pattern** — NOT a white box with a shadow:

```css
/* Action group — invisible until row hover */
.nav-item-actions {
  display: flex;
  align-items: center;
  gap: 0;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.row:hover .nav-item-actions { opacity: 1; }

/* Individual icon button */
.nav-icon-btn {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: rgba(26, 26, 26, 0.4);      /* dim on light bg */
  border-radius: 0.3125rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.nav-icon-btn:hover            { background: rgba(26,26,26,0.08);  color: #1A1A1A; }
.nav-icon-btn.danger:hover     { background: rgba(239,68,68,0.10); color: #EF4444; }

/* When the row is active (dark gradient bg) — flip to white icons */
.active-row .nav-icon-btn            { color: rgba(255,255,255,0.5); }
.active-row .nav-icon-btn:hover      { background: rgba(255,255,255,0.15); color: #FFFFFF; }
.active-row .nav-icon-btn.danger:hover { background: rgba(255,59,48,0.25); color: #FF6B6B; }
```

**Rules:**
- **No white background box, no box-shadow, no border** on the action group container — pure transparency
- Icon color is `rgba(26,26,26,0.4)` on light rows; flips to `rgba(255,255,255,0.5)` on active (gradient) rows
- Hover uses low-opacity fill: `rgba(26,26,26,0.08)` on light, `rgba(255,255,255,0.15)` on dark
- Danger hover: `rgba(239,68,68,0.10)` / `#EF4444` on light; `rgba(255,59,48,0.25)` / `#FF6B6B` on dark

#### Left Nav Category Rows (Full-Row Hover Background)

Category rows in left nav panels (e.g. persona categories) use a **wrapper + transparent button** pattern so the entire row — including the action buttons on the right — gets the dark gradient background on hover/active. Never apply the background to the inner `<button>` only, as that leaves the action icons outside the background.

**Structure:**
```html
<!-- Wrapper gets the gradient background -->
<div class="nav-cat-wrap">
  <!-- Button is transparent — wrapper provides the bg -->
  <button class="nav-item nav-cat-btn" :class="{ active: isActive }">
    <span class="nav-item-emoji">{{ cat.emoji }}</span>
    <span class="nav-item-label">{{ cat.name }}</span>
  </button>
  <!-- Right-side siblings: count badge + action buttons -->
  <div class="nav-cat-right">
    <span class="nav-cat-count">{{ count }}</span>
    <div class="nav-cat-actions">
      <!-- rename + delete icon buttons -->
    </div>
  </div>
</div>
```

**CSS pattern:**
```css
.nav-cat-wrap {
  display: flex; align-items: center; border-radius: 0.5rem;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  padding-right: 0.25rem;
}
/* Hover: full row gets the dark gradient */
.nav-cat-wrap:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
/* Active: same — use :has() to detect .active child */
.nav-cat-wrap:has(.nav-item.active) {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
/* Button is transparent — wrapper provides the bg */
.nav-cat-btn { flex: 1; min-width: 0; background: transparent !important; box-shadow: none !important; }
.nav-cat-wrap:hover .nav-cat-btn,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-btn { color: #FFFFFF; }

/* Hide count badge on hover/active; show action buttons instead */
.nav-cat-wrap:hover .nav-cat-count,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-count { opacity: 0; pointer-events: none; }
.nav-cat-wrap:hover .nav-cat-actions,
.nav-cat-wrap:has(.nav-item.active) .nav-cat-actions { opacity: 1; }

/* Icon buttons always white (they only appear on dark gradient bg) */
.nav-icon-btn { color: rgba(255,255,255,0.5); background: transparent; }
.nav-icon-btn:hover { background: rgba(255,255,255,0.15); color: #FFFFFF; }
.nav-icon-btn-danger:hover { background: rgba(255,59,48,0.25); color: #FF6B6B; }
```

**Rules:**
- The **wrapper div** (`nav-cat-wrap`) gets the gradient — never the inner button alone
- The inner button must have `background: transparent !important` to let the wrapper bg show
- The count badge and action buttons are **flex siblings** of the inner button (not children of it) — this ensures clicking action buttons does NOT trigger the nav button's click handler
- Hide the count on hover/active (fade to `opacity: 0`) so the action buttons have room — both occupy the same `nav-cat-right` area with actions as `position: absolute`
- Action icon buttons are always white-tinted (they only appear on the dark gradient bg)
- Use CSS `:has(.nav-item.active)` to style the wrapper based on its active child

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

Pages using this standard: ToolsView, McpView, PersonasView, KnowledgeView, SkillsView, NewsView.

**Exception — NotesView tree toolbar**: Uses raw `<button class="action-btn">` because that toolbar is inside the notes file tree sidebar, not a page header. This is acceptable for that specific dense/icon-only context.

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

Every logical group of related fields lives in its own `config-card` with a `form-section-header` at the top:

```html
<div class="config-card">
  <div class="form-section-header">
    <div class="section-icon-sm">
      <svg class="icon-xs" viewBox="0 0 24 24" ...><!-- icon --></svg>
    </div>
    <h3 class="form-section-title">Section Title</h3>
    <!-- optional: <span class="form-label-hint">subtitle or env var</span> -->
  </div>
  <!-- fields -->
</div>
```

- `section-icon-sm`: 28×28px black gradient square, white icon inside
- `form-section-title`: `font-weight: 700`, `var(--fs-body)`, `var(--text-primary)`
- `form-label-hint`: monospace, `var(--fs-caption)`, `var(--text-muted)` — used for env var names or counts

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

SparkAI targets **1920×1080 (HD)** as the primary resolution and **2560px+ (4K)** as the secondary. Design all UI for HD first; 4K gets proportional scaling via the global font-size step.

### Breakpoints

| Name | `min-width` | `html font-size` | Description |
|------|-------------|------------------|-------------|
| base | (default) | `100%` = 16px | < 1920px — graceful fallback |
| `hd` | `1920px` | `112.5%` = 18px | 1080p — **primary target** |
| `4k` | `2560px` | `125%` = 20px | 4K / large display |

Tailwind custom screens `hd:` and `4k:` are registered. Use them instead of ad-hoc `@media` where possible.

### Font Scale Strategy — Breakpoint Steps (not `clamp()`)

`html { font-size }` steps at two breakpoints. All `rem` and `var(--fs-*)` values auto-scale with it — no per-component media queries needed for typography.

```css
html { font-size: 100%; }                          /* < 1920px */
@media (min-width: 1920px) { font-size: 112.5%; } /* HD       */
@media (min-width: 2560px) { font-size: 125%; }   /* 4K       */
```

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

**Quick conversion table (÷16):**

| px | rem |
|----|-----|
| 4 | 0.25rem |
| 6 | 0.375rem |
| 8 | 0.5rem |
| 10 | 0.625rem |
| 12 | 0.75rem |
| 14 | 0.875rem |
| 16 | 1rem |
| 20 | 1.25rem |
| 24 | 1.5rem |
| 28 | 1.75rem |
| 32 | 2rem |
| 42 | 2.625rem |

### Card Grid Columns

Card grids (MCP, Tools, Skills, Knowledge, Personas) use `min-width` breakpoints — never `max-width`:

```css
.some-grid { grid-template-columns: repeat(2, 1fr); } /* < 1920px */
@media (min-width: 1920px) { grid-template-columns: repeat(3, 1fr); }
@media (min-width: 2560px) { grid-template-columns: repeat(4, 1fr); }
```

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
- **Restart notification:** When any change touches files that require an app restart to take effect (anything under `electron/` — `main.js`, `preload.js`, `agent/`, etc.), end your message to the user with a **red-colored** notice: <span style="color:#EF4444;">**⟳ This change requires restarting the app to take effect.**</span>

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **No hardcoded provider endpoints**: Never use `|| 'https://api.anthropic.com'`, `|| 'https://openrouter.ai/api'`, `|| 'https://mlaas.virtuosgames.com'`, or any other provider URL as a fallback in source code. All endpoints must come from user configuration (`config.anthropic.baseURL`, `config.openrouter.baseURL`, `config.openai.baseURL`). If a baseURL is missing at runtime, throw an error or return early — do not silently fall back to an official URL. Placeholder text in `<input placeholder="...">` UI fields is exempt (display only, not used for requests).

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

- **2026-03-02**: Group chat persona collaboration loop collected ALL @mentions from a persona's response and triggered all mentioned personas immediately. This caused a persona that was only *referenced* (e.g. "then we'll hand to @Reviewer") to respond in the same round as the persona that was *addressed*. **Rule: in the persona→persona collaboration loop (`triggerPersonaCollaboration`), apply `resolveAddressees` per source message — the same AI-based disambiguation used in the user→persona path — so only the truly addressed personas respond in each round, not every mentioned name.**

- **2026-03-02**: Multiple personas in a group chat must never share a single message bubble. **Rule: `_applyChunk` in `chats.js` must NOT touch ANY chunk tagged with `personaId` (text, persona_start, persona_end, tool_call, tool_result). All group persona chunk processing — placeholder creation, text routing, streaming flag management — is owned exclusively by `ChatsView.handleChunk` via the `perChatStreamingMsgId` keying system.** The store only handles non-persona chunks (single persona / non-group path) and state flags (isThinking, contextMetrics). Violating this causes: (a) duplicate placeholders, (b) double content writes, (c) `streaming=false` race conditions that reroute text to the wrong persona's bubble.

- **2026-03-02**: `\b` (word boundary) in regex does NOT work for CJK (Chinese/Japanese/Korean) characters. CJK chars are non-`\w`, so `\b` between a CJK char and a space/punctuation (both non-`\w`) never fires. **Rule: always use `(?=\W|$)` instead of `\b` for name-boundary matching in `parseMentions`, `stripMentions`, and the `MessageRenderer` @mention highlighter.** This applies to any regex that must support non-Latin names.

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
