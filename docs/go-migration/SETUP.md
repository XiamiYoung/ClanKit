# Go Migration — Setup Checklist

Complete these steps before testing the Go core binary.

## 1. Install Go 1.22+

Download from https://go.dev/dl/ — choose the Windows amd64 installer.

After install, restart terminal and verify:
```bash
go version
# go version go1.22.x windows/amd64
```

## 2. Install air (hot reload)

```bash
go install github.com/air-verse/air@latest
```

Verify:
```bash
air -v
```

## 3. Verify Go compiles

```bash
cd core
go build ./cmd/clank-core
```

Should produce `clank-core.exe` in the `core/` directory.

## 4. Verify health endpoint

Terminal 1:
```bash
cd core
./clank-core.exe --mode embedded --port 7731
# Should print: READY
```

Terminal 2:
```bash
curl http://localhost:7731/v1/health
# {"mode":"embedded","status":"ok","version":"0.1.0"}
```

## 5. Verify session key auth

```bash
# Without key → 401
curl -s http://localhost:7731/v1/config
# {"code":"unauthorized","error":"..."}

# With key (dev mode bypasses)
CLANK_ENV=development ./clank-core.exe --mode embedded --port 7731
curl -s http://localhost:7731/v1/config
# (should succeed once config endpoint exists)
```

## 6. Verify Electron integration

```bash
CLANK_USE_GO=1 npm run dev
```

Check Electron console for `[GoCore] ready on port 7731`. If the binary
doesn't exist yet, it logs a warning and falls back to JS engine.

## 7. Verify air hot reload

Terminal 1:
```bash
cd core
air
```

Edit any `.go` file → air rebuilds automatically, restarts the binary.

## 8. Build for distribution

```bash
# Current platform only
npm run build:go

# All platforms (win-x64, mac-x64, mac-arm64)
npm run build:go:all
```

Output goes to `resources/{platform}/clank-core[.exe]`.
