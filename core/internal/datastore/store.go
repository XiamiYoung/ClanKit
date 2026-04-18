// Package datastore provides read-only access to ClankAI's JSON data files.
//
// All readers return raw `any` types (maps and slices) rather than typed
// structs. This ensures 1:1 fidelity with the JavaScript data layer — every
// field round-trips unchanged, even fields the Go code doesn't know about.
//
// Normalization logic mirrors electron/agent/dataNormalizers.js exactly.
package datastore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Store is the data access layer with concurrency-safe read-modify-write.
type Store struct {
	DataDir string
	mu      sync.RWMutex // protects all file read-modify-write operations
}

// New creates a Store rooted at the given data directory.
func New(dataDir string) *Store {
	return &Store{DataDir: dataDir}
}

// RLock/RUnlock for read operations, Lock/Unlock for writes.
func (s *Store) rlock()   { s.mu.RLock() }
func (s *Store) runlock() { s.mu.RUnlock() }
func (s *Store) lock()    { s.mu.Lock() }
func (s *Store) unlock()  { s.mu.Unlock() }

// readJSON reads a JSON file and unmarshals it into an any value.
func (s *Store) readJSON(relPath string) (any, error) {
	data, err := os.ReadFile(filepath.Join(s.DataDir, relPath))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // file not found is not an error — just empty data
		}
		return nil, fmt.Errorf("read %s: %w", relPath, err)
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, fmt.Errorf("parse %s: %w", relPath, err)
	}
	return v, nil
}

// asArray safely casts any to []any.
func asArray(v any) []any {
	if arr, ok := v.([]any); ok {
		return arr
	}
	return nil
}

// asMap safely casts any to map[string]any.
func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
}

// findByID searches a slice of maps for one with matching "id" field.
func findByID(items []any, id string) map[string]any {
	for _, item := range items {
		m := asMap(item)
		if m == nil {
			continue
		}
		if itemID, ok := m["id"].(string); ok && itemID == id {
			return m
		}
	}
	return nil
}
