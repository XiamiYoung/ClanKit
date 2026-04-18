package datastore

import (
	"os"
	"path/filepath"
)

// WriteSoul writes a soul file: souls/{agentId}/{type}.md
func (s *Store) WriteSoul(agentID, soulType, content string) error {
	relPath := filepath.Join("souls", agentID, soulType+".md")
	return s.writeTextFile(relPath, content)
}

// DeleteSoul removes a soul file.
func (s *Store) DeleteSoul(agentID, soulType string) error {
	filePath := filepath.Join(s.DataDir, "souls", agentID, soulType+".md")
	err := os.Remove(filePath)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
