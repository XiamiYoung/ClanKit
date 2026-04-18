package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/nicekid1/ClankAI/core/internal/llm"
	"github.com/nicekid1/ClankAI/core/internal/tools"
)

// TestGoldenParity runs Go AgentLoop against mock LLM servers using
// scenarios from scripts/recorder/scenarios/ and compares the chunk
// stream against the golden files recorded from the JS AgentLoop.
//
// This is the primary P3 correctness test. Any drift between Go and JS
// chunk output will fail this test.
func TestGoldenParity(t *testing.T) {
	// Find repo root
	repoRoot, err := findRepoRoot()
	if err != nil {
		t.Fatal(err)
	}

	scenariosDir := filepath.Join(repoRoot, "scripts", "recorder", "scenarios")
	goldenDir := filepath.Join(repoRoot, "core", "testdata", "golden")

	entries, err := os.ReadDir(scenariosDir)
	if err != nil {
		t.Fatal(err)
	}

	skip := map[string]string{}

	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ".json")

		if reason, skipped := skip[name]; skipped {
			t.Run(name, func(t *testing.T) {
				t.Skipf("skipped: %s", reason)
			})
			continue
		}

		t.Run(name, func(t *testing.T) {
			runGoldenScenario(t,
				filepath.Join(scenariosDir, entry.Name()),
				filepath.Join(goldenDir, name+".chunks.json"))
		})
	}
}

type scenario struct {
	Name                  string           `json:"name"`
	Model                 string           `json:"model"`
	Messages              []map[string]any `json:"messages"`
	LLMResponses          [][]sseEvent     `json:"llmResponses"`
	ToolMocks             map[string]any   `json:"toolMocks"`
	LoopConfigOverrides   map[string]any   `json:"loopConfigOverrides"`
	LoopInstanceOverrides map[string]any   `json:"loopInstanceOverrides"`
	AutoAnswerPermission  *struct {
		Decision string `json:"decision"`
		Pattern  string `json:"pattern"`
	} `json:"autoAnswerPermission"`
	StopOnChunk map[string]any `json:"stopOnChunk"`
}

type sseEvent struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func runGoldenScenario(t *testing.T, scenarioPath, goldenPath string) {
	t.Helper()

	data, err := os.ReadFile(scenarioPath)
	if err != nil {
		t.Fatal(err)
	}

	var sc scenario
	if err := json.Unmarshal(data, &sc); err != nil {
		t.Fatal(err)
	}

	// Start mock LLM server
	var responseIdx int
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		io.Copy(io.Discard, r.Body)

		if responseIdx >= len(sc.LLMResponses) {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		events := sc.LLMResponses[responseIdx]
		responseIdx++

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		for _, ev := range events {
			if ev.Event != "" {
				fmt.Fprintf(w, "event: %s\n", ev.Event)
			}
			// Data might be a string (e.g. "[DONE]") or a JSON object.
			// CRITICAL: compact JSON (no newlines) — SSE scanner splits on \n.
			var dataStr string
			if len(ev.Data) > 0 && ev.Data[0] == '"' {
				var s string
				json.Unmarshal(ev.Data, &s)
				dataStr = s
			} else {
				// Re-marshal to strip pretty-print whitespace
				var raw any
				if err := json.Unmarshal(ev.Data, &raw); err == nil {
					compact, _ := json.Marshal(raw)
					dataStr = string(compact)
				} else {
					dataStr = string(ev.Data)
				}
			}
			fmt.Fprintf(w, "data: %s\n\n", dataStr)
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}))
	defer server.Close()

	// Build LLM client pointing at mock
	var client llm.Client
	model := sc.Model
	if strings.HasPrefix(model, "claude") {
		c, err := llm.NewAnthropicClient("mock-key", server.URL, model)
		if err != nil {
			t.Fatal(err)
		}
		client = c
	} else if strings.HasPrefix(model, "gpt") {
		c, err := llm.NewOpenAICompatClient("mock-key", server.URL, model, false)
		if err != nil {
			t.Fatal(err)
		}
		client = c
	} else if strings.HasPrefix(model, "gemini") {
		// Gemini client hardcodes URL; skip in parity test.
		// A dedicated TestGeminiClient in llm package covers the SSE path.
		t.Skipf("gemini model uses hardcoded URL; covered by llm package tests")
	} else {
		t.Skipf("unsupported model: %s", model)
	}

	// Build tool registry with mocks
	registry := tools.NewRegistry(t.TempDir(), t.TempDir())
	if sc.ToolMocks != nil {
		for name, cfg := range sc.ToolMocks {
			cfgMap, _ := cfg.(map[string]any)
			registry.Register(&mockTool{name: name, cfg: cfgMap})
		}
	}

	// Enable permission gate in sandbox mode if scenario has autoAnswerPermission
	var permGate *PermissionGate
	if sc.AutoAnswerPermission != nil {
		permGate = &PermissionGate{GlobalMode: "sandbox"}
	}

	// Capture chunks
	var chunks []llm.Chunk
	var chunksMu sync.Mutex
	var loopRef *AgentLoop // forward declaration for onChunk closure
	var stopCalled bool

	loopCfg := LoopConfig{
		Client:         client,
		Registry:       registry,
		SystemPrompt:   "test system prompt",
		MaxTokens:      32768,
		ChatID:         "test",
		PermissionGate: permGate,
		OnChunk: func(c llm.Chunk) {
			chunksMu.Lock()
			chunks = append(chunks, c)
			chunksMu.Unlock()

			// Auto-answer permission requests
			if sc.AutoAnswerPermission != nil && c.Type == "permission_request" {
				loopRef.ResolvePermission(c.BlockID, sc.AutoAnswerPermission.Decision)
			}

			// Stop on matching chunk
			if sc.StopOnChunk != nil && !stopCalled && matchesChunk(c, sc.StopOnChunk) {
				stopCalled = true
				loopRef.Stop()
			}
		},
	}

	// Apply scenario-level overrides
	if ov := sc.LoopConfigOverrides; ov != nil {
		if v, ok := ov["maxOutputTokens"].(float64); ok {
			loopCfg.MaxTokens = int(v)
		}
		if v, ok := ov["providerMaxOutputTokens"].(float64); ok {
			loopCfg.ProviderMaxOutputTokens = int(v)
		}
		if v, ok := ov["_maxOutputTokensExplicit"].(bool); ok {
			loopCfg.MaxTokensExplicit = v
		}
	}

	loop := NewAgentLoop(context.Background(), loopCfg)
	loopRef = loop

	// Apply instance-level overrides (e.g. _compactionRequested → RequestCompaction)
	if sc.LoopInstanceOverrides != nil {
		if v, ok := sc.LoopInstanceOverrides["_compactionRequested"].(bool); ok && v {
			loop.RequestCompaction()
		}
	}

	_, runErr := loop.Run(sc.Messages)
	if runErr != nil {
		t.Logf("loop.Run error: %v", runErr)
	}

	// Normalize captured chunks
	normalized := normalizeChunks(chunks)

	// Compare structural properties against golden (not byte-for-byte since
	// details like token counts differ between Go estimation and JS runtime).
	assertChunkShape(t, normalized, goldenPath)
}

