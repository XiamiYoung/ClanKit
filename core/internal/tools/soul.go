package tools

import (
	"fmt"
	"os"
	"path/filepath"
)

// SoulTool reads and writes agent soul/memory files.
type SoulTool struct {
	soulsDir string
}

func NewSoulTool(soulsDir string) *SoulTool {
	return &SoulTool{soulsDir: soulsDir}
}

func (t *SoulTool) Name() string { return "soul_memory" }

func (t *SoulTool) Definition() map[string]any {
	return map[string]any{
		"name":        "soul_memory",
		"description": "Read or write soul memory files for agents. Soul files persist character traits, learned information, and relationship context across conversations.",
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{
					"type": "string",
					"enum": []string{"read", "write", "append"},
				},
				"agentId": map[string]any{"type": "string"},
				"type": map[string]any{
					"type":        "string",
					"description": "Soul type: system or users",
				},
				"content": map[string]any{"type": "string"},
			},
			"required": []string{"action", "agentId", "type"},
		},
	}
}

func (t *SoulTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	action, _ := input["action"].(string)
	agentID, _ := input["agentId"].(string)
	soulType, _ := input["type"].(string)
	content, _ := input["content"].(string)

	// Path traversal protection
	safePath, err := ValidatePath(t.soulsDir, filepath.Join(agentID, soulType+".md"))
	if err != nil {
		return textResult(fmt.Sprintf("Error: %v", err)), nil
	}
	filePath := safePath

	switch action {
	case "read":
		data, err := os.ReadFile(filePath)
		if err != nil {
			if os.IsNotExist(err) {
				return textResult("(empty — no soul file yet)"), nil
			}
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		return textResult(string(data)), nil

	case "write":
		dir := filepath.Dir(filePath)
		os.MkdirAll(dir, 0755)
		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		return textResult(fmt.Sprintf("Soul file written (%d bytes)", len(content))), nil

	case "append":
		dir := filepath.Dir(filePath)
		os.MkdirAll(dir, 0755)
		f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		defer f.Close()
		f.WriteString("\n" + content)
		return textResult("Appended to soul file"), nil

	default:
		return textResult(fmt.Sprintf("Unknown action: %s", action)), nil
	}
}
