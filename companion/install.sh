#!/usr/bin/env bash
# ============================================================
# DownloadForge Companion — install.sh
# P4inz Interactive Labs | p4inz
#
# Builds and registers the native messaging host on macOS/Linux.
# Run: bash install.sh YOUR_EXTENSION_ID
#
# For Windows — use install.bat instead.
# ============================================================

set -e

EXTENSION_ID="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="downloadforge-companion"
HOST_NAME="com.P4inz Interactive Labs.downloadforge"

# ── Validate ─────────────────────────────────────────────────
if [ -z "$EXTENSION_ID" ]; then
  echo "Usage: bash install.sh YOUR_CHROME_EXTENSION_ID"
  echo ""
  echo "Find your extension ID at chrome://extensions after loading unpacked."
  exit 1
fi

echo "DownloadForge Companion Installer"
echo "P4inz Interactive Labs | p4inz"
echo "=================================="
echo ""

# ── Build binary ─────────────────────────────────────────────
echo "→ Building companion binary..."
cd "$SCRIPT_DIR"
go build -o "$BINARY_NAME" . || { echo "✗ Build failed. Make sure Go is installed (https://go.dev)."; exit 1; }
echo "✓ Binary built: $SCRIPT_DIR/$BINARY_NAME"

# ── Determine host manifest destination ──────────────────────
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  mkdir -p "$HOST_DIR"
elif [ "$OS" = "Linux" ]; then
  HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
  # Also support Chromium
  CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
  mkdir -p "$HOST_DIR" "$CHROMIUM_DIR" 2>/dev/null || true
else
  echo "✗ Unsupported OS: $OS. Use install.bat on Windows."
  exit 1
fi

# ── Write host manifest ───────────────────────────────────────
MANIFEST_PATH="$HOST_DIR/$HOST_NAME.json"
BINARY_PATH="$SCRIPT_DIR/$BINARY_NAME"

cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "DownloadForge native companion app by P4inz Interactive Labs",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "✓ Host manifest written: $MANIFEST_PATH"

# Chromium copy on Linux
if [ "$OS" = "Linux" ] && [ -d "$CHROMIUM_DIR" ]; then
  cp "$MANIFEST_PATH" "$CHROMIUM_DIR/$HOST_NAME.json"
  echo "✓ Also registered for Chromium"
fi

# ── Make binary executable ────────────────────────────────────
chmod +x "$BINARY_PATH"

echo ""
echo "✓ Installation complete!"
echo ""
echo "  Extension ID : $EXTENSION_ID"
echo "  Binary       : $BINARY_PATH"
echo "  Manifest     : $MANIFEST_PATH"
echo ""
echo "Open the DownloadForge dashboard → Desktop App tab to verify the connection."
