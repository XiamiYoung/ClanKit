package datastore

import "fmt"

// WriteMcpServers writes the full MCP servers list (always as array).
func (s *Store) WriteMcpServers(servers []any) error {
	return s.writeJSON("mcp-servers.json", servers)
}

// CreateMcpServer adds an MCP server.
func (s *Store) CreateMcpServer(server map[string]any) error {
	servers, err := s.ReadMcpServers()
	if err != nil {
		return err
	}
	servers = append(servers, server)
	return s.WriteMcpServers(servers)
}

// UpdateMcpServer replaces an MCP server by ID.
func (s *Store) UpdateMcpServer(id string, updated map[string]any) error {
	servers, err := s.ReadMcpServers()
	if err != nil {
		return err
	}
	found := false
	for i, item := range servers {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID == id {
				servers[i] = updated
				found = true
				break
			}
		}
	}
	if !found {
		return fmt.Errorf("mcp server %s not found", id)
	}
	return s.WriteMcpServers(servers)
}

// DeleteMcpServer removes an MCP server by ID.
func (s *Store) DeleteMcpServer(id string) error {
	servers, err := s.ReadMcpServers()
	if err != nil {
		return err
	}
	var filtered []any
	for _, item := range servers {
		m := asMap(item)
		if m != nil {
			if itemID, _ := m["id"].(string); itemID != id {
				filtered = append(filtered, item)
			}
		}
	}
	return s.WriteMcpServers(filtered)
}
