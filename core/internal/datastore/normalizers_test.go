package datastore

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// setupStore creates a temporary data directory for tests.
func setupStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	return New(dir)
}

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	path := filepath.Join(dir, name)
	os.MkdirAll(filepath.Dir(path), 0755)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// ── Agents normalizer ──

func TestReadAgents_ObjectFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "agents.json", `{
		"categories": [],
		"agents": [
			{"id": "a1", "name": "Alice"},
			{"id": "a2", "name": "Bob"}
		]
	}`)

	agents, err := s.ReadAgents()
	if err != nil {
		t.Fatal(err)
	}
	if len(agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(agents))
	}
}

func TestReadAgents_ArrayFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "agents.json", `[
		{"id": "a1", "name": "Alice"},
		{"id": "a2", "name": "Bob"}
	]`)

	agents, err := s.ReadAgents()
	if err != nil {
		t.Fatal(err)
	}
	if len(agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(agents))
	}
}

func TestReadAgents_MissingFile(t *testing.T) {
	s := setupStore(t)
	agents, err := s.ReadAgents()
	if err != nil {
		t.Fatal(err)
	}
	if len(agents) != 0 {
		t.Fatalf("expected empty, got %d", len(agents))
	}
}

func TestReadAgent_ByID(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "agents.json", `[
		{"id": "a1", "name": "Alice"},
		{"id": "a2", "name": "Bob"}
	]`)

	a, err := s.ReadAgent("a2")
	if err != nil {
		t.Fatal(err)
	}
	if a == nil {
		t.Fatal("expected agent a2")
	}
	if a["name"] != "Bob" {
		t.Fatalf("expected Bob, got %v", a["name"])
	}
}

// ── Tools normalizer ──

func TestReadTools_DictFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "tools.json", `{
		"tool1": {"name": "Tool One"},
		"tool2": {"name": "Tool Two"},
		"__deletedBuiltins": ["removed-tool"]
	}`)

	tools, err := s.ReadTools()
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 2 {
		t.Fatalf("expected 2 tools (filtered __deletedBuiltins), got %d", len(tools))
	}
	// Check sorted order (determinism)
	first, _ := tools[0].(map[string]any)
	if first["id"] != "tool1" {
		t.Fatalf("expected tool1 first (sorted), got %v", first["id"])
	}
}

func TestReadTools_ArrayFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "tools.json", `[
		{"id": "t1", "name": "Tool A"}
	]`)

	tools, err := s.ReadTools()
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools))
	}
}

// ── MCP Servers normalizer ──

func TestReadMcpServers_LegacyDictFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "mcp-servers.json", `{
		"filesystem": {"command": "npx", "args": ["fs-server"]},
		"git": {"command": "npx", "args": ["git-server"]}
	}`)

	servers, err := s.ReadMcpServers()
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %d", len(servers))
	}
	first, _ := servers[0].(map[string]any)
	// Sorted order: filesystem < git
	if first["id"] != "filesystem" {
		t.Fatalf("expected filesystem first (sorted), got %v", first["id"])
	}
	if first["name"] != "filesystem" {
		t.Fatalf("expected name=filesystem (from key), got %v", first["name"])
	}
}

func TestReadMcpServers_ArrayFormat(t *testing.T) {
	s := setupStore(t)
	writeFile(t, s.DataDir, "mcp-servers.json", `[
		{"id": "s1", "name": "server1", "command": "run"}
	]`)

	servers, err := s.ReadMcpServers()
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
}

// ── Atomic write ──

func TestWriteAgents_Atomic(t *testing.T) {
	s := setupStore(t)

	if err := s.WriteAgents([]any{
		map[string]any{"id": "a1", "name": "Alice"},
	}, []any{}); err != nil {
		t.Fatal(err)
	}

	// Read back
	data, err := os.ReadFile(filepath.Join(s.DataDir, "agents.json"))
	if err != nil {
		t.Fatal(err)
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	agents, ok := result["agents"].([]any)
	if !ok || len(agents) != 1 {
		t.Fatalf("expected 1 agent in object format, got %v", result)
	}
}

func TestCreateAgent_UpdateAgent_DeleteAgent(t *testing.T) {
	s := setupStore(t)

	// Create
	if err := s.CreateAgent(map[string]any{"id": "a1", "name": "Alice"}); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateAgent(map[string]any{"id": "a2", "name": "Bob"}); err != nil {
		t.Fatal(err)
	}

	// Update
	if err := s.UpdateAgent("a1", map[string]any{"id": "a1", "name": "Alice Updated"}); err != nil {
		t.Fatal(err)
	}
	a, _ := s.ReadAgent("a1")
	if a["name"] != "Alice Updated" {
		t.Fatalf("expected updated, got %v", a["name"])
	}

	// Delete
	if err := s.DeleteAgent("a2"); err != nil {
		t.Fatal(err)
	}
	agents, _ := s.ReadAgents()
	if len(agents) != 1 {
		t.Fatalf("expected 1 after delete, got %d", len(agents))
	}
}

// ── Skills parser ──

func TestParseFrontmatter(t *testing.T) {
	content := `---
name: "My Skill"
description: 'A multi-word description'
---

# Body
`
	name, desc := parseFrontmatter(content)
	if name != "My Skill" {
		t.Fatalf("expected 'My Skill', got %q", name)
	}
	if desc != "A multi-word description" {
		t.Fatalf("expected stripped quotes, got %q", desc)
	}
}

func TestStripQuotes(t *testing.T) {
	cases := map[string]string{
		`"hello"`:    "hello",
		`'hello'`:    "hello",
		`hello`:      "hello",
		`"unclosed`:  `"unclosed`,
		`''`:         "",
	}
	for input, want := range cases {
		if got := stripQuotes(input); got != want {
			t.Errorf("stripQuotes(%q) = %q, want %q", input, got, want)
		}
	}
}
