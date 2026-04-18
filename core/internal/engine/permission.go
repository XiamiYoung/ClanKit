package engine

import "strings"

// PermissionGate checks whether a tool call is allowed, blocked, or needs user approval.
type PermissionGate struct {
	GlobalMode       string   // "sandbox", "all_permissions"
	SandboxAllowList []string // patterns allowed without asking
	DangerBlockList  []string // patterns always blocked
	ChatMode         string   // "inherit", "all_permissions"
	ChatAllowList    []string // patterns allowed for this chat
}

// Check returns "allow", "block", or "ask".
func (pg *PermissionGate) Check(toolName string, toolInput map[string]any) string {
	if pg == nil {
		return "allow"
	}

	// Chat-level override
	if pg.ChatMode == "all_permissions" {
		return "allow"
	}

	// Global override
	if pg.GlobalMode == "all_permissions" {
		return "allow"
	}

	// Only certain tools need permission
	needsCheck := toolName == "execute_shell" ||
		(toolName == "file_operation" && isRestrictedFileOp(toolInput)) ||
		strings.HasPrefix(toolName, "mcp_")

	if !needsCheck {
		return "allow"
	}

	commandStr := extractCommand(toolName, toolInput)

	// Check danger block list
	for _, pattern := range pg.DangerBlockList {
		if strings.Contains(commandStr, pattern) {
			return "block"
		}
	}

	// Check allow lists
	for _, pattern := range pg.SandboxAllowList {
		if matchesPattern(commandStr, pattern) {
			return "allow"
		}
	}
	for _, pattern := range pg.ChatAllowList {
		if matchesPattern(commandStr, pattern) {
			return "allow"
		}
	}

	return "ask"
}

// AddToAllowList adds a pattern to the appropriate allow list.
func (pg *PermissionGate) AddToAllowList(pattern, scope string) {
	if scope == "chat" {
		pg.ChatAllowList = append(pg.ChatAllowList, pattern)
	} else {
		pg.SandboxAllowList = append(pg.SandboxAllowList, pattern)
	}
}

func isRestrictedFileOp(input map[string]any) bool {
	op, _ := input["operation"].(string)
	return op == "write" || op == "append" || op == "delete" || op == "mkdir"
}

func extractCommand(toolName string, input map[string]any) string {
	if toolName == "execute_shell" {
		cmd, _ := input["command"].(string)
		return cmd
	}
	op, _ := input["operation"].(string)
	path, _ := input["path"].(string)
	return op + " " + path
}

func matchesPattern(command, pattern string) bool {
	return strings.Contains(command, pattern)
}
