package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/nicekid1/ClankAI/core/internal/engine"
	"github.com/nicekid1/ClankAI/core/internal/llm"
	"github.com/nicekid1/ClankAI/core/internal/mcp"
	"github.com/nicekid1/ClankAI/core/internal/tools"
)

// activeLoops tracks running AgentLoops by chatID:agentID for stop/permission.
var (
	activeLoops   = make(map[string]*engine.AgentLoop)
	activeLoopsMu sync.Mutex
)

// StopAllLoops stops all running agent loops (called on server shutdown).
func StopAllLoops() {
	activeLoopsMu.Lock()
	defer activeLoopsMu.Unlock()
	for key, loop := range activeLoops {
		loop.Stop()
		delete(activeLoops, key)
	}
}

// threadSafeWriter serializes concurrent writes to an http.ResponseWriter.
type threadSafeWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
	mu      sync.Mutex
}

func (tw *threadSafeWriter) writeChunk(chunk llm.Chunk) {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	data, _ := json.Marshal(chunk)
	fmt.Fprintf(tw.w, "data: %s\n\n", data)
	tw.flusher.Flush()
}

// SendRequest is the body for POST /v1/chats/{id}/send.
type SendRequest struct {
	Messages    []map[string]any `json:"messages"`
	Attachments []map[string]any `json:"attachments,omitempty"`
	AgentPrompts map[string]any  `json:"agent_prompts,omitempty"`
}

// handleSend runs the agent loop and streams chunks as SSE.
func (s *Server) handleSend(w http.ResponseWriter, r *http.Request) {
	chatID := r.PathValue("id")

	var req SendRequest
	if err := readBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// Read agent + config from datastore
	chat, err := s.cfg.Store.ReadChat(chatID)
	if err != nil || chat == nil {
		writeError(w, http.StatusNotFound, "not_found", "chat not found")
		return
	}

	agentID, _ := chat["systemAgentId"].(string)
	agent, _ := s.cfg.Store.ReadAgent(agentID)
	if agent == nil {
		writeError(w, http.StatusNotFound, "not_found", "agent not found")
		return
	}

	config, _ := s.cfg.Store.ReadConfig()

	// Resolve provider credentials
	providerID, _ := agent["providerId"].(string)
	client := resolveClient(config, providerID, agent)
	if client == nil {
		writeError(w, http.StatusBadRequest, "bad_request", "could not resolve LLM provider")
		return
	}

	// Build tool registry
	soulsDir := s.cfg.Store.DataDir + "/souls"
	registry := tools.NewRegistry(soulsDir, s.cfg.Store.DataDir)

	// Register HTTP tools
	allTools, _ := s.cfg.Store.ReadTools()
	requiredToolIDs := asStringSlice(agent["requiredToolIds"])
	for _, t := range allTools {
		tm, ok := t.(map[string]any)
		if !ok {
			continue
		}
		tid, _ := tm["id"].(string)
		if contains(requiredToolIDs, tid) {
			registry.Register(tools.NewHTTPTool(tm))
		}
	}

	// MCP tool discovery
	mcpMgr := mcp.NewManager()
	defer mcpMgr.StopAll()

	allMcpServers, _ := s.cfg.Store.ReadMcpServers()
	requiredMcpIDs := asStringSlice(agent["requiredMcpServerIds"])
	var extraTools []map[string]any
	for _, ms := range allMcpServers {
		msm, ok := ms.(map[string]any)
		if !ok {
			continue
		}
		msID, _ := msm["id"].(string)
		if !contains(requiredMcpIDs, msID) {
			continue
		}
		cfg := mcp.ServerConfig{
			ID:      msID,
			Name:    strOrDefault(msm["name"], msID),
			Command: strOrDefault(msm["command"], ""),
			Args:    asStringSlice(msm["args"]),
		}
		if envMap, ok := msm["env"].(map[string]any); ok {
			cfg.Env = make(map[string]string)
			for k, v := range envMap {
				cfg.Env[k] = fmt.Sprintf("%v", v)
			}
		}
		if err := mcpMgr.Start(cfg); err == nil {
			discovered, _ := mcpMgr.DiscoverTools(msID)
			for _, td := range discovered {
				extraTools = append(extraTools, map[string]any{
					"name":         td.Name,
					"description":  td.Description,
					"input_schema": td.InputSchema,
				})
			}
		}
	}

	// Build system prompt
	agentName, _ := agent["name"].(string)
	agentDesc, _ := agent["description"].(string)
	agentPrompt, _ := agent["prompt"].(string)
	language, _ := config["language"].(string)

	// Read soul files
	userSoul, _, _ := s.cfg.Store.ReadSoul(agentID, "users")
	systemSoul, _, _ := s.cfg.Store.ReadSoul(agentID, "system")

	systemPrompt := engine.BuildSystemPrompt(engine.PromptConfig{
		AgentName:        agentName,
		AgentDescription: agentDesc,
		AgentPrompt:      agentPrompt,
		Language:         language,
		UserSoul:         userSoul,
		SystemSoul:       systemSoul,
		DataDir:          s.cfg.Store.DataDir,
	})

	// Build permission gate
	sandboxCfg, _ := config["sandboxConfig"].(map[string]any)
	permGate := &engine.PermissionGate{
		GlobalMode:       strOrDefault(sandboxCfg["defaultMode"], "all_permissions"),
		SandboxAllowList: asStringSlice(sandboxCfg["sandboxAllowList"]),
		DangerBlockList:  asStringSlice(sandboxCfg["dangerBlockList"]),
	}

	// Set up SSE response
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	// Build agent loop
	maxTokens := 32768
	if mt, ok := config["maxOutputTokens"].(float64); ok && mt > 0 {
		maxTokens = int(mt)
	}

	tw := &threadSafeWriter{w: w, flusher: flusher}

	loop := engine.NewAgentLoop(r.Context(), engine.LoopConfig{
		Client:         client,
		Registry:       registry,
		SystemPrompt:   systemPrompt,
		MaxTokens:      maxTokens,
		ChatID:         chatID,
		ExtraTools:     extraTools,
		PermissionGate: permGate,
		OnChunk:        tw.writeChunk,
	})

	// Register active loop keyed by chatID:agentID (matches JS pattern)
	loopKey := chatID + ":" + agentID
	activeLoopsMu.Lock()
	activeLoops[loopKey] = loop
	activeLoopsMu.Unlock()

	defer func() {
		activeLoopsMu.Lock()
		delete(activeLoops, loopKey)
		activeLoopsMu.Unlock()
	}()

	// SSE keepalive: send comment every 15s to prevent proxy/LB timeout
	keepaliveDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				tw.mu.Lock()
				fmt.Fprintf(tw.w, ": keepalive\n\n")
				tw.flusher.Flush()
				tw.mu.Unlock()
			case <-keepaliveDone:
				return
			case <-r.Context().Done():
				return
			}
		}
	}()
	defer close(keepaliveDone)

	// Build conversation messages
	messages := engine.BuildConversationMessages(req.Messages, req.Attachments)

	// Run
	_, runErr := loop.Run(messages)

	// Emit completion
	if runErr != nil {
		data, _ := json.Marshal(llm.Chunk{Type: "send_message_error", Error: runErr.Error()})
		fmt.Fprintf(w, "data: %s\n\n", data)
	} else {
		data, _ := json.Marshal(llm.Chunk{Type: "send_message_complete", StickyTargetIDs: []string{}})
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	flusher.Flush()
}

