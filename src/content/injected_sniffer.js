// ============================================================
// DownloadForge — content/injected_sniffer.js
// ObsidianLabs | p4inz
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
  const sessionToken = scriptEl ? scriptEl.dataset.token : null;

  const MEDIA_REGEX = /\.(m3u8|mpd|mp4|webm|ts|m4s|f4m|flv)(\?|$)/i;
  const MIME_REGEX = /(mpegurl|x-mpegurl|video\/|audio\/|dash\+xml)/i;

  function notifyDetected(mediaInfo) {
    if (!mediaInfo || !mediaInfo.url) return;
    // Validate protocol
    if (!/^https?:\/\//i.test(mediaInfo.url) && !mediaInfo.url.startsWith('blob:')) return;

    try {
      window.postMessage({
        source: 'DOWNLOADFORGE_SNIFFER',
        token: sessionToken,
        type: 'MEDIA_DETECTED',
        data: {
          url: mediaInfo.url,
          mimeType: mediaInfo.mimeType || '',
          category: mediaInfo.category || 'stream',
          title: (mediaInfo.title || document.title || 'Video Stream').slice(0, 150),
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
    if (this._df_url && MEDIA_REGEX.test(this._df_url)) {
      notifyDetected({
        url: this._df_url,
        category: this._df_url.includes('m3u8') ? 'stream' : 'video',
        initiator: 'xhr'
      });
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
        }
      } catch (e) {}
    });

    return originalSend.apply(this, args);
  };

  // ── 3. Intercept SourceBuffer.appendBuffer for Buffer Capture ──
  if (window.SourceBuffer && SourceBuffer.prototype.appendBuffer) {
    const originalAppendBuffer = SourceBuffer.prototype.appendBuffer;
    SourceBuffer.prototype.appendBuffer = function(buffer) {
      if (window.__df_record_mode_active) {
        try {
          window.postMessage({
            source: 'DOWNLOADFORGE_SNIFFER',
            token: sessionToken,
            type: 'BUFFER_CHUNK_APPENDED',
            data: {
              byteLength: buffer.byteLength,
              mimeType: this._df_mime || 'video/mp4'
            }
          }, '*');
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

  document.querySelectorAll('video').forEach(inspectVideoElement);
  window.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      inspectVideoElement(e.target);
    }
  }, true);

})();
