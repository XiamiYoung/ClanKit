package llm

import (
	"crypto/tls"
	"net"
	"net/http"
	"time"
)

// StreamingHTTPClient returns an http.Client configured for LLM streaming.
// It sets connection-phase timeouts but no global timeout (streams are long-lived).
var StreamingHTTPClient = &http.Client{
	Transport: &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
		TLSHandshakeTimeout:  10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConns:          10,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	},
}
