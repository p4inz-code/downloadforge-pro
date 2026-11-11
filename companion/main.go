// ============================================================
// DownloadForge Companion — main.go
// P4inz Interactive Labs | p4inz
//
// Native desktop companion app for DownloadForge Chrome extension.
// Communicates via Chrome Native Messaging protocol (stdin/stdout).
// Message framing: 4-byte little-endian length prefix + JSON body.
//
// Capabilities:
//   - Receive download tasks from extension
//   - Download files with progress tracking
//   - Queue management with pause/resume (HTTP Range supported)
//   - Report status back to extension
//
// Build: go build -o downloadforge-companion main.go messaging.go downloader.go queue.go config.go
// ============================================================

package main

import (
	"log"
	"os"
)

func main() {
	// Set up file logging (stdout is reserved for native messaging)
	logFile, err := openLogFile()
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}

	log.Printf("DownloadForge Companion starting — v%s by P4inz Interactive Labs", Version)

	// Load config
	cfg, err := LoadConfig()
	if err != nil {
		log.Printf("Config load failed (using defaults): %v", err)
		cfg = DefaultConfig()
	}

	// Initialize queue
	q := NewQueue(cfg)

	// Initialize messenger (reads/writes native messaging protocol on stdin/stdout)
	m := NewMessenger(q)

	// Block on message loop
	if err := m.Run(); err != nil {
		log.Printf("Messenger exited: %v", err)
		os.Exit(1)
	}
}

func openLogFile() (*os.File, error) {
	logPath := getLogPath()
	return os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
}
