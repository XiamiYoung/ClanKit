package engine

import (
	"strings"
	"unicode"
)

// AgentInfo holds minimal agent metadata for mention resolution.
type AgentInfo struct {
	ID          string
	Name        string
	Description string
}

// ParseMentions extracts @-mentioned agent names from text.
//
// Go's RE2 regex doesn't support lookahead, so we scan manually.
// A mention is "@Name" where the character after Name is either:
//   - End of string
//   - A non-letter, non-digit character (including CJK punctuation and whitespace)
//
// This handles the CJK boundary case that broke \b in the JS codebase:
// "@小明，你好" — the ， after 小明 correctly terminates the mention.
func ParseMentions(text string, agents []AgentInfo) []string {
	var mentioned []string
	seen := make(map[string]bool)

	for _, agent := range agents {
		if findMention(text, agent.Name) >= 0 && !seen[agent.ID] {
			mentioned = append(mentioned, agent.ID)
			seen[agent.ID] = true
		}
	}
	return mentioned
}

// findMention returns the index of the first "@name" in text that is
// terminated by end-of-string or a non-word character, or -1 if not found.
func findMention(text, name string) int {
	needle := "@" + name
	searchFrom := 0
	for {
		idx := strings.Index(text[searchFrom:], needle)
		if idx < 0 {
			return -1
		}
		absIdx := searchFrom + idx
		endIdx := absIdx + len(needle)

		// Check boundary: end-of-string or non-word char after the name
		if endIdx >= len(text) {
			return absIdx
		}
		// Look at the rune following the match
		r := []rune(text[endIdx:])[0]
		if !isWordChar(r) {
			return absIdx
		}
		// Not a clean boundary (e.g. @Al in @Alice) — keep searching past this position
		searchFrom = absIdx + 1
	}
}

// isWordChar returns true for letters and digits (Unicode-aware).
// CJK characters ARE word chars, so "@小明文字" would not match "小明"
// (the trailing 文 is a letter). This is intentional — match only at clean boundaries.
func isWordChar(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_'
}

// StripMentions removes @mentions from text for clean display.
func StripMentions(text string, agents []AgentInfo) string {
	result := text
	for _, agent := range agents {
		needle := "@" + agent.Name
		for {
			idx := findMention(result, agent.Name)
			if idx < 0 {
				break
			}
			result = result[:idx] + result[idx+len(needle):]
		}
	}
	return strings.TrimSpace(result)
}

// UtilityModelFunc is a function that calls a lightweight LLM to disambiguate mentions.
// It receives the text and list of mentioned agent names, and returns the IDs of
// agents that are truly being ADDRESSED (not just referenced).
// If nil, falls back to returning all mentioned agents.
type UtilityModelFunc func(text string, mentionedAgents []AgentInfo) ([]string, error)

// DefaultUtilityModel is set by the server at startup if a utility model is configured.
var DefaultUtilityModel UtilityModelFunc

// ResolveAddressees determines which agents are truly being addressed
// (not just referenced) in a message.
// - Single mention → always the addressee
// - Multiple mentions → calls utility model for disambiguation if available
//
// Per lesson learned (2026-03-02): without disambiguation, agents that are merely
// *referenced* ("then we'll hand to @Reviewer") respond in the same round as
// agents that are *addressed*. The utility model prevents this.
func ResolveAddressees(text string, agents []AgentInfo) []string {
	mentioned := ParseMentions(text, agents)
	if len(mentioned) <= 1 {
		return mentioned
	}

	// Use utility model for disambiguation if available
	if DefaultUtilityModel != nil {
		// Collect mentioned agent info
		var mentionedAgents []AgentInfo
		mentionSet := make(map[string]bool)
		for _, id := range mentioned {
			mentionSet[id] = true
		}
		for _, a := range agents {
			if mentionSet[a.ID] {
				mentionedAgents = append(mentionedAgents, a)
			}
		}

		resolved, err := DefaultUtilityModel(text, mentionedAgents)
		if err == nil && len(resolved) > 0 {
			return resolved
		}
		// Fallback on error: return all mentioned
	}

	return mentioned
}

// DispatchGroupTasks determines execution mode for a set of target agents.
// Returns "concurrent" if agents can run in parallel, "sequential" if they
// have dependency chains.
func DispatchGroupTasks(targetIDs []string) string {
	if len(targetIDs) <= 1 {
		return "sequential"
	}
	// Default: concurrent for multiple independent agents
	// TODO: analyze dependsOn relationships from agent config
	return "concurrent"
}
