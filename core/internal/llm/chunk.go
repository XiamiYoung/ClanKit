// Package llm provides LLM client abstractions and chunk types.
//
// Chunk types match the golden file spec in core/testdata/golden/ exactly.
// The Go engine MUST produce identical chunk streams to the JS AgentLoop.
package llm

// Chunk is any event emitted during an agent run.
// It serializes to JSON matching the CHUNK_PROTOCOL spec.
type Chunk struct {
	Type string `json:"type"`

	// text / thinking
	Text string `json:"text,omitempty"`

	// tool_call
	Name       string `json:"name,omitempty"`
	Input      any    `json:"input,omitempty"`
	ToolCallID string `json:"toolCallId,omitempty"`

	// tool_result
	Result any              `json:"result,omitempty"`
	Images []map[string]any `json:"images,omitempty"`

	// tool_output
	Stream string `json:"stream,omitempty"`

	// agent_step
	ID      string         `json:"id,omitempty"`
	Title   string         `json:"title,omitempty"`
	Status  string         `json:"status,omitempty"`
	Details map[string]any `json:"details,omitempty"`

	// context_update
	Metrics *ContextMetrics `json:"metrics,omitempty"`

	// warning
	Code string `json:"code,omitempty"`
	From int    `json:"from,omitempty"`
	To   int    `json:"to,omitempty"`

	// max_tokens_reached
	Limit int `json:"limit,omitempty"`

	// permission_request
	BlockID   string `json:"blockId,omitempty"`
	ToolName  string `json:"toolName,omitempty"`
	Command   string `json:"command,omitempty"`
	ToolInput any    `json:"toolInput,omitempty"`

	// plan_submitted
	Plan any `json:"plan,omitempty"`

	// compaction
	Message string `json:"message,omitempty"`

	// group chat envelope (added by orchestration layer)
	AgentID   string `json:"agentId,omitempty"`
	AgentName string `json:"agentName,omitempty"`

	// send_message_complete
	StickyTargetIDs []string `json:"stickyTargetIds,omitempty"`

	// send_message_error
	Error string `json:"error,omitempty"`
}

// ContextMetrics matches the context_update.metrics shape.
type ContextMetrics struct {
	InputTokens              int `json:"inputTokens"`
	OutputTokens             int `json:"outputTokens"`
	TotalTokens              int `json:"totalTokens"`
	MaxTokens                int `json:"maxTokens"`
	Percentage               int `json:"percentage"`
	CacheCreationInputTokens int `json:"cacheCreationInputTokens"`
	CacheReadInputTokens     int `json:"cacheReadInputTokens"`
	CompactionCount          int `json:"compactionCount"`
}

// ContentBlock represents a content block in an LLM response.
type ContentBlock struct {
	Type  string `json:"type"`            // text, tool_use, thinking
	Text  string `json:"text,omitempty"`
	ID    string `json:"id,omitempty"`    // tool_use id
	Name  string `json:"name,omitempty"` // tool_use name
	Input any    `json:"input,omitempty"`
}

// LLMResponse is the final message from an LLM call.
type LLMResponse struct {
	Content    []ContentBlock `json:"content"`
	StopReason string         `json:"stop_reason"`
	Usage      Usage          `json:"usage"`
}

// Usage tracks token consumption.
type Usage struct {
	InputTokens              int `json:"input_tokens"`
	OutputTokens             int `json:"output_tokens"`
	CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int `json:"cache_read_input_tokens"`
}
