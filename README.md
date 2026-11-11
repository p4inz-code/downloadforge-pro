# DownloadForge Pro (v1.1.0)
**Pure In-Browser High-Performance Streaming Media & 3D Spatial Asset Ingestion Engine**  
*Engineered by Atharva Patil (p4inz) | P4inz Interactive Labs*  
*Architecture: Chrome Extension Manifest V3 (Zero Background OS Daemons / Zero Native Messaging Dependencies)*

---

## Technical Overview

DownloadForge Pro is a specialized media extraction engine operating entirely within the Chrome V8 browser runtime. It intercepts, categorizes, decrypts, transmuxes, and downloads video streams (HLS, MPEG-DASH), audio tracks, images, documents, and 3D spatial models (glTF, GLB, OBJ, STL, USDZ, Gaussian Splats) without routing network traffic through external proxies or requiring desktop companion software.

---

## Competitive Architecture Matrix

| Architectural Feature | DownloadForge Pro (v1.1.0) | FetchV Downloader | Stream Recorder | Online 3D Rippers |
| :--- | :--- | :--- | :--- | :--- |
| **Detection Reliability** | **4-Tier Fallback Cascade** (Network, DOM, Engine Config, Hardware MSE) | Single-tier XHR/fetch interceptor | Audio/Video element polling | Single-format URL regex |
| **HLS / DASH Ingestion** | **Multi-Worker Web Workers** (1x to 32x parallel segment downloads) | Single-threaded script loop | Re-encoding via canvas record | Unsupported |
| **Decryption Support** | **WebCrypto AES-128 CBC** (In-Worker direct buffer decryption) | Basic AES-128 (main thread) | Unsupported | Unsupported |
| **Memory Footprint** | **0% RAM Bloat** (W3C FileSystemWritableFileStream streaming to disk) | Unbounded memory accumulation | 4GB buffer limits (OOM crashes) | N/A |
| **Error Intelligence** | **7-Code Error Taxonomy** + Automated Self-Healing Referer Ingestion | Generic error string | Silent stall | HTTP 403 failure |
| **Live Stream Capture** | **Sliding-Window DVR Engine** with deduplicated chunk streaming | Unsupported | Lossy Canvas Record | Unsupported |
| **Record Mode Quality** | **Lossless MSE Capture** (moof/mdat bitstream grab + Chrono-Pacer) | Screen re-encoding loss (30-40%) | Playback speedup stutter | N/A |
| **3D Asset Extraction** | **Deep WebGL / Three.js Hook** + Auto-Bundling .gltf into single .glb | Unsupported | Unsupported | Broken external .bin files |
| **Interface Aesthetics** | **Custom Outlinedesk Design** (Zero OS-native dialogues, Light & Dark modes) | Generic Chrome UI | Legacy popup | Web forms with ads |
| **Update Mechanism** | **Automated GitHub Release Checker** (4h interval background alerts) | Chrome Web Store only | Manual download | N/A |

---

## Sniffer Architecture: 4-Tier Detection Cascade

```
+-----------------------------------------------------------------------------------------+
| Tier 1: Active Network Request Interception                                             |
| Injected hooks on window.fetch & XMLHttpRequest.prototype.open/send                     |
| Evaluates outgoing URLs & Content-Type headers for .m3u8, .mpd, .ts, .m4s, .glb, .splat |
+-----------------------------------------------------------------------------------------+
                                             | (Fails or zero matches)
                                             v
+-----------------------------------------------------------------------------------------+
| Tier 2: DOM & Page-Source Media Scanner                                                 |
| Traversal of <video>, <audio>, <source>, <model-viewer>, <spline-viewer>, and shadow DOM |
+-----------------------------------------------------------------------------------------+
                                             | (Fails or blob:-only URLs)
                                             v
+-----------------------------------------------------------------------------------------+
| Tier 3: Player Config & Hydration State Extractor                                       |
| Traverses global engine instances (jwplayer, videojs, hls.js) and SSR JSON hydration   |
| (__NEXT_DATA__, __NUXT__, Schema.org VideoObject LD-JSON)                               |
+-----------------------------------------------------------------------------------------+
                                             | (Fails or obfuscated closures)
                                             v
+-----------------------------------------------------------------------------------------+
| Tier 4: Hardware MediaSource & WebGL Buffer Interceptor                                 |
| Intercepts SourceBuffer.prototype.appendBuffer and THREE.GLTFLoader.prototype.parse    |
| Harvests lossless moof/mdat binary boxes and scene geometries straight from memory      |
+-----------------------------------------------------------------------------------------+
```

