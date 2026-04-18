package engine

import (
	"encoding/json"
	"fmt"
)

// BuildConversationMessages prepares messages for the LLM API.
// Converts attachments on the last user message to multimodal content blocks.
func BuildConversationMessages(messages []map[string]any, attachments []map[string]any) []map[string]any {
	if len(messages) == 0 {
		return messages
	}

	// Deep clone via JSON round-trip to avoid shared references
	data, _ := json.Marshal(messages)
	var result []map[string]any
	json.Unmarshal(data, &result)

	// If no attachments, return as-is
	if len(attachments) == 0 {
		return result
	}

	// Find last user message and add attachments as multimodal content
	for i := len(result) - 1; i >= 0; i-- {
		if result[i]["role"] == "user" {
			content := result[i]["content"]
			textContent := ""
			if s, ok := content.(string); ok {
				textContent = s
			}

			var blocks []map[string]any
			for _, att := range attachments {
				attType, _ := att["type"].(string)
				switch attType {
				case "image":
					mediaType, _ := att["media_type"].(string)
					data, _ := att["data"].(string)
					blocks = append(blocks, map[string]any{
						"type": "image",
						"source": map[string]any{
							"type":       "base64",
							"media_type": mediaType,
							"data":       data,
						},
					})
				case "file":
					name, _ := att["name"].(string)
					data, _ := att["data"].(string)
					blocks = append(blocks, map[string]any{
						"type": "text",
						"text": fmt.Sprintf("--- File: %s ---\n%s\n--- End ---", name, data),
					})
				}
			}

			// Add the original text content at the end
			if textContent != "" {
				blocks = append(blocks, map[string]any{
					"type": "text",
					"text": textContent,
				})
			}

			result[i]["content"] = blocks
			break
		}
	}

	return result
}

// SerializeToolResult converts a tool result to a string for the LLM.
// Mirrors: messageConverter.js serializeToolResult()
func SerializeToolResult(result any) string {
	switch v := result.(type) {
	case string:
		return truncate(v, 100000)
	case map[string]any:
		// Unified format: { content: [{ type: 'text', text: '...' }] }
		if content, ok := v["content"].([]any); ok && len(content) > 0 {
			if first, ok := content[0].(map[string]any); ok {
				if text, ok := first["text"].(string); ok {
					return truncate(text, 100000)
				}
			}
		}
		// Fallback: JSON stringify
		data, _ := json.Marshal(v)
		return truncate(string(data), 100000)
	default:
		data, _ := json.Marshal(v)
		return truncate(string(data), 100000)
	}
}

// UIResult converts a tool result for the tool_result chunk.
// Mirrors: messageConverter.js uiResult()
func UIResult(result any) any {
	m, ok := result.(map[string]any)
	if !ok {
		return result
	}
	content, _ := m["content"].([]any)
	if len(content) == 0 {
		return result
	}
	first, _ := content[0].(map[string]any)
	if first == nil || first["type"] != "text" {
		return result
	}
	text, _ := first["text"].(string)

	// Flatten: { text, ...details }
	out := map[string]any{"text": text}
	if details, ok := m["details"].(map[string]any); ok {
		for k, v := range details {
			out[k] = v
		}
	}
	return out
}

func truncate(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "... [truncated]"
}
