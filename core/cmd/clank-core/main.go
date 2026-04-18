// clank-core is the Go execution engine for ClankAI.
//
// In embedded mode it is spawned by Electron and communicates via localhost
// HTTP + SSE. In server mode it runs standalone with license validation.
//
// Usage:
//
//	clank-core --mode embedded --port 7731
//	clank-core --mode server   --port 8080
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nicekid1/ClankAI/core/internal/auth"
	"github.com/nicekid1/ClankAI/core/internal/datastore"
	"github.com/nicekid1/ClankAI/core/internal/server"
)

var (
	version = "0.1.0"
)

func main() {
	mode := flag.String("mode", "embedded", "Runtime mode: embedded or server")
	port := flag.Int("port", 7731, "TCP port to listen on")
	dataDir := flag.String("data-dir", "", "Path to data directory (required)")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		os.Exit(0)
	}

	// Read session key from env, then clear it so child processes cannot read it.
	sessionKey := os.Getenv("CLANK_SESSION_KEY")
	os.Unsetenv("CLANK_SESSION_KEY")

	isDev := os.Getenv("CLANK_ENV") == "development"

	// Resolve data directory: flag > env > empty (will error on read)
	resolvedDataDir := *dataDir
	if resolvedDataDir == "" {
		resolvedDataDir = os.Getenv("CLANK_DATA_DIR")
	}

	// Build auth middleware
	authMiddleware := auth.NewSessionKeyMiddleware(sessionKey, isDev)

	// Build data store
	store := datastore.New(resolvedDataDir)

	// Build server
	srv := server.New(server.Config{
		Version: version,
		Mode:    *mode,
		Port:    *port,
		Auth:    authMiddleware,
		Store:   store,
	})

	// Determine bind address
	bindAddr := fmt.Sprintf("127.0.0.1:%d", *port)
	if *mode == "server" {
		bindAddr = fmt.Sprintf("0.0.0.0:%d", *port)
	}

	httpServer := &http.Server{
		Addr:              bindAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Embedded mode: exit when stdin closes (parent process died)
	if *mode == "embedded" {
		go func() {
			buf := make([]byte, 1)
			for {
				_, err := os.Stdin.Read(buf)
				if err == io.EOF || err != nil {
					log.Println("stdin closed, shutting down")
					stop()
					return
				}
			}
		}()
	}

	// Start server
	go func() {
		log.Printf("clank-core v%s starting on %s (mode=%s, dev=%v)", version, bindAddr, *mode, isDev)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Signal readiness to Electron (it watches stdout for this line)
	fmt.Println("READY")

	// Wait for shutdown signal
	<-ctx.Done()
	log.Println("shutting down...")

	// Stop all active agent loops before closing HTTP connections
	server.StopAllLoops()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
