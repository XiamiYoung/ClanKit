// Structured logging using Go 1.21+ slog.
// All engine/server code should use these functions instead of log.Printf.
package engine

import (
	"log/slog"
	"os"
)

// Logger is the package-level structured logger.
var Logger = slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))

// LogAgent logs an agent-related event with structured fields.
func LogAgent(msg string, args ...any) {
	Logger.Info(msg, args...)
}

// LogWarn logs a warning.
func LogWarn(msg string, args ...any) {
	Logger.Warn(msg, args...)
}

// LogError logs an error.
func LogError(msg string, args ...any) {
	Logger.Error(msg, args...)
}
