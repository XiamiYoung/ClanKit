package datastore

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// ReadSkills scans the skills directory and returns metadata for each skill.
//
// Skills are stored as directories under {DATA_DIR}/skills/{skillId}/.
// Each skill directory contains SKILL.md (required) with YAML frontmatter
// and optionally manifest.json.
//
// Mirrors: electron/ipc/skills.js scan logic
func (s *Store) ReadSkills() ([]any, error) {
	skillsDir := filepath.Join(s.DataDir, "skills")
	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []any{}, nil
		}
		return nil, err
	}

	var result []any
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillID := entry.Name()
		skillDir := filepath.Join(skillsDir, skillID)

		// Read SKILL.md for frontmatter
		skillMD, err := os.ReadFile(filepath.Join(skillDir, "SKILL.md"))
		if err != nil {
			continue // skip directories without SKILL.md
		}

		name, description := parseFrontmatter(string(skillMD))
		if name == "" {
			name = skillID
		}

		skill := map[string]any{
			"id":          skillID,
			"name":        name,
			"displayName": name,
			"description": description,
			"path":        skillDir,
			"isBuiltin":   false,
		}

		// Check manifest.json for builtin flag
		manifestData, err := os.ReadFile(filepath.Join(skillDir, "manifest.json"))
		if err == nil {
			var manifest map[string]any
			if json.Unmarshal(manifestData, &manifest) == nil {
				if builtin, ok := manifest["builtin"].(bool); ok {
					skill["isBuiltin"] = builtin
				}
			}
		}

		result = append(result, skill)
	}
	return result, nil
}

// ReadSkill reads a single skill's metadata and full content.
func (s *Store) ReadSkill(id string) (map[string]any, error) {
	skillDir := filepath.Join(s.DataDir, "skills", id)
	skillMD, err := os.ReadFile(filepath.Join(skillDir, "SKILL.md"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	name, description := parseFrontmatter(string(skillMD))
	if name == "" {
		name = id
	}

	return map[string]any{
		"id":           id,
		"name":         name,
		"displayName":  name,
		"description":  description,
		"systemPrompt": string(skillMD),
		"path":         skillDir,
	}, nil
}

// parseFrontmatter extracts name and description from YAML frontmatter in SKILL.md.
// Simple parser — handles `name:` and `description:` lines between `---` delimiters.
func parseFrontmatter(content string) (name, description string) {
	lines := strings.Split(content, "\n")
	inFrontmatter := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			if !inFrontmatter {
				inFrontmatter = true
				continue
			}
			break // end of frontmatter
		}
		if !inFrontmatter {
			continue
		}
		if strings.HasPrefix(trimmed, "name:") {
			name = stripQuotes(strings.TrimSpace(strings.TrimPrefix(trimmed, "name:")))
		} else if strings.HasPrefix(trimmed, "description:") {
			description = stripQuotes(strings.TrimSpace(strings.TrimPrefix(trimmed, "description:")))
		}
	}
	return
}

// stripQuotes removes surrounding single or double quotes from a YAML value.
func stripQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}
