// ============================================================
// DownloadForge — content/injected_sniffer.js
// P4inz Interactive Labs | p4inz
//
// Injected into the page's MAIN execution context.
// Cryptographic token handshake with content_script.
// Intercepts:
//   1. fetch & XMLHttpRequest for HLS manifests & video chunks
//   2. MediaSource & SourceBuffer for live buffer recording
//   3. HTMLVideoElement for active playback metadata
// ============================================================

(function() {
  if (window.__df_sniffer_injected) return;
  window.__df_sniffer_injected = true;

  // Retrieve security nonce passed from content script
  const scriptEl = document.currentScript;
  const sessionToken = (document.documentElement && document.documentElement.dataset.dfSnifferToken) ||
                       (scriptEl ? scriptEl.dataset.token : null);
  if (document.documentElement && document.documentElement.dataset.dfSnifferToken) {
    delete document.documentElement.dataset.dfSnifferToken;
  }

  const MEDIA_REGEX = /\.(m3u8|mpd|mp4|webm|ts|m4s|f4m|flv|mov|m4v|m4a|aac|opus|wav)(\?|$)|(googlevideo\.com\/videoplayback|vimeocdn\.com|video\.twimg\.com|tiktokcdn\.com|v\.redd\.it)/i;
  const MIME_REGEX = /(mpegurl|x-mpegurl|video\/|audio\/|dash\+xml)/i;
  const MODEL_3D_REGEX = /\.(glb|gltf|obj|mtl|fbx|stl|usdz|splat|ply|3mf|dae|blend|step|stp|iges|osgjs|binz|splinecode|drc)(\?|$)|(sketchfab\.com\/(?:i\/models|3d-models)|media\.sketchfab\.com\/models|models\.readyplayer\.me|prod\.spline\.design|lumalabs\.ai)/i;
  const MODEL_3D_MIME_REGEX = /(model\/|gltf|usdz|octet-stream-splat|3mf|step|stl)/i;

  function extractFilename(url) {
    try {
      const u = new URL(url);
      const name = u.pathname.split('/').pop() || '';
      return decodeURIComponent(name.split('?')[0]);
    } catch {
      return '';
    }
  }

  function notifyDetected(mediaInfo) {
    if (!mediaInfo || !mediaInfo.url) return;
    // Validate protocol
    if (!/^https?:\/\//i.test(mediaInfo.url) && !mediaInfo.url.startsWith('blob:')) return;

    const method = mediaInfo.method || (
      mediaInfo.initiator?.includes('fetch') ? 'TIER_1_NETWORK_FETCH' :
      mediaInfo.initiator?.includes('xhr') ? 'TIER_1_NETWORK_XHR' :
      mediaInfo.initiator?.includes('threejs') ? 'TIER_4_THREEJS_RIPPER' :
      mediaInfo.initiator?.includes('jwplayer') || mediaInfo.initiator?.includes('videojs') || mediaInfo.initiator?.includes('hydration') || mediaInfo.initiator?.includes('jsonld') ? 'TIER_3_PLAYER_CONFIG' :
      'TIER_2_DOM_TAG'
    );

    try {
      window.postMessage({
        source: 'DOWNLOADFORGE_SNIFFER',
        token: sessionToken,
        type: 'MEDIA_DETECTED',
        data: {
          url: mediaInfo.url,
          mimeType: mediaInfo.mimeType || '',
          category: mediaInfo.category || 'stream',
          title: (mediaInfo.title || document.title || 'Media Resource').slice(0, 150),
          method,
          initiator: mediaInfo.initiator || 'network'
        }
      }, '*');
    } catch (e) {
      // Ignore
    }
  }

  // ── 1. Intercept Fetch ─────────────────────────────────────
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function(...args) {
      try {
        const request = args[0];
        let url = '';
        if (typeof request === 'string') {
          url = request;
        } else if (request instanceof URL) {
          url = request.href;
        } else if (request && request.url) {
          url = request.url;
        }

        if (url && MEDIA_REGEX.test(url)) {
          notifyDetected({
            url,
            category: url.includes('m3u8') ? 'stream' : 'video',
            initiator: 'fetch'
          });
        } else if (url && MODEL_3D_REGEX.test(url)) {
          notifyDetected({
            url,
            category: 'model_3d',
            title: extractFilename(url) || '3D Model',
            initiator: 'fetch-3d'
          });
        }
      } catch (sniffErr) {
        // Silently ignore sniffing parsing issues
      }

      const p = originalFetch.apply(this, args);
      p.then((response) => {
        try {
          if (response && response.headers) {
            const contentType = response.headers.get('content-type') || '';
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (MIME_REGEX.test(contentType)) {
              notifyDetected({
                url: response.url || reqUrl,
                mimeType: contentType,
                category: contentType.includes('mpegurl') ? 'stream' : 'video',
                initiator: 'fetch-response'
              });
            } else if (MODEL_3D_MIME_REGEX.test(contentType)) {
              notifyDetected({
                url: response.url || reqUrl,
                mimeType: contentType,
                category: 'model_3d',
                title: extractFilename(response.url || reqUrl) || '3D Model',
                initiator: 'fetch-response-3d'
              });
            }
          }
        } catch (respErr) {
          // Silently ignore response inspection issues
        }
      }, () => {
        // Silently swallow network aborts or blocked trackers on observer branch
      });
      return p;
    };
  }

  // ── 2. Intercept XMLHttpRequest ───────────────────────────
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._df_url = typeof url === 'string' ? url : (url ? url.toString() : '');
    this._df_method = method;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._df_url) {
      if (MEDIA_REGEX.test(this._df_url)) {
        notifyDetected({
          url: this._df_url,
          category: this._df_url.includes('m3u8') ? 'stream' : 'video',
          initiator: 'xhr'
        });
      } else if (MODEL_3D_REGEX.test(this._df_url)) {
        notifyDetected({
          url: this._df_url,
          category: 'model_3d',
          title: extractFilename(this._df_url) || '3D Model',
          initiator: 'xhr-3d'
        });
      }
    }

    this.addEventListener('load', function() {
      try {
        const contentType = this.getResponseHeader('content-type') || '';
        if (MIME_REGEX.test(contentType)) {
          notifyDetected({
            url: this.responseURL || this._df_url,
            mimeType: contentType,
            category: contentType.includes('mpegurl') ? 'stream' : 'video',
            initiator: 'xhr-response'
          });
        } else if (MODEL_3D_MIME_REGEX.test(contentType)) {
          notifyDetected({
            url: this.responseURL || this._df_url,
            mimeType: contentType,
            category: 'model_3d',
            title: extractFilename(this.responseURL || this._df_url) || '3D Model',
            initiator: 'xhr-response-3d'
          });
        }
      } catch (e) {}
    });

    return originalSend.apply(this, args);
  };

  // ── 3. Intercept SourceBuffer.appendBuffer for Buffer Capture ──
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'DF_RECORD_MODE_TOGGLE') {
      window.__df_record_mode_active = !!e.data.active;
    }
  });

  if (window.SourceBuffer && SourceBuffer.prototype.appendBuffer) {
    const originalAppendBuffer = SourceBuffer.prototype.appendBuffer;
    SourceBuffer.prototype.appendBuffer = function(buffer) {
      if (window.__df_record_mode_active) {
        try {
          let copy = null;
          if (buffer instanceof ArrayBuffer) {
            copy = buffer.slice(0);
          } else if (buffer && buffer.buffer) {
            copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          }
          if (copy && copy.byteLength > 0) {
            window.postMessage({
              source: 'DOWNLOADFORGE_SNIFFER',
              token: sessionToken,
              type: 'BUFFER_CHUNK_APPENDED',
              data: {
                chunk: copy,
                byteLength: copy.byteLength,
                mimeType: this._df_mime || 'video/mp4'
              }
            }, '*', [copy]);
          }
        } catch (e) {}
      }
      return originalAppendBuffer.apply(this, arguments);
    };
  }

  // ── 4. Intercept HTMLVideoElement ─────────────────────────
  function inspectVideoElement(video) {
    if (!video) return;
    const src = video.currentSrc || video.src;
    if (src && !src.startsWith('blob:') && (MEDIA_REGEX.test(src) || src.startsWith('http'))) {
      notifyDetected({
        url: src,
        category: src.includes('m3u8') ? 'stream' : 'video',
        title: video.title || document.title,
        initiator: 'video-element'
      });
    }
  }

  // ── 5. Intercept Web Workers & SharedWorkers ──────────────
  if (window.Worker) {
    const OriginalWorker = window.Worker;
    window.Worker = function(scriptURL, options) {
      if (typeof scriptURL === 'string' && MEDIA_REGEX.test(scriptURL)) {
        notifyDetected({
          url: scriptURL,
          category: 'stream',
          initiator: 'worker'
        });
      }
      return new OriginalWorker(scriptURL, options);
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }

  // ── 6. 3D Model Elements & WebGL Hook ────────────────────
  function inspect3DElement(el) {
    if (!el) return;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'MODEL-VIEWER') {
      const src = el.getAttribute('src') || el.src;
      if (src) {
        notifyDetected({
          url: src,
          category: 'model_3d',
          title: el.getAttribute('alt') || extractFilename(src) || '3D Model',
          initiator: 'model-viewer'
        });
      }
      const iosSrc = el.getAttribute('ios-src');
      if (iosSrc) {
        notifyDetected({
          url: iosSrc,
          category: 'model_3d',
          title: (el.getAttribute('alt') || extractFilename(iosSrc) || '3D Model') + ' (USDZ)',
          initiator: 'model-viewer-ios'
        });
      }
    } else if (tag === 'SPLINE-VIEWER') {
      const url = el.getAttribute('url');
      if (url) {
        notifyDetected({
          url,
          category: 'model_3d',
          title: extractFilename(url) || 'Spline 3D Scene',
          initiator: 'spline-viewer'
        });
      }
    }
  }

  // Hook Three.js & Babylon.js Loaders if present in page runtime
  function hookEngineLoaders() {
    try {
      if (window.THREE && window.THREE.GLTFLoader && !window.THREE.GLTFLoader.__df_hooked) {
        window.THREE.GLTFLoader.__df_hooked = true;
        const origParse = window.THREE.GLTFLoader.prototype.parse;
        window.THREE.GLTFLoader.prototype.parse = function(data, path, onLoad, onError) {
          try {
            if (data instanceof ArrayBuffer) {
              const blob = new Blob([data], { type: 'model/gltf-binary' });
              const blobUrl = URL.createObjectURL(blob);
              setTimeout(() => {
                try { URL.revokeObjectURL(blobUrl); } catch (e) {}
              }, 120000);
              notifyDetected({
                url: blobUrl,
                mimeType: 'model/gltf-binary',
                category: 'model_3d',
                title: (document.title || 'Scene') + ' (Three.js GLB)',
                initiator: 'threejs-ripper'
              });
            }
          } catch (e) {}
          return origParse.apply(this, arguments);
        };
      }
    } catch (e) {}
  }

  // ── WebGL Mesh Geometry Ripper (In-Browser Ninja Ripper Core) ─
  const capturedGeometries = [];
  const capturedDrawCalls = [];
  const drawCallDedup = new Set();
  let totalCapturedVertices = 0;
  let totalCapturedFaces = 0;
  let lastTelemetryTimestamp = 0;
  const activeWebGlCanvases = new Set();

  function dispatchTelemetry(glVersion = 'WebGL') {
    const now = Date.now();
    if (now - lastTelemetryTimestamp < 800) return;
    lastTelemetryTimestamp = now;
    try {
      window.postMessage({
        source: 'DOWNLOADFORGE_SNIFFER',
        token: sessionToken,
        type: 'DF_WEBGL_TELEMETRY',
        data: {
          glVersion,
          drawCalls: capturedDrawCalls.length,
          vertexCount: totalCapturedVertices,
          faceCount: totalCapturedFaces
        }
      }, '*');
    } catch (_) {}
  }

  function ensureBufferMeta(buf) {
    if (!buf) return null;
    if (!buf._df_id) {
      buf._df_id = 'buf_' + Math.random().toString(36).slice(2, 9);
      buf._df_target = 0;
      buf._df_data = null;
      buf._df_byteLength = 0;
    }
    return buf;
  }

  function captureRawBuffer(target, data) {
    if (!data) return;
    let rawBytes = null;
    if (data instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(data.slice(0));
    } else if (ArrayBuffer.isView(data)) {
      rawBytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    if (!rawBytes || rawBytes.byteLength < 12) return;

    if (target === 0x8892) { // ARRAY_BUFFER
      let floatView = null;
      if (data instanceof Float32Array) {
        floatView = new Float32Array(rawBytes.buffer);
      } else if (rawBytes.byteLength % 4 === 0) {
        floatView = new Float32Array(rawBytes.buffer);
      }

      if (floatView && floatView.length >= 9) {
        const isDup = capturedGeometries.some(g => g.type === 'positions' && g.length === floatView.length && g.data[0] === floatView[0]);
        if (!isDup) {
          capturedGeometries.push({
            type: 'positions',
            data: floatView,
            length: floatView.length,
            time: Date.now()
          });
          if (capturedGeometries.length > 500) capturedGeometries.shift();
        }
      }
    } else if (target === 0x8893) { // ELEMENT_ARRAY_BUFFER
      let idxView = null;
      if (data instanceof Uint16Array || (rawBytes.byteLength % 2 === 0 && rawBytes.byteLength % 4 !== 0)) {
        idxView = new Uint16Array(rawBytes.buffer);
      } else if (data instanceof Uint32Array || rawBytes.byteLength % 4 === 0) {
        idxView = new Uint32Array(rawBytes.buffer);
      }

      if (idxView && idxView.length >= 3) {
        capturedGeometries.push({
          type: 'indices',
          data: idxView,
          length: idxView.length,
          time: Date.now()
        });
        if (capturedGeometries.length > 500) capturedGeometries.shift();
      }
    }
  }

  function recordDrawCall(gl, count, type, byteOffset, isElements = true, first = 0) {
    try {
      const glVersion = (window.WebGL2RenderingContext && gl instanceof window.WebGL2RenderingContext) ? 'WebGL 2.0' : 'WebGL 1.0';

      // 1. Identify active index buffer (if drawElements)
      let idxArray = null;
      let elemBufId = 'arr';
      if (isElements) {
        const elemBuf = gl._df_boundElementBuffer;
        if (!elemBuf || !elemBuf._df_data) return;
        elemBufId = elemBuf._df_id;
        const buf = elemBuf._df_data;

        if (type === 5123 || type === 0x1403) { // UNSIGNED_SHORT
          const off = Math.floor(byteOffset / 2);
          idxArray = new Uint16Array(buf, byteOffset, count);
        } else if (type === 5125 || type === 0x1405) { // UNSIGNED_INT
          const off = Math.floor(byteOffset / 4);
          idxArray = new Uint32Array(buf, byteOffset, count);
        } else if (type === 5121 || type === 0x1401) { // UNSIGNED_BYTE
          idxArray = new Uint8Array(buf, byteOffset, count);
        }
        if (!idxArray || idxArray.length < 3) return;
      }

      // 2. Identify active vertex position attribute
      const attribs = gl._df_attribs || {};
      let posAttrib = null;
      let normAttrib = null;
      let uvAttrib = null;

      // Slot 0 is standard POSITION in Three.js / OSG.js / WebGL conventions
      if (attribs[0] && attribs[0].buffer && attribs[0].buffer._df_data) {
        posAttrib = attribs[0];
      }

      // If slot 0 is not position, scan attributes for size 3 float arrays
      if (!posAttrib) {
        for (const k of Object.keys(attribs)) {
          const a = attribs[k];
          if (a && a.buffer && a.buffer._df_data && a.size >= 3) {
            posAttrib = a;
            break;
          }
        }
      }
      if (!posAttrib || !posAttrib.buffer || !posAttrib.buffer._df_data) return;

      // Look for Normal attribute (size 3) and UV attribute (size 2)
      for (const k of Object.keys(attribs)) {
        const a = attribs[k];
        if (!a || !a.buffer || !a.buffer._df_data || a === posAttrib) continue;
        if (a.size === 3 && !normAttrib) normAttrib = a;
        else if (a.size === 2 && !uvAttrib) uvAttrib = a;
      }

      const posBuf = posAttrib.buffer;
      const dedupKey = `${elemBufId}_${byteOffset}_${count}_${posBuf._df_id}`;
      if (drawCallDedup.has(dedupKey)) return;
      drawCallDedup.add(dedupKey);

      // 3. Extract vertices from buffer view
      const rawPosBuf = posBuf._df_data;
      const posStrideBytes = posAttrib.stride > 0 ? posAttrib.stride : (posAttrib.size * 4);
      const posOffsetBytes = posAttrib.offset || 0;
      const strideFloats = Math.floor(posStrideBytes / 4);
      const floatView = new Float32Array(rawPosBuf);

      let maxIndex = 0;
      if (isElements && idxArray) {
        for (let i = 0; i < idxArray.length; i++) {
          if (idxArray[i] > maxIndex) maxIndex = idxArray[i];
        }
      } else {
        maxIndex = first + count;
      }

      const vertexCount = maxIndex + 1;
      if (vertexCount > 500000) return; // Guard against corrupt buffer length

      const positions = new Float32Array(vertexCount * 3);
      const normals = normAttrib ? new Float32Array(vertexCount * 3) : null;
      const uvs = uvAttrib ? new Float32Array(vertexCount * 2) : null;

      // Check for active affine model matrix (uniformMatrix4fv)
      const m = gl._df_activeMatrix;
      const hasTransform = m && m.length >= 16 && Math.abs(m[15] - 1.0) < 0.1 && m[3] === 0 && m[7] === 0;

      for (let v = 0; v < vertexCount; v++) {
        const fIdx = Math.floor(posOffsetBytes / 4) + v * strideFloats;
        if (fIdx + 2 < floatView.length) {
          let x = floatView[fIdx];
          let y = floatView[fIdx + 1];
          let z = floatView[fIdx + 2];

          // Apply 4x4 World Transformation Matrix if available
          if (hasTransform) {
            const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
            const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
            const wz = m[2]*x + m[6]*y + m[10]*z + m[14];
            x = wx; y = wy; z = wz;
          }

          positions[v * 3] = x;
          positions[v * 3 + 1] = y;
          positions[v * 3 + 2] = z;
        }

        if (normals && normAttrib) {
          const nStride = normAttrib.stride > 0 ? Math.floor(normAttrib.stride / 4) : 3;
          const nOff = Math.floor((normAttrib.offset || 0) / 4);
          const nView = new Float32Array(normAttrib.buffer._df_data);
          const nIdx = nOff + v * nStride;
          if (nIdx + 2 < nView.length) {
            normals[v * 3] = nView[nIdx];
            normals[v * 3 + 1] = nView[nIdx + 1];
            normals[v * 3 + 2] = nView[nIdx + 2];
          }
        }

        if (uvs && uvAttrib) {
          const uvStride = uvAttrib.stride > 0 ? Math.floor(uvAttrib.stride / 4) : 2;
          const uvOff = Math.floor((uvAttrib.offset || 0) / 4);
          const uvView = new Float32Array(uvAttrib.buffer._df_data);
          const uvIdx = uvOff + v * uvStride;
          if (uvIdx + 1 < uvView.length) {
            uvs[v * 2] = uvView[uvIdx];
            uvs[v * 2 + 1] = uvView[uvIdx + 1];
          }
        }
      }

      // Synthesize indices for drawArrays if needed
      let finalIndices = idxArray;
      if (!isElements) {
        finalIndices = new Uint32Array(count);
        for (let i = 0; i < count; i++) finalIndices[i] = first + i;
      }

      capturedDrawCalls.push({
        positions,
        normals,
        uvs,
        indices: finalIndices,
        vertexCount,
        faceCount: Math.floor(finalIndices.length / 3),
        partId: capturedDrawCalls.length + 1,
        time: Date.now()
      });

      totalCapturedVertices += vertexCount;
      totalCapturedFaces += Math.floor(finalIndices.length / 3);

      dispatchTelemetry(glVersion);
    } catch (_) {}
  }

  function hookWebGL() {
    if (!window.WebGLRenderingContext) return;

    function hookContext(proto) {
      if (!proto || proto.__df_hooked) return;
      proto.__df_hooked = true;

      // 1. Buffer creation & binding
      const origCreateBuffer = proto.createBuffer;
      proto.createBuffer = function() {
        const buf = origCreateBuffer.apply(this, arguments);
        return ensureBufferMeta(buf);
      };

      const origBindBuffer = proto.bindBuffer;
      proto.bindBuffer = function(target, buffer) {
        if (buffer) ensureBufferMeta(buffer);
        if (target === 0x8892) { // ARRAY_BUFFER
          this._df_boundArrayBuffer = buffer;
        } else if (target === 0x8893) { // ELEMENT_ARRAY_BUFFER
          this._df_boundElementBuffer = buffer;
          if (this._df_currentVao) {
            this._df_currentVao._df_elementBuffer = buffer;
          }
        }
        return origBindBuffer.apply(this, arguments);
      };

      // 2. Buffer data uploads
      const origBufferData = proto.bufferData;
      proto.bufferData = function(target, data, usage) {
        try {
          const bound = target === 0x8892 ? this._df_boundArrayBuffer :
                        target === 0x8893 ? this._df_boundElementBuffer : null;
          if (bound && data) {
            ensureBufferMeta(bound);
            bound._df_target = target;
            let copy = null;
            if (data instanceof ArrayBuffer) {
              copy = data.slice(0);
            } else if (ArrayBuffer.isView(data)) {
              copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            }
            if (copy) {
              bound._df_data = copy;
              bound._df_byteLength = copy.byteLength;
            }
          }
          captureRawBuffer(target, data);
        } catch (_) {}
        return origBufferData.apply(this, arguments);
      };

      const origBufferSubData = proto.bufferSubData;
      proto.bufferSubData = function(target, offset, data) {
        try {
          const bound = target === 0x8892 ? this._df_boundArrayBuffer :
                        target === 0x8893 ? this._df_boundElementBuffer : null;
          if (bound && bound._df_data && data) {
            const srcBytes = ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : new Uint8Array(data);
            const dstBytes = new Uint8Array(bound._df_data);
            if (offset + srcBytes.length <= dstBytes.length) {
              dstBytes.set(srcBytes, offset);
            }
          }
        } catch (_) {}
        return origBufferSubData.apply(this, arguments);
      };

      // 3. Vertex Attribute Pointers
      const origVertexAttribPointer = proto.vertexAttribPointer;
      proto.vertexAttribPointer = function(index, size, type, normalized, stride, offset) {
        try {
          if (!this._df_attribs) this._df_attribs = {};
          const state = {
            buffer: this._df_boundArrayBuffer,
            size,
            type,
            normalized,
            stride: stride || (size * 4),
            offset: offset || 0
          };
          this._df_attribs[index] = state;
          if (this._df_currentVao) {
            if (!this._df_currentVao._df_attribs) this._df_currentVao._df_attribs = {};
            this._df_currentVao._df_attribs[index] = state;
          }
        } catch (_) {}
        return origVertexAttribPointer.apply(this, arguments);
      };

      // 4. Uniform Matrix tracking (World / Model matrix)
      const origUniformMatrix4fv = proto.uniformMatrix4fv;
      proto.uniformMatrix4fv = function(location, transpose, value) {
        try {
          if (value && value.length >= 16) {
            this._df_activeMatrix = new Float32Array(value.slice(0, 16));
          }
        } catch (_) {}
        return origUniformMatrix4fv.apply(this, arguments);
      };

      // 5. Draw call precision interception
      const origDrawElements = proto.drawElements;
      proto.drawElements = function(mode, count, type, offset) {
        try {
          if (mode === 4 && count >= 3 && this._df_boundElementBuffer) { // gl.TRIANGLES
            recordDrawCall(this, count, type, offset || 0, true);
          }
        } catch (_) {}
        return origDrawElements.apply(this, arguments);
      };

      const origDrawArrays = proto.drawArrays;
      proto.drawArrays = function(mode, first, count) {
        try {
          if (mode === 4 && count >= 3) { // gl.TRIANGLES
            recordDrawCall(this, count, 0, 0, false, first || 0);
          }
        } catch (_) {}
        return origDrawArrays.apply(this, arguments);
      };

      // 6. WebGL2 VAO support
      if (proto.bindVertexArray) {
        const origBVA = proto.bindVertexArray;
        proto.bindVertexArray = function(vao) {
          this._df_currentVao = vao;
          if (vao) {
            if (vao._df_elementBuffer) this._df_boundElementBuffer = vao._df_elementBuffer;
            if (vao._df_attribs) this._df_attribs = { ...vao._df_attribs };
          }
          return origBVA.apply(this, arguments);
        };
      }
    }

    hookContext(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) {
      hookContext(WebGL2RenderingContext.prototype);
    }

    if (window.HTMLCanvasElement && !window.HTMLCanvasElement.prototype.__df_hooked) {
      window.HTMLCanvasElement.prototype.__df_hooked = true;
      const origGetContext = window.HTMLCanvasElement.prototype.getContext;
      window.HTMLCanvasElement.prototype.getContext = function(type) {
        const ctx = origGetContext.apply(this, arguments);
        if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
          activeWebGlCanvases.add(this);
          try {
            hookContext(Object.getPrototypeOf(ctx));
            // Hook OES_vertex_array_object extension if requested
            if (ctx.getExtension) {
              const origGetExtension = ctx.getExtension;
              ctx.getExtension = function(name) {
                const ext = origGetExtension.apply(this, arguments);
                if (ext && name && name.toLowerCase().includes('vertex_array_object') && !ext.__df_hooked) {
                  ext.__df_hooked = true;
                  const origBVAOES = ext.bindVertexArrayOES;
                  ext.bindVertexArrayOES = function(vao) {
                    ctx._df_currentVao = vao;
                    if (vao) {
                      if (vao._df_elementBuffer) ctx._df_boundElementBuffer = vao._df_elementBuffer;
                      if (vao._df_attribs) ctx._df_attribs = { ...vao._df_attribs };
                    }
                    return origBVAOES.apply(this, arguments);
                  };
                }
                return ext;
              };
            }
          } catch (_) {}
        }
        return ctx;
      };
    }
  }

  hookWebGL();

  // Listen for mesh export & canvas nudge requests from content script
  window.addEventListener('message', (e) => {
    if (!e.data) return;

    if (e.data.type === 'DF_NUDGE_CANVAS') {
      try {
        // Trigger requestAnimationFrame or dispatch synthetic resize/wheel event to wake draw calls
        activeWebGlCanvases.forEach(canvas => {
          if (canvas) {
            canvas.dispatchEvent(new Event('mousemove', { bubbles: true }));
          }
        });
        window.requestAnimationFrame(() => {});
      } catch (_) {}
    }

    if (e.data.type === 'DF_TRIGGER_WEBGL_RIP' || e.data.type === 'DF_REQUEST_MESH') {
      const title = (document.title || 'model').replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 80);
      const objData = exportCapturedMeshToObj(title);
      if (objData) {
        window.postMessage({
          type: 'DF_WEBGL_RIP_DATA',
          objData,
          title,
          drawCalls: capturedDrawCalls.length,
          vertexCount: totalCapturedVertices,
          faceCount: totalCapturedFaces
        }, '*');
        window.postMessage({ type: 'DF_WEBGL_RIP_SUCCESS', title }, '*');
      } else {
        window.postMessage({
          type: 'DF_WEBGL_RIP_FAIL',
          reason: 'No WebGL buffer data captured yet. Interact with the 3D model viewer to stream geometry.'
        }, '*');
      }
    }
  });

  function exportCapturedMeshToObj(title) {
    let objText = `# DownloadForge Pro WebGL 3D Ripper (Ninja Ripper Engine)\n# Model: ${title}\n# Extracted: ${new Date().toISOString()}\n\n`;

    // ── PRIMARY PIPELINE: Draw-Call Precision Meshes ─────────
    if (capturedDrawCalls.length > 0) {
      let globalVOffset = 0;
      let globalVtOffset = 0;
      let globalVnOffset = 0;
      let faceCount = 0;

      for (let c = 0; c < capturedDrawCalls.length; c++) {
        const dc = capturedDrawCalls[c];
        const pos = dc.positions;
        const norm = dc.normals;
        const uvs = dc.uvs;
        const idx = dc.indices;
        const vCount = dc.vertexCount;

        if (!pos || vCount < 3 || !idx || idx.length < 3) continue;

        const submeshVStart = globalVOffset;
        const submeshVnStart = globalVnOffset;
        const submeshVtStart = globalVtOffset;

        objText += `g part_${String(c + 1).padStart(2, '0')}\n`;

        // 1. Vertices
        for (let v = 0; v < vCount; v++) {
          const x = Number(pos[v * 3]).toFixed(5);
          const y = Number(pos[v * 3 + 1]).toFixed(5);
          const z = Number(pos[v * 3 + 2]).toFixed(5);
          objText += `v ${x} ${y} ${z}\n`;
          globalVOffset++;
        }

        // 2. Normals
        if (norm) {
          for (let v = 0; v < vCount; v++) {
            const nx = Number(norm[v * 3]).toFixed(5);
            const ny = Number(norm[v * 3 + 1]).toFixed(5);
            const nz = Number(norm[v * 3 + 2]).toFixed(5);
            objText += `vn ${nx} ${ny} ${nz}\n`;
            globalVnOffset++;
          }
        }

        // 3. Texture UVs
        if (uvs) {
          for (let v = 0; v < vCount; v++) {
            const u = Number(uvs[v * 2]).toFixed(5);
            const vCoord = Number(uvs[v * 2 + 1]).toFixed(5);
            objText += `vt ${u} ${vCoord}\n`;
            globalVtOffset++;
          }
        }

        // 4. Faces
        for (let i = 0; i < idx.length - 2; i += 3) {
          const i1 = idx[i];
          const i2 = idx[i + 1];
          const i3 = idx[i + 2];
          if (i1 < vCount && i2 < vCount && i3 < vCount) {
            const f1 = i1 + 1 + submeshVStart;
            const f2 = i2 + 1 + submeshVStart;
            const f3 = i3 + 1 + submeshVStart;

            if (norm && uvs) {
              const vn1 = i1 + 1 + submeshVnStart;
              const vn2 = i2 + 1 + submeshVnStart;
              const vn3 = i3 + 1 + submeshVnStart;
              const vt1 = i1 + 1 + submeshVtStart;
              const vt2 = i2 + 1 + submeshVtStart;
              const vt3 = i3 + 1 + submeshVtStart;
              objText += `f ${f1}/${vt1}/${vn1} ${f2}/${vt2}/${vn2} ${f3}/${vt3}/${vn3}\n`;
            } else if (norm) {
              const vn1 = i1 + 1 + submeshVnStart;
              const vn2 = i2 + 1 + submeshVnStart;
              const vn3 = i3 + 1 + submeshVnStart;
              objText += `f ${f1}//${vn1} ${f2}//${vn2} ${f3}//${vn3}\n`;
            } else if (uvs) {
              const vt1 = i1 + 1 + submeshVtStart;
              const vt2 = i2 + 1 + submeshVtStart;
              const vt3 = i3 + 1 + submeshVtStart;
              objText += `f ${f1}/${vt1} ${f2}/${vt2} ${f3}/${vt3}\n`;
            } else {
              objText += `f ${f1} ${f2} ${f3}\n`;
            }
            faceCount++;
          }
        }
      }

      if (globalVOffset > 0) return objText;
    }

    // ── SECONDARY FALLBACK: Raw Buffer Pool ───────────────────
    const posChunks = capturedGeometries.filter(g => g.type === 'positions');
    const idxChunks = capturedGeometries.filter(g => g.type === 'indices');
    if (posChunks.length === 0) return null;

    let globalVOffset = 0;
    for (let c = 0; c < posChunks.length; c++) {
      const chunk = posChunks[c];
      const arr = chunk.data;
      if (!arr || arr.length < 9) continue;

      const submeshVStart = globalVOffset;
      let submeshVCount = 0;
      objText += `g raw_submesh_${c + 1}\n`;

      for (let i = 0; i < arr.length - 2; i += 3) {
        const x = Number(arr[i]).toFixed(5);
        const y = Number(arr[i + 1]).toFixed(5);
        const z = Number(arr[i + 2]).toFixed(5);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          objText += `v ${x} ${y} ${z}\n`;
          submeshVCount++;
          globalVOffset++;
        }
      }

      if (submeshVCount === 0) continue;

      let matchingIdx = idxChunks[c] || idxChunks[0] || null;
      if (matchingIdx && matchingIdx.data) {
        const iarr = matchingIdx.data;
        for (let j = 0; j < iarr.length - 2; j += 3) {
          const i1 = iarr[j], i2 = iarr[j + 1], i3 = iarr[j + 2];
          if (i1 < submeshVCount && i2 < submeshVCount && i3 < submeshVCount) {
            objText += `f ${i1 + 1 + submeshVStart} ${i2 + 1 + submeshVStart} ${i3 + 1 + submeshVStart}\n`;
          }
        }
      } else {
        for (let j = 1; j <= submeshVCount - 2; j += 3) {
          objText += `f ${j + submeshVStart} ${j + 1 + submeshVStart} ${j + 2 + submeshVStart}\n`;
        }
      }
    }

    return globalVOffset > 0 ? objText : null;
  }

  hookEngineLoaders();
  setTimeout(hookEngineLoaders, 1500);

  // Initial scan for static 3D elements in page
  try {
    document.querySelectorAll('model-viewer, spline-viewer').forEach(inspect3DElement);
  } catch (e) {}

  // ── 7. Dynamic DOM MutationObserver for Video & 3D Elements ───
  try {
    const domObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const tag = (node.tagName || '').toUpperCase();
            if (tag === 'VIDEO') {
              inspectVideoElement(node);
            } else if (tag === 'MODEL-VIEWER' || tag === 'SPLINE-VIEWER') {
              inspect3DElement(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(inspectVideoElement);
              node.querySelectorAll('model-viewer, spline-viewer').forEach(inspect3DElement);
            }
          }
        }
      }
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // ── 8. Tier 3: Player Config & Hydration State Extractor ──────
  function extractFromPlayerConfigs() {
    try {
      // A. JWPlayer
      if (window.jwplayer && typeof window.jwplayer === 'function') {
        const jw = window.jwplayer();
        if (jw && typeof jw.getPlaylist === 'function') {
          const playlist = jw.getPlaylist();
          if (Array.isArray(playlist)) {
            for (const item of playlist) {
              if (item && item.file) {
                notifyDetected({
                  url: item.file,
                  category: item.file.includes('m3u8') ? 'stream' : 'video',
                  title: item.title || document.title,
                  method: 'TIER_3_PLAYER_CONFIG',
                  initiator: 'jwplayer-playlist'
                });
              }
              if (item && Array.isArray(item.sources)) {
                for (const src of item.sources) {
                  if (src && src.file) {
                    notifyDetected({
                      url: src.file,
                      category: src.file.includes('m3u8') ? 'stream' : 'video',
                      title: (item.title || document.title) + (src.label ? ` [${src.label}]` : ''),
                      method: 'TIER_3_PLAYER_CONFIG',
                      initiator: 'jwplayer-source'
                    });
                  }
                }
              }
            }
          }
        }
      }

      // B. Video.js
      if (window.videojs && typeof window.videojs.getAllPlayers === 'function') {
        const players = window.videojs.getAllPlayers();
        for (const p of Object.values(players)) {
          const currentSrc = p && p.currentSrc && p.currentSrc();
          if (currentSrc && !currentSrc.startsWith('blob:')) {
            notifyDetected({
              url: currentSrc,
              category: currentSrc.includes('m3u8') ? 'stream' : 'video',
              title: document.title,
              method: 'TIER_3_PLAYER_CONFIG',
              initiator: 'videojs-player'
            });
          }
        }
      }

      // C. Hls.js & Dash.js global instances
      if (window.hls && window.hls.url) {
        notifyDetected({
          url: window.hls.url,
          category: 'stream',
          title: document.title,
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'hlsjs-instance'
        });
      }

      // D. Next.js Hydration (__NEXT_DATA__)
      const nextDataEl = document.getElementById('__NEXT_DATA__');
      if (nextDataEl && nextDataEl.textContent) {
        const text = nextDataEl.textContent;
        const matches = text.match(/https?:\/\/[^"'\s]+\.(m3u8|mpd|mp4|webm|glb|gltf|splat)[^"'\s]*/gi);
        if (matches) {
          for (const matchUrl of matches.slice(0, 10)) {
            const cleanUrl = matchUrl.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            notifyDetected({
              url: cleanUrl,
              category: cleanUrl.includes('.glb') || cleanUrl.includes('.gltf') || cleanUrl.includes('.splat') ? 'model_3d' : (cleanUrl.includes('.m3u8') ? 'stream' : 'video'),
              title: extractFilename(cleanUrl) || document.title,
              method: 'TIER_3_PLAYER_CONFIG',
              initiator: 'nextjs-hydration'
            });
          }
        }
      }

      // E. JSON-LD Schema.org VideoObject
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of jsonLdScripts) {
        try {
          const parsed = JSON.parse(s.textContent);
          const checkObj = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj['@type'] === 'VideoObject' || obj.contentUrl || obj.embedUrl) {
              const url = obj.contentUrl || obj.embedUrl;
              if (url && typeof url === 'string' && (MEDIA_REGEX.test(url) || url.startsWith('http'))) {
                notifyDetected({
                  url,
                  category: url.includes('m3u8') ? 'stream' : 'video',
                  title: obj.name || document.title,
                  method: 'TIER_3_PLAYER_CONFIG',
                  initiator: 'schema-org-jsonld'
                });
              }
            }
            for (const key of Object.keys(obj)) {
              if (typeof obj[key] === 'object') checkObj(obj[key]);
            }
          };
          checkObj(parsed);
        } catch (e) {}
      }

      // F. YouTube / Vimeo / Platform Player Configs
      if (window.ytplayer && window.ytplayer.config) {
        try {
          const cfg = window.ytplayer.config;
          const args = cfg.args || {};
          if (args.raw_player_response && args.raw_player_response.streamingData) {
            const sd = args.raw_player_response.streamingData;
            if (sd.hlsManifestUrl) {
              notifyDetected({
                url: sd.hlsManifestUrl,
                category: 'stream',
                title: document.title,
                method: 'TIER_3_PLAYER_CONFIG',
                initiator: 'youtube-hls'
              });
            }
          }
        } catch (e) {}
      }

      // G. Dedicated Sketchfab Adapter
      detectSketchfabModel();

      // H. Dedicated CGTrader Adapter
      detectCGTraderModel();

      // I. Dedicated 3D Sites Adapter (Thingiverse, Printables, Cults3D, TurboSquid, Free3D, Thangs, Spline)
      detectFamous3DPlatforms();

    } catch (err) {}
  }

  // ── 9. Specialized Sketchfab 3D Model Adapter ────────────────
  function detectSketchfabModel() {
    try {
      const loc = window.location.href;
      // Sketchfab URL pattern: /3d-models/<slug>-<32-hex-uid> or /models/<32-hex-uid>/embed
      const m = loc.match(/(?:3d-models\/.*-|models\/)([0-9a-f]{32})/i);
      const uid = m ? m[1] : null;

      if (uid) {
        let title = document.title || 'Sketchfab 3D Model';
        title = title.replace(/\s*-\s*(?:3D\s*model\s*by.*|Sketchfab).*$/i, '').trim();

        let thumbnail = '';
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) thumbnail = ogImg.getAttribute('content') || '';

        notifyDetected({
          url: `https://sketchfab.com/i/models/${uid}`,
          category: 'model_3d',
          title: title || `Sketchfab Model (${uid.slice(0, 8)})`,
          mimeType: 'model/gltf+json',
          preview: thumbnail,
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'sketchfab-adapter'
        });
      }

      // Check for Sketchfab embed iframes
      document.querySelectorAll('iframe[src*="sketchfab.com"]').forEach(frame => {
        const src = frame.src || frame.getAttribute('src');
        if (src) {
          const match = src.match(/models\/([0-9a-f]{32})/i);
          if (match) {
            notifyDetected({
              url: `https://sketchfab.com/i/models/${match[1]}`,
              category: 'model_3d',
              title: (frame.getAttribute('title') || document.title || 'Embedded Sketchfab Model').slice(0, 100),
              method: 'TIER_2_DOM_TAG',
              initiator: 'sketchfab-embed'
            });
          }
        }
      });
    } catch (e) {}
  }

  // ── 10. Specialized CGTrader 3D Model Adapter ────────────────
  function detectCGTraderModel() {
    try {
      const href = window.location.href;
      if (!href.includes('cgtrader.com')) return;

      if (href.includes('/3d-models/') || href.includes('/free-3d-models/')) {
        let title = (document.title || 'CGTrader 3D Model')
          .replace(/\s*\|\s*CGTrader.*$/i, '')
          .replace(/\s*-\s*3D\s*model.*$/i, '')
          .trim();

        let thumbnail = '';
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) thumbnail = ogImg.getAttribute('content') || '';

        // Check for download buttons or action endpoints
        const downloadLinks = document.querySelectorAll('a[href*="/download"], a[href*="download-locations"], button[data-testid*="download"], .product-action__download-button');
        let dlUrl = null;
        for (const a of downloadLinks) {
          const h = a.getAttribute('href');
          if (h && !h.startsWith('#') && !h.startsWith('javascript:')) {
            try {
              dlUrl = new URL(h, window.location.origin).href;
              break;
            } catch (e) {}
          }
        }

        notifyDetected({
          url: dlUrl || href,
          category: 'model_3d',
          title: title || 'CGTrader 3D Model',
          preview: thumbnail,
          method: dlUrl ? 'TIER_2_DOM_TAG' : 'TIER_3_PLAYER_CONFIG',
          initiator: 'cgtrader-adapter'
        });
      }
    } catch (e) {}
  }

  // ── 11. Dedicated Famous 3D Platforms Adapter ────────────────
  function detectFamous3DPlatforms() {
    try {
      const href = window.location.href;

      // Thingiverse
      if (href.includes('thingiverse.com/thing:')) {
        const thingId = href.split('thing:')[1].split('/')[0].split('?')[0];
        notifyDetected({
          url: `https://www.thingiverse.com/thing:${thingId}/files`,
          category: 'model_3d',
          title: document.title.replace(/\s*-\s*Thingiverse.*$/i, '').trim() || 'Thingiverse 3D Model',
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'thingiverse-adapter'
        });
      }

      // Printables
      if (href.includes('printables.com/model/')) {
        notifyDetected({
          url: href,
          category: 'model_3d',
          title: document.title.replace(/\s*\|\s*Printables.*$/i, '').trim() || 'Printables 3D Model',
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'printables-adapter'
        });
      }

      // Cults3D
      if (href.includes('cults3d.com')) {
        if (href.includes('/3d-model/')) {
          notifyDetected({
            url: href,
            category: 'model_3d',
            title: document.title.replace(/\s*·.*Cults.*$/i, '').trim() || 'Cults3D Model',
            method: 'TIER_3_PLAYER_CONFIG',
            initiator: 'cults3d-adapter'
          });
        }
      }

      // TurboSquid
      if (href.includes('turbosquid.com/3d-models/')) {
        notifyDetected({
          url: href,
          category: 'model_3d',
          title: document.title.replace(/\s*\|\s*TurboSquid.*$/i, '').trim() || 'TurboSquid 3D Model',
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'turbosquid-adapter'
        });
      }

      // Free3D
      if (href.includes('free3d.com/3d-model/')) {
        notifyDetected({
          url: href,
          category: 'model_3d',
          title: document.title.replace(/\s*\|\s*Free3D.*$/i, '').trim() || 'Free3D Model',
          method: 'TIER_3_PLAYER_CONFIG',
          initiator: 'free3d-adapter'
        });
      }

      // Thangs
      if (href.includes('thangs.com/')) {
        if (href.includes('/3d-model/')) {
          notifyDetected({
            url: href,
            category: 'model_3d',
            title: document.title.replace(/\s*\|\s*Thangs.*$/i, '').trim() || 'Thangs 3D Model',
            method: 'TIER_3_PLAYER_CONFIG',
            initiator: 'thangs-adapter'
          });
        }
      }

      // Spline Viewer URL / code
      document.querySelectorAll('spline-viewer').forEach(el => {
        const url = el.getAttribute('url');
        if (url) {
          notifyDetected({
            url,
            category: 'model_3d',
            title: extractFilename(url) || 'Spline 3D Scene',
            method: 'TIER_2_DOM_TAG',
            initiator: 'spline-adapter'
          });
        }
      });
    } catch (e) {}
  }

  // Run Tier 3 extraction on load and shortly after
  setTimeout(extractFromPlayerConfigs, 500);
  setTimeout(extractFromPlayerConfigs, 1500);
  setTimeout(extractFromPlayerConfigs, 3500);

})();

