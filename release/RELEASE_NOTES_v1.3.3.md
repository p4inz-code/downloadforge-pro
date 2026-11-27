# DownloadForge Pro v1.3.3

Maintenance and engine reliability release addressing end-to-end 3D geometry ripping, large-file MV3 downloads, and MPEG-DASH stream stability.

## Fixes & Improvements
- **Main/Isolated Token Handshake (`injected_sniffer.js`, `content_script.js`)**: Coordinated `document_start` cryptographic token synchronization across MV3 `MAIN` and `ISOLATED` execution worlds, eliminating dropped `MEDIA_DETECTED` and buffer IPC messages while scrubbing `dfSnifferToken` from DOM datasets.
- **WebGL Geometry & Attribute Decoder (`injected_sniffer.js`)**: Replaced `Float32Array`-only vertex assumptions with a full typed `DataView` decoder (`UNSIGNED_SHORT`, signed `SHORT` octahedral normals, `BYTE`, `UNSIGNED_BYTE`, `HALF_FLOAT`, `FLOAT`), exact byte strides per attribute type, per-VAO state tracking (`bindVertexArray` / `enableVertexAttribArray`), `getUniformLocation`-filtered `uModelMatrix` / `uQUV0` dequantization, fullscreen post-process quad filtering, and compact per-draw vertex remapping with pass-upgrade deduplication.
- **GLB Export & MV3 Offscreen Blob Pipeline (`model_zip_bundler.js`, `src/offscreen/`, `service_worker.js`)**: Preserved `NORMAL`, `TEXCOORD_0`, PBR material definitions, and embedded primary diffuse textures in `convertObjToGlb()`. Added MV3 `"offscreen"` Blob URL creation and `chrome.tabs.connect` chunked mesh transfer (`df_obj_stream`) to bypass Chrome's 2MB `data:` URL cap and 64MB single-message IPC limit on multi-megabyte 3D packages, with Blob cleanup on `downloads.onChanged`.
- **MPEG-DASH & Audio Fixes (`hls_engine.js`, `stream_worker.js`, `downloader_bundle.js`, `audio_converter.js`)**: Fixed `ReferenceError: targetPlaylist is not defined` on `.mpd` DASH manifests, prevented fMP4 audio segments from being pushed into the MPEG-TS transmuxer, wired paired HLS TS audio into `stream_worker.js`, revoked subtitle Blob URLs, and aligned PCM WAV audio exports to `.wav`.
- **Dashboard & Packaging (`dashboard.js`, `constants.js`, `manifest.json`)**: Imported missing `DEFAULT_SETTINGS` for settings reset, removed stale toggle/extension keys, and synced version strings to `1.3.3`.

## Verification
- `npm test` (19 suites), `node tests/five_layer_proof.js`, and `python tests/audit_check.py` passed with 0 failures.
- Verified live WebGL extraction on Sketchfab models (`dc6cec25ed3249dbac5ba49121963dec`, `250b9046b0c54a51bda967458eaa29ef`, `61b1259b14ae4840ba1b0e9d819e60c1`), Poly Haven (`ArmChair_01`), HLS (`test-streams.mux.dev`), and MPEG-DASH (`dash.akamaized.net`).
