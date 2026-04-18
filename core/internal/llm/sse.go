package llm

import (
	"bufio"
	"io"
	"strings"
)

// SSEEvent represents a single Server-Sent Event.
type SSEEvent struct {
	Event string // event type (e.g. "message_start")
	Data  string // JSON data payload
}

// ReadSSE reads SSE events from a reader.
// Returns a channel that yields events until EOF or error.
func ReadSSE(r io.Reader) <-chan SSEEvent {
	ch := make(chan SSEEvent, 16)
	go func() {
		defer close(ch)
		scanner := bufio.NewScanner(r)
		// Increase buffer for large SSE payloads (e.g. tool results)
		scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

		var event SSEEvent
		for scanner.Scan() {
			line := scanner.Text()

			if line == "" {
				// Empty line = end of event
				if event.Data != "" {
					ch <- event
				}
				event = SSEEvent{}
				continue
			}

			if strings.HasPrefix(line, "event: ") {
				event.Event = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				if event.Data == "" {
					event.Data = data
				} else {
					event.Data += "\n" + data // multi-line data per SSE spec
				}
			} else if strings.HasPrefix(line, ":") {
				// Comment line (keepalive) — skip (SSE spec: lines starting with colon)
			}
		}
		// Flush last event if no trailing newline
		if event.Data != "" {
			ch <- event
		}
	}()
	return ch
}
