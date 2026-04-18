package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// OpenAICompatClient implements Client for OpenAI-compatible APIs.
// Covers: openai, openrouter, deepseek, qwen, glm, mistral, groq, xai, moonshot, doubao, ollama, custom.
type OpenAICompatClient struct {
	apiKey     string
	baseURL    string
	model      string
	directAuth bool // true = Bearer auth; false = proxy-based (OpenAI official)
}

// NewOpenAICompatClient creates a new OpenAI-compatible client.
// NewOpenAICompatClient creates a new OpenAI-compatible client.
// baseURL must be provided from user config — no hardcoded fallback per CLAUDE.md rules.
func NewOpenAICompatClient(apiKey, baseURL, model string, directAuth bool) (*OpenAICompatClient, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("openai-compat baseURL is required (no hardcoded fallback)")
	}
	return &OpenAICompatClient{
		apiKey:     apiKey,
		baseURL:    strings.TrimRight(baseURL, "/"),
		model:      model,
		directAuth: directAuth,
	}, nil
}

func (c *OpenAICompatClient) ProviderType() string        { return "openai" }
func (c *OpenAICompatClient) ResolveModel() string        { return c.model }
func (c *OpenAICompatClient) SupportsThinking() bool      { return false }
func (c *OpenAICompatClient) IsOpus46() bool              { return false }
func (c *OpenAICompatClient) MaxContextWindow() int       { return 128000 }

// Stream sends a streaming request to the OpenAI Chat Completions API.
func (c *OpenAICompatClient) Stream(ctx context.Context, req *Request) (<-chan StreamEvent, <-chan error) {
	events := make(chan StreamEvent, 32)
	errc := make(chan error, 1)

	go func() {
		defer close(events)
		defer close(errc)

		// Convert Anthropic-format request to OpenAI format
		openaiReq := map[string]any{
			"model":  req.Model,
			"stream": true,
		}

		// Build messages: system + conversation
		var msgs []map[string]any
		if req.System != "" {
			msgs = append(msgs, map[string]any{"role": "system", "content": req.System})
		}
		msgs = append(msgs, req.Messages...)
		openaiReq["messages"] = msgs

		if req.MaxTokens > 0 {
			openaiReq["max_tokens"] = req.MaxTokens
		}

		// Convert tools to OpenAI format
		if len(req.Tools) > 0 {
			var tools []map[string]any
			for _, t := range req.Tools {
				tools = append(tools, map[string]any{
					"type": "function",
					"function": map[string]any{
						"name":        t["name"],
						"description": t["description"],
						"parameters":  t["input_schema"],
					},
				})
			}
			openaiReq["tools"] = tools
		}

		body, _ := json.Marshal(openaiReq)
		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
		if err != nil {
			errc <- err
			return
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := StreamingHTTPClient.Do(httpReq)
		if err != nil {
			errc <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			data, _ := io.ReadAll(resp.Body)
			errc <- fmt.Errorf("openai API error %d: %s", resp.StatusCode, string(data))
			return
		}

		// Parse OpenAI SSE stream → convert to Anthropic-style events
		// OpenAI streams: data: {"choices":[{"delta":{"content":"...", "tool_calls":[...]}, "finish_reason":null}]}
		var toolCalls = map[int]*pendingToolCall{} // index → accumulated tool call

		for sse := range ReadSSE(resp.Body) {
			if sse.Data == "[DONE]" {
				break
			}

			var chunk openaiChunk
			if err := json.Unmarshal([]byte(sse.Data), &chunk); err != nil {
				continue
			}

			if len(chunk.Choices) == 0 {
				// Usage-only chunk (some providers send this at the end)
				if chunk.Usage != nil {
					events <- StreamEvent{
						Type:    "message_start",
						Message: &MessageStart{Usage: Usage{InputTokens: chunk.Usage.PromptTokens, OutputTokens: chunk.Usage.CompletionTokens}},
					}
				}
				continue
			}

			choice := chunk.Choices[0]
			delta := choice.Delta

			// Text content
			if delta.Content != "" {
				events <- StreamEvent{
					Type:  "content_block_delta",
					Delta: &Delta{Type: "text_delta", Text: delta.Content},
				}
			}

			// Tool calls
			for _, tc := range delta.ToolCalls {
				pending, exists := toolCalls[tc.Index]
				if !exists {
					pending = &pendingToolCall{Index: tc.Index}
					toolCalls[tc.Index] = pending
				}
				if tc.ID != "" {
					pending.ID = tc.ID
				}
				if tc.Function.Name != "" {
					pending.Name = tc.Function.Name
				}
				pending.Arguments += tc.Function.Arguments
			}

			// Finish reason
			if choice.FinishReason != "" {
				// Convert OpenAI finish_reason to Anthropic stop_reason
				stopReason := "end_turn"
				if choice.FinishReason == "tool_calls" || choice.FinishReason == "function_call" {
					stopReason = "tool_use"
				} else if choice.FinishReason == "length" {
					stopReason = "max_tokens"
				}

				// Emit accumulated tool calls as content blocks
				for _, tc := range toolCalls {
					var input any
					json.Unmarshal([]byte(tc.Arguments), &input)
					events <- StreamEvent{
						Type: "content_block_start",
						ContentBlock: &ContentBlock{
							Type:  "tool_use",
							ID:    tc.ID,
							Name:  tc.Name,
							Input: input,
						},
					}
					events <- StreamEvent{Type: "content_block_stop"}
				}

				events <- StreamEvent{Type: "message_delta", StopReason: stopReason}
			}
		}
	}()

	return events, errc
}

type openaiChunk struct {
	Choices []openaiChoice `json:"choices"`
	Usage   *openaiUsage   `json:"usage,omitempty"`
}

type openaiChoice struct {
	Delta        openaiDelta `json:"delta"`
	FinishReason string      `json:"finish_reason"`
}

type openaiDelta struct {
	Content   string           `json:"content"`
	ToolCalls []openaiToolCall `json:"tool_calls"`
}

type openaiToolCall struct {
	Index    int                  `json:"index"`
	ID       string               `json:"id"`
	Function openaiToolCallFunc   `json:"function"`
}

type openaiToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openaiUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}

type pendingToolCall struct {
	Index     int
	ID        string
	Name      string
	Arguments string
}
