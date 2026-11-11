// ============================================================
// DownloadForge Companion — config.go
// ObsidianLabs | p4inz
// ============================================================

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

const Version = "1.0.0"

type Config struct {
	MaxConcurrent int    `json:"maxConcurrent"`
	DefaultSavePath string `json:"defaultSavePath"`
	LogLevel      string `json:"logLevel"`
}

func DefaultConfig() *Config {
	return &Config{
		MaxConcurrent:   3,
		DefaultSavePath: GetDefaultDownloadDir(),
		LogLevel:        "info",
	}
}

func LoadConfig() (*Config, error) {
	path := getConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return DefaultConfig(), nil // not found — use defaults
	}
	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		return DefaultConfig(), err
	}
	return cfg, nil
}

func getConfigPath() string {
	return filepath.Join(getAppDataDir(), "config.json")
}

func getLogPath() string {
	return filepath.Join(getAppDataDir(), "companion.log")
}

func getAppDataDir() string {
	var base string
	switch runtime.GOOS {
	case "windows":
		base = os.Getenv("APPDATA")
	case "darwin":
		base = filepath.Join(os.Getenv("HOME"), "Library", "Application Support")
	default: // linux
		base = filepath.Join(os.Getenv("HOME"), ".config")
	}
	dir := filepath.Join(base, "ObsidianLabs", "DownloadForge")
	os.MkdirAll(dir, 0755)
	return dir
}

func GetDefaultDownloadDir() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, "Downloads", "DownloadForge")
	os.MkdirAll(dir, 0755)
	return dir
}
