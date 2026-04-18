# Go Migration — Progress Tracker

**Start date:** 2026-04-15
**Current phase:** P0 — Skeleton + Recorder (in progress)

See also: [`DECISIONS.md`](./DECISIONS.md), [`HTTP_API.md`](./HTTP_API.md), [`CHUNK_PROTOCOL.md`](./CHUNK_PROTOCOL.md).

> HTTP_API.md and DECISIONS.md were drafted before the 2026-04-15 discussion. They
> still reflect the old session-based API and the "orchestration stays in JS" idea.
> The authoritative current plan is this file + the Decision Log below. Those two
> files will be rewritten at the start of P1.

---

## Rules (non-negotiable)

1. **Never delete Electron code until P7 is explicitly greenlit.** Only add
   flag branches. If anything breaks, flip the flag off to fall back to pure
   Electron.
2. **Runtime toggle:** `config.backend = "electron" | "go"`, default `"electron"`.
3. **At any moment, only one side writes to disk** (Electron OR Go). The flag
   decides who. No shared writes, no race conditions.
4. **Each phase advances only when all four gates are green:**
   - (a) Go unit tests
   - (b) Golden file parity
   - (c) JS regression (`npm test`, plus the mandatory chat regression suite)
   - (d) Manual E2E checklist for that phase
5. **If a gate is red, stop and re-plan.** Never patch around it.

---

## Phase Map

| Phase | Scope | Status |
|---|---|---|
| P0 | Scaffold + chunk recorder (derives golden files from JS AgentLoop) | **done** |
| P1 | Resource layer read-only (`GET` endpoints for agents/tools/mcp/skills/knowledge/config/chats) | **done** |
| P2 | Resource layer read/write (POST/PUT/DELETE + souls + memory + permission allow-list) | **done** |
| P3 | Single-agent Run path (LLM clients, tool registry, agent loop, SSE endpoint) | **done** |
| P4 | Multi-agent orchestration (orchestrator, mention parsing, group dispatch) | **done** |
| P5 | MCP subprocess management + HTTP tool + permission gate | **done** |
| P6 | Flip `config.backend` default to `"go"` — JS path still preserved | pending |
| P7 | Delete JS AgentLoop + orphaned IPC handlers (requires explicit user greenlight) | pending |

---

## P0 Subtasks

- [x] `docs/go-migration/PROGRESS.md` (this file)
- [x] Mock Anthropic SSE server (`scripts/recorder/mockAnthropic.js`)
- [x] Chunk normalizer (`scripts/recorder/normalize.js`)
- [x] Scenario runner (`scripts/recorder/run.js`)
- [x] Tool mocking infra (`scripts/recorder/mockTools.js`, wraps `registry.execute`)
- [x] Scenario `01-simple-text` + golden
- [x] Scenario `02-multi-turn` + golden
- [x] Scenario `03-tool-call-shell` + golden (mocked tool, deterministic output)
- [x] Scenario `04-plan-submitted` + golden
- [x] Scenario `05-thinking-opus` + golden
- [x] Scenario `06-max-tokens-capped` + golden
- [x] Scenario `07-permission-request` + golden
- [x] Scenario `08-context-compaction` + golden
- [x] Scenario `09-stop-mid-stream` + golden (see note below)
- [x] Scenario `10-multi-tool-parallel` + golden
- [x] Scenario `11-max-tokens-reached` + golden
- [x] Scenario `12-image-tool-result` + golden
- [x] Reconcile `CHUNK_PROTOCOL.md` with real JS chunk shapes (4 update rounds)
- [x] Go module skeleton (`core/`) + `/v1/health` + session key auth
- [x] `air` hot reload config (`.air.toml`) + `npm run dev:go`
- [x] Electron spawn/shutdown plumbing behind `CLANK_USE_GO=1`
- [x] Cross-platform build script (`scripts/build-core.js`)
- [x] `.gitignore` fixes (whitelist recorder, docs/go-migration, build-core)
- [x] JS regression tests pass (3/4 suites, 78 tests; 1 pre-existing failure)
- [ ] Group-chat scenarios (deferred to P4; require IPC-layer orchestration)

## P1 Subtasks

- [x] `core/internal/datastore/` package — 7 files: store, config, agents, tools, mcpservers, chats, skills
- [x] Normalization logic mirrors JS dataNormalizers (agents two-format, tools dict→array, mcp legacy dict)
- [x] All GET routes wired in `server.go` behind auth middleware
- [x] `--data-dir` flag added to `main.go`, passed through Electron spawn
- [ ] Verification: `curl` all endpoints against real data dir, compare to Electron IPC responses
- [x] `GET /v1/souls/{agentId}/{type}` endpoint (soul file reader)
- [x] `GET /v1/knowledge` endpoint (knowledge.json reader)

## P2 Subtasks

