package tools

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ShellTool executes shell commands.
// Commands are passed to sh -c (Unix) or cmd /C (Windows).
// Permission gate is the primary security layer; this tool adds a
// secondary deny-list for catastrophic patterns.
type ShellTool struct{}

// dangerousPatterns are blocked even if the permission gate allows them.
var dangerousPatterns = []string{
	"rm -rf /",
	"rm -rf /*",
	"mkfs.",
	"dd if=",
	":(){:|:&};:",      // fork bomb
	"> /dev/sda",
	"chmod -R 777 /",
}

func (t *ShellTool) Name() string { return "execute_shell" }

func (t *ShellTool) Definition() map[string]any {
	return map[string]any{
		"name":        "execute_shell",
		"description": "Execute a shell command and return stdout/stderr. Use for running scripts, installing packages, checking file contents, git operations, etc.",
		"input_schema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command": map[string]any{
					"type":        "string",
					"description": "The command to execute",
				},
			},
			"required": []string{"command"},
		},
	}
}

func (t *ShellTool) Execute(toolCallID string, input map[string]any, onUpdate func(string, string)) (any, error) {
	command, _ := input["command"].(string)
	if command == "" {
		return map[string]any{
			"content": []any{map[string]any{"type": "text", "text": "Error: empty command"}},
		}, nil
	}

	// Secondary deny-list: block catastrophic commands even if permission gate allows
	cmdLower := strings.ToLower(command)
	for _, pattern := range dangerousPatterns {
		if strings.Contains(cmdLower, pattern) {
			return textResult(fmt.Sprintf("Error: command blocked by safety filter (matched: %s)", pattern)), nil
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}

	// Use pipes for live streaming (not batch-after-completion)
	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return textResult(fmt.Sprintf("Error starting command: %v", err)), nil
	}

	// Stream stdout and stderr concurrently
	var output strings.Builder
	var wg sync.WaitGroup

	streamPipe := func(pipe io.Reader, streamType string) {
		defer wg.Done()
		scanner := bufio.NewScanner(pipe)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text() + "\n"
			output.WriteString(line)
			if onUpdate != nil {
				onUpdate(streamType, line)
			}
		}
	}

	wg.Add(2)
	go streamPipe(stdoutPipe, "stdout")
	go streamPipe(stderrPipe, "stderr")
	wg.Wait()

	err := cmd.Wait()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	fullOutput := output.String()
	totalLines := len(strings.Split(strings.TrimRight(fullOutput, "\n"), "\n"))
	truncated := len(fullOutput) > 100000
	if truncated {
		fullOutput = fullOutput[:100000] + fmt.Sprintf("\n... [truncated, total %d bytes]", len(fullOutput))
	}

	return map[string]any{
		"content": []any{map[string]any{"type": "text", "text": fullOutput}},
		"details": map[string]any{
			"exit_code":  exitCode,
			"truncated":  truncated,
			"totalLines": totalLines,
			"totalBytes": len(fullOutput),
		},
	}, nil
}
