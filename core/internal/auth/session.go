// Package auth provides authentication middleware for clank-core.
package auth

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
)

// NewSessionKeyMiddleware returns middleware that validates the X-Session-Key
// header against the expected key.
//
// In development mode (isDev=true), the check is skipped entirely.
// If no key is configured and not in dev mode, all requests are rejected.
func NewSessionKeyMiddleware(expectedKey string, isDev bool) func(http.Handler) http.Handler {
	keyBytes := []byte(expectedKey)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Dev mode bypasses auth
			if isDev {
				next.ServeHTTP(w, r)
				return
			}

			// No key configured — reject everything
			if len(keyBytes) == 0 {
				writeError(w, http.StatusUnauthorized, "unauthorized", "no session key configured")
				return
			}

			provided := r.Header.Get("X-Session-Key")
			if provided == "" {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing X-Session-Key header")
				return
			}

			// Constant-time comparison to prevent timing attacks
			if subtle.ConstantTimeCompare(keyBytes, []byte(provided)) != 1 {
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session key")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}
