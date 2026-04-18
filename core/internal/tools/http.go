package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HTTPTool executes HTTP requests configured as tools.
type HTTPTool struct {
	id      string
	name    string
	url     string
	method  string
	headers map[string]string
	body    string
}

// NewHTTPTool creates an HTTP tool from a tool configuration.
func NewHTTPTool(config map[string]any) *HTTPTool {
	id, _ := config["id"].(string)
	name, _ := config["name"].(string)
	url, _ := config["url"].(string)
	method, _ := config["method"].(string)
	body, _ := config["body"].(string)
	if method == "" {
		method = "GET"
	}

	headers := make(map[string]string)
	if h, ok := config["headers"].(map[string]any); ok {
		for k, v := range h {
			if s, ok := v.(string); ok {
				headers[k] = s
			}
		}
	}

	return &HTTPTool{
		id: id, name: name, url: url,
		method: method, headers: headers, body: body,
	}
}

func (t *HTTPTool) Name() string { return t.name }

func (t *HTTPTool) Definition() map[string]any {
	return map[string]any{
		"name":        t.name,
		"description": fmt.Sprintf("HTTP %s %s", t.method, t.url),
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"body": map[string]any{
					"type":        "string",
					"description": "Request body (overrides default template)",
				},
				"params": map[string]any{
					"type":        "object",
					"description": "URL template parameters",
				},
			},
		},
	}
}

func (t *HTTPTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	url := t.url
	body := t.body

	// Override body from input
	if b, ok := input["body"].(string); ok && b != "" {
		body = b
	}

	// Template params
	if params, ok := input["params"].(map[string]any); ok {
		for k, v := range params {
			url = strings.ReplaceAll(url, "{"+k+"}", fmt.Sprintf("%v", v))
			body = strings.ReplaceAll(body, "{"+k+"}", fmt.Sprintf("%v", v))
		}
	}

	var bodyReader io.Reader
	if body != "" {
		bodyReader = bytes.NewBufferString(body)
	}

	req, err := http.NewRequest(strings.ToUpper(t.method), url, bodyReader)
	if err != nil {
		return textResult(fmt.Sprintf("Error creating request: %v", err)), nil
	}

	for k, v := range t.headers {
		req.Header.Set(k, v)
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return textResult(fmt.Sprintf("Request failed: %v", err)), nil
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 500*1024))

	result := map[string]any{
		"status":  resp.StatusCode,
		"headers": flattenHeaders(resp.Header),
	}

	// Try to parse as JSON for clean display
	var jsonBody any
	if json.Unmarshal(respBody, &jsonBody) == nil {
		result["body"] = jsonBody
	} else {
		result["body"] = string(respBody)
	}

	data, _ := json.Marshal(result)
	return textResult(string(data)), nil
}

func flattenHeaders(h http.Header) map[string]string {
	flat := make(map[string]string)
	for k, v := range h {
		flat[k] = strings.Join(v, ", ")
	}
	return flat
}
