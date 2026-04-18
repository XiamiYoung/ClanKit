// Package engine provides the agent execution loop and supporting components.
package engine

import "github.com/nicekid1/ClankAI/core/internal/llm"

// ContextManager tracks token usage and decides when to compact.
type ContextManager struct {
	InputTokens              int
	OutputTokens             int
	CacheCreationInputTokens int
	CacheReadInputTokens     int
	CompactionCount          int
	maxContextTokens         int
}

// NewContextManager creates a ContextManager for the given context window.
func NewContextManager(maxTokens int) *ContextManager {
	if maxTokens <= 0 {
		maxTokens = 200000
	}
	return &ContextManager{maxContextTokens: maxTokens}
}

// GetMetrics returns the current metrics snapshot (matches golden file shape).
func (cm *ContextManager) GetMetrics() *llm.ContextMetrics {
	total := cm.InputTokens + cm.OutputTokens
	pct := 0
	if cm.maxContextTokens > 0 {
		pct = total * 100 / cm.maxContextTokens
	}
	return &llm.ContextMetrics{
		InputTokens:              cm.InputTokens,
		OutputTokens:             cm.OutputTokens,
		TotalTokens:              total,
		MaxTokens:                cm.maxContextTokens,
		Percentage:               pct,
		CacheCreationInputTokens: cm.CacheCreationInputTokens,
		CacheReadInputTokens:     cm.CacheReadInputTokens,
		CompactionCount:          cm.CompactionCount,
	}
}

// UpdateUsage updates token counts from an LLM response usage block.
// Anthropic sends cumulative input tokens per-call, so we use = (replace).
// Output tokens are per-call, so we also use = (replace with the final message's value).
func (cm *ContextManager) UpdateUsage(u llm.Usage) {
	cm.InputTokens = u.InputTokens
	cm.OutputTokens = u.OutputTokens
	cm.CacheCreationInputTokens = u.CacheCreationInputTokens
	cm.CacheReadInputTokens = u.CacheReadInputTokens
}

// ShouldCompact returns true when context usage exceeds 70% of max.
func (cm *ContextManager) ShouldCompact() bool {
	return cm.InputTokens >= cm.maxContextTokens*70/100
}

// IsExhausted returns true when context usage exceeds 90% of max.
func (cm *ContextManager) IsExhausted() bool {
	return cm.InputTokens >= cm.maxContextTokens*90/100
}

// TrimMessages keeps the first message (if user) + last N conversation turns.
// A "turn" is one user message + its assistant response. Older messages are
// replaced by a summary marker so the conversation context is coherent.
func TrimMessages(messages []map[string]any, keepTurns int) []map[string]any {
	if len(messages) <= keepTurns*2 {
		return messages
	}

	// Find user message indices
	var userIdx []int
	for i, m := range messages {
		if role, _ := m["role"].(string); role == "user" {
			userIdx = append(userIdx, i)
		}
	}

	if len(userIdx) <= keepTurns {
		return messages
	}

	// Keep the last N user messages (and everything after them)
	startIdx := userIdx[len(userIdx)-keepTurns]

	marker := map[string]any{
		"role":    "user",
		"content": "[Earlier conversation was trimmed to fit context window]",
	}
	markerReply := map[string]any{
		"role":    "assistant",
		"content": "Understood. Continuing with recent context.",
	}

	result := []map[string]any{marker, markerReply}
	result = append(result, messages[startIdx:]...)
	return result
}