// handleStop stops a running agent loop.
func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	chatID := r.PathValue("id")

	// Stop all loops whose key starts with this chatID
	activeLoopsMu.Lock()
	for key, loop := range activeLoops {
		if strings.HasPrefix(key, chatID+":") || key == chatID {
			loop.Stop()
		}
	}
	activeLoopsMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handlePermission resolves a permission request.
func (s *Server) handlePermission(w http.ResponseWriter, r *http.Request) {
	blockID := r.PathValue("blockId")

	var body struct {
		Decision string `json:"decision"`
		Pattern  string `json:"pattern"`
	}
	if err := readBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// Find the specific loop that has this pending blockID (stop on first match)
	activeLoopsMu.Lock()
	for _, loop := range activeLoops {
		if loop.ResolvePermission(blockID, body.Decision) {
			break
		}
	}
	activeLoopsMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// resolveClient creates the appropriate LLM client from config.
func resolveClient(config map[string]any, providerID string, agent map[string]any) llm.Client {
	providers, _ := config["providers"].([]any)

	// Find matching provider
	var provider map[string]any
	for _, p := range providers {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		pid, _ := pm["id"].(string)
		ptype, _ := pm["type"].(string)
		if pid == providerID || ptype == providerID {
			if active, _ := pm["isActive"].(bool); active {
				provider = pm
				break
			}
		}
	}

	if provider == nil {
		// Fallback to default provider
		defaultType, _ := config["defaultProvider"].(string)
		for _, p := range providers {
			pm, ok := p.(map[string]any)
			if !ok {
				continue
			}
			ptype, _ := pm["type"].(string)
			if ptype == defaultType {
				if active, _ := pm["isActive"].(bool); active {
					provider = pm
					break
				}
			}
		}
	}

	if provider == nil {
		return nil
	}

	apiKey, _ := provider["apiKey"].(string)
	baseURL, _ := provider["baseURL"].(string)
	model, _ := agent["modelId"].(string)
	if model == "" {
		model, _ = provider["model"].(string)
	}
	providerType, _ := provider["type"].(string)

	switch providerType {
	case "anthropic":
		c, err := llm.NewAnthropicClient(apiKey, baseURL, model)
		if err != nil {
			return nil
		}
		return c
	case "google":
		return llm.NewGeminiClient(apiKey, model)
	default:
		log.Printf("[GoCore] unknown provider type %q, falling back to OpenAI-compat", providerType)
		directAuth := providerType != "openai"
		c, err := llm.NewOpenAICompatClient(apiKey, baseURL, model, directAuth)
		if err != nil {
			return nil
		}
		return c
	}
}

func asStringSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	var result []string
	for _, item := range arr {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func contains(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}

func strOrDefault(v any, def string) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return def
}
