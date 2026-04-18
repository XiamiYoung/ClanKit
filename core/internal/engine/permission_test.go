package engine

import "testing"

func TestPermissionGate_AllPermissions(t *testing.T) {
	g := &PermissionGate{GlobalMode: "all_permissions"}
	if g.Check("execute_shell", map[string]any{"command": "ls"}) != "allow" {
		t.Error("all_permissions should allow everything")
	}
}

func TestPermissionGate_ChatOverride(t *testing.T) {
	g := &PermissionGate{
		GlobalMode: "sandbox",
		ChatMode:   "all_permissions",
	}
	if g.Check("execute_shell", map[string]any{"command": "rm -rf foo"}) != "allow" {
		t.Error("chat override should allow")
	}
}

func TestPermissionGate_Sandbox_AskByDefault(t *testing.T) {
	g := &PermissionGate{GlobalMode: "sandbox"}
	if got := g.Check("execute_shell", map[string]any{"command": "ls"}); got != "ask" {
		t.Errorf("expected ask, got %s", got)
	}
}

func TestPermissionGate_DangerBlock(t *testing.T) {
	g := &PermissionGate{
		GlobalMode:      "sandbox",
		DangerBlockList: []string{"rm -rf"},
	}
	if got := g.Check("execute_shell", map[string]any{"command": "rm -rf /"}); got != "block" {
		t.Errorf("expected block, got %s", got)
	}
}

func TestPermissionGate_AllowListHit(t *testing.T) {
	g := &PermissionGate{
		GlobalMode:       "sandbox",
		SandboxAllowList: []string{"ls"},
	}
	if got := g.Check("execute_shell", map[string]any{"command": "ls -la"}); got != "allow" {
		t.Errorf("expected allow via pattern match, got %s", got)
	}
}

func TestPermissionGate_ChatAllowList(t *testing.T) {
	g := &PermissionGate{
		GlobalMode:    "sandbox",
		ChatAllowList: []string{"git"},
	}
	if got := g.Check("execute_shell", map[string]any{"command": "git status"}); got != "allow" {
		t.Errorf("expected allow via chat allow list, got %s", got)
	}
}

func TestPermissionGate_NonRestrictedTool(t *testing.T) {
	g := &PermissionGate{GlobalMode: "sandbox"}
	// read operation is not restricted
	if got := g.Check("file_operation", map[string]any{"operation": "read", "path": "x"}); got != "allow" {
		t.Errorf("read should be allowed, got %s", got)
	}
	// write is restricted
	if got := g.Check("file_operation", map[string]any{"operation": "write", "path": "x"}); got != "ask" {
		t.Errorf("write should ask, got %s", got)
	}
}

func TestPermissionGate_MCPToolChecked(t *testing.T) {
	g := &PermissionGate{GlobalMode: "sandbox"}
	if got := g.Check("mcp_abc_read", map[string]any{}); got != "ask" {
		t.Errorf("mcp_ tools should ask, got %s", got)
	}
}

func TestPermissionGate_AddToAllowList(t *testing.T) {
	g := &PermissionGate{}
	g.AddToAllowList("npm", "chat")
	if len(g.ChatAllowList) != 1 || g.ChatAllowList[0] != "npm" {
		t.Errorf("expected chat allow list to contain npm, got %v", g.ChatAllowList)
	}
	g.AddToAllowList("git", "global")
	if len(g.SandboxAllowList) != 1 || g.SandboxAllowList[0] != "git" {
		t.Errorf("expected sandbox allow list to contain git, got %v", g.SandboxAllowList)
	}
}
