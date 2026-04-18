package datastore

// ReadAgents reads agents.json and normalizes it to an array.
//
// agents.json has two possible formats:
//   - Object: { "categories": [...], "agents": [...] } → extract .agents
//   - Array:  [...] → use as-is
//
// Mirrors: electron/agent/dataNormalizers.js normalizeAgents()
func (s *Store) ReadAgents() ([]any, error) {
	v, err := s.readJSON("agents.json")
	if err != nil {
		return nil, err
	}
	if v == nil {
		return []any{}, nil
	}

	switch raw := v.(type) {
	case map[string]any:
		// Object format: extract .agents array
		if agents := asArray(raw["agents"]); agents != nil {
			return agents, nil
		}
		return []any{}, nil
	case []any:
		return raw, nil
	default:
		return []any{}, nil
	}
}

// ReadAgent reads a single agent by ID.
func (s *Store) ReadAgent(id string) (map[string]any, error) {
	agents, err := s.ReadAgents()
	if err != nil {
		return nil, err
	}
	return findByID(agents, id), nil
}
