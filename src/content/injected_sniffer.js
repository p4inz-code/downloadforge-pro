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
    window.fetch = async function(...args) {
      const request = args[0];
      let url = '';
      if (typeof request === 'string') {
        url = request;
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

      try {
        const response = await originalFetch.apply(this, args);
        if (response && response.headers) {
          const contentType = response.headers.get('content-type') || '';
          if (MIME_REGEX.test(contentType)) {
            notifyDetected({
              url: response.url || url,
              mimeType: contentType,
              category: contentType.includes('mpegurl') ? 'stream' : 'video',
              initiator: 'fetch-response'
            });
          } else if (MODEL_3D_MIME_REGEX.test(contentType)) {
            notifyDetected({
              url: response.url || url,
              mimeType: contentType,
              category: 'model_3d',
              title: extractFilename(response.url || url) || '3D Model',
              initiator: 'fetch-response-3d'
            });
          }
        }
        return response;
      } catch (err) {
        throw err;
      }
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

  // ── WebGL Mesh Geometry Ripper (Direct GPU Buffer Extraction) ─
  const capturedGeometries = [];
  function hookWebGL() {
    if (!window.WebGLRenderingContext) return;

    function captureBuffer(target, data) {
      if (!data) return;
      const isArrayBuf = data instanceof ArrayBuffer;
      const isView = ArrayBuffer.isView(data);
      if (!isArrayBuf && !isView) return;

      const rawBuffer = isArrayBuf ? data : data.buffer;
      const byteOffset = isArrayBuf ? 0 : data.byteOffset;
      const byteLength = isArrayBuf ? data.byteLength : data.byteLength;
      if (!rawBuffer || byteLength < 6) return;

      // Target 0x8892 is gl.ARRAY_BUFFER (vertices/normals/uvs)
      if (target === 0x8892) {
        let floatView = null;
        if (data instanceof Float32Array) {
          floatView = new Float32Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        } else if (data instanceof Int16Array) {
          // Dequantize 16-bit signed normalized vertex positions
          const i16 = new Int16Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
          floatView = new Float32Array(i16.length);
          for (let i = 0; i < i16.length; i++) {
            floatView[i] = i16[i] / 32767.0;
          }
        } else if (byteLength % 4 === 0 && byteLength >= 36) {
          floatView = new Float32Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        }

        if (floatView && floatView.length >= 9) {
          capturedGeometries.push({
            type: 'positions',
            data: floatView,
            length: floatView.length,
            time: Date.now()
          });
          if (capturedGeometries.length > 300) capturedGeometries.shift();
        }
      }
      // Target 0x8893 is gl.ELEMENT_ARRAY_BUFFER (indices)
      else if (target === 0x8893) {
        let idxView = null;
        if (data instanceof Uint16Array) {
          idxView = new Uint16Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        } else if (data instanceof Uint32Array) {
          idxView = new Uint32Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        } else if (byteLength % 4 === 0 && byteLength >= 12) {
          idxView = new Uint32Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        } else if (byteLength % 2 === 0 && byteLength >= 6) {
          idxView = new Uint16Array(rawBuffer.slice(byteOffset, byteOffset + byteLength));
        }

        if (idxView && idxView.length >= 3) {
          capturedGeometries.push({
            type: 'indices',
            data: idxView,
            length: idxView.length,
            time: Date.now()
          });
          if (capturedGeometries.length > 300) capturedGeometries.shift();
        }
      }
    }

    function hookContext(proto) {
      if (!proto || proto.__df_hooked) return;
      proto.__df_hooked = true;

      const origBufferData = proto.bufferData;
      proto.bufferData = function(target, data, usage) {
        try {
          captureBuffer(target, data);
        } catch (e) {}
        return origBufferData.apply(this, arguments);
      };

      const origBufferSubData = proto.bufferSubData;
      proto.bufferSubData = function(target, offset, data) {
        try {
          captureBuffer(target, data);
        } catch (e) {}
        return origBufferSubData.apply(this, arguments);
      };
    }

    hookContext(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) {
      hookContext(WebGL2RenderingContext.prototype);
    }
  }

  hookWebGL();

  // Listen for mesh export request from content script
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'DF_TRIGGER_WEBGL_RIP') {
      const title = (document.title || 'model').replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 80);
      const objData = exportCapturedMeshToObj(title);
      if (objData) {
        const blob = new Blob([objData], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${title}.obj`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

        notifyDetected({
          url: blobUrl,
          category: 'model_3d',
          title: `${title} (WebGL Mesh OBJ)`,
          mimeType: 'text/plain',
          method: 'TIER_4_MSE_BUFFER',
          initiator: 'webgl-mesh-ripper'
        });

        window.postMessage({ type: 'DF_WEBGL_RIP_SUCCESS', title }, '*');
      } else {
        window.postMessage({ type: 'DF_WEBGL_RIP_FAIL', reason: 'No WebGL buffer data captured yet. Interact with the 3D model viewer to stream geometry.' }, '*');
      }
    }
  });

  function exportCapturedMeshToObj(title) {
    let objText = `# DownloadForge Pro WebGL 3D Ripper\n# Model: ${title}\n# Extracted: ${new Date().toISOString()}\n\n`;
    const posChunks = capturedGeometries.filter(g => g.type === 'positions');
    const idxChunks = capturedGeometries.filter(g => g.type === 'indices');

    if (posChunks.length === 0) return null;

    let globalVOffset = 0;
    let globalVtOffset = 0;
    let globalVnOffset = 0;
    let totalFaces = 0;

    for (let c = 0; c < posChunks.length; c++) {
      const chunk = posChunks[c];
      const arr = chunk.data;
      let stride = 3;
      let hasUVs = false;
      let hasNormals = false;

      // Stride detection
      if (arr.length % 8 === 0 && arr.length >= 24) {
        stride = 8; // x, y, z, nx, ny, nz, u, v
        hasNormals = true;
        hasUVs = true;
      } else if (arr.length % 6 === 0 && arr.length >= 18) {
        stride = 6; // x, y, z, nx, ny, nz
        hasNormals = true;
      } else if (arr.length % 5 === 0 && arr.length >= 15) {
        stride = 5; // x, y, z, u, v
        hasUVs = true;
      }

      const submeshVStart = globalVOffset;
      const submeshVtStart = globalVtOffset;
      const submeshVnStart = globalVnOffset;
      let submeshVCount = 0;

      objText += `g submesh_${c + 1}\n`;

      for (let i = 0; i < arr.length; i += stride) {
        const x = Number(arr[i]).toFixed(5);
        const y = Number(arr[i + 1]).toFixed(5);
        const z = Number(arr[i + 2]).toFixed(5);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          objText += `v ${x} ${y} ${z}\n`;
          submeshVCount++;
          globalVOffset++;

          if (hasNormals) {
            const nx = Number(arr[i + 3]).toFixed(5);
            const ny = Number(arr[i + 4]).toFixed(5);
            const nz = Number(arr[i + 5]).toFixed(5);
            objText += `vn ${nx} ${ny} ${nz}\n`;
            globalVnOffset++;
          }

          if (hasUVs) {
            const uOffset = hasNormals ? 6 : 3;
            const u = Number(arr[i + uOffset]).toFixed(5);
            const v = Number(arr[i + uOffset + 1]).toFixed(5);
            objText += `vt ${u} ${v}\n`;
            globalVtOffset++;
          }
        }
      }

      if (submeshVCount === 0) continue;

      // Match corresponding index chunk if available, or sequential faces
      const matchingIdx = idxChunks[c];
      if (matchingIdx && matchingIdx.data) {
        const iarr = matchingIdx.data;
        for (let j = 0; j < iarr.length - 2; j += 3) {
          const i1 = iarr[j];
          const i2 = iarr[j + 1];
          const i3 = iarr[j + 2];
          if (i1 < submeshVCount && i2 < submeshVCount && i3 < submeshVCount) {
            const f1 = i1 + 1 + submeshVStart;
            const f2 = i2 + 1 + submeshVStart;
            const f3 = i3 + 1 + submeshVStart;
            if (hasNormals && hasUVs) {
              const vt1 = i1 + 1 + submeshVtStart;
              const vt2 = i2 + 1 + submeshVtStart;
              const vt3 = i3 + 1 + submeshVtStart;
              const vn1 = i1 + 1 + submeshVnStart;
              const vn2 = i2 + 1 + submeshVnStart;
              const vn3 = i3 + 1 + submeshVnStart;
              objText += `f ${f1}/${vt1}/${vn1} ${f2}/${vt2}/${vn2} ${f3}/${vt3}/${vn3}\n`;
            } else if (hasNormals) {
              const vn1 = i1 + 1 + submeshVnStart;
              const vn2 = i2 + 1 + submeshVnStart;
              const vn3 = i3 + 1 + submeshVnStart;
              objText += `f ${f1}//${vn1} ${f2}//${vn2} ${f3}//${vn3}\n`;
            } else if (hasUVs) {
              const vt1 = i1 + 1 + submeshVtStart;
              const vt2 = i2 + 1 + submeshVtStart;
              const vt3 = i3 + 1 + submeshVtStart;
              objText += `f ${f1}/${vt1} ${f2}/${vt2} ${f3}/${vt3}\n`;
            } else {
              objText += `f ${f1} ${f2} ${f3}\n`;
            }
            totalFaces++;
          }
        }
      } else {
        for (let j = 1; j <= submeshVCount - 2; j += 3) {
          const f1 = j + submeshVStart;
          const f2 = j + 1 + submeshVStart;
          const f3 = j + 2 + submeshVStart;
          objText += `f ${f1} ${f2} ${f3}\n`;
          totalFaces++;
        }
      }
    }

    if (globalVOffset === 0) return null;
    return objText;
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

