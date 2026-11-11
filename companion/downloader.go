// ============================================================
// DownloadForge Companion — downloader.go
// ObsidianLabs | p4inz
//
// HTTP downloader with:
//   - Resume support via Range headers (if server supports it)
//   - Progress tracking
//   - Filename sanitization
//   - Collision-safe saving
// ============================================================

package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ── Downloader ────────────────────────────────────────────────

type DownloadProgress struct {
	TaskID    string  `json:"taskId"`
	BytesDone int64   `json:"bytesDone"`
	BytesTotal int64  `json:"bytesTotal"`
	Percent   float64 `json:"percent"`
	SpeedBps  int64   `json:"speedBps"`
	Done      bool    `json:"done"`
	Error     string  `json:"error,omitempty"`
}

type Downloader struct {
	client *http.Client
}

func NewDownloader() *Downloader {
	return &Downloader{
		client: &http.Client{
			Timeout: 0, // no overall timeout — downloads can be long
			Transport: &http.Transport{
				MaxIdleConns:       10,
				IdleConnTimeout:    90 * time.Second,
				DisableCompression: true, // don't decompress — download raw bytes
			},
		},
	}
}

// Download fetches a URL and saves it to savePath/filename.
// Supports resuming if the file partially exists and server supports Range.
func (d *Downloader) Download(ctx context.Context, task DownloadTask, progressCh chan<- DownloadProgress) error {
	savePath := task.SavePath
	if savePath == "" {
		savePath = GetDefaultDownloadDir()
	}

	// Ensure directory exists
	if err := os.MkdirAll(savePath, 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	filename := SanitizeFilename(task.Filename)
	if filename == "" {
		filename = extractFilenameFromURL(task.URL)
	}
	if filename == "" {
		filename = fmt.Sprintf("download_%d", time.Now().Unix())
	}

	destPath := collisionSafe(filepath.Join(savePath, filename))
	tempPath  := destPath + ".dfpart"

	// Check existing partial file for resume
	var resumeFrom int64
	if fi, err := os.Stat(tempPath); err == nil {
		resumeFrom = fi.Size()
		log.Printf("Resuming %s from byte %d", filename, resumeFrom)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", task.URL, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	// Request resume if we have a partial file
	if resumeFrom > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", resumeFrom))
	}

	req.Header.Set("User-Agent", "DownloadForge/"+Version+" (ObsidianLabs)")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	// Handle resume rejection (server doesn't support Range)
	if resp.StatusCode == http.StatusRequestedRangeNotSatisfiable {
		resumeFrom = 0
		os.Remove(tempPath)
		// Retry without range
		req2, _ := http.NewRequestWithContext(ctx, "GET", task.URL, nil)
		req2.Header.Set("User-Agent", req.Header.Get("User-Agent"))
		resp, err = d.client.Do(req2)
		if err != nil {
			return fmt.Errorf("retry request: %w", err)
		}
		defer resp.Body.Close()
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	// Open temp file
	flag := os.O_CREATE | os.O_WRONLY
	if resumeFrom > 0 && resp.StatusCode == http.StatusPartialContent {
		flag |= os.O_APPEND
	} else {
		flag |= os.O_TRUNC
		resumeFrom = 0
	}

	f, err := os.OpenFile(tempPath, flag, 0644)
	if err != nil {
		return fmt.Errorf("open temp file: %w", err)
	}
	defer f.Close()

	totalSize := resp.ContentLength
	if totalSize > 0 {
		totalSize += resumeFrom
	}

	// Stream with progress
	buf       := make([]byte, 64*1024) // 64KB chunks
	bytesDone := resumeFrom
	lastReport := time.Now()
	lastBytes  := resumeFrom

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				return fmt.Errorf("write: %w", writeErr)
			}
			bytesDone += int64(n)

			// Report progress every 500ms
			if time.Since(lastReport) > 500*time.Millisecond {
				elapsed := time.Since(lastReport).Seconds()
				speed   := int64(float64(bytesDone-lastBytes) / elapsed)
				percent := 0.0
				if totalSize > 0 {
					percent = float64(bytesDone) / float64(totalSize) * 100
				}

				if progressCh != nil {
					progressCh <- DownloadProgress{
						TaskID:     task.ID,
						BytesDone:  bytesDone,
						BytesTotal: totalSize,
						Percent:    percent,
						SpeedBps:   speed,
					}
				}

				lastReport = time.Now()
				lastBytes  = bytesDone
			}
		}

		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("read body: %w", readErr)
		}
	}

	f.Close()

	// Rename temp → final
	if err := os.Rename(tempPath, destPath); err != nil {
		return fmt.Errorf("rename: %w", err)
	}

	log.Printf("Download complete: %s (%d bytes)", destPath, bytesDone)

	if progressCh != nil {
		progressCh <- DownloadProgress{
			TaskID:    task.ID,
			BytesDone: bytesDone,
			BytesTotal: totalSize,
			Percent:   100,
			Done:      true,
		}
	}

	return nil
}

// ── Helpers ───────────────────────────────────────────────────

var illegalCharsRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// SanitizeFilename removes illegal characters from a filename.
func SanitizeFilename(name string) string {
	if name == "" { return "" }
	clean := illegalCharsRe.ReplaceAllString(name, "_")
	clean  = strings.TrimSpace(clean)
	if len(clean) > 200 { clean = clean[:200] }
	return clean
}

// collisionSafe returns a path that doesn't already exist by appending (1), (2) etc.
func collisionSafe(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path // doesn't exist — use as-is
	}

	ext  := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)

	for i := 1; i < 1000; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}

	return fmt.Sprintf("%s_%d%s", base, time.Now().Unix(), ext)
}

func extractFilenameFromURL(rawURL string) string {
	parts := strings.Split(rawURL, "/")
	if len(parts) == 0 { return "" }
	last := parts[len(parts)-1]
	// Strip query string
	if idx := strings.Index(last, "?"); idx != -1 {
		last = last[:idx]
	}
	return last
}
