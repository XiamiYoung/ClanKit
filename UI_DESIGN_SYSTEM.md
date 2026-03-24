# UI/UX Design System — ClankAI

> This file contains the full UI/UX design specifications. Referenced from `CLAUDE.md`.

## Color Palette

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

## Signature Black Gradient

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

## Typography

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

## Border Radius Scale

| Token          | Value  |
|----------------|--------|
| `--radius-sm`  | `8px`  |
| `--radius-md`  | `12px` |
| `--radius-lg`  | `16px` |
| `--radius-xl`  | `20px` |
| `--radius-full`| `9999px` |

## Shadow Scale

| Name          | Value                                                  | Usage            |
|---------------|--------------------------------------------------------|------------------|
| `card`        | `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)` | Card resting |
| `card-hover`  | `0 4px 12px rgba(0,0,0,0.08)`                          | Card hover       |
| `card-lg`     | `0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)` | Elevated panels |
| Gradient shadow | `0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)` | On dark gradient elements |
| Dropdown      | `0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06)` | Floating menus |
| Modal         | `0 25px 60px rgba(0,0,0,0.18)`                         | Modal dialogs    |

## Component Patterns

### AppButton (`src/components/common/AppButton.vue`)
- Variants: `primary` (black gradient), `secondary` (gray), `ghost` (transparent), `danger` (red), `danger-ghost` (soft red)
- Sizes: `default`, `compact`, `save`, `modal`
- Supports `loading` state with spinner, `disabled` state with 0.5 opacity
- Always uses `font-weight: 600`, Inter font

### ComboBox (`src/components/common/ComboBox.vue`)
- Supports single-select (chip display) and multi-select (chip bar) modes
- Selected values shown as black gradient chips with white text
- Dropdown options gain black gradient on hover/selected
- Focus ring: `border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06)`
- Chip remove buttons: semi-transparent white `rgba(255,255,255,0.15)` background

### ConfirmModal (`src/components/common/ConfirmModal.vue`)
- Teleported to `<body>`, backdrop with `blur(6px)`
- Scale+fade entry animation (200ms ease-out)
- Footer: gray background `#F9F9F9` with border-top
- `confirmClass="danger"` for destructive actions, `"primary"` for non-destructive

