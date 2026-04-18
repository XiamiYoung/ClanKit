package tools

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestValidatePath_RelativePath(t *testing.T) {
	base := t.TempDir()
	resolved, err := ValidatePath(base, "subdir/file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(resolved, base) {
		t.Errorf("resolved %q should be inside %q", resolved, base)
	}
}

func TestValidatePath_BlocksTraversal(t *testing.T) {
	base := t.TempDir()
	cases := []string{
		"../etc/passwd",
		"../../system32",
		"subdir/../../../etc",
	}
	for _, userPath := range cases {
		if _, err := ValidatePath(base, userPath); err == nil {
			t.Errorf("expected error for traversal %q", userPath)
		}
	}
}

func TestValidatePath_AbsolutePathOutsideBase(t *testing.T) {
	base := t.TempDir()
	// Absolute path outside base should be rejected
	outside := filepath.Join(t.TempDir(), "other.txt")
	if _, err := ValidatePath(base, outside); err == nil {
		t.Errorf("expected error for path outside base: %s", outside)
	}
}

func TestValidatePath_RequiresBase(t *testing.T) {
	if _, err := ValidatePath("", "anything"); err == nil {
		t.Error("expected error for empty base")
	}
}

func TestValidatePath_NestedAllowed(t *testing.T) {
	base := t.TempDir()
	resolved, err := ValidatePath(base, "a/b/c/d.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(resolved, "a") {
		t.Errorf("expected path under base, got %s", resolved)
	}
}
