package datastore

import (
	"fmt"
	"os"
	"path/filepath"
)

// WriteAgents writes the full agents list back to agents.json.
// Always writes in the object format { categories, agents } to preserve categories.
func (s *Store) WriteAgents(agents []any, categories []any) error {
	if categories == nil {
		categories = []any{}
	}
	return s.writeJSON("agents.json", map[string]any{
		"categories": categories,
		"agents":     agents,
	})
}

// ReadAgentsRaw reads agents.json preserving the full structure (for category access).
func (s *Store) ReadAgentsRaw() (agents []any, categories []any, err error) {
	v, err := s.readJSON("agents.json")
	if err != nil {
		return nil, nil, err
	}
	if v == nil {
		return []any{}, []any{}, nil
	}

	switch raw := v.(type) {
	case map[string]any:
		agents = asArray(raw["agents"])
		categories = asArray(raw["categories"])
		if agents == nil {
			agents = []any{}
		}
		if categories == nil {
			categories = []any{}
		}
	case []any:
		agents = raw
		categories = []any{}
	}
	return
}

// CreateAgent adds a new agent and writes to disk.
func (s *Store) CreateAgent(agent map[string]any) error {
	agents, categories, err := s.ReadAgentsRaw()
	if err != nil {
		return err
	}
	agents = append(agents, agent)
	return s.WriteAgents(agents, categories)
}

// UpdateAgent replaces an agent by ID and writes to disk.
func (s *Store) UpdateAgent(id string, updated map[string]any) error {
	agents, categories, err := s.ReadAgentsRaw()
	if err != nil {
		return err
	}
	found := false
	for i, item := range agents {
		m := asMap(item)
		if m == nil {
			continue
		}
		if itemID, _ := m["id"].(string); itemID == id {
			agents[i] = updated
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("agent %s not found", id)
	}
	return s.WriteAgents(agents, categories)
}

// DeleteAgent removes an agent by ID, writes to disk, and cleans up soul files.
func (s *Store) DeleteAgent(id string) error {
	agents, categories, err := s.ReadAgentsRaw()
	if err != nil {
		return err
	}
	var filtered []any
	for _, item := range agents {
		m := asMap(item)
		if m == nil {
			continue
		}
		if itemID, _ := m["id"].(string); itemID != id {
			filtered = append(filtered, item)
		}
	}
	if err := s.WriteAgents(filtered, categories); err != nil {
		return err
	}
	// Clean up associated soul files
	soulsDir := filepath.Join(s.DataDir, "souls", id)
	os.RemoveAll(soulsDir) // ignore error — may not exist
	return nil
}
