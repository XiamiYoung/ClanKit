package datastore

import "sort"

// ReadMcpServers reads mcp-servers.json and normalizes it to an array.
//
// mcp-servers.json has two possible formats:
//   - Array: [...] → use as-is
//   - Legacy dict: { "serverName": { ...config } } → convert to array, set id=name from key
//
// Mirrors: electron/agent/dataNormalizers.js normalizeMcpServers()
func (s *Store) ReadMcpServers() ([]any, error) {
	v, err := s.readJSON("mcp-servers.json")
	if err != nil {
		return nil, err
	}
	if v == nil {
		return []any{}, nil
	}

	switch raw := v.(type) {
	case []any:
		return raw, nil
	case map[string]any:
		// Legacy dict format: convert to array (sorted keys for determinism)
		keys := make([]string, 0, len(raw))
		for k := range raw {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var result []any
		for _, key := range keys {
			val := raw[key]
			m := asMap(val)
			if m == nil {
				continue
			}
			if _, hasID := m["id"]; !hasID {
				m["id"] = key
			}
			if _, hasName := m["name"]; !hasName {
				m["name"] = key
			}
			result = append(result, m)
		}
		return result, nil
	default:
		return []any{}, nil
	}
}

// ReadMcpServer reads a single MCP server by ID.
func (s *Store) ReadMcpServer(id string) (map[string]any, error) {
	servers, err := s.ReadMcpServers()
	if err != nil {
		return nil, err
	}
	return findByID(servers, id), nil
}
