package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/nicekid1/ClankAI/core/internal/llm"
	"github.com/nicekid1/ClankAI/core/internal/tools"
)

const maxIterations = 200

// LoopConfig holds all configuration for a single agent run.
type LoopConfig struct {
	Client       llm.Client
	Registry     *tools.Registry
	SystemPrompt string
	MaxTokens    int
	ChatID       string

	// ProviderMaxOutputTokens caps MaxTokens if lower; triggers max_tokens_capped warning
	// when MaxTokensExplicit is also true (user explicitly set MaxTokens above the cap).
	ProviderMaxOutputTokens int
	MaxTokensExplicit       bool

	// Extra tool definitions injected from MCP/HTTP/skills
	ExtraTools []map[string]any

	// Permission gate (nil = allow all)
	PermissionGate *PermissionGate

	// Callbacks
	OnChunk func(llm.Chunk) // streaming chunk callback
}

// AgentLoop runs the agentic tool-use loop.
type AgentLoop struct {
	cfg                 LoopConfig
	ctx                 context.Context
	cancel              context.CancelFunc
	stopped             bool
	compactionRequested bool // manual compaction trigger
	mu                  sync.Mutex

	contextMgr *ContextManager

	// Permission pending map: blockID → chan string (decision)
	pendingPermissions sync.Map
}

// NewAgentLoop creates a new loop. parentCtx is inherited so client disconnect
// cancels the loop. Pass context.Background() if no parent context exists.
func NewAgentLoop(parentCtx context.Context, cfg LoopConfig) *AgentLoop {
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	ctx, cancel := context.WithCancel(parentCtx)
	maxCtx := cfg.Client.MaxContextWindow()
	return &AgentLoop{
		cfg:        cfg,
		ctx:        ctx,
		cancel:     cancel,
		contextMgr: NewContextManager(maxCtx),
	}
}

// Stop aborts the loop.
func (l *AgentLoop) Stop() {
	l.mu.Lock()
	l.stopped = true
	l.mu.Unlock()
	l.cancel()

	// Reject any pending permissions
	l.pendingPermissions.Range(func(key, value any) bool {
		ch := value.(chan string)
		select {
		case ch <- "reject":
		default:
		}
		return true
	})
}

// ResolvePermission answers a pending permission prompt.
// Returns true if this loop had the pending blockID.
func (l *AgentLoop) ResolvePermission(blockID, decision string) bool {
	if v, ok := l.pendingPermissions.LoadAndDelete(blockID); ok {
		ch := v.(chan string)
		ch <- decision
		return true
	}
	return false
}

// RequestCompaction flags the next LLM iteration to apply compaction.
// Mirrors `_compactionRequested` flag in the JS AgentLoop.
func (l *AgentLoop) RequestCompaction() {
	l.mu.Lock()
	l.compactionRequested = true
	l.mu.Unlock()
}

