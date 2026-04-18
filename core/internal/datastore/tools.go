package datastore

import "sort"

// ReadTools reads tools.json and normalizes it to an array.
//
// tools.json has two possible formats:
//   - Dict: { "toolId": { ...config }, "__deletedBuiltins": [...] } → convert to array, filter
//   - Array: [...] → use as-is
//
// Mirrors: electron/agent/dataNormalizers.js normalizeTools()
func (s *Store) ReadTools() ([]any, error) {
	v, err := s.readJSON("tools.json")
	if err != nil {
		return nil, err
	}
	if v == nil {
		return []any{}, nil
	}

	switch raw := v.(type) {
	case map[string]any:
		// Dict format: convert to array, inject id from key
		// Sort keys for deterministic ordering (Go map iteration is random)
		keys := make([]string, 0, len(raw))
		for k := range raw {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var result []any
		for _, key := range keys {
			val := raw[key]
			// Skip the __deletedBuiltins meta-key
			if key == "__deletedBuiltins" {
				continue
			}
			m := asMap(val)
			if m == nil {
				continue
			}
			// Set id from the dict key if not already present
			if _, hasID := m["id"]; !hasID {
				m["id"] = key
			}
			result = append(result, m)
		}
		return result, nil
	case []any:
		return raw, nil
	default:
		return []any{}, nil
	}
}

// ReadTool reads a single tool by ID.
func (s *Store) ReadTool(id string) (map[string]any, error) {
	tools, err := s.ReadTools()
	if err != nil {
		return nil, err
	}
	return findByID(tools, id), nil
}