### Detection Provenance Telemetry
Every detected item is tagged with its origin method:
- `TIER_1_NETWORK_FETCH`: Dynamically requested via fetch.
- `TIER_1_NETWORK_XHR`: Requested via XMLHttpRequest.
- `TIER_2_DOM_TAG`: Discovered in page DOM attributes.
- `TIER_3_PLAYER_CONFIG`: Parsed from player configurations or hydration scripts.
- `TIER_4_MSE_BUFFER`: Extracted from MediaSource buffer chunk writes.

---

## 3D Spatial Asset Ripper & glTF Standalone Bundler

When websites render 3D scenes using `<model-viewer>`, Spline, or Three.js, models are often delivered as fragmented `.gltf` JSON files referencing external `.bin` geometry buffers and image textures. Downloading only the `.gltf` yields a broken, unrenderable file.

DownloadForge Pro solves this with an in-browser glTF 2.0 Binary container packager (`src/core/gltf_packager.js`):
1. **Network Sniffing**: Automatically intercepts calls for `.glb`, `.gltf`, `.obj`, `.stl`, `.fbx`, `.usdz`, `.splat`, and `.ply`.
2. **Buffer Merging**: Fetches external `.bin` files, aligns buffer views to 4-byte boundaries, shifts byte offsets, and embeds textures.
3. **GLB Header Serialization**: Generates the 12-byte binary header (`0x46546C67`), chunk 0 JSON, and chunk 1 BIN.
4. **Export**: Produces a 100% self-contained `.glb` file ready for Blender, Unity, Unreal Engine, and Windows 3D Viewer.
5. **In-Page Hover Overlay**: Adds an interactive `3D Rip` pill when hovering over any `<model-viewer>` or `<spline-viewer>` canvas.

---

## Error Intelligence & Automated Self-Healing Taxonomy

Network exceptions during video and 3D ingestion are parsed and mapped to structured recovery operations:

| Error Code | Root Cause | Automated Self-Healing Action |
| :--- | :--- | :--- |
| `ERR_HOTLINK_403` | CDN blocks request due to missing Referer/Origin headers. | Automatically injects origin page Referer and retries segment fetch. |
| `ERR_CORS_BLOCKED` | CDN omits `Access-Control-Allow-Origin` headers. | Routes chunk fetch through background extension context. |
| `ERR_CHUNK_404` | Missing or expired segment on CDN server. | Interpolates timestamp sequence and advances to prevent job abort. |
| `ERR_LIVE_DESYNC` | Live broadcast sequence drifted beyond the sliding window. | Re-aligns playlist sequence pointer to current live frontier. |
| `ERR_DRM_PROTECTED` | Stream is encrypted with hardware Widevine L1/L3 DRM. | Prompts user to engage In-Page Lossless Buffer Record mode. |
| `ERR_STREAM_ABORT` | User or network interruption halted the pipeline. | Safely finalizes existing chunks so downloaded portion is playable. |
| `ERR_TIMEOUT_CDN` | CDN socket stalled during segment retrieval. | Executes exponential backoff retry across worker threads. |

---

## Installation & Setup

### Option 1: Unpacked Developer Mode (Chrome / Edge / Brave / Opera)
1. Download `downloadforge-pro-v1.1.0.zip` from the [Latest Release](https://github.com/p4inz-code/downloadforge-pro/releases/latest).
2. Extract the archive to a local folder.
3. Open `chrome://extensions` in your browser.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the extracted folder.

### Option 2: Build from Source
```bash
git clone https://github.com/p4inz-code/downloadforge-pro.git
cd downloadforge-pro
npm install
npm test
npm run build
python package.py
```

---

## Keyboard Shortcuts
- `Alt + D`: Open DownloadForge resource detection popup.
- `Alt + R`: Force rescan of active page media and 3D assets.
- `Enter`: Confirm action in Outlinedesk custom modal.
- `Escape`: Cancel action / close active modal dialog.

---

## Verification & Test Suite
Run the automated engine test suite:
```bash
npm test
```
The test suite validates:
- MPEG-DASH ISO-8601 duration string arithmetic.
- HLS worker concurrency thread pools (1x to 32x).
- Time-Range timestamp slicer parsing (`HH:MM:SS`).
- Error Intelligence classification and auto-healing flags.
- Auto-Updater semver evaluation.
- glTF-to-GLB binary serialization and header alignment.
- Media and 3D spatial asset taxonomy mappings.

---

## Engineering Credits & Contact
- **Author**: Atharva Patil ([p4inz](https://atharvapatil.tech))
- **Organization**: P4inz Interactive Labs
- **Support & Community Discord**: [discord.gg/8UKt8s5FbW](https://discord.gg/8UKt8s5FbW)
- **Repository**: [github.com/p4inz-code/downloadforge-pro](https://github.com/p4inz-code/downloadforge-pro)
- **License**: ISC
