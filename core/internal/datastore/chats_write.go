package datastore

import (
	"fmt"
	"os"
	"path/filepath"
)

// WriteChats writes the chat index (chats/index.json).
func (s *Store) WriteChats(chats []any) error {
	return s.writeJSON(filepath.Join("chats", "index.json"), chats)
}

// CreateChat adds a chat to the index and creates an empty chat file.
func (s *Store) CreateChat(meta map[string]any) error {
	chats, err := s.ReadChats()
	if err != nil {
		return err
	}
	chats = append(chats, meta)
	if err := s.WriteChats(chats); err != nil {
		return err
	}
	// Create the per-chat file with messages: []
	id, _ := meta["id"].(string)
	if id != "" {
		chatData := map[string]any{}
		for k, v := range meta {
			chatData[k] = v
		}
		chatData["messages"] = []any{}
		return s.writeJSON(filepath.Join("chats", id+".json"), chatData)
	}
	return nil
}

// UpdateChat updates a chat's metadata in the index.
func (s *Store) UpdateChat(id string, updated map[string]any) error {
	chats, err := s.ReadChats()
	if err != nil {
		return err
	}
	found := false
	for i, item := range chats {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID == id {
				chats[i] = updated
				found = true
				break
			}
		}
	}
	if !found {
		return fmt.Errorf("chat %s not found", id)
	}
	return s.WriteChats(chats)
}

// DeleteChat removes a chat from the index and deletes its file.
func (s *Store) DeleteChat(id string) error {
	chats, err := s.ReadChats()
	if err != nil {
		return err
	}
	var filtered []any
	for _, item := range chats {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID != id {
				filtered = append(filtered, item)
			}
		}
	}
	if err := s.WriteChats(filtered); err != nil {
		return err
	}
	// Remove the per-chat file (ignore if not found)
	os.Remove(filepath.Join(s.DataDir, "chats", id+".json"))
	return nil
}

// WriteChatMessages writes the full chat data file (chats/{id}.json).
func (s *Store) WriteChatMessages(id string, chatData map[string]any) error {
	return s.writeJSON(filepath.Join("chats", id+".json"), chatData)
}

// AppendMessage appends a message to a chat's message array.
func (s *Store) AppendMessage(chatID string, message map[string]any) error {
	chatData, err := s.ReadChatMessages(chatID)
	if err != nil {
		return err
	}
	if chatData == nil {
		return fmt.Errorf("chat %s not found", chatID)
	}
	messages := asArray(chatData["messages"])
	messages = append(messages, message)
	chatData["messages"] = messages
	return s.WriteChatMessages(chatID, chatData)
}
