# ClankAI

ClankAI is a multi-LLM desktop chat application built with Electron and Vue 3. It combines chat, agent collaboration, MCP tools, knowledge retrieval, skills, notes, and task orchestration in a single local-first desktop app.

## Highlights

- Multi-provider model support through a dynamic providers array (Anthropic, OpenRouter, OpenAI-compatible, DeepSeek, Google, and extensible custom providers)
- Streaming chat with per-chat and per-agent model selection/override
- Multi-agent system with distinct system agents and user agents, so each agent represents a specific role, collaborator, or working persona
- Group chat support, including multi-agent collaboration in the same conversation
- Per-agent isolation for prompt/definition, skills, tools, MCP servers, and RAG/knowledge context
- Agentic tool-use loop (filesystem, shell, git, web, data processing, planning)
- Mention routing between agents during collaborative conversations
- MCP server integration and HTTP tools management
- Knowledge (RAG) workflows with Pinecone-backed indexing/querying
- Skills system (filesystem and remote skill hub sources)
- AI docs workspace with markdown plus office/drawing helpers
- AI news view with configurable feed aggregation and reading workflows
- Task engine and AI task execution views
- Voice call pipeline (STT/TTS + usage accounting)
- Built-in i18n with English and Chinese locale support

## Tech Stack

- Electron 31 (main process in CommonJS)
- Vue 3.4 (Composition API with script setup)
- Pinia 2, Vue Router 4 (hash history)
- Vite 5
- Tailwind CSS 3.4 + CSS variables
- Marked + highlight.js + DOMPurify
- TipTap (rich text)
- Babylon.js (3D viewer)

## Prerequisites

- Node.js 18+
- npm

## Quick Start

1. Install dependencies.

   npm install

2. Start development mode.

   npm run dev

This starts Vite and then launches Electron.

Important: the full app behavior only works in the Electron window. Browser-only Vite preview does not include Electron IPC features.

## Scripts

- npm run dev: start Vite + Electron
- npm run build: build renderer into dist/
- npm run preview: preview built renderer
- npm run electron: run Electron against current build/dev server setup
- npm run dist:win: package Windows installer output to dist-release/
- npm run dist:mac: package macOS dmg output to dist-release/
- npm run dist:all: package win + mac
- npm run bundle:mcporter: rebuild bundled MCP transporter module

## Packaging

The dist scripts automatically compile Electron main-process JS to V8 bytecode before packaging, and restore the source files afterward:

    npm run dist:win          # Windows NSIS installer
    npm run dist:mac          # macOS DMG
    npm run dist:all          # Both platforms

Under the hood each dist command runs:

1. `vite build` — build Vue renderer to dist/
2. `node scripts/compile-bytecode.js` — compile 69 electron/ JS files to .jsc bytecode (backup originals)
3. `electron-builder` — package app (asar contains only .jsc bytecode, not readable JS)
4. `node scripts/compile-bytecode.js --restore` — restore original JS source for development

Files kept as plaintext: main.js (entry point), preload.js, drawio-preload.js (Electron internal loading).

To set the telemetry endpoint before packaging, create electron/build-config.json (gitignored):

    { "telemetryEndpoint": "https://api.amy1230.win/report" }

## Routing

Router uses hash history for Electron compatibility.

- /chats
- /agents
- /skills
- /knowledge
- /mcp
- /tools
- /notes
- /tasks
- /ai-tasks
- /news
- /auth
- /config

## Data and Configuration

Default data directory:

- Windows: C:\Users\<user>\AppData\Roaming\clankai\data
- macOS: ~/Library/Application Support/clankai/data

Data location can be overridden via CLANKAI_DATA_PATH.

Config model notes:

- Runtime settings are stored in config.json inside the data directory.
- Provider credentials and model defaults are managed through config providers.
- skillsPath, DoCPath, and artifactPath are stored in config.json.
- CLANKAI_DATA_PATH is the only path setting that lives in .env.

Typical data files include:

- config.json
- agents.json
- tools.json
- mcp-servers.json
- knowledge.json
- chats/index.json and chats/<id>.json

## Project Structure

ClankAI/
- electron/
  - main.js: app bootstrap, IPC handlers, persistence orchestration
  - preload.js: contextBridge API surface exposed to renderer
  - agent/: agent loop, model clients, managers, tools, MCP integration
  - im-bridge/: IM bridge message routing and agent model flow
  - memory/: memory indexing utilities
  - task-scheduler.js and recipe-scheduler.js: scheduler runners
- src/
  - views/: chats, agents, config, mcp, tools, knowledge, docs, tasks, news, auth
  - components/: chat UI, layout, common controls, agent/voice components
  - stores/: Pinia stores for chats, config, agents, models, tools, mcp, skills, tasks, voice, and more
  - i18n/: locale dictionaries and composables
  - services/storage.js: renderer storage abstraction via Electron IPC
- build/icons/: app icon assets for packaging
- scripts/run-electron.js: Electron launcher used by dev and electron scripts

## Development Notes

- Renderer changes support Vite HMR.
- Changes under electron/ require restarting the app process.
- Keep UI strings i18n-ready when adding features.
- Use hash routes for any new renderer routes.

## License

GPL-3.0-only
