# Go Migration — Architecture Decisions

This document records all architecture decisions made for the ClankAI Go core migration.
It is the authoritative reference for all implementation work.

---

## Goal

Rewrite the AgentLoop engine in Go, producing a standalone binary (`clank-core`) that:

1. **Replaces** `electron/agent/agentLoop.js` and `electron/ipc/agent.js` as the execution engine
2. **Runs embedded** inside the existing Electron app (transparent to users)
3. **Runs standalone** on a server without Electron (server deployment use case)
4. **Protects** core IP via compiled binary + obfuscation

The Electron frontend (Vue, Pinia, IPC channels) remains **completely unchanged**.

---

## Decision 1 — Language: Go

**Chosen:** Go

**Rationale:**
- Compiles to a single static binary (no runtime dependency)
- Goroutines are a natural fit for concurrent multi-agent execution
- Significantly faster development than Rust
- `garble` obfuscation provides sufficient commercial protection
- Cross-compilation: `GOOS/GOARCH` one-liner for all platforms
- Mature ecosystem for HTTP servers and subprocess management

**Rejected alternatives:**
- Rust: higher protection ceiling, but 2-3x slower to develop; borrow checker is painful for complex async state machines
- Node.js: plaintext JS is not protectable; obfuscation is easily reversed
- Python: pyc is trivially decompilable; not suitable for IP protection

---

## Decision 2 — Two Independent Builds

One source tree, two `go build` targets with compile-time feature flags:

| | Embedded Build | Server Build |
|---|---|---|
| Build tag | `-tags embedded` | `-tags server` |
| Distribution | Bundled inside Electron installer (free) | Sold/licensed separately |
| Server mode | Does not exist in binary (compile-time absent) | Full HTTP server |
| Obfuscation | `garble -tiny` (no `-literals`) | `garble -tiny -literals` |
| License check | Session key from Electron parent process | `license.dat` file |
| Build trigger | Every Electron release (automated) | Manual, infrequent |

The embedded build **cannot** be used as a server even if extracted — the server mode
code is absent at the compiler level, and it requires a per-launch session key from
the Electron parent process.

---

## Decision 3 — Embedded Mode Anti-Extraction

The embedded build is protected against extraction and standalone use:

**Session key mechanism:**
1. Electron generates a cryptographically random 256-bit secret on each launch
2. Secret is passed to the Go subprocess via environment variable `CLANK_SESSION_KEY`
3. Go reads the secret into memory immediately, then clears the environment variable
4. Every HTTP request to the Go server must include `X-Session-Key: {secret}`
5. Requests without the correct key are rejected silently (process exits)
6. The secret changes on every Electron restart — captured secrets cannot be reused

**Development mode bypass:**
- When `CLANK_ENV=development`, session key validation is skipped
- Only active when `go build -tags embedded` with dev env var

---

## Decision 4 — Server Build License

Server customers receive a signed `license.dat` file.

**Format:** JWT signed with Ed25519 (`alg: EdDSA`)

**Payload:**
```json
{
  "sub":          "customer-identifier",
  "machine_id":   "sha256:...",
  "tier":         "pro",
  "max_sessions": 10,
  "iat":          1713225600,
  "exp":          1767225600
}
```

**Key management:**
- Private key stored only on developer's machine (`~/.clank-keys/signing-key.pem`)
- Public key embedded in binary source (`core/internal/license/pubkey.go`), protected by garble
- Private key never committed to the repository

**License lookup order (highest priority first):**
1. `CLANK_LICENSE` env var — contains JWT directly (Docker/K8s friendly)
2. `CLANK_LICENSE_FILE` env var — path to license file
3. `license_file` field in `config.yaml`
4. `/etc/clank/license.dat`
5. Same directory as binary (`./license.dat`)

**Signing tool:** `license-tool` CLI in `core/cmd/license-tool/`

**Customer workflow:**
1. Customer runs `clank-core --machine-id` → outputs machine fingerprint
2. Customer sends fingerprint to developer
3. Developer runs `license-tool sign --customer ... --machine-id ... --expires ...`
4. Developer sends `license.dat` to customer
5. Customer places file per lookup order above

---

## Decision 5 — Runtime Modes

Single binary entry point, mode selected by `--mode` flag:

```
clank-core --mode embedded --port 7731          # Electron desktop
clank-core --mode server   --port 8080          # Server deployment
```

**Embedded mode:**
- Spawned by Electron `main.js`
- Listens on `localhost:{port}` (TCP, not Unix socket — simpler, same security for desktop)
- No external auth (session key is sufficient)
- Exits when stdin closes (parent process death detection)

**Server mode:**
- Runs as daemon / Docker container / systemd service
- Listens on `0.0.0.0:{port}` or configured bind address
- JWT auth via `Authorization: Bearer {token}` header
- Validates `license.dat` on startup

