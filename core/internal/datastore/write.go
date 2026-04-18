package datastore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// writeJSON atomically writes a JSON value to a file.
// Write to a temp file first, then rename — prevents torn reads.
func (s *Store) writeJSON(relPath string, v any) error {
	fullPath := filepath.Join(s.DataDir, relPath)

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}

	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", relPath, err)
	}
	data = append(data, '\n')

	// Write to temp file in same directory (ensures same filesystem for rename)
	tmp, err := os.CreateTemp(dir, ".clank-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp for %s: %w", relPath, err)
	}
	tmpName := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return fmt.Errorf("write temp for %s: %w", relPath, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("close temp for %s: %w", relPath, err)
	}

	// Atomic rename
	if err := os.Rename(tmpName, fullPath); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("rename %s: %w", relPath, err)
	}
	return nil
}

// writeTextFile atomically writes a plain text file.
func (s *Store) writeTextFile(relPath string, content string) error {
	fullPath := filepath.Join(s.DataDir, relPath)
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}

	tmp, err := os.CreateTemp(dir, ".clank-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp for %s: %w", relPath, err)
	}
	tmpName := tmp.Name()

	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, fullPath)
}

// deleteFile removes a file.
func (s *Store) deleteFile(relPath string) error {
	return os.Remove(filepath.Join(s.DataDir, relPath))
}