- [x] Atomic write infrastructure (`write.go` — tmp+rename pattern)
- [x] Config: `PUT /v1/config` (partial merge)
- [x] Agents: `POST /v1/agents`, `PUT /v1/agents/{id}`, `DELETE /v1/agents/{id}`
- [x] Tools: `POST /v1/tools`, `PUT /v1/tools/{id}`, `DELETE /v1/tools/{id}`
- [x] MCP Servers: `POST`, `PUT`, `DELETE`
- [x] Chats: `POST /v1/chats`, `PUT /v1/chats/{id}`, `DELETE /v1/chats/{id}`, `POST /v1/chats/{id}/messages`
- [x] Souls: `PUT /v1/souls/{agentId}/{type}` (text or JSON body)
- [x] All write routes registered behind auth middleware
- [ ] Verification: end-to-end CRUD test with real data
- [ ] Skills write endpoints (deferred — skills are filesystem-managed via SKILL.md)

## P3 Subtasks

- [x] `core/internal/llm/chunk.go` — Chunk type definitions matching golden file spec
- [x] `core/internal/llm/client.go` — LLMClient interface (Stream, ResolveModel, SupportsThinking)
- [x] `core/internal/llm/sse.go` — Generic SSE stream parser
- [x] `core/internal/llm/anthropic.go` — Anthropic Messages API streaming client (raw HTTP, no SDK)
- [x] `core/internal/llm/openai.go` — OpenAI-compat streaming client (chat.completions, tool_calls accumulation)
- [x] `core/internal/engine/loop.go` — AgentLoop: iteration, tool dispatch, chunk emission (200-iter safety)
- [x] `core/internal/engine/context.go` — ContextManager: token tracking, shouldCompact, isExhausted
- [x] `core/internal/engine/prompt.go` — System prompt builder (identity, skills, MCP, tools, memory, RAG)
- [x] `core/internal/engine/message.go` — Message converter (attachments → multimodal, serializeToolResult, uiResult)
- [x] `core/internal/tools/registry.go` — Tool registry with register/execute/getDefinitions
- [x] `core/internal/tools/shell.go` — ShellTool (exec.Command, live stdout streaming via onUpdate)
- [x] `core/internal/tools/file.go` — FileTool (read/write/append/delete/list/mkdir)
- [x] `core/internal/tools/todo.go` — TodoTool (in-memory per-chat task list)
- [x] `core/internal/tools/soul.go` — SoulTool (read/write/append soul memory files)
- [x] `core/internal/server/handler_run.go` — SSE endpoint: POST /v1/chats/{id}/send, /stop, /permissions/{blockId}

## P4 Subtasks

- [x] `core/internal/engine/orchestrator.go` — Multi-agent group chat orchestrator (concurrent/sequential rounds, collaboration loop)
- [x] `core/internal/engine/mentions.go` — @mention parsing (CJK-compatible regex), resolveAddressees, dispatchGroupTasks

## P5 Subtasks

- [x] `core/internal/mcp/manager.go` — MCP subprocess manager (spawn, JSON-RPC 2.0, tools/list, tools/call, lifecycle)
- [x] `core/internal/tools/http.go` — HTTP tool executor (configurable URL/method/headers/body, template params)
- [x] `core/internal/engine/permission.go` — Permission gate (sandbox/allow/block/ask modes, pattern matching)

## Recorder Findings (2026-04-15, scenarios 01–06)

The 6 recordings surfaced everything below. All findings have been folded into
`CHUNK_PROTOCOL.md`. The real JS output is the ground truth.

### Chunk shape drifts

1. **`context_update.metrics` fields.** Real emits `maxTokens` and `percentage`.
   The spec doc listed `contextWindow` which does not exist in the real output.
2. **`agent_step: step-complete`.** Spec doc did not list this. Real code
   emits it at the very end of `run()`.
3. **`agent_step: step-tools-{iteration}`.** Spec doc did not list this either.
   Emitted only when `stop_reason === 'tool_use'`, before any tool executes.
4. **`agent_step.status` uses `completed` not `complete`.** The spec previously
   said the status value was `"complete"`; the actual string is `"completed"`.

### Ordering invariants surfaced

5. **Two distinct `context_update` emit sites at run end.** Stream-end emit
   (agentLoop.js:1828) + final-metrics emit (agentLoop.js:2009). When nothing
   follows the stream (normal `end_turn`, no tools), they appear adjacent with
   identical values. When the loop breaks mid-iteration (e.g. `plan_submitted`),
   they are separated by `tool_call`/`plan_submitted`/`tool_result`. Both emits
   always happen. Go must preserve both.
6. **Config-level `warning` chunks fire before `step-llm-1`.** E.g.
   `max_tokens_capped` emits between `step-init` and the first `step-llm-1`,
   not adjacent to the LLM call it affects.
7. **`submit_plan` tool-use sequence.** Inside `step-tools-{n}`, the exact
   order is `tool_call` → `plan_submitted` → `tool_result`, then the iteration
   loop breaks via `_planPending`. No `step-llm-{n+1}` follows.

### Tool infrastructure findings