// Run executes the agent loop. Returns the final text output.
func (l *AgentLoop) Run(messages []map[string]any) (string, error) {
	emit := l.cfg.OnChunk
	if emit == nil {
		emit = func(llm.Chunk) {}
	}

	model := l.cfg.Client.ResolveModel()
	isOpus46 := l.cfg.Client.IsOpus46()
	supportsThinking := l.cfg.Client.SupportsThinking()
	provider := l.cfg.Client.ProviderType()

	// Emit initial context metrics
	emit(llm.Chunk{Type: "context_update", Metrics: l.contextMgr.GetMetrics()})

	// Emit agent start signal
	emit(llm.Chunk{
		Type: "agent_step", ID: "step-init",
		Title: "🤖 Initializing Agent...", Status: "in_progress",
		Details: map[string]any{
			"iteration": 0, "model": model, "provider": provider,
			"tools": 0, "thinking": false, "msgs": 0,
			"inputTokens": 0, "outputTokens": 0,
		},
	})

	// Build tool definitions
	allTools := l.cfg.Registry.GetDefinitions()
	allTools = append(allTools, l.cfg.ExtraTools...)

	// Resolve max tokens
	maxTokens := l.cfg.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 32768
	}

	// Provider hard-cap: emit max_tokens_capped warning if user's explicit
	// maxOutputTokens exceeds the provider's limit.
	if l.cfg.ProviderMaxOutputTokens > 0 && l.cfg.ProviderMaxOutputTokens < maxTokens {
		if l.cfg.MaxTokensExplicit {
			emit(llm.Chunk{
				Type: "warning",
				Code: "max_tokens_capped",
				From: maxTokens,
				To:   l.cfg.ProviderMaxOutputTokens,
			})
		}
		maxTokens = l.cfg.ProviderMaxOutputTokens
	}

	conversationMsgs := make([]map[string]any, len(messages))
	copy(conversationMsgs, messages)

	var finalText string
	iteration := 0

	for !l.isStopped() && iteration < maxIterations {
		iteration++

		// Build request
		req := &llm.Request{
			Model:     model,
			MaxTokens: maxTokens,
			System:    l.cfg.SystemPrompt,
			Messages:  conversationMsgs,
			Stream:    true,
		}
		if len(allTools) > 0 {
			req.Tools = allTools
		}
		if isOpus46 {
			req.Thinking = map[string]any{"type": "adaptive"}
		} else if supportsThinking {
			req.Thinking = map[string]any{"type": "enabled", "budget_tokens": 8192}
			if req.MaxTokens < 8192+1024 {
				req.MaxTokens = 8192 + 1024
			}
		}

		// Manual compaction request (Anthropic beta — adds context_management.edits)
		l.mu.Lock()
		manualCompact := l.compactionRequested
		l.compactionRequested = false
		l.mu.Unlock()
		if manualCompact {
			emit(llm.Chunk{Type: "compaction", Message: "Manual compaction applied"})
			l.contextMgr.CompactionCount++
		}

		// Context compaction: trim old messages to fit window
		if l.contextMgr.ShouldCompact() {
			trimmed := TrimMessages(conversationMsgs, 5) // keep last 5 turns
			if len(trimmed) < len(conversationMsgs) {
				conversationMsgs = trimmed
				req.Messages = conversationMsgs
				l.contextMgr.CompactionCount++
				// Estimate: after trim, input tokens roughly halve
				l.contextMgr.InputTokens = l.contextMgr.InputTokens * 40 / 100
				emit(llm.Chunk{Type: "compaction", Message: "Context compacted to fit window"})
			}
		}

		// Emit LLM call step
		emit(llm.Chunk{
			Type: "agent_step", ID: fmt.Sprintf("step-llm-%d", iteration),
			Title: fmt.Sprintf("📡 Calling %s...", model), Status: "in_progress",
			Details: map[string]any{
				"iteration": iteration, "model": model, "provider": provider,
				"tools": len(allTools), "thinking": isOpus46 || supportsThinking,
				"msgs": len(conversationMsgs),
				"inputTokens": l.contextMgr.InputTokens, "outputTokens": l.contextMgr.OutputTokens,
			},
		})

		// Stream LLM response
		events, errc := l.cfg.Client.Stream(l.ctx, req)

		var assistantContent []llm.ContentBlock
		var currentText string
		var currentToolUse *llm.ContentBlock
		var stopReason string
		var lastUsage llm.Usage

		for event := range events {
			if l.isStopped() {
				break
			}

			switch event.Type {
			case "message_start":
				if event.Message != nil {
					lastUsage = event.Message.Usage
				}

			case "content_block_start":
				if event.ContentBlock == nil {
					continue
				}
				switch event.ContentBlock.Type {
				case "text":
					currentText = ""
				case "thinking":
					emit(llm.Chunk{Type: "thinking_start"})
				case "tool_use":
					if currentText != "" {
						assistantContent = append(assistantContent, llm.ContentBlock{Type: "text", Text: currentText})
						currentText = ""
					}
					currentToolUse = &llm.ContentBlock{
						Type: "tool_use",
						ID:   event.ContentBlock.ID,
						Name: event.ContentBlock.Name,
					}
				}

			case "content_block_delta":
				if event.Delta == nil {
					continue
				}
				switch event.Delta.Type {
				case "text_delta":
					currentText += event.Delta.Text
					finalText += event.Delta.Text
					emit(llm.Chunk{Type: "text", Text: event.Delta.Text})
				case "thinking_delta":
					emit(llm.Chunk{Type: "thinking", Text: event.Delta.Thinking})
				case "input_json_delta":
					if currentToolUse != nil {
						// Accumulate JSON input as string, parse later
						existing, _ := currentToolUse.Input.(string)
						currentToolUse.Input = existing + event.Delta.PartialJSON
					}
				}

			case "content_block_stop":
				if currentText != "" {
					assistantContent = append(assistantContent, llm.ContentBlock{Type: "text", Text: currentText})
					currentText = ""
				}
				if currentToolUse != nil {
					// Parse accumulated JSON input
					if jsonStr, ok := currentToolUse.Input.(string); ok {
						var parsed any
						if json.Unmarshal([]byte(jsonStr), &parsed) == nil {
							currentToolUse.Input = parsed
						} else {
							currentToolUse.Input = map[string]any{}
						}
					}
					assistantContent = append(assistantContent, *currentToolUse)
					currentToolUse = nil
				}

			case "message_delta":
				stopReason = event.StopReason
				if event.DeltaUsage != nil {
					lastUsage.OutputTokens += event.DeltaUsage.OutputTokens
				}
			}
		}

		// Drain error channel (wait for goroutine to close it)
		if err, ok := <-errc; ok && err != nil {
			return finalText, err
		}

		// Flush remaining text
		if currentText != "" {
			assistantContent = append(assistantContent, llm.ContentBlock{Type: "text", Text: currentText})
		}

		// Update context metrics — skip the stream-end emit if stopped mid-stream
		// (matches JS: stream.finalMessage() throws AbortError when stopped, so the
		// in-loop context_update never fires; only the final-metrics emit remains).
		if !l.isStopped() {
			l.contextMgr.UpdateUsage(lastUsage)
			emit(llm.Chunk{Type: "context_update", Metrics: l.contextMgr.GetMetrics()})
		}

		// Append assistant response to conversation
		var contentForMsgs []any
		for _, b := range assistantContent {
			contentForMsgs = append(contentForMsgs, map[string]any{
				"type":  b.Type,
				"text":  b.Text,
				"id":    b.ID,
				"name":  b.Name,
				"input": b.Input,
			})
		}
		conversationMsgs = append(conversationMsgs, map[string]any{
			"role": "assistant", "content": contentForMsgs,
		})

		// Handle tool_use
		if stopReason == "tool_use" && !l.isStopped() {
			toolBlocks := filterToolUse(assistantContent)

			emit(llm.Chunk{
				Type: "agent_step", ID: fmt.Sprintf("step-tools-%d", iteration),
				Title:  fmt.Sprintf("🔧 Executing tools (%d)...", len(toolBlocks)),
				Status: "in_progress",
				Details: map[string]any{
					"iteration": iteration, "model": model, "provider": provider,
					"tools": len(toolBlocks),
					"currentTools": toolNames(toolBlocks),
					"thinking": isOpus46 || supportsThinking,
					"msgs": len(conversationMsgs),
					"inputTokens": l.contextMgr.InputTokens, "outputTokens": l.contextMgr.OutputTokens,
				},
			})

			// Emit all tool_call chunks first (matches JS Promise.all ordering)
			type toolExecResult struct {
				index  int
				block  llm.ContentBlock
				result any
				images []map[string]any
				isPlan bool
			}

			for _, block := range toolBlocks {
				toolInput, _ := block.Input.(map[string]any)
				if toolInput == nil {
					toolInput = map[string]any{}
				}
				emit(llm.Chunk{Type: "tool_call", Name: block.Name, Input: toolInput, ToolCallID: block.ID})
			}

			// Check for submit_plan first (handled inline, breaks the loop)
			planIdx := -1
			for i, block := range toolBlocks {
				if block.Name == "submit_plan" {
					planIdx = i
					break
				}
			}
			if planIdx >= 0 {
				block := toolBlocks[planIdx]
				toolInput, _ := block.Input.(map[string]any)
				if toolInput == nil {
					toolInput = map[string]any{}
				}
				emit(llm.Chunk{Type: "plan_submitted", Plan: toolInput})
				result := map[string]any{"success": true, "status": "awaiting_approval"}
				resultJSON, _ := json.Marshal(result)
				emit(llm.Chunk{Type: "tool_result", Name: block.Name, Result: string(resultJSON), ToolCallID: block.ID})
				goto endLoop
			}

			// Execute all tools in parallel (matches JS Promise.all behavior)
			execResults := make([]toolExecResult, len(toolBlocks))
			var toolWg sync.WaitGroup
			for i, block := range toolBlocks {
				toolWg.Add(1)
				go func(idx int, b llm.ContentBlock) {
					defer toolWg.Done()
					toolInput, _ := b.Input.(map[string]any)
					if toolInput == nil {
						toolInput = map[string]any{}
					}

					// Permission check
					if l.cfg.PermissionGate != nil {
						decision := l.cfg.PermissionGate.Check(b.Name, toolInput)
						if decision == "ask" {
							decision = l.askPermission(b.Name, toolInput, emit)
						}
						if decision == "block" || decision == "reject" {
							execResults[idx] = toolExecResult{
								index: idx, block: b,
								result: map[string]any{"error": "Operation rejected"},
							}
							return
						}
					}

					result, _ := l.cfg.Registry.Execute(b.Name, toolInput, b.ID, func(streamType, text string) {
						emit(llm.Chunk{Type: "tool_output", Name: b.Name, Text: text, Stream: streamType})
					})

					var images []map[string]any
					if rm, ok := result.(map[string]any); ok {
						if mcpImages, ok := rm["_mcpImages"].([]any); ok {
							for _, img := range mcpImages {
								if imgMap, ok := img.(map[string]any); ok {
									images = append(images, imgMap)
								}
							}
							delete(rm, "_mcpImages")
						}
					}

					execResults[idx] = toolExecResult{index: idx, block: b, result: result, images: images}
				}(i, block)
			}
			toolWg.Wait()

			// Emit tool_result chunks in order (preserves deterministic sequence)
			var toolResults []any
			for _, er := range execResults {
				emit(llm.Chunk{
					Type: "tool_result", Name: er.block.Name,
					Result: UIResult(er.result), ToolCallID: er.block.ID,
					Images: er.images,
				})
				toolResults = append(toolResults, map[string]any{
					"type": "tool_result", "tool_use_id": er.block.ID,
					"content": SerializeToolResult(er.result),
				})
			}

			conversationMsgs = append(conversationMsgs, map[string]any{
				"role": "user", "content": toolResults,
			})
			continue // next iteration
		}

		// Non-tool stop: end_turn or max_tokens
		if stopReason == "max_tokens" {
			emit(llm.Chunk{Type: "max_tokens_reached", Limit: maxTokens})
		}
		break
	}

