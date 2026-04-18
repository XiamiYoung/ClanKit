package tools

import (
	"fmt"
	"os"
	"path/filepath"
)

// FileTool performs file system operations.
// All paths are validated against BaseDir to prevent traversal attacks.
type FileTool struct {
	BaseDir string // allowed root directory; empty = reject all operations
}

func (t *FileTool) Name() string { return "file_operation" }

func (t *FileTool) Definition() map[string]any {
	return map[string]any{
		"name":        "file_operation",
		"description": "Read, write, append, delete, list, or create directories. Use for file management tasks.",
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"operation": map[string]any{
					"type":        "string",
					"description": "Operation: read, write, append, delete, list, mkdir",
					"enum":        []string{"read", "write", "append", "delete", "list", "mkdir"},
				},
				"path": map[string]any{
					"type":        "string",
					"description": "File or directory path",
				},
				"content": map[string]any{
					"type":        "string",
					"description": "Content for write/append operations",
				},
			},
			"required": []string{"operation", "path"},
		},
	}
}

func (t *FileTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	op, _ := input["operation"].(string)
	path, _ := input["path"].(string)
	content, _ := input["content"].(string)

	if path == "" {
		return textResult("Error: path is required"), nil
	}

	// Path traversal protection
	safePath, err := ValidatePath(t.BaseDir, path)
	if err != nil {
		return textResult(fmt.Sprintf("Error: %v", err)), nil
	}
	path = safePath

	switch op {
	case "read":
		data, err := os.ReadFile(path)
		if err != nil {
			return textResult(fmt.Sprintf("Error reading file: %v", err)), nil
		}
		return textResult(string(data)), nil

	case "write":
		dir := filepath.Dir(path)
		os.MkdirAll(dir, 0755)
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			return textResult(fmt.Sprintf("Error writing file: %v", err)), nil
		}
		return textResult(fmt.Sprintf("File written: %s (%d bytes)", path, len(content))), nil

	case "append":
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		defer f.Close()
		f.WriteString(content)
		return textResult(fmt.Sprintf("Appended to %s", path)), nil

	case "delete":
		if err := os.Remove(path); err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		return textResult(fmt.Sprintf("Deleted: %s", path)), nil

	case "list":
		entries, err := os.ReadDir(path)
		if err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		var lines []string
		for _, e := range entries {
			prefix := "  "
			if e.IsDir() {
				prefix = "📁"
			}
			lines = append(lines, fmt.Sprintf("%s %s", prefix, e.Name()))
		}
		return textResult(fmt.Sprintf("%s\n(%d entries)", joinLines(lines), len(entries))), nil

	case "mkdir":
		if err := os.MkdirAll(path, 0755); err != nil {
			return textResult(fmt.Sprintf("Error: %v", err)), nil
		}
		return textResult(fmt.Sprintf("Directory created: %s", path)), nil

	default:
		return textResult(fmt.Sprintf("Unknown operation: %s", op)), nil
	}
}

func textResult(text string) map[string]any {
	return map[string]any{
		"content": []any{map[string]any{"type": "text", "text": text}},
	}
}

func joinLines(lines []string) string {
	result := ""
	for _, l := range lines {
		result += l + "\n"
	}
	return result
}
