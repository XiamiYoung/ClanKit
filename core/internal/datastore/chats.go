package datastore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ReadChats reads the chat index (chats/index.json) — metadata only.
func (s *Store) ReadChats() ([]any, error) {
	v, err := s.readJSON(filepath.Join("chats", "index.json"))
	if err != nil {
		return nil, err
	}
	if v == nil {
		return []any{}, nil
	}
	arr := asArray(v)
	if arr == nil {
		return []any{}, nil
	}
	return arr, nil
}

// ReadChat reads a single chat's metadata from the index.
func (s *Store) ReadChat(id string) (map[string]any, error) {
	chats, err := s.ReadChats()
	if err != nil {
		return nil, err
	}
	return findByID(chats, id), nil
}

// ReadChatMessages reads the full chat file (chats/{id}.json) including messages.
func (s *Store) ReadChatMessages(id string) (map[string]any, error) {
	filePath := filepath.Join(s.DataDir, "chats", id+".json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read chat %s: %w", id, err)
	}
	var v map[string]any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, fmt.Errorf("parse chat %s: %w", id, err)
	}
	return v, nil
}
