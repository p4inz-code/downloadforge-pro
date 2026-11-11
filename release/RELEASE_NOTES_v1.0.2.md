## DownloadForge Pro v1.0.2 — 100x Ultra Engine Upgrade & FetchV Parity

### What is New in v1.0.2:

1. **[CRITICAL FIX] ERR_BLOCKED_BY_CLIENT Permanently Eradicated**:
   - Web pages and content scripts previously attempted to call `window.open('chrome-extension://...')`, triggering Chrome's security boundary error: `ERR_BLOCKED_BY_CLIENT (fblnpbbapgedgcekpjlmddecoimonkpi is blocked)`.
   - **Fix**: Replaced all web-initiated navigations with `chrome.runtime.sendMessage({ type: 'OPEN_DOWNLOADER' })`. The Background Service Worker now manages tab creation via `chrome.tabs.create()`, which is an authorized internal extension operation and is never blocked by Chrome.
   - Added all internal extension paths (`src/downloader/*`, `src/dashboard/*`) to `web_accessible_resources` in `manifest.json`.

2. **100x Ultra Engine Architecture**:
   - **MPEG-DASH (.mpd) Native Engine**: Full ISO/IEC 23009-1 manifest parser supporting `SegmentTemplate`, `SegmentTimeline`, `SegmentList`, and multi-period dual video + audio track extraction (Reddit, Twitter/X, Vimeo, Dailymotion).
   - **Offscreen Web Worker Pipeline**: Segment fetching, AES-128 decryption, and `mux.js` transmuxing run in a dedicated Web Worker (`dist/stream_worker.bundle.js`) passing chunks via zero-copy Transferable ArrayBuffers (`postMessage([chunk])`), keeping the UI at a locked 60 FPS under multi-gigabit throughput.
   - **Time-Range Slicing**: Download specific segments between exact start and end timestamps (`00:01:30` -> `00:05:00`).
   - **Subtitles & Captions Extractor**: One-click download of embedded WebVTT subtitle tracks.
   - **Multi-Tool CLI Command Exporter**: Export exact terminal commands for `yt-dlp`, `cURL`, or `aria2c` with headers and referer pre-configured.

3. **In-Page Live Buffer Recorder with 1x-16x Speedup**:
   - For MSE / blob streams that cannot be downloaded as simple files, DownloadForge Pro embeds an in-page floating Outlinedesk recording HUD directly on the player:
     - Real-time duration timer and captured MB size meter.
     - **Speedup Controls**: Instant 1x, 2x, 4x, 8x, 16x fast-forward playback buttons to record lengthy videos in a fraction of the time.
     - **Stop & Save MP4**: Packages chunks into an MP4/WebM file with 1 click.

4. **100% FetchV Feature Parity in Stream Studio**:
   - Parallel worker threads selector: 1 (Safe), 2, 4, 8 (Turbo), 16 (Max), 32 (Ultra).
   - Configurable retry attempts: 1, 3, 5, 10 retries with exponential backoff.
   - Segment request timeout: 5s, 10s, 15s, 30s with `AbortController` timeout.
   - **Skip Broken / 404 Segments**: Toggle to prevent single corrupt or missing segments from failing an entire download.
   - **Extract Audio Only**: Option to extract M4A/AAC audio tracks directly from video streams.
   - Custom `Referer` and anti-hotlink header support.
   - Direct-to-Disk streaming (W3C File System Access API) + browser download fallback.

5. **100% Custom Outlinedesk Design (Zero Chrome OS Native Elements)**:
   - Designed to match the minimalist engineering aesthetic of https://p4inz-code.github.io/outlinedesk/.
   - Eradicated all default Chrome/Windows select dropdowns, checkboxes, and scrollbars.
   - High-contrast tabular numbers, monospace eyebrows, and colored segment heatmap dots.
   - Strictly zero emojis across the entire project.

### Download & Install:
Download `downloadforge-pro-v1.0.2.zip` below and load unpacked in `chrome://extensions`.
