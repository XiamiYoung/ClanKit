package tools

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ValidatePath ensures the resolved path stays within an allowed base directory.
// Returns the cleaned absolute path, or an error if traversal is detected.
func ValidatePath(base, userPath string) (string, error) {
	if base == "" {
		return "", fmt.Errorf("no base directory configured — file operations disabled")
	}

	// Clean and resolve
	absBase, _ := filepath.Abs(base)
	var absPath string
	if filepath.IsAbs(userPath) {
		absPath = filepath.Clean(userPath)
	} else {
		absPath = filepath.Clean(filepath.Join(absBase, userPath))
	}

	// Ensure the path is within the base directory
	rel, err := filepath.Rel(absBase, absPath)
	if err != nil {
		return "", fmt.Errorf("path traversal detected: %s", userPath)
	}
	if strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path traversal detected: %s resolves outside allowed directory", userPath)
	}

	return absPath, nil
}
