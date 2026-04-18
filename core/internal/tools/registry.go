// Package tools provides the tool registry and built-in tool implementations.
package tools

import (
	"fmt"
	"sync"
)

// Tool is the interface for executable tools.
type Tool interface {
	// Name returns the tool's name.
	Name() string
	// Definition returns the Anthropic tool_use definition (name, description, input_schema).
	Definition() map[string]any
	// Execute runs the tool with the given input.
	// onUpdate is called for live streaming output (e.g. shell stdout).
	Execute(toolCallID string, input map[string]any, onUpdate func(streamType, text string)) (any, error)
}

// Registry manages available tools.
type Registry struct {
	mu    sync.RWMutex
	tools map[string]Tool
}

// NewRegistry creates a Registry with built-in tools registered.
func NewRegistry(soulsDir, dataDir string) *Registry {
	r := &Registry{tools: make(map[string]Tool)}

	// Register built-in tools
	r.Register(&ShellTool{})
	r.Register(&FileTool{BaseDir: dataDir})
	r.Register(NewTodoTool())
	r.Register(NewSoulTool(soulsDir))

	return r
}

// Register adds a tool to the registry.
func (r *Registry) Register(t Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[t.Name()] = t
}

// Get returns a tool by name.
func (r *Registry) Get(name string) (Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.tools[name]
	return t, ok
}

// Execute runs a tool by name.
func (r *Registry) Execute(name string, input map[string]any, toolCallID string, onUpdate func(streamType, text string)) (any, error) {
	t, ok := r.Get(name)
	if !ok {
		return nil, fmt.Errorf("tool %q not found", name)
	}
	return t.Execute(toolCallID, input, onUpdate)
}

// GetDefinitions returns all tool definitions for the LLM.
func (r *Registry) GetDefinitions() []map[string]any {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var defs []map[string]any
	for _, t := range r.tools {
		defs = append(defs, t.Definition())
	}
	return defs
}
