## DownloadForge Pro v1.3.1 — Platform Resolvers, Single-Asset Packaging & 5-Layer Hardening

### What is New in v1.3.1:

1. **Dedicated 3D Platform Resolvers**:
   - **Poly Haven**: Direct files API integration. Ingests official `.gltf`, binary `.bin`, and all PBR textures into a single clean ZIP with zero user interaction.
   - **Sketchfab**: Regex engine updated to match all modern Sketchfab slug formats (`sketchfab.com/3d-models/<slug>-<uid>`). Ingests original-resolution PBR textures from `/i/models/<uid>/textures` and rips geometry directly from WebGL GPU draw calls.
   - **CGTrader & TurboSquid**: Automated detection and hardware WebGL preview ripper. Intercepts geometry directly from GPU draw buffers when an interactive 3D viewer is active on the page.

2. **Clean Single-Asset Packaging (Zero Duplicate Clutter)**:
   - Packages exactly one primary 3D model asset per ZIP archive (pure `.glb` container, or `.obj` + `.mtl` fallback).
   - Bundles all original-resolution PBR maps inside a clean `textures/` folder. Eliminates duplicate `.obj` and `.glb` files in the same archive.

3. **5-Layer System Hardening & Anti-Tampering**:
   - **Cryptographic Session Tokens**: Replaced pseudo-random tokens with `crypto.getRandomValues(new Uint8Array(24))` (48-character hex entropy) for the main-world to content script bridge.
   - **DOM Token Sanitation**: Security attributes are removed from the DOM immediately upon initialization to prevent rogue page scripts from inspecting authorization tokens.
   - **Prototype Tampering Defense**: Module-level caching of native constructors (`Uint8Array`, `Float32Array`, `Uint16Array`, `Uint32Array`) and `window.postMessage.bind(window)` prevents hostile scripts from hijacking internal sniffer channels.
   - **Path Traversal Neutralization**: Added `.replace(/\.{2,}/g, '_')` alongside illegal character stripping to eliminate directory traversal sequences like `../../../../etc/passwd`.
   - **Strict Sender ID Isolation**: Background service worker rejects runtime messages where `sender.id !== chrome.runtime.id`.

4. **Expanded Popup Window UI (480px x 600px)**:
   - Window width increased from 380px to **480px** (+26% horizontal breathing room).
   - Window max-height increased to **600px** with a **400px** scrollable list view.
   - Domain badge column expanded to **170px**, eliminating truncated filenames and URLs.
   - High-contrast dark theme unified with indigo accents (`#6366f1`) and dedicated Cyan badges for 3D assets (`3D MESH`).

5. **Actionable Error Logging**:
   - Single and batch downloads surface exact error messages (`ERR_HOTLINK_403`, `ERR_CORS_BLOCKED`, `ERR_DRM_PROTECTED`) directly to user HUD toasts rather than generic "Failed" notifications.
   - Batch download responses track accurate partial failure counts.

6. **Automated Verification**:
   - 16 core unit test suites pass (`npm test`).
   - 6 automated security audit gates pass (`python tests/audit_check.py`).
   - 5-layer programmatic verification suite passes (`node tests/five_layer_proof.js`).

### Download & Installation:
Download `downloadforge-pro-v1.3.1.zip` below, extract it, and click **Load unpacked** in `chrome://extensions`.
