package tools

import (
	"encoding/json"
	"fmt"
	"sync"
)

// TodoTool manages task lists per chat.
type TodoTool struct {
	mu    sync.Mutex
	todos map[string][]map[string]any // chatId → []todo
}

func NewTodoTool() *TodoTool {
	return &TodoTool{todos: make(map[string][]map[string]any)}
}

func (t *TodoTool) Name() string { return "todo_manager" }

func (t *TodoTool) Definition() map[string]any {
	return map[string]any{
		"name":        "todo_manager",
		"description": "Create, list, update, and delete todo items for task planning and tracking.",
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{
					"type": "string",
					"enum": []string{"add", "list", "update", "delete", "clear"},
				},
				"chatId": map[string]any{"type": "string"},
				"id":     map[string]any{"type": "string"},
				"text":   map[string]any{"type": "string"},
				"status": map[string]any{"type": "string"},
			},
			"required": []string{"action", "chatId"},
		},
	}
}

func (t *TodoTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	action, _ := input["action"].(string)
	chatID, _ := input["chatId"].(string)

	switch action {
	case "add":
		text, _ := input["text"].(string)
		id := fmt.Sprintf("todo_%d", len(t.todos[chatID])+1)
		todo := map[string]any{"id": id, "text": text, "status": "pending"}
		t.todos[chatID] = append(t.todos[chatID], todo)
		return textResult(fmt.Sprintf("Added todo: %s", id)), nil

	case "list":
		data, _ := json.Marshal(t.todos[chatID])
		return textResult(string(data)), nil

	case "update":
		id, _ := input["id"].(string)
		for _, todo := range t.todos[chatID] {
			if todo["id"] == id {
				if s, ok := input["status"].(string); ok {
					todo["status"] = s
				}
				if s, ok := input["text"].(string); ok {
					todo["text"] = s
				}
				return textResult(fmt.Sprintf("Updated: %s", id)), nil
			}
		}
		return textResult(fmt.Sprintf("Todo %s not found", id)), nil

	case "delete":
		id, _ := input["id"].(string)
		var filtered []map[string]any
		for _, todo := range t.todos[chatID] {
			if todo["id"] != id {
				filtered = append(filtered, todo)
			}
		}
		t.todos[chatID] = filtered
		return textResult(fmt.Sprintf("Deleted: %s", id)), nil

	case "clear":
		t.todos[chatID] = nil
		return textResult("Cleared all todos"), nil

	default:
		return textResult(fmt.Sprintf("Unknown action: %s", action)), nil
	}
}
