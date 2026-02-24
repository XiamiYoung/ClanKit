# SparkAI

Multi-LLM desktop chat application with agentic tool use, built with Electron and Vue 3.

## Features

- **Streaming chat** with Claude models (Sonnet, Opus, Haiku) via the Anthropic API
- **Agentic tool loop** — the AI can read/write files, execute shell commands, manage git repos, fetch web pages, and analyze data
- **Sub-agent delegation** for parallel or focused subtasks
- **Background tasks** for long-running operations (builds, test suites)
- **Todo/task planning** for complex multi-step work
- **File attachments** — drag-drop or pick files, images, and folders
- **Obsidian vault integration** — browse and edit markdown files
- **Persona system** — configurable system and user personas per chat
- **Skills system** — extend the AI with filesystem-based markdown skill files
- **Context management** — automatic compaction when the context window fills up
- **WSL2-native** — Windows file picker, path conversion, emoji font support

## Prerequisites

- Node.js 18+
- npm
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
npm install
```

Create `.env.development` in the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Optional settings:

```env
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-3-5
OBSIDIAN_VAULT_PATH=/path/to/vault
```

## Development

```bash
npm run dev
```

This starts the Vite dev server on port 5173 and launches Electron.

> **Note**: The agent loop only works in the Electron window, not in a browser at `localhost:5173`.

## Build

```bash
npm run build
```

Produces a production build in `dist/`.

## Project Structure

```
electron/              Electron main process
  main.js              App entry, window, IPC handlers
  preload.js           contextBridge API surface
  agent/               Agent loop subsystem
    agentLoop.js       Streaming agentic loop
    core/              AnthropicClient, ContextManager
    managers/          SubAgentManager, TaskManager
    tools/             FileTool, ShellTool, GitTool, WebTool, DataTool, TodoTool

src/                   Vue renderer
  views/               ChatsView, ConfigView, PersonasView, SkillsView, ObsidianView
  components/          MessageRenderer, RichTextEditor, Sidebar, TitleBar, Persona components
  stores/              Pinia stores (chats, config, personas, skills, obsidian)
  services/storage.js  Storage abstraction (Electron IPC / localStorage fallback)
```

See [SPARKAI_ARCHITECTURE.md](./SPARKAI_ARCHITECTURE.md) for full architectural documentation.

## Tech Stack

Electron | Vue 3 | Pinia | Vite | Tailwind CSS | Anthropic SDK | marked | DOMPurify | TipTap

## License

Private.
