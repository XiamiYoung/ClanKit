package engine

import (
	"testing"

	"github.com/nicekid1/ClankAI/core/internal/llm"
)

func TestContextManager_GetMetrics(t *testing.T) {
	cm := NewContextManager(200000)
	cm.InputTokens = 50000
	cm.OutputTokens = 1000

	m := cm.GetMetrics()
	if m.InputTokens != 50000 {
		t.Errorf("input tokens: got %d, want 50000", m.InputTokens)
	}
	if m.TotalTokens != 51000 {
		t.Errorf("total tokens: got %d, want 51000", m.TotalTokens)
	}
	if m.Percentage != 25 {
		t.Errorf("percentage: got %d, want 25", m.Percentage)
	}
	if m.MaxTokens != 200000 {
		t.Errorf("max tokens: got %d, want 200000", m.MaxTokens)
	}
}

func TestContextManager_ShouldCompact(t *testing.T) {
	cm := NewContextManager(100000)

	cm.InputTokens = 50000
	if cm.ShouldCompact() {
		t.Error("50% should not trigger compact")
	}

	cm.InputTokens = 70000
	if !cm.ShouldCompact() {
		t.Error("70% should trigger compact")
	}
}

func TestContextManager_IsExhausted(t *testing.T) {
	cm := NewContextManager(100000)

	cm.InputTokens = 80000
	if cm.IsExhausted() {
		t.Error("80% should not be exhausted")
	}

	cm.InputTokens = 90000
	if !cm.IsExhausted() {
		t.Error("90% should be exhausted")
	}
}

func TestTrimMessages_KeepsRecent(t *testing.T) {
	msgs := []map[string]any{
		{"role": "user", "content": "t1"},
		{"role": "assistant", "content": "r1"},
		{"role": "user", "content": "t2"},
		{"role": "assistant", "content": "r2"},
		{"role": "user", "content": "t3"},
		{"role": "assistant", "content": "r3"},
		{"role": "user", "content": "t4"},
		{"role": "assistant", "content": "r4"},
	}
	trimmed := TrimMessages(msgs, 2)
	// Expected: marker + markerReply + t3/r3/t4/r4 = 6 messages
	if len(trimmed) != 6 {
		t.Fatalf("expected 6 messages after trim, got %d", len(trimmed))
	}
	// First should be the trim marker
	if trimmed[0]["role"] != "user" || trimmed[0]["content"] == msgs[0]["content"] {
		t.Errorf("first message should be marker, got %+v", trimmed[0])
	}
}

func TestTrimMessages_NoOpWhenSmall(t *testing.T) {
	msgs := []map[string]any{
		{"role": "user", "content": "t1"},
		{"role": "assistant", "content": "r1"},
	}
	trimmed := TrimMessages(msgs, 5)
	if len(trimmed) != 2 {
		t.Fatalf("expected no-op, got %d messages", len(trimmed))
	}
}

func TestContextManager_UpdateUsage(t *testing.T) {
	cm := NewContextManager(200000)
	cm.UpdateUsage(llm.Usage{
		InputTokens:  1000,
		OutputTokens: 500,
	})
	if cm.InputTokens != 1000 {
		t.Errorf("input: got %d", cm.InputTokens)
	}
	if cm.OutputTokens != 500 {
		t.Errorf("output: got %d", cm.OutputTokens)
	}

	// Second call replaces (not accumulates)
	cm.UpdateUsage(llm.Usage{
		InputTokens:  1200,
		OutputTokens: 300,
	})
	if cm.InputTokens != 1200 {
		t.Errorf("input should replace, got %d", cm.InputTokens)
	}
	if cm.OutputTokens != 300 {
		t.Errorf("output should replace, got %d", cm.OutputTokens)
	}
}