---

## Decision 6 — Communication Transport

**Chosen:** localhost TCP (both embedded and server modes use HTTP)

**Rationale:**
- Single code path for both modes
- Debuggable with curl/Postman during development
- No meaningful security risk on desktop (attacker needs local code execution, at which point the machine is already compromised)
- Unix sockets / Named Pipes add platform-specific complexity for marginal benefit

---

## Decision 7 — Multi-Provider Architecture

Three LLM client implementations behind a single interface:

```go
type LLMClient interface {
    Stream(ctx context.Context, req *Request) (<-chan Chunk, error)
    ResolveModel() string
    SupportsThinking() bool
    MaxContextWindow() int
}
```

| Implementation | Covers |
|---|---|
| `AnthropicClient` | anthropic |
| `GeminiClient` | google |
| `OpenAICompatClient` | openai, openai_official, openrouter, deepseek, qwen, glm, mistral, groq, xai, moonshot, doubao, ollama, custom |

Provider is resolved from `agent.providerId` → `config.providers[]` array,
identical logic to `agentRuntimeUtils.js` `normalizeLoopConfig`.

---

## Decision 8 — MCP Management

MCP server subprocesses are managed entirely by the Go binary.

- Rust `rmcp` crate is not used (wrong language)
- Go implementation: `os/exec` + JSON-RPC 2.0 over stdin/stdout
- Library: `github.com/mark3labs/mcp-go` (client side)
- Process lifecycle: spawn on first tool use, health-check, restart on crash
- Tool registration: `tools/list` response → dynamic registration into `ToolRegistry`

This means the Go binary is self-contained: it manages all subprocess lifecycles.
Electron does not touch MCP processes.

---

## Decision 9 — Repository Structure

Monorepo. Go module lives in `core/` subdirectory of the existing ClankAI repo.

**Rationale:**
- Feature parity requirement makes version sync critical
- Single CI pipeline
- `electron-builder` references built Go binaries via `extraResources`

```
ClankAI/
├── electron/               unchanged
├── src/                    unchanged (Vue)
├── core/                   new — Go module
│   ├── cmd/
│   │   ├── clank-core/     main binary
│   │   └── license-tool/   license signing CLI
│   ├── internal/           all implementation packages
│   └── go.mod
├── docs/go-migration/      this documentation
├── scripts/
│   └── build-core.js       cross-platform Go build script
├── resources/              built Go binaries (gitignored)
│   ├── win/clank-core.exe
│   ├── mac-x64/clank-core
│   └── mac-arm64/clank-core
└── package.json
```

---

## Decision 10 — Development Workflow

Single `npm run dev` command starts both Go (with hot reload) and Electron:

```json
{
  "dev":          "concurrently --kill-others --names \"go,electron\" \"npm run dev:go\" \"npm run dev:electron\"",
  "dev:go":       "cd core && air",
  "dev:electron": "wait-on tcp:7731 && vite & electron ."
}
```

- `air` watches Go files and hot-reloads the Go binary
- `wait-on` ensures Go is ready before Electron connects
- `Ctrl+C` stops both processes via `--kill-others`
- Electron checks `NODE_ENV=development` to connect to fixed port 7731 instead of spawning its own Go process

---

## Decision 11 — Testing Strategy

Two independent test suites, both must pass:

| Suite | Command | Tests |
|---|---|---|
| JS (existing) | `npm test` | Vue composables, IPC layer, data normalization |
| Go (new) | `cd core && go test ./...` | Engine logic, LLM clients, tools, golden file parity |

Combined: `npm run test:all` (runs both sequentially)

**Golden file parity tests** are the primary correctness guarantee:
- Mock LLM Server serves pre-recorded SSE responses
- Go engine runs against Mock LLM, produces chunk sequence
- Chunk sequence is compared byte-for-byte against golden JSON files
- Golden files were derived from JS behavior analysis — they are the specification

**Principle:** The chunk protocol is a contract. Any deviation from golden files is a bug,
not an implementation choice.

---

## Decision 12 — Antivirus / Distribution

**Windows/macOS distribution (Electron):**
- Embedded build does NOT use `garble -literals` to avoid high-entropy false positives
- Submit to 360 whitelist (https://s.360.cn) and Huorong whitelist after each release
- Code signing certificate: deferred (add when budget allows; EV cert preferred)

**Server build:**
- Full `garble -tiny -literals` obfuscation
- Enterprise customers manage their own AV whitelist

---

## Decision 13 — Execution Path Switch Timing

The switch from JS AgentLoop to Go engine happens in **a single commit** that modifies
`electron/ipc/agent.js` to call the Go server via HTTP instead of instantiating
`AgentLoop` directly.

This switch happens **only after** all Go golden file tests pass.
Until then, the existing JS code runs unchanged and the Go code exists purely as
a parallel implementation under test.