endLoop:
	// Final context metrics (this + the one inside the loop = the "two context_update" pattern)
	emit(llm.Chunk{Type: "context_update", Metrics: l.contextMgr.GetMetrics()})

	// Completion step
	emit(llm.Chunk{
		Type: "agent_step", ID: "step-complete",
		Title: "✅ Agent Complete", Status: "completed",
		Details: map[string]any{
			"iteration": iteration, "model": model, "provider": provider,
			"msgs": len(conversationMsgs),
			"totalTokens": l.contextMgr.InputTokens + l.contextMgr.OutputTokens,
			"inputTokens": l.contextMgr.InputTokens, "outputTokens": l.contextMgr.OutputTokens,
		},
	})

	return finalText, nil
}

func (l *AgentLoop) isStopped() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.stopped
}

func (l *AgentLoop) askPermission(toolName string, toolInput map[string]any, emit func(llm.Chunk)) string {
	randBytes := make([]byte, 16)
	rand.Read(randBytes)
	blockID := hex.EncodeToString(randBytes)
	ch := make(chan string, 1)
	l.pendingPermissions.Store(blockID, ch)

	command := ""
	if cmd, ok := toolInput["command"].(string); ok {
		command = cmd
	}
	emit(llm.Chunk{
		Type: "permission_request", BlockID: blockID,
		ToolName: toolName, Command: command, ToolInput: toolInput,
	})

	select {
	case decision := <-ch:
		return decision
	case <-l.ctx.Done():
		return "reject"
	}
}

func filterToolUse(blocks []llm.ContentBlock) []llm.ContentBlock {
	var result []llm.ContentBlock
	for _, b := range blocks {
		if b.Type == "tool_use" {
			result = append(result, b)
		}
	}
	return result
}

func toolNames(blocks []llm.ContentBlock) string {
	var names []string
	for _, b := range blocks {
		names = append(names, b.Name)
	}
	return strings.Join(names, ", ")
}