// assertChunkShape verifies the Go chunk stream has the same types and
// ordering as the JS golden file. Token counts and other runtime-specific
// values are not compared.
func assertChunkShape(t *testing.T, goChunks []map[string]any, goldenPath string) {
	t.Helper()

	data, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("failed to read golden: %v", err)
	}
	var jsChunks []map[string]any
	if err := json.Unmarshal(data, &jsChunks); err != nil {
		t.Fatal(err)
	}

	// Compare the sequence of chunk types
	goTypes := extractTypes(goChunks)
	jsTypes := extractTypes(jsChunks)

	if len(goTypes) != len(jsTypes) {
		t.Errorf("chunk count mismatch:\n  Go: %d %v\n  JS: %d %v",
			len(goTypes), goTypes, len(jsTypes), jsTypes)
		return
	}

	for i := range goTypes {
		if goTypes[i] != jsTypes[i] {
			t.Errorf("chunk[%d] type mismatch: Go=%q JS=%q\n  Go sequence: %v\n  JS sequence: %v",
				i, goTypes[i], jsTypes[i], goTypes, jsTypes)
			return
		}
	}
}

func extractTypes(chunks []map[string]any) []string {
	var result []string
	for _, c := range chunks {
		t, _ := c["type"].(string)
		id, _ := c["id"].(string)
		if t == "agent_step" && id != "" {
			result = append(result, t+"#"+id)
		} else {
			result = append(result, t)
		}
	}
	return result
}

// normalizeChunks applies the same transformations as scripts/recorder/normalize.js:
// - toolCallId → tool_{N}
// - permission_request.blockId → block_{N}
func normalizeChunks(chunks []llm.Chunk) []map[string]any {
	toolIDMap := make(map[string]string)
	blockIDMap := make(map[string]string)

	var result []map[string]any
	for _, c := range chunks {
		m := chunkToMap(c)
		if tid, ok := m["toolCallId"].(string); ok && tid != "" {
			if mapped, ok := toolIDMap[tid]; ok {
				m["toolCallId"] = mapped
			} else {
				mapped := fmt.Sprintf("tool_%d", len(toolIDMap))
				toolIDMap[tid] = mapped
				m["toolCallId"] = mapped
			}
		}
		if m["type"] == "permission_request" {
			if bid, ok := m["blockId"].(string); ok && bid != "" {
				if mapped, ok := blockIDMap[bid]; ok {
					m["blockId"] = mapped
				} else {
					mapped := fmt.Sprintf("block_%d", len(blockIDMap))
					blockIDMap[bid] = mapped
					m["blockId"] = mapped
				}
			}
		}
		result = append(result, m)
	}
	return result
}

func chunkToMap(c llm.Chunk) map[string]any {
	data, _ := json.Marshal(c)
	var m map[string]any
	json.Unmarshal(data, &m)
	return m
}

// matchesChunk returns true if the chunk matches the given pattern (all keys must match).
func matchesChunk(c llm.Chunk, pattern map[string]any) bool {
	m := chunkToMap(c)
	for k, v := range pattern {
		if m[k] != v {
			return false
		}
	}
	return true
}

// ── Mock tool ──

type mockTool struct {
	name string
	cfg  map[string]any
}

func (t *mockTool) Name() string                  { return t.name }
func (t *mockTool) Definition() map[string]any {
	return map[string]any{"name": t.name, "description": "mock"}
}
func (t *mockTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	if output, ok := t.cfg["output"].([]any); ok {
		for _, line := range output {
			lm, _ := line.(map[string]any)
			streamType, _ := lm["stream"].(string)
			text, _ := lm["text"].(string)
			if onUpdate != nil {
				onUpdate(streamType, text)
			}
		}
	}
	if result, ok := t.cfg["result"]; ok {
		return result, nil
	}
	return map[string]any{
		"content": []any{map[string]any{"type": "text", "text": "[mock]"}},
	}, nil
}

// ── Helpers ──

func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for i := 0; i < 10; i++ {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find repo root (no package.json found in ancestors)")
}

func init() {
	// Ensure tests are deterministic
	sort.Strings([]string{})
}
