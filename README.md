# DownloadForge Pro (v1.0.3)

**High-Performance In-Browser Stream Ingestion, Lossless MSE Harvester & Media Studio for Chrome (Manifest V3)**  
*Engineered by Atharva Patil ([p4inz](https://atharvapatil.tech)) · P4inz Interactive Labs*

[![Release](https://img.shields.io/badge/release-v1.0.3-6366f1.svg)](https://github.com/p4inz-code/downloadforge-pro/releases)
[![Chrome MV3](https://img.shields.io/badge/manifest-v3-10b981.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Portfolio](https://img.shields.io/badge/portfolio-atharvapatil.tech-0ea5e9.svg)](https://atharvapatil.tech)
[![Discord](https://img.shields.io/badge/discord-join-5865f2.svg)](https://discord.gg/8UKt8s5FbW)
[![Zero Telemetry](https://img.shields.io/badge/telemetry-none-success.svg)](#privacy--security-model)

---

DownloadForge Pro is a developer-focused, zero-telemetry Chrome extension engineered to sniff, decrypt, transmux, and download media streams from the web. It delivers full parity with and surpasses commercial tools like FetchV, Video DownloadHelper, and Stream Recorder by combining **native dual-protocol streaming (HLS + MPEG-DASH)**, **Lossless MSE Buffer Harvester with Chrono-Pacer Auto-Harvesting**, **dedicated Web Worker offscreen pipelines**, **hardware WebCrypto AES-128 decryption**, and **zero-RAM direct-to-disk streaming** (W3C File System Access API) inside a minimalist, zero-OS-native Outlinedesk engineering interface.

---

## What Sets DownloadForge Pro Apart

| Feature | Standard Downloaders | FetchV | DownloadForge Pro v1.0.3 |
| :--- | :--- | :--- | :--- |
| **Record Mode Technology** | Canvas / lossy re-encoding | Basic MediaRecorder | **Lossless MSE Bitstream Capture (0% re-encoding loss)** |
| **Buffer Fast-Buffering** | None | 1x - 16x audio playback | **Chrono-Pacer Auto-Seek + Auto-Mute (10x-50x speed)** |
| **HLS Stream Parsing** | Basic | Complete | **Complete (AES-128, Discontinuity, fMP4/CMAF bypass)** |
| **MPEG-DASH (.mpd) Parsing** | None | Separate Tool | **Native ISO/IEC 23009-1 (Template, Timeline, List)** |
| **Live Stream Capture** | Fails after 3 chunks | Limited | **Sliding-Window Live DVR Engine (Continuous capture)** |
| **Offscreen Web Worker** | Blocks UI thread | Partial | **Dedicated Web Worker with Transferable ArrayBuffers (60 FPS)** |
| **Direct-to-Disk Streaming** | In-memory RAM bloat | Limited | **W3C File System Access API (Flat < 30 MB RAM profile)** |
| **Error Handling & Triage** | Generic failure text | None | **7-Code Error Taxonomy + Automated Self-Healing Card** |
| **Time-Range Slicing** | None | None | **Start/End Timestamp Slicer (e.g. 00:01:30 -> 00:05:00)** |
| **Multi-Audio Track Selection**| None | None | **Native Audio Track & Language Picker** |
| **Subtitle / WebVTT Export** | None | None | **1-Click WebVTT Extractor & Concatenator** |
| **CLI Export (yt-dlp, curl)** | None | None | **Multi-Tool Command Generator** |
| **Design System** | Generic ad-filled UI | Basic grey UI | **Custom Outlinedesk UI (Zero OS Native Dialogs/Controls)** |
| **Extension Footprint** | 5 MB - 15 MB | ~3.2 MB | **270.9 KB (Ultra-Lightweight)** |

---

## Visual Interfaces

### 1. Stream Studio (`src/downloader/downloader.html`)
Live visual segment heatmap with telemetry hover tooltips, real-time throughput metrics (MB/s and ETA countdown), multi-thread concurrency tuning (1 to 32 threads), integrated HTML5 preview player, and multi-audio/subtitle track pickers.

### 2. In-Page Video Overlay & Buffer Harvester (`src/content/video_overlay.js`)
Subtle glassmorphic pill anchored to `<video>` elements with detected resolution badges, Picture-in-Picture quick toggle, and the Chrono-Pacer Live Buffer Recorder HUD.

### 3. Media Hub & Audit Dashboard (`src/dashboard/dashboard.html`)
Searchable local audit log, domain rule engine, diagnostics panel, and Outlinedesk confirmation modals.

---

## Core Systems Architecture

```
Webpage Context (DOM & Media)
   │
   ├── Main-World Sniffer (injected_sniffer.js)
   │     ├─ Intercepts fetch / XMLHttpRequest / Worker / SharedWorker
   │     ├─ Intercepts SourceBuffer.prototype.appendBuffer (Bitstream Harvester)
   │     └─ Cryptographic Nonce Handshake with Content Script
   │
   ├── Content Script Bridge (dist/content_script.bundle.js)
   │     ├─ In-Page Video Overlay & Chrono-Pacer HUD (video_overlay.js)
   │     ├─ Picture-in-Picture Quick Toggle
   │     └─ Relays stream manifests and MSE chunks to Service Worker
   │
   ├── Background Service Worker (src/background/service_worker.js)
   │     ├─ Tab resource store & dynamic badge counters
   │     ├─ Privileged tab creation (prevents ERR_BLOCKED_BY_CLIENT)
   │     └─ Anti-hotlink declarativeNetRequest dynamic header rules
   │
   └── Stream Studio (dist/downloader.bundle.js)
         ├─ dash_parser.js: ISO/IEC 23009-1 XML MPD parser
         ├─ hls_parser.js: RFC 8216 HLS Master, Media, Subtitles & CMAF Map parser
         ├─ hls_engine.js: Live DVR Sliding-Window Engine + Parallel Queue
         ├─ stream_worker.js: Dedicated offscreen Web Worker for AES-128 & mux.js
         ├─ error_handler.js: 7-Code Error Taxonomy & Self-Healing Engine
         └─ FileSystemWritableFileStream: Direct-to-Disk zero-RAM storage stream
```

---

## How to Pin DownloadForge Pro in Chrome

1. Click the **Extensions** icon (the puzzle piece) in the top-right toolbar of Google Chrome.
2. Locate **DownloadForge Pro** in the dropdown list.
3. Click the **Pin icon** (pushpin) so it turns blue.
4. DownloadForge Pro will now stay permanently anchored in your browser corner, displaying dynamic badges for detected media streams.

---

## Standalone Desktop Window Mode

DownloadForge Pro operates as a self-contained in-browser engine without requiring external background daemons or OS companion installers:

- **Launch as Standalone App**:
  Run Chrome with the `--app` argument:
  ```bash
  chrome.exe --app="chrome-extension://<EXTENSION_ID>/src/downloader/downloader.html"
  ```
  This launches an isolated, frameless desktop window with its own taskbar presence.

---

## Keyboard Shortcuts

| Shortcut | Scope | Action |
|---|---|---|
| `Alt + D` | Webpage | Trigger immediate download of currently active video stream |
| `Alt + R` | Webpage | Launch In-Page Buffer Recording HUD for `blob:` streams |
| `Escape` | Stream Studio / Dashboard | Close open modals or abort download job safely |

---

## Installation

### Method A: Install via Official Release Zip (Recommended)
1. Download `downloadforge-pro-v1.0.3.zip` from [Releases](https://github.com/p4inz-code/downloadforge-pro/releases).
2. Unzip the archive to a local directory (e.g. `Documents/downloadforge-pro`).
3. In Chrome, open `chrome://extensions` and toggle **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the unzipped directory.
5. Pin DownloadForge Pro to your toolbar.

### Method B: Build from Source
Requirements: Node.js (v18+) and npm.

```bash
# 1. Clone repository
git clone https://github.com/p4inz-code/downloadforge-pro.git
cd downloadforge-pro

# 2. Install dependencies
npm install

# 3. Compile bundles via esbuild
npm run build

# 4. Run automated test suite
npm test

# 5. Load unpacked into chrome://extensions
```

---

## Privacy & Security Model

- **Zero Remote Telemetry**: DownloadForge Pro contains zero tracking scripts, zero external analytics, and zero remote API pings.
- **Pure Local Ingestion**: All TS segment demuxing, AES-128 decryption, and MP4 packaging occur entirely within your local browser runtime.
- **Strict Content Security Policy (CSP)**: Extension pages are enforced with `script-src 'self'` and `object-src 'none'`.
- **Privileged Tab Routing**: Navigations from web pages to extension pages route strictly through `chrome.runtime.sendMessage()` and `chrome.tabs.create()`, permanently eliminating `ERR_BLOCKED_BY_CLIENT` browser errors.
- **DRM Policy**: DownloadForge Pro respects proprietary hardware DRM systems (Widevine, PlayReady, FairPlay) by surfacing clear guidance rather than failing silently, and offers the non-circumventing In-Page Buffer Recorder HUD as an alternative.

---

## Author & Support

- **Author**: Atharva Patil ([p4inz](https://atharvapatil.tech))
- **Studio**: P4inz Interactive Labs
- **Website**: [https://atharvapatil.tech](https://atharvapatil.tech)
- **Discord Community**: [https://discord.gg/8UKt8s5FbW](https://discord.gg/8UKt8s5FbW)
- **Email**: [atharva.patil.cg@gmail.com](mailto:atharva.patil.cg@gmail.com)
- **Repository**: [https://github.com/p4inz-code/downloadforge-pro](https://github.com/p4inz-code/downloadforge-pro)

---

## License

MIT License. Designed and engineered for personal high-speed media archiving.