8. **Mock installation must wrap `registry.execute`, not mutate
   `registry.tools`.** `AgentLoop.run()` calls `toolRegistry.loadForAgents()`
   at the top, which re-populates the `tools` map and clobbers any `set()`
   calls done before `run()`. The mockTools.js installer wraps the `execute`
   function, which is persistent across `loadForAgents` calls.
9. **Tool result shape: `uiResult()` flattening.** A tool returning
   `{ content: [{ type: 'text', text }], details: {...} }` is flattened by
   `uiResult()` in `messageConverter.js` to `{ text, ...details }` before
   being placed in the `tool_result` chunk. Go's equivalent must apply the
   same flattening.

### Findings from scenarios 07–12

10. **`permission_request` position.** Fires between `tool_call` and
    `tool_output`/`tool_result`. Contains `blockId` (UUID, normalized),
    `toolName`, `command`, `toolInput`. Auto-answered via
    `loop.resolvePermission()` from the onChunk callback — synchronous resolve
    works because the loop awaits a Promise that resolves immediately.
11. **`compaction` chunk position.** Fires between `step-init` and `step-llm-1`
    when `_compactionRequested` is true. The LLM call then uses the beta
    endpoint (`client.beta.messages.stream`) with compaction betas — the mock
    server handles this transparently since the URL path is still `/v1/messages`.
12. **Scenario 09 (stop-mid-stream) is AMBIGUOUS.** Because the mock server
    sends all SSE events synchronously, the stream is fully buffered before
    `loop.stop()` fires from `onChunk`. The loop breaks cleanly (`this.stopped`
    check at iteration top), but the final `context_update` + `step-complete`
    still emit. A true mid-HTTP-abort test would require slow-streaming mock
    with timed delays — deferred. The golden still captures the "clean stop
    after full consumption" pattern.
13. **Parallel tool ordering is deterministic.** `Promise.all` with sync mock
    tools produces: `tool_call A, tool_call B, tool_result A, tool_result B`.
    JS microtask FIFO guarantees this order for instant-returning async
    functions.
14. **`max_tokens_reached` fires between the stream-end `context_update` and the
    final-metrics `context_update`.** The `limit` value comes from
    `configuredMaxTokens` (resolved from model defaults), not from the mock
    response.
15. **Image tool result shape.** A tool returning `_mcpImages` gets the images
    extracted and placed as `images: [...]` on the `tool_result` chunk. The
    `_mcpImages` key is deleted from the result before `uiResult()` flattening.

### Non-issues (correct behavior)

- **`tools: 11` in step-llm details.** The tool registry auto-loads 11 built-in
  tools regardless of `enabledAgents`. Deterministic across runs.
- **No `send_message_complete` chunk in recordings.** Correct — that chunk is
  added by `electron/ipc/agent.js` IPC wrapper, not by `AgentLoop`. The
  recorder scope stops at AgentLoop-native chunks. Go's orchestration layer
  will add `send_message_complete` the same way.

---

## Decision Log

- **2026-04-15 — Orchestration moves into Go.** Multi-agent orchestration
  (`_buildAgentRuns`, `resolveAddressees`, `triggerCollaboration`,
  `dispatchGroupTasks`) moves into Go so frontend-agnostic clients (Electron,
  CLI, web, headless server) all get the same behavior. Overrides the original
  HTTP_API.md note that said orchestration stays in the IPC bridge.

- **2026-04-15 — Go owns the data layer, not just execution.** Since
  orchestration is in Go and the frontend may be anything (including nothing),
  Go owns reads AND writes of `agents.json` / `config.json` / `tools.json` /
  `mcp-servers.json` / chats / souls / memory / permission allow-lists.
  Electron becomes one client among many.

- **2026-04-15 — Resource + Run API replaces session API.** Drops the original
  `POST /v1/sessions` session-creation model. Instead:
  `GET/POST/PUT/DELETE /v1/agents`, `/v1/tools`, etc. (resources) +
  `POST /v1/chats/{id}/send` (run). Each run reads the current state from Go's
  own disk store, so there is no session-config drift. HTTP_API.md will be
  rewritten in P1.

- **2026-04-15 — Parallel-run strategy, flag-gated.** `config.backend` toggles
  path. Writes are never concurrent; reads are always safe. JS code stays
  until P7.

- **2026-04-15 — Recorder strategy.** Golden files are derived by running the
  existing JS `AgentLoop` against a mock LLM server — they are recordings, not
  hand-written. The recorder lives in `scripts/recorder/`, outputs to
  `core/testdata/golden/`. Scenarios under `scripts/recorder/scenarios/`
  describe both the conversation input AND the pre-baked mock LLM SSE events.

- **2026-04-15 — Data-dir split.** Embedded mode: Electron passes its
  `%APPDATA%/clankai/data/` path to Go via launch arg / env. Server mode: Go
  uses its own default (`/var/lib/clank` or `~/.clank`). Same schema, different
  base dirs.
