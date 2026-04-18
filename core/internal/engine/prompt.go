package engine

import (
	"fmt"
	"strings"
	"time"
)

// PromptConfig holds all inputs for system prompt assembly.
type PromptConfig struct {
	AgentName        string
	AgentDescription string
	AgentPrompt      string // base system prompt from agent config
	Language         string
	SkillSummaries   []SkillSummary
	MCPServerNames   []string
	HTTPToolNames    []string
	UserSoul         string // soul file content for the user
	SystemSoul       string // soul file content for the system agent
	UserProfile      string // USER.md content
	RAGContext       string // knowledge base chunks
	DataDir          string
	SkillsDir        string
	GroupChat        *GroupChatContext
}

// SkillSummary is a skill listed in the system prompt (load_skill loads full content).
type SkillSummary struct {
	ID          string
	Name        string
	Description string
}

// GroupChatContext provides multi-agent context for the system prompt.
type GroupChatContext struct {
	AgentName         string
	OtherParticipants []struct {
		ID          string
		Name        string
		Description string
	}
}

// BuildSystemPrompt assembles the full system prompt string.
// Mirrors: electron/agent/systemPromptBuilder.js buildSystemPrompt()
//
// The assembly order matches the JS implementation exactly so that token
// counts and prompt caching align between the two engines.
func BuildSystemPrompt(cfg PromptConfig) string {
	var b strings.Builder

	// 1. Identity
	if cfg.AgentName != "" {
		fmt.Fprintf(&b, "You ARE %s.", cfg.AgentName)
		if cfg.AgentDescription != "" {
			fmt.Fprintf(&b, " %s", cfg.AgentDescription)
		}
		b.WriteString("\n\n")
	}

	// 2. Base prompt (agent.prompt)
	if cfg.AgentPrompt != "" {
		b.WriteString(cfg.AgentPrompt)
		b.WriteString("\n\n")
	}

	// 3. System soul content
	if cfg.SystemSoul != "" {
		b.WriteString("## Character Memory\n\n")
		b.WriteString(cfg.SystemSoul)
		b.WriteString("\n\n")
	}

	// 4. User soul content
	if cfg.UserSoul != "" {
		b.WriteString("## Conversation Partner Memory\n\n")
		b.WriteString(cfg.UserSoul)
		b.WriteString("\n\n")
	}

	// 5. Group chat context
	if cfg.GroupChat != nil {
		b.WriteString("## Group Chat\n\n")
		fmt.Fprintf(&b, "You are %s in a group conversation.\n", cfg.GroupChat.AgentName)
		if len(cfg.GroupChat.OtherParticipants) > 0 {
			b.WriteString("Other participants:\n")
			for _, p := range cfg.GroupChat.OtherParticipants {
				fmt.Fprintf(&b, "- @%s: %s\n", p.Name, p.Description)
			}
		}
		b.WriteString("\nUse @Name to address specific participants.\n\n")
	}

	// 6. Skills list
	if len(cfg.SkillSummaries) > 0 {
		b.WriteString("## Available Skills\n\n")
		b.WriteString("Call `load_skill` with the skill ID to activate:\n")
		for _, s := range cfg.SkillSummaries {
			fmt.Fprintf(&b, "- `%s` — %s: %s\n", s.ID, s.Name, s.Description)
		}
		b.WriteString("\n")
	}

	// 7. MCP servers
	if len(cfg.MCPServerNames) > 0 {
		b.WriteString("## MCP Servers\n\n")
		b.WriteString("Use `search_mcp_tools` to discover tools from these servers:\n")
		for _, name := range cfg.MCPServerNames {
			fmt.Fprintf(&b, "- %s\n", name)
		}
		b.WriteString("\n")
	}

	// 8. HTTP tools
	if len(cfg.HTTPToolNames) > 0 {
		b.WriteString("## HTTP Tools\n\n")
		for _, name := range cfg.HTTPToolNames {
			fmt.Fprintf(&b, "- %s\n", name)
		}
		b.WriteString("\n")
	}

	// 9. Data paths
	if cfg.DataDir != "" {
		b.WriteString("## Paths\n\n")
		fmt.Fprintf(&b, "- Data directory: %s\n", cfg.DataDir)
		if cfg.SkillsDir != "" {
			fmt.Fprintf(&b, "- Skills directory: %s\n", cfg.SkillsDir)
		}
		b.WriteString("\n")
	}

	// 10. User profile
	if cfg.UserProfile != "" {
		b.WriteString("## User Profile\n\n")
		b.WriteString(cfg.UserProfile)
		b.WriteString("\n\n")
	}

	// 11. Language instruction
	if cfg.Language != "" && cfg.Language != "en" {
		fmt.Fprintf(&b, "You MUST respond in %s unless the user explicitly asks for another language.\n\n", cfg.Language)
	}

	// 12. Current date
	fmt.Fprintf(&b, "Current date: %s\n\n", time.Now().Format("2006-01-02"))

	// 12. RAG context
	if cfg.RAGContext != "" {
		b.WriteString("## Relevant Knowledge\n\n")
		b.WriteString(cfg.RAGContext)
		b.WriteString("\n\n")
	}

	return b.String()
}
