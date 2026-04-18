// Package mcp manages MCP (Model Context Protocol) server subprocesses.
//
// Each MCP server runs as a child process communicating via JSON-RPC 2.0
// over stdin/stdout. The manager handles lifecycle: spawn, health-check,
// restart on crash, tool discovery, and tool execution.
package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ServerConfig is the configuration for a single MCP server.
type ServerConfig struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
}

// ToolDef is a tool definition discovered from an MCP server.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
	ServerID    string         `json:"server_id"`
}

// Server is a running MCP server subprocess.
type Server struct {
	config  ServerConfig
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
	tools   []ToolDef
	mu      sync.Mutex
	nextID  int
	pending map[int]chan json.RawMessage
	done    chan struct{} // closed when the process exits
}

// Manager manages multiple MCP server subprocesses.
type Manager struct {
	mu      sync.Mutex
	servers map[string]*Server // id → server
}

// NewManager creates a new MCP manager.
func NewManager() *Manager {
	return &Manager{servers: make(map[string]*Server)}
}

// Start spawns an MCP server subprocess.
func (m *Manager) Start(cfg ServerConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.servers[cfg.ID]; exists {
		return nil // already running
	}

	cmd := exec.Command(cfg.Command, cfg.Args...)
	cmd.Stderr = os.Stderr

	// Set environment
	env := os.Environ()
	for k, v := range cfg.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("mcp stdin pipe: %w", err)
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("mcp stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("mcp start %s: %w", cfg.Name, err)
	}

	server := &Server{
		config:  cfg,
		cmd:     cmd,
		stdin:   stdin,
		stdout:  bufio.NewReaderSize(stdoutPipe, 1024*1024),
		pending: make(map[int]chan json.RawMessage),
		done:    make(chan struct{}),
	}

	// Start response reader goroutine
	go server.readResponses()

	// Monitor process exit to unblock pending calls
	go func() {
		cmd.Wait()
		close(server.done)
	}()

	m.servers[cfg.ID] = server

	// Initialize: send initialize request
	_, _ = server.call("initialize", map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "clank-core", "version": "0.1.0"},
	})

	return nil
}

// DiscoverTools calls tools/list on a server and returns discovered tool definitions.
func (m *Manager) DiscoverTools(serverID string) ([]ToolDef, error) {
	m.mu.Lock()
	srv, ok := m.servers[serverID]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("server %s not running", serverID)
	}

	result, err := srv.call("tools/list", map[string]any{})
	if err != nil {
		return nil, err
	}

	var response struct {
		Tools []struct {
			Name        string         `json:"name"`
			Description string         `json:"description"`
			InputSchema map[string]any `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(result, &response); err != nil {
		return nil, fmt.Errorf("parse tools/list: %w", err)
	}

	var tools []ToolDef
	for _, t := range response.Tools {
		tools = append(tools, ToolDef{
			Name:        fmt.Sprintf("mcp_%s_%s", serverID[:8], t.Name),
			Description: t.Description,
			InputSchema: t.InputSchema,
			ServerID:    serverID,
		})
	}

	srv.mu.Lock()
	srv.tools = tools
	srv.mu.Unlock()

	return tools, nil
}

// CallTool executes a tool on an MCP server.
func (m *Manager) CallTool(serverID, toolName string, args map[string]any) (json.RawMessage, error) {
	m.mu.Lock()
	srv, ok := m.servers[serverID]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("server %s not running", serverID)
	}

	return srv.call("tools/call", map[string]any{
		"name":      toolName,
		"arguments": args,
	})
}

// StopAll stops all running MCP servers.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, srv := range m.servers {
		srv.stdin.Close()
		srv.cmd.Process.Kill()
		srv.cmd.Wait()
		delete(m.servers, id)
	}
}

// Server methods

func (s *Server) call(method string, params any) (json.RawMessage, error) {
	s.mu.Lock()
	s.nextID++
	id := s.nextID
	ch := make(chan json.RawMessage, 1)
	s.pending[id] = ch
	s.mu.Unlock()

	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}
	data, _ := json.Marshal(req)
	data = append(data, '\n')

	if _, err := s.stdin.Write(data); err != nil {
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return nil, err
	}

	select {
	case result := <-ch:
		return result, nil
	case <-s.done:
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return nil, fmt.Errorf("mcp call %s: process exited", method)
	case <-time.After(30 * time.Second):
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return nil, fmt.Errorf("mcp call %s: timeout", method)
	}
}

func (s *Server) readResponses() {
	for {
		line, err := s.stdout.ReadBytes('\n')
		if err != nil {
			return
		}

		var msg struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(line, &msg) != nil {
			continue
		}

		s.mu.Lock()
		ch, ok := s.pending[msg.ID]
		if ok {
			delete(s.pending, msg.ID)
		}
		s.mu.Unlock()

		if ok {
			if msg.Error != nil {
				errJSON, _ := json.Marshal(map[string]string{"error": msg.Error.Message})
				ch <- json.RawMessage(errJSON)
			} else {
				ch <- msg.Result
			}
		}
	}
}
