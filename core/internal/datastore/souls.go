package datastore

import (
	"os"
	"path/filepath"
)

// ReadSoul reads a soul file: souls/{agentId}/{type}.md
// Type is typically "system" or "users".
// ReadSoul reads a soul file. Returns (content, found, error).
// An empty file returns ("", true, nil) — distinct from not-found ("", false, nil).
func (s *Store) ReadSoul(agentID, soulType string) (string, bool, error) {
	filePath := filepath.Join(s.DataDir, "souls", agentID, soulType+".md")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	return string(data), true, nil
}

// ReadSoulDir lists all soul types available for an agent.
func (s *Store) ReadSoulDir(agentID string) ([]map[string]any, error) {
	dir := filepath.Join(s.DataDir, "souls", agentID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []map[string]any{}, nil
		}
		return nil, err
	}

	var result []map[string]any
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := filepath.Ext(name)
		if ext != ".md" {
			continue
		}
		soulType := name[:len(name)-len(ext)]
		result = append(result, map[string]any{
			"agentId": agentID,
			"type":    soulType,
		})
	}
	return result, nil
}
