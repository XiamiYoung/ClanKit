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

// AnthropicClient implements Client for the Anthropic Messages API.
// Uses raw HTTP + SSE parsing (no SDK dependency).
type AnthropicClient struct {
	apiKey  string
	baseURL string
	model   string
}

// NewAnthropicClient creates a new Anthropic client.
// NewAnthropicClient creates a new Anthropic client.
// baseURL must be provided from user config — no hardcoded fallback per CLAUDE.md rules.
func NewAnthropicClient(apiKey, baseURL, model string) (*AnthropicClient, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("anthropic baseURL is required (no hardcoded fallback)")
	}
	return &AnthropicClient{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
	}, nil
}

func (c *AnthropicClient) ProviderType() string        { return "anthropic" }
func (c *AnthropicClient) ResolveModel() string        { return c.model }
func (c *AnthropicClient) MaxContextWindow() int       { return 200000 }

func (c *AnthropicClient) IsOpus46() bool {
	return strings.Contains(c.model, "opus-4-6") || strings.Contains(c.model, "opus-4.6")
}

func (c *AnthropicClient) SupportsThinking() bool {
	return strings.Contains(c.model, "opus") || strings.Contains(c.model, "sonnet-4")
}

// Stream sends a streaming request to the Anthropic Messages API.
func (c *AnthropicClient) Stream(ctx context.Context, req *Request) (<-chan StreamEvent, <-chan error) {
	events := make(chan StreamEvent, 32)
	errc := make(chan error, 1)

	go func() {
		defer close(events)
		defer close(errc)

		body, _ := json.Marshal(req)
		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/messages", bytes.NewReader(body))
		if err != nil {
			errc <- err
			return
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-api-key", c.apiKey)
		httpReq.Header.Set("anthropic-version", "2023-06-01")

		resp, err := StreamingHTTPClient.Do(httpReq)
		if err != nil {
			errc <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			data, _ := io.ReadAll(resp.Body)
			errc <- fmt.Errorf("anthropic API error %d: %s", resp.StatusCode, string(data))
			return
		}

		for sse := range ReadSSE(resp.Body) {
			event, err := parseAnthropicEvent(sse)
			if err != nil {
				errc <- err
				return
			}
			if event != nil {
				select {
				case events <- *event:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return events, errc
}

func parseAnthropicEvent(sse SSEEvent) (*StreamEvent, error) {
	switch sse.Event {
	case "message_start":
		var payload struct {
			Message MessageStart `json:"message"`
		}
		if err := json.Unmarshal([]byte(sse.Data), &payload); err != nil {
			return nil, err
		}
		return &StreamEvent{Type: "message_start", Message: &payload.Message}, nil

	case "content_block_start":
		var payload struct {
			Index        int          `json:"index"`
			ContentBlock ContentBlock `json:"content_block"`
		}
		if err := json.Unmarshal([]byte(sse.Data), &payload); err != nil {
			return nil, err
		}
		return &StreamEvent{Type: "content_block_start", Index: payload.Index, ContentBlock: &payload.ContentBlock}, nil

	case "content_block_delta":
		var payload struct {
			Index int   `json:"index"`
			Delta Delta `json:"delta"`
		}
		if err := json.Unmarshal([]byte(sse.Data), &payload); err != nil {
			return nil, err
		}
		return &StreamEvent{Type: "content_block_delta", Index: payload.Index, Delta: &payload.Delta}, nil

	case "content_block_stop":
		var payload struct {
			Index int `json:"index"`
		}
		json.Unmarshal([]byte(sse.Data), &payload)
		return &StreamEvent{Type: "content_block_stop", Index: payload.Index}, nil

	case "message_delta":
		var payload struct {
			Delta struct {
				StopReason string `json:"stop_reason"`
			} `json:"delta"`
			Usage Usage `json:"usage"`
		}
		if err := json.Unmarshal([]byte(sse.Data), &payload); err != nil {
			return nil, err
		}
		return &StreamEvent{
			Type:       "message_delta",
			StopReason: payload.Delta.StopReason,
			DeltaUsage: &payload.Usage,
		}, nil

	case "message_stop":
		return &StreamEvent{Type: "message_stop"}, nil

	case "ping":
		return nil, nil // skip keepalive

	default:
		return nil, nil // unknown events are ignored
	}
}
