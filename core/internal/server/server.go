// Package server provides the HTTP server and route registration for clank-core.
package server

import (
	"encoding/json"
	"net/http"

	"github.com/nicekid1/ClankAI/core/internal/datastore"
)

// Config holds server configuration.
type Config struct {
	Version string
	Mode    string
	Port    int
	Auth    func(http.Handler) http.Handler
	Store   *datastore.Store
}

// Server is the main HTTP server.
type Server struct {
	cfg     Config
	sendSem *Semaphore // limits concurrent /send requests
}

// New creates a new Server.
func New(cfg Config) *Server {
	return &Server{cfg: cfg, sendSem: NewSemaphore(5)}
}

// Handler returns the root http.Handler with all routes registered.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Health check — no auth required
	mux.HandleFunc("GET /v1/health", s.handleHealth)

	// Resource routes — behind auth middleware
	authed := http.NewServeMux()

	// Config
	authed.HandleFunc("GET /v1/config", s.handleGetConfig)
	authed.HandleFunc("PUT /v1/config", s.handlePutConfig)

	// Agents
	authed.HandleFunc("GET /v1/agents", s.handleGetAgents)
	authed.HandleFunc("POST /v1/agents", s.handleCreateAgent)
	authed.HandleFunc("GET /v1/agents/{id}", s.handleGetAgent)
	authed.HandleFunc("PUT /v1/agents/{id}", s.handleUpdateAgent)
	authed.HandleFunc("DELETE /v1/agents/{id}", s.handleDeleteAgent)

	// Tools
	authed.HandleFunc("GET /v1/tools", s.handleGetTools)
	authed.HandleFunc("POST /v1/tools", s.handleCreateTool)
	authed.HandleFunc("GET /v1/tools/{id}", s.handleGetTool)
	authed.HandleFunc("PUT /v1/tools/{id}", s.handleUpdateTool)
	authed.HandleFunc("DELETE /v1/tools/{id}", s.handleDeleteTool)

	// MCP Servers
	authed.HandleFunc("GET /v1/mcp-servers", s.handleGetMcpServers)
	authed.HandleFunc("POST /v1/mcp-servers", s.handleCreateMcpServer)
	authed.HandleFunc("GET /v1/mcp-servers/{id}", s.handleGetMcpServer)
	authed.HandleFunc("PUT /v1/mcp-servers/{id}", s.handleUpdateMcpServer)
	authed.HandleFunc("DELETE /v1/mcp-servers/{id}", s.handleDeleteMcpServer)

	// Chats
	authed.HandleFunc("GET /v1/chats", s.handleGetChats)
	authed.HandleFunc("POST /v1/chats", s.handleCreateChat)
	authed.HandleFunc("GET /v1/chats/{id}", s.handleGetChat)
	authed.HandleFunc("PUT /v1/chats/{id}", s.handleUpdateChat)
	authed.HandleFunc("DELETE /v1/chats/{id}", s.handleDeleteChat)
	authed.HandleFunc("GET /v1/chats/{id}/messages", s.handleGetChatMessages)
	authed.HandleFunc("POST /v1/chats/{id}/messages", s.handlePostChatMessage)
	authed.HandleFunc("POST /v1/chats/{id}/send", s.sendSem.LimitHandler(s.handleSend))
	authed.HandleFunc("POST /v1/chats/{id}/stop", s.handleStop)

	// Permissions
	authed.HandleFunc("POST /v1/permissions/{blockId}", s.handlePermission)

	// Skills (read-only for now — skills are managed via filesystem)
	authed.HandleFunc("GET /v1/skills", s.handleGetSkills)
	authed.HandleFunc("GET /v1/skills/{id}", s.handleGetSkill)

	// Knowledge
	authed.HandleFunc("GET /v1/knowledge", s.handleGetKnowledge)
	authed.HandleFunc("GET /v1/knowledge/{id}", s.handleGetKnowledgeBase)

	// Souls
	authed.HandleFunc("GET /v1/souls/{agentId}", s.handleGetSoulDir)
	authed.HandleFunc("GET /v1/souls/{agentId}/{type}", s.handleGetSoul)
	authed.HandleFunc("PUT /v1/souls/{agentId}/{type}", s.handlePutSoul)

	// Mount all authed routes
	mux.Handle("/v1/", s.cfg.Auth(authed))

	return mux
}

// ── Health ──

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": s.cfg.Version,
		"mode":    s.cfg.Mode,
	})
}

// ── Config ──

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadConfig()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Agents ──

func (s *Server) handleGetAgents(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadAgents()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadAgent(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "agent not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Tools ──

func (s *Server) handleGetTools(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadTools()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadTool(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "tool not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── MCP Servers ──

func (s *Server) handleGetMcpServers(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadMcpServers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadMcpServer(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "mcp server not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Chats ──

func (s *Server) handleGetChats(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadChats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetChat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadChat(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "chat not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetChatMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadChatMessages(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "chat not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Skills ──

func (s *Server) handleGetSkills(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadSkills()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetSkill(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadSkill(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "skill not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Knowledge ──

func (s *Server) handleGetKnowledge(w http.ResponseWriter, r *http.Request) {
	data, err := s.cfg.Store.ReadKnowledge()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetKnowledgeBase(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	data, err := s.cfg.Store.ReadKnowledgeBase(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "knowledge base not found")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// ── Souls ──

func (s *Server) handleGetSoulDir(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	data, err := s.cfg.Store.ReadSoulDir(agentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleGetSoul(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	soulType := r.PathValue("type")
	content, found, err := s.cfg.Store.ReadSoul(agentID, soulType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "soul file not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agentId": agentID,
		"type":    soulType,
		"content": content,
	})
}

// ── Helpers ──

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}
