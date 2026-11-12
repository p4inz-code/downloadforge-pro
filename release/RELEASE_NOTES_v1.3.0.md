## DownloadForge Pro v1.3.0 — In-Browser Ninja Ripper & 3D Viewport Overhaul

### What is New in v1.3.0:

1. **In-Browser "Ninja Ripper" 3D Engine**:
   - Hardware-level draw-call precision interception across WebGL 1.0 and WebGL 2.0 (`gl.drawElements` / `gl.drawArrays` for `mode === gl.TRIANGLES`).
   - Reads active index slices directly from `gl.ELEMENT_ARRAY_BUFFER` with safe alignment checks and bounds protection.
   - Reads position $(x, y, z)$, normal $(nx, ny, nz)$, and UV $(u, v)$ coordinates directly from active attribute pointers mapped via `gl.vertexAttribPointer`.
   - Eliminates all heuristic buffer guessing, preventing normals or texture UVs from ever being mistakenly treated as 3D vertex positions.

2. **$4\times 4$ World / Model Matrix Transformation**:
   - Intercepts `gl.uniformMatrix4fv` to track the active $4\times 4$ Model/World matrix.
   - Multiplies vertex positions by the active matrix at the instant of draw:
     $$\begin{bmatrix} x' \\ y' \\ z' \\ 1 \end{bmatrix} = M_{\text{world}} \begin{bmatrix} x \\ y \\ z \\ 1 \end{bmatrix}$$
   - Guarantees multi-part models (e.g. car body, wheels, interior, spoilers) snap into their authentic physical coordinates rather than collapsing at the origin $(0,0,0)$.

3. **Vertex Array Object (VAO) Shadow Tracking**:
   - Tracks attribute and element buffer state across `bindVertexArray` in both WebGL 2.0 and the `OES_vertex_array_object` extension.

4. **Multi-Part OBJ & Binary GLB Serializer**:
   - Assembles all captured draw calls into a clean multi-submesh Wavefront OBJ file (`g part_01`, `g part_02`, etc.) with correct face indices (`f v/vt/vn`) and explicit NaN guards.
   - Converts geometry to a standard binary glTF 2.0 (`.glb`) container with a valid 12-byte header (`0x46546C67`) for direct double-click opening in Windows 3D Viewer, macOS QuickLook, Blender, and Unreal Engine.

5. **Interactive 3D Viewport in Studio**:
   - Ripped models load into the DownloadForge Dashboard viewport (`Ninja Ripper — Live 3D Model Viewport`) for immediate pre-export inspection.
   - Features mouse-orbit controls, mouse-wheel zoom, directional depth shading, wireframe mode toggle, and live vertex/face counters.

6. **In-Page GPU Telemetry Badge & Canvas Nudge**:
   - Real-time badge on the in-page 3D pill displaying live GPU extraction metrics: `3D Rip [499k v]` or `3D Rip [48 parts]`.
   - Broadcasts `DF_NUDGE_CANVAS` on rip trigger to wake up idle canvas animation loops before serializing geometry.

7. **Transparent Network Sniffer Isolation**:
   - Network response observation in `injected_sniffer.js` now executes on an isolated observer branch with an explicit empty rejection handler while returning the native promise untouched to the page.
   - Eliminates synthetic `TypeError: Failed to fetch` stack traces in the extension console from blocked third-party trackers.

8. **Zero Emojis & Zero Native Dialogs**:
   - 100% custom Outlinedesk confirmation dialogs and Lucide inline SVG icons.
   - Strictly zero emojis across all code, comments, logs, and documentation.

### Download & Install:
Download `downloadforge-pro-v1.3.0.zip` below and load unpacked in `chrome://extensions`.