### Modals (General Rules)
- **Modal-first rule**: All dialogs, pickers, confirmations, and configuration panels MUST be implemented as proper centered modals. **Never use inline popovers, anchored dropdowns, or absolutely-positioned panels attached to trigger elements.** If UI needs to float over content, it is a modal.
- All modals are **true modals** — they do **NOT** close on backdrop click. **Never add `@click.self` or any click handler to the backdrop div.** Users must explicitly dismiss via Cancel, X button, or Escape key. No exceptions — this applies to every dialog including cost overview, settings panels, pickers, and confirmations.
- Use `<Teleport to="body">` with `position: fixed` + `z-index: 200`
- Dark themed: `#0F0F0F` background, `#2A2A2A` borders, white text
- Header: icon in gradient container + title + close button
- Footer: `#0A0A0A` background with border-top, Cancel (dark gray) + primary action (black gradient)
- Inputs: `#1A1A1A` background, `#2A2A2A` border, focus `#4B5563` border
- Teleported elements require an **unscoped** `<style>` block (scoped styles don't apply outside the component DOM)
- Entry animation: `scale(0.95) translateY(8px) → scale(1) translateY(0)` with opacity fade, 200ms ease-out

### Sidebar (`src/components/layout/Sidebar.vue`)
- Collapsible (260px expanded, 64px collapsed) with smooth transition
- Active item: black gradient background with white text
- Inactive item: `#6B7280` text, hover `#F5F5F5` bg transitioning to `#1A1A1A` text
- Section labels: uppercase, `letter-spacing: 0.06em`, `#9CA3AF`
- Grouped sections: "AI Agent" (Chats, Skills, Knowledge, MCP, Tools, Agents), "Workspace" (Notes), "System" (Configuration)

### Cards
- White background, `1px solid var(--border)`, `border-radius: var(--radius-lg)` (16px)
- Subtle shadow: `card` shadow from Tailwind config

### Form Fields
- Text inputs: `border: 1px solid var(--border)`, `border-radius: var(--radius-sm)` (8px)
- Focus: `border-color: var(--text-primary)` with subtle box-shadow ring
- Mono inputs: `font-family: 'JetBrains Mono'` for API keys, paths, model IDs

### Empty States
- Centered layout with large icon in 80x80 rounded-2xl black gradient container
- Title: `--fs-section`, weight 700
- Description: `--fs-body`, color `#9CA3AF`, line-height 1.6

### Sidebar / Nav Item Action Buttons (Rename, Delete, etc.)

Nav hover icon buttons: transparent bg, no box-shadow/border on the action group. Icon color `rgba(26,26,26,0.4)` on light rows, `rgba(255,255,255,0.5)` on active/dark rows. Hover fills: `rgba(26,26,26,0.08)` light / `rgba(255,255,255,0.15)` dark. Danger hover: `rgba(239,68,68,0.10)` / `#EF4444` light; `rgba(255,59,48,0.25)` / `#FF6B6B` dark. Action group invisible until row hover (`opacity: 0` → `1`).

### Left Nav Category Rows (Full-Row Hover Background)

Outer `nav-cat-wrap` div gets the dark gradient on hover/`:has(.active)` — **never the inner `<button>` alone**. Inner button: `background: transparent !important`. Count badge and action buttons are **flex siblings** of the button (not children) — so clicking actions doesn't trigger the nav button's click handler. Hide count badge on hover (opacity→0), show action buttons instead. Use CSS `:has(.nav-item.active)` to detect active state on the wrapper. Action icon buttons are always white-tinted (they only appear on the dark gradient bg).

### Back Buttons

Back/return navigation buttons: black gradient (`linear-gradient(135deg,#0F0F0F,#1A1A1A,#374151)`) + white text, `font-weight:600`, chevron-left SVG icon. Hover: lighter stops (#1A1A1A → #2D2D2D → #4B5563). Examples: `ChatGridLayout` (grid→single), `SkillsView` (detail→catalog).

### Page-Level Action Buttons (Standard)

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

### Dark Dialogs / Dropdowns

Floating panels over dark/mixed content: `background:#0F0F0F`, `border:1px solid #2A2A2A`, `border-radius:16px`, heavy box-shadow. Header: `#FFFFFF` weight 700, icon in gradient container. Search: `#1A1A1A` bg, focus `#4B5563` border, placeholder `#6B7280`. List items: `#9CA3AF`, hover gets dark gradient + `#FFFFFF`. Use `<Teleport to="body">` + unscoped `<style>` + `z-index:9999` when escaping `overflow:hidden` containers. Entry: `scale(0.96) translateY(4px)→1/0` 150ms ease-out. Examples: swap-chat dropdown (`ChatGridPanel`), chat settings (`ChatHeader`).

## Animations & Transitions

- **Default transition:** `all 0.15s ease` (buttons, nav items, inputs)
- **Message enter:** `translateY(8px) → 0` + `opacity 0 → 1` over 200ms ease-out
- **Modal enter:** `scale(0.95) translateY(8px)` → `scale(1) translateY(0)` over 200ms
- **Sidebar collapse:** `width 0.2s ease, min-width 0.2s ease`
- **Busy indicator:** Bouncing dots with `busyBounce 1s ease-in-out infinite`
- **Streaming indicator:** Equalizer bars with `eqPulse 0.8s ease-in-out infinite alternate`
- Respects `prefers-reduced-motion: reduce`

## Scrollbar

- Thin minimal style: 6px width
- Track: transparent
- Thumb: `#D1D1D6`, hover `#A1A1AA`, active `#71717A`, fully rounded

## Chat Bubbles

- **User messages:** Black gradient background (`linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)`), all text forced to `#FFFFFF !important` via `.user-content` class
- **Assistant messages:** White/light card background with prose-clankai styling
- **Code blocks:** Dark background `#1C1C1E` with `#E5E5EA` text, 12px border-radius, 1px `#2C2C2E` border
- **Inline code:** `var(--accent-light)` background, `var(--accent)` text color

## Markdown Prose (`prose-clankai`)

- Line height: 1.65
- Links: `var(--accent)` with underline
- Blockquotes: 3px left border, muted italic text
- Tables: bordered cells, `#F9F9F9` header background
- Images: rounded `var(--radius-md)`

## Search Bars (Catalog Pattern)

Views like MCP, Tools use a consistent search bar:
- Search icon left-aligned inside the input wrapper
- Input with placeholder text, no visible border (integrated into header card)
- Clear button (X icon) appears when search has value

## Count Badges

- Small pill showing item count: `{N} tool(s)`, `{N} server(s)`, `{N} agent(s)`
- Typically styled as a subtle rounded badge near the page header

## Page Layout Pattern

All views follow a consistent structure:
1. **Header** — Title (h1, `--fs-page-title`), subtitle, action buttons in top-right
2. **Tab bar** (optional) — Horizontal button group for sub-sections
3. **Scrollable content** — Cards, grids, or lists in a padded container
4. **Save row** (config pages) — Bottom-aligned save button with status indicator

## Configuration Page Layout

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

### Section Card Pattern

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
