package server

import (
	"encoding/json"
	"net/http"
)

// Semaphore limits concurrent requests to a handler.
type Semaphore struct {
	ch chan struct{}
}

// NewSemaphore creates a semaphore with the given max concurrency.
func NewSemaphore(max int) *Semaphore {
	return &Semaphore{ch: make(chan struct{}, max)}
}

// LimitHandler wraps an http.HandlerFunc with concurrency limiting.
// Returns 429 if the semaphore is full.
func (s *Semaphore) LimitHandler(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		select {
		case s.ch <- struct{}{}:
			defer func() { <-s.ch }()
			next(w, r)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "too many concurrent agent runs",
				"code":  "rate_limited",
			})
		}
	}
}
