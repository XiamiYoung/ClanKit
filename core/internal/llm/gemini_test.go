package llm

import (
	"strings"
	"testing"
)

func TestGeminiToGeminiContents_StringContent(t *testing.T) {
	msgs := []map[string]any{
		{"role": "user", "content": "hello"},
		{"role": "assistant", "content": "hi"},
	}
	contents := toGeminiContents("system prompt", msgs)
	// Expect: system pair + 2 messages = 4 entries
	if len(contents) != 4 {
		t.Fatalf("expected 4 contents (2 system + 2 messages), got %d", len(contents))
	}
	if contents[0]["role"] != "user" {
		t.Errorf("first entry role: got %v", contents[0]["role"])
	}
	if contents[1]["role"] != "model" {
		t.Errorf("second entry role: got %v", contents[1]["role"])
	}
}

func TestGeminiToGeminiContents_MultimodalAndToolResult(t *testing.T) {
	msgs := []map[string]any{
		{
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Let me check."},
				map[string]any{"type": "tool_use", "id": "t1", "name": "search", "input": map[string]any{"q": "foo"}},
			},
		},
		{
			"role": "user",
			"content": []any{
				map[string]any{"type": "tool_result", "tool_use_id": "t1", "content": "found it"},
			},
		},
	}
	contents := toGeminiContents("", msgs)
	if len(contents) != 2 {
		t.Fatalf("expected 2 contents, got %d", len(contents))
	}

	// First: assistant with text + functionCall
	parts0, _ := contents[0]["parts"].([]map[string]any)
	if len(parts0) != 2 {
		t.Fatalf("expected 2 parts on assistant, got %d: %+v", len(parts0), parts0)
	}
	if _, ok := parts0[1]["functionCall"]; !ok {
		t.Errorf("expected functionCall in assistant part[1], got %+v", parts0[1])
	}

	// Second: user with functionResponse
	parts1, _ := contents[1]["parts"].([]map[string]any)
	if len(parts1) != 1 {
		t.Fatalf("expected 1 part on user, got %d", len(parts1))
	}
	if _, ok := parts1[0]["functionResponse"]; !ok {
		t.Errorf("expected functionResponse in user part[0], got %+v", parts1[0])
	}
}

func TestGeminiToGeminiContents_EmptyContentSkipped(t *testing.T) {
	msgs := []map[string]any{
		{"role": "user", "content": ""},
	}
	contents := toGeminiContents("", msgs)
	if len(contents) != 0 {
		t.Errorf("empty content should be skipped, got %d", len(contents))
	}
}

func TestGeminiClient_ProviderType(t *testing.T) {
	c := NewGeminiClient("key", "gemini-2.0-flash")
	if c.ProviderType() != "google" {
		t.Errorf("expected google, got %s", c.ProviderType())
	}
	if c.ResolveModel() != "gemini-2.0-flash" {
		t.Errorf("expected gemini-2.0-flash, got %s", c.ResolveModel())
	}
}

// geminiSSEChunk is a minimal Gemini SSE response used to test end-to-end parsing.
func TestGeminiSSEParsing(t *testing.T) {
	sseData := `data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}

data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}

`
	var texts []string
	for ev := range ReadSSE(strings.NewReader(sseData)) {
		if strings.Contains(ev.Data, "text") {
			texts = append(texts, ev.Data)
		}
	}
	if len(texts) != 2 {
		t.Errorf("expected 2 chunks, got %d", len(texts))
	}
}
