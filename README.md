# DownloadForge Pro (v1.2.2)
**Pure In-Browser High-Performance Streaming Media, Audio Studio & 3D Spatial Asset Ingestion Engine**  
*Engineered by Atharva Patil (p4inz) | P4inz Interactive Labs*  
*Architecture: Chrome Extension Manifest V3 (Zero Background OS Daemons / Zero Native Messaging Dependencies)*

---

## Technical Overview

DownloadForge Pro is a media extraction and transcoding engine running directly inside the Chrome V8 browser environment. It intercepts, parses, categorizes, decrypts, transmuxes, separates, and downloads video streams (HLS, MPEG-DASH), standalone audio tracks, images, documents, and 3D spatial models (glTF, GLB, OBJ, STL, USDZ, Gaussian Splats). 

The entire pipeline executes in the client browser sandbox without external proxies, native messaging hosts, or desktop companion tools.

---

## Competitive Architecture Matrix

| Architectural Feature | DownloadForge Pro (v1.2.2) | FetchV Downloader | Stream Recorder | Online 3D Rippers |
| :--- | :--- | :--- | :--- | :--- |
| **Detection Reliability** | **4-Tier Fallback Cascade** (Network, DOM, Engine Config, Hardware MSE) | Single-tier XHR/fetch interceptor | Audio/Video element polling | Single-format URL regex |
| **Audio Extraction & Transcoding** | **Native Web Audio PCM Engine** (WAV, MP3, M4A, Gain Boost +12dB) | Unsupported | Low-bitrate recording | Unsupported |
| **Track Separation** | **Pure In-Browser A/V Demuxer** (Muted MP4 or Audio-Only track) | Unsupported | Unsupported | Unsupported |
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

## In-Browser Audio Extraction & Transcoding Studio

When extracting audio from a streaming video or audio-only playlist, DownloadForge Pro bypasses the need for external tools like FFmpeg:
1. **Audio/Video Separation**: Download pure audio tracks (`.m4a`), studio-master uncompressed PCM (`.wav`), or muted video-only containers (`.mp4`) directly from the stream dropdown.
2. **Web Audio PCM Transcoder**: Uses the browser's hardware `AudioContext.decodeAudioData` to decode native compressed streams (AAC, Opus, MP3) into multi-channel Float32 PCM arrays.
3. **16-bit RIFF WAV Encoder**: Interleaves multi-channel samples, clamps signal excursions, applies optional hardware-calculated gain boosts (+3 dB, +6 dB, +12 dB), and prepends a standard 44-byte RIFF header in TypedArray memory.
4. **Direct File System Write**: Saves the output directly to disk via Chrome Downloads or the File System Access API without holding unbounded buffers in RAM.

---

## 3D Spatial Asset Ripper & WebGL GPU Geometry Extraction

Modern 3D web platforms use fragmented delivery pipelines to prevent trivial downloading:
- **WebGL Geometry Encryption & Proprietary Chunks**: Platforms like Sketchfab, Spline, and custom Three.js viewers stream binary buffers (`.binz`, `.osgjs`) or deliver raw JSON metadata endpoints (`/i/models/<uid>`). Direct downloads of these endpoints yield raw JSON strings or broken assets.
- **Fragmented glTF Archives**: Other sites deliver `.gltf` JSON files referencing external `.bin` geometry buffers and image textures.

DownloadForge Pro solves this through a dual-mode 3D extraction pipeline:

1. **In-Page WebGL GPU Mesh Ripper (Hardware Buffer Hook)**:
   - Intercepts `WebGLRenderingContext.prototype.bufferData` and `WebGL2RenderingContext.prototype.bufferData`.
   - Captures vertex arrays (`gl.ARRAY_BUFFER`, 0x8892) and element indices (`gl.ELEMENT_ARRAY_BUFFER`, 0x8893) directly as they are loaded into the GPU.
   - Reconstructs 3D coordinates, detects stride (normals/UVs), and exports a clean Wavefront `.obj` file on demand via the floating `3D Rip` viewer badge.
2. **Dedicated Platform Resolvers**:
   - **Sketchfab**: Extracts model UIDs, queries authenticated download endpoints for official `.zip`/`.glb` archives, automatically resolves streaming binary geometries (`.binz`/`.osgjs`), and strictly protects against downloading raw JSON metadata as `.glb`.
   - **Supported Ecosystems**: Automatic adapters for Sketchfab, Thingiverse, Printables, Cults3D, Spline (`.splinecode`), Ready Player Me (`.glb`), and Luma AI (`.splat`).
3. **glTF 2.0 Binary Container Packager (`src/core/gltf_packager.js`)**:
   - Merges external `.bin` files and embedded textures into standard standalone `.glb` containers ready for Blender, Unity, and Unreal Engine.

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
1. Download `downloadforge-pro-v1.2.2.zip` from the [Latest Release](https://github.com/p4inz-code/downloadforge-pro/releases/latest).
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
- In-Browser Audio Transcoder and RIFF WAV PCM header serialization.

---

## Engineering Credits & Contact
- **Author**: Atharva Patil ([p4inz](https://atharvapatil.tech))
- **Organization**: P4inz Interactive Labs
- **Support & Community Discord**: [discord.gg/8UKt8s5FbW](https://discord.gg/8UKt8s5FbW)
- **Repository**: [github.com/p4inz-code/downloadforge-pro](https://github.com/p4inz-code/downloadforge-pro)
- **License**: ISC
