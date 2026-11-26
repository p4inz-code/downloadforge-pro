## DownloadForge Pro v1.3.2 — Advanced 3D Engine Introspection, Instancing, and Hardware WebGL Capture

### What is New in v1.3.2:

1. **Dual-Engine 3D Capture Architecture**:
   - **Tier 0 Scene Graph Introspection**: Directly hooks into Three.js (`WebGLRenderer.render`), Babylon.js (`Scene.render`), and OSG.js (`Geometry.drawImplementation`). Captures original scene node names, uncompressed vertex coordinate matrices, and UV maps prior to GPU rasterization.
   - **Tier 1 Hardware WebGL Ripper**: Intercepts GPU draw calls (`gl.drawElements`, `gl.drawArrays`), decomposing primitives into standard Wavefront OBJ and binary glTF 2.0 (`.glb`).

2. **Full Instanced Rendering & Primitive Decomposer**:
   - **Instanced Drawing Hooks**: Native support for `gl.drawElementsInstanced`, `gl.drawArraysInstanced`, and the `ANGLE_instanced_arrays` extension. Captures repeated components (wheels, mechanical fasteners, vegetation) previously missed by standard draw-call hooks.
   - **Triangle Strip & Fan Decomposer**: Automatically translates `gl.TRIANGLE_STRIP` (mode 5) and `gl.TRIANGLE_FAN` (mode 6) primitive arrays into standard triangle topologies with degenerate triangle elimination and winding order normalization.

3. **GPU Material & Texture Sniffer**:
   - Hooks `gl.texImage2D` and `gl.texSubImage2D` to intercept active material maps the moment engines upload them into GPU VRAM, registering them directly in detected assets.

4. **Pure In-Browser Binary STL Exporter**:
   - Added `convertObjToStl(objText)` in the core packager. Parses 3D geometry into 84-byte standard binary STL containers suitable for 3D printing in slicers (Cura, PrusaSlicer, Bambu Studio).

5. **Memory Safety & Telemetry Integrity**:
   - Enforced a 500-submesh FIFO bound on `capturedSceneGraphMeshes` to prevent heap expansion during sustained 3D animation playback.
   - Synchronized vertex count and draw call telemetry across scene graph introspection and rasterization pipelines, eliminating false zero-vertex toast warnings.
   - Resolved payload mesh shadowing in the background service worker across TurboSquid and generic 3D asset flows.

6. **Comprehensive Automated Verification**:
   - 17 core unit test suites passed (`npm test`).
   - 5-layer programmatic verification suite passed (`node tests/five_layer_proof.js`).
   - Security audit verification passed with zero native dialogs, zero emojis, and strict MV3 compliance (`python tests/audit_check.py`).

### Installation:
Download `downloadforge-pro-v1.3.2.zip`, extract the files, and load unpacked via `chrome://extensions`.
