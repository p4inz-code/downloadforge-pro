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

  const MEDIA_REGEX = /\.(m3u8|mpd|mp4|webm|ts|m4s|f4m|flv)(\?|$)/i;
  const MIME_REGEX = /(mpegurl|x-mpegurl|video\/|audio\/|dash\+xml)/i;
  const MODEL_3D_REGEX = /\.(glb|gltf|obj|mtl|fbx|stl|usdz|splat|ply)(\?|$)/i;
  const MODEL_3D_MIME_REGEX = /(model\/|gltf|usdz|octet-stream-splat)/i;

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
    } catch (err) {}
  }

  // Run Tier 3 extraction on load and shortly after
  setTimeout(extractFromPlayerConfigs, 800);
  setTimeout(extractFromPlayerConfigs, 2500);

})();
