package llm

import "context"

// StreamEvent is a single event from an LLM streaming response.
type StreamEvent struct {
	// Anthropic event types: message_start, content_block_start,
	// content_block_delta, content_block_stop, message_delta, message_stop
	Type string

	// content_block_start
	Index        int
	ContentBlock *ContentBlock

	// content_block_delta
	Delta *Delta

	// message_delta
	StopReason string
	DeltaUsage *Usage

	// message_start
	Message *MessageStart
}

// Delta is the delta payload in a content_block_delta event.
type Delta struct {
	Type        string `json:"type"` // text_delta, thinking_delta, input_json_delta
	Text        string `json:"text,omitempty"`
	Thinking    string `json:"thinking,omitempty"`
	PartialJSON string `json:"partial_json,omitempty"`
}

// MessageStart is the message payload in a message_start event.
type MessageStart struct {
	ID    string `json:"id"`
	Model string `json:"model"`
	Usage Usage  `json:"usage"`
}

// Client is the interface for LLM providers.
type Client interface {
	// Stream sends a request and returns a channel of streaming events.
	Stream(ctx context.Context, req *Request) (<-chan StreamEvent, <-chan error)

	// ProviderType returns the provider identifier (e.g. "anthropic", "openai", "google").
	ProviderType() string

	// ResolveModel returns the model ID this client will use.
	ResolveModel() string

	// SupportsThinking returns true if the model supports extended thinking.
	SupportsThinking() bool

	// IsOpus46 returns true if the model is Opus 4.6 (adaptive thinking).
	IsOpus46() bool

	// MaxContextWindow returns the context window size.
	MaxContextWindow() int
}

// Request is the parameters for an LLM call.
type Request struct {
	Model     string           `json:"model"`
	MaxTokens int              `json:"max_tokens"`
	System    string           `json:"system"`
	Messages  []map[string]any `json:"messages"`
	Tools     []map[string]any `json:"tools,omitempty"`
	Stream    bool             `json:"stream"`
	Thinking  map[string]any   `json:"thinking,omitempty"`
}
