package datastore

import "fmt"

// WriteTools writes the full tools list back to tools.json (always as array).
func (s *Store) WriteTools(tools []any) error {
	return s.writeJSON("tools.json", tools)
}

// CreateTool adds a tool and writes to disk.
func (s *Store) CreateTool(tool map[string]any) error {
	tools, err := s.ReadTools()
	if err != nil {
		return err
	}
	tools = append(tools, tool)
	return s.WriteTools(tools)
}

// UpdateTool replaces a tool by ID.
func (s *Store) UpdateTool(id string, updated map[string]any) error {
	tools, err := s.ReadTools()
	if err != nil {
		return err
	}
	found := false
	for i, item := range tools {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID == id {
				tools[i] = updated
				found = true
				break
			}
		}
	}
	if !found {
		return fmt.Errorf("tool %s not found", id)
	}
	return s.WriteTools(tools)
}

// DeleteTool removes a tool by ID.
func (s *Store) DeleteTool(id string) error {
	tools, err := s.ReadTools()
	if err != nil {
		return err
	}
	var filtered []any
	for _, item := range tools {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID != id {
				filtered = append(filtered, item)
			}
		}
	}
	return s.WriteTools(filtered)
}
