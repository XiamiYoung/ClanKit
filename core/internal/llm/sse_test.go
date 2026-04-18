package llm

import (
	"strings"
	"testing"
)

func TestReadSSE_BasicEvents(t *testing.T) {
	input := `event: message_start
data: {"type":"message_start"}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"hi"}}

`
	events := collectSSE(input)
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d: %+v", len(events), events)
	}
	if events[0].Event != "message_start" {
		t.Errorf("event[0].Event = %q", events[0].Event)
	}
	if events[1].Event != "content_block_delta" {
		t.Errorf("event[1].Event = %q", events[1].Event)
	}
}

func TestReadSSE_MultiLineData(t *testing.T) {
	input := `data: line1
data: line2

`
	events := collectSSE(input)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Data != "line1\nline2" {
		t.Errorf("expected multi-line data joined, got %q", events[0].Data)
	}
}

func TestReadSSE_CommentSkipped(t *testing.T) {
	input := `:keepalive
:another comment
data: {"x":1}

`
	events := collectSSE(input)
	if len(events) != 1 {
		t.Fatalf("expected 1 event (comments skipped), got %d", len(events))
	}
	if events[0].Data != `{"x":1}` {
		t.Errorf("data mismatch: %q", events[0].Data)
	}
}

func TestReadSSE_OpenAIStyle_DataOnly(t *testing.T) {
	// OpenAI SSE has no `event:` field
	input := `data: {"choices":[{"delta":{"content":"a"}}]}

data: {"choices":[{"delta":{"content":"b"}}]}

data: [DONE]

`
	events := collectSSE(input)
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}
	for _, ev := range events {
		if ev.Event != "" {
			t.Errorf("expected empty event field, got %q", ev.Event)
		}
	}
	if events[2].Data != "[DONE]" {
		t.Errorf("expected [DONE], got %q", events[2].Data)
	}
}

func collectSSE(input string) []SSEEvent {
	ch := ReadSSE(strings.NewReader(input))
	var events []SSEEvent
	for ev := range ch {
		events = append(events, ev)
	}
	return events
}

// ── Anthropic client URL validation ──

func TestNewAnthropicClient_RequiresBaseURL(t *testing.T) {
	if _, err := NewAnthropicClient("key", "", "claude-haiku-4-5"); err == nil {
		t.Fatal("expected error for empty baseURL")
	}
	if _, err := NewAnthropicClient("key", "http://x.com", "claude-haiku-4-5"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewOpenAICompatClient_RequiresBaseURL(t *testing.T) {
	if _, err := NewOpenAICompatClient("key", "", "gpt-4o", false); err == nil {
		t.Fatal("expected error for empty baseURL")
	}
}

// ── Model detection ──

func TestAnthropicClient_IsOpus46(t *testing.T) {
	cases := map[string]bool{
		"claude-opus-4-6":     true,
		"claude-opus-4.6":     true,
		"claude-opus-4-5":     false,
		"claude-haiku-4-5":    false,
		"claude-sonnet-4-5":   false,
	}
	for model, want := range cases {
		c, _ := NewAnthropicClient("k", "http://x", model)
		if got := c.IsOpus46(); got != want {
			t.Errorf("IsOpus46(%s) = %v, want %v", model, got, want)
		}
	}
}

func TestAnthropicClient_SupportsThinking(t *testing.T) {
	cases := map[string]bool{
		"claude-opus-4-6":   true,
		"claude-opus-4-5":   true,
		"claude-sonnet-4-5": true,
		"claude-haiku-4-5":  false,
	}
	for model, want := range cases {
		c, _ := NewAnthropicClient("k", "http://x", model)
		if got := c.SupportsThinking(); got != want {
			t.Errorf("SupportsThinking(%s) = %v, want %v", model, got, want)
		}
	}
}
