package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// GeminiClient implements Client for Google's Gemini API.
// Uses the generateContent REST endpoint with streaming.
type GeminiClient struct {
	apiKey string
	model  string
}

// NewGeminiClient creates a new Gemini client.
func NewGeminiClient(apiKey, model string) *GeminiClient {
	return &GeminiClient{apiKey: apiKey, model: model}
}

func (c *GeminiClient) ProviderType() string        { return "google" }
func (c *GeminiClient) ResolveModel() string        { return c.model }
func (c *GeminiClient) SupportsThinking() bool      { return false }
func (c *GeminiClient) IsOpus46() bool              { return false }
func (c *GeminiClient) MaxContextWindow() int       { return 1000000 }

// Stream sends a streaming request to the Gemini generateContent API.
// Converts between Anthropic-style events and Gemini's response format.
func (c *GeminiClient) Stream(ctx context.Context, req *Request) (<-chan StreamEvent, <-chan error) {
	events := make(chan StreamEvent, 32)
	errc := make(chan error, 1)

	go func() {
		defer close(events)
		defer close(errc)

		// Build Gemini request
		geminiReq := map[string]any{
			"contents": toGeminiContents(req.System, req.Messages),
		}

		// Convert tools to Gemini format
		if len(req.Tools) > 0 {
			var funcs []map[string]any
			for _, t := range req.Tools {
				funcs = append(funcs, map[string]any{
					"name":                 t["name"],
					"description":          t["description"],
					"parametersJsonSchema": t["input_schema"],
				})
			}
			geminiReq["tools"] = []map[string]any{{"functionDeclarations": funcs}}
		}

		body, _ := json.Marshal(geminiReq)
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?alt=sse",
			c.model)

		httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		if err != nil {
			errc <- err
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-goog-api-key", c.apiKey)

		resp, err := StreamingHTTPClient.Do(httpReq)
		if err != nil {
			errc <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			data, _ := io.ReadAll(resp.Body)
			errc <- fmt.Errorf("gemini API error %d: %s", resp.StatusCode, string(data))
			return
		}

		// Parse Gemini SSE stream
		for sse := range ReadSSE(resp.Body) {
			var chunk geminiChunk
			if json.Unmarshal([]byte(sse.Data), &chunk) != nil {
				continue
			}

			for _, candidate := range chunk.Candidates {
				for _, part := range candidate.Content.Parts {
					if part.Text != "" {
						events <- StreamEvent{
							Type:  "content_block_delta",
							Delta: &Delta{Type: "text_delta", Text: part.Text},
						}
					}
					if part.FunctionCall != nil {
						events <- StreamEvent{
							Type: "content_block_start",
							ContentBlock: &ContentBlock{
								Type:  "tool_use",
								ID:    part.FunctionCall.Name,
								Name:  part.FunctionCall.Name,
								Input: part.FunctionCall.Args,
							},
						}
						events <- StreamEvent{Type: "content_block_stop"}
					}
				}

				if candidate.FinishReason != "" {
					stopReason := "end_turn"
					if candidate.FinishReason == "STOP" {
						stopReason = "end_turn"
					} else if candidate.FinishReason == "MAX_TOKENS" {
						stopReason = "max_tokens"
					}
					// Check if any function calls exist
					for _, part := range candidate.Content.Parts {
						if part.FunctionCall != nil {
							stopReason = "tool_use"
							break
						}
					}
					events <- StreamEvent{Type: "message_delta", StopReason: stopReason}
				}
			}

			if chunk.UsageMetadata != nil {
				events <- StreamEvent{
					Type: "message_start",
					Message: &MessageStart{
						Usage: Usage{
							InputTokens:  chunk.UsageMetadata.PromptTokenCount,
							OutputTokens: chunk.UsageMetadata.CandidatesTokenCount,
						},
					},
				}
			}
		}
	}()

	return events, errc
}

// toGeminiContents converts Anthropic-format messages to Gemini contents.
func toGeminiContents(system string, messages []map[string]any) []map[string]any {
	var contents []map[string]any

	// System prompt as a user/model turn pair
	if system != "" {
		contents = append(contents,
			map[string]any{"role": "user", "parts": []map[string]any{{"text": system}}},
			map[string]any{"role": "model", "parts": []map[string]any{{"text": "Understood."}}},
		)
	}

	for _, msg := range messages {
		role, _ := msg["role"].(string)
		geminiRole := "user"
		if role == "assistant" {
			geminiRole = "model"
		}

		switch content := msg["content"].(type) {
		case string:
			if content != "" {
				contents = append(contents, map[string]any{
					"role":  geminiRole,
					"parts": []map[string]any{{"text": content}},
				})
			}
		case []any:
			// Handle multimodal content blocks and tool results
			var parts []map[string]any
			for _, block := range content {
				bm, ok := block.(map[string]any)
				if !ok {
					continue
				}
				blockType, _ := bm["type"].(string)
				switch blockType {
				case "text":
					if text, _ := bm["text"].(string); text != "" {
						parts = append(parts, map[string]any{"text": text})
					}
				case "tool_use":
					name, _ := bm["name"].(string)
					input := bm["input"]
					parts = append(parts, map[string]any{
						"functionCall": map[string]any{"name": name, "args": input},
					})
				case "tool_result":
					toolContent, _ := bm["content"].(string)
					toolID, _ := bm["tool_use_id"].(string)
					parts = append(parts, map[string]any{
						"functionResponse": map[string]any{
							"name":     toolID,
							"response": map[string]any{"result": toolContent},
						},
					})
				}
			}
			if len(parts) > 0 {
				contents = append(contents, map[string]any{"role": geminiRole, "parts": parts})
			}
		}
	}

	return contents
}

type geminiChunk struct {
	Candidates    []geminiCandidate `json:"candidates"`
	UsageMetadata *geminiUsage      `json:"usageMetadata"`
}

type geminiCandidate struct {
	Content      geminiContent `json:"content"`
	FinishReason string        `json:"finishReason"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
	Role  string       `json:"role"`
}

type geminiPart struct {
	Text         string              `json:"text,omitempty"`
	FunctionCall *geminiFunctionCall `json:"functionCall,omitempty"`
}

type geminiFunctionCall struct {
	Name string `json:"name"`
	Args any    `json:"args"`
}

type geminiUsage struct {
	PromptTokenCount     int `json:"promptTokenCount"`
	CandidatesTokenCount int `json:"candidatesTokenCount"`
}
