---
name: testing
description: Automated and manual verification of HLS stream parsing, segment decryption, TS-to-fMP4 transmuxing, and file saving across varied video sites.
---

# Testing Skill

## Testing Matrix
1. **Manifest Parsing**:
   - Master playlists with multiple resolutions (4K, 1080p, 720p).
   - Media playlists with byte ranges (`#EXT-X-BYTERANGE`).
   - Initialization maps (`#EXT-X-MAP`).
   - Discontinuities (`#EXT-X-DISCONTINUITY`).
2. **Decryption Accuracy**:
   - WebCrypto AES-128 CBC decrypting actual test segments with known hex IVs and sequence-derived IVs.
3. **Transmuxing Validation**:
   - Verify that output `.mp4` files play back smoothly in Chrome and VLC with aligned audio and video.
4. **Build & Bundle Verification**:
   - Verify `esbuild` compiles `dist/content_script.bundle.js` and `dist/downloader.bundle.js` without syntax errors or runtime exceptions.
