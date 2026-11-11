## DownloadForge Pro v1.0.3 — Error Intelligence & Live DVR Engine

### What is New in v1.0.3:

1. **Unified Error Intelligence & Self-Healing System**:
   - Integrated `src/core/error_handler.js` with a 7-code error taxonomy:
     - `ERR_HOTLINK_403`: Auto-injects origin Referer into network headers and retries automatically.
     - `ERR_CORS_BLOCKED`: Auto-routes chunk requests through privileged background extension channel.
     - `ERR_CHUNK_404`: Interpolates segment duration and bypasses broken chunks without failing the job.
     - `ERR_LIVE_DESYNC`: Re-aligns live stream sequence index to current sliding window.
     - `ERR_DRM_PROTECTED`: Detects hardware encryption and prompts immediate switch to In-Page Buffer Mode.
     - `ERR_STREAM_ABORT`: Safely finalizes partial downloads so existing video is playable.
     - `ERR_TIMEOUT_CDN`: Triggers exponential backoff retry.
   - Outlinedesk Error Diagnostic Card in Stream Studio with one-click actions: "Auto-Fix & Retry", "Switch to Buffer Mode", and "Copy Diagnostic Log".

2. **Live Stream DVR Sliding-Window Engine**:
   - Added continuous live stream recording to `HLSEngine.downloadLiveStream()`.
   - Handles ongoing live broadcasts (Twitch, YouTube Live, event streams) lacking `#EXT-X-ENDLIST`.
   - Polls incoming chunks every half-target-duration with sequence-number deduplication.
   - Writes directly to disk in real time. Finalizes into a clean, seekable MP4 upon user stop.

3. **Multi-Audio Track Selection**:
   - Detects all alternate audio tracks from `#EXT-X-MEDIA:TYPE=AUDIO` and MPEG-DASH audio AdaptationSets.
   - Allows users to select desired audio language and commentary tracks in Stream Studio.

4. **In-Page Floating Overlay Upgrade**:
   - Added Picture-in-Picture (PiP) quick toggle button directly inside the video overlay HUD.
   - Preserves 1x, 2x, 4x, 8x, and 16x fast-forward playback rate speedup buttons.

5. **Segment Heatmap Telemetry Tooltips**:
   - Real-time hover inspection over every segment dot in the heatmap:
     - Segment sequence index (`#042 / 500`).
     - Decryption and container state (`Decrypted [Ready]`, `Direct [fMP4]`, `Skipped [404]`).
     - Exact byte size and duration.

6. **Zero OS Native Dialogs & Zero Emojis**:
   - 100% custom Outlinedesk confirmation modal with keyboard shortcuts.
   - Verified zero emojis across all code, markup, and styles.

### Download & Install:
Download `downloadforge-pro-v1.0.3.zip` below and load unpacked in `chrome://extensions`.
