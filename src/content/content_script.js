// ============================================================
// DownloadForge — content/content_script.js
// P4inz Interactive Labs | p4inz
//
// Content Script — injected into pages.
// Responsibilities:
//   - Inject main-world sniffer into page context
//   - Capture sniffed network requests from main-world
//   - Run DOM scan via dom_scanner.js
//   - Listen for RESCAN messages from service worker
//   - Report results back to service worker
//   - Guard against double-injection
// ============================================================

import { scanDOM }         from './dom_scanner.js';
import { initVideoOverlay, registerDetectedMedia, onBufferChunkIntercepted } from './video_overlay.js';
import { MSG, CATEGORY, SOURCE, STATUS } from '../shared/constants.js';
import { StorageService }  from '../storage/storage.js';
import { inferCategory }   from '../core/classifier.js';

// ── Guard against double injection ───────────────────────────
if (!window.__downloadForgeInjected) {
  window.__downloadForgeInjected = true;
  init();
}

// Session token binding with main-world sniffer
let sessionToken = (document.documentElement && document.documentElement.dataset.dfSnifferToken) || null;
const mainSnifferAlreadyMounted = !!sessionToken;
if (document.documentElement && document.documentElement.dataset.dfSnifferToken) {
  delete document.documentElement.dataset.dfSnifferToken;
}
if (!sessionToken && window.crypto && window.crypto.getRandomValues) {
  const buf = new Uint8Array(24);
  window.crypto.getRandomValues(buf);
  sessionToken = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function injectMainWorldSniffer() {
  try {
    if (mainSnifferAlreadyMounted) return;
    document.documentElement.dataset.dfSnifferToken = sessionToken;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/injected_sniffer.js');
    script.dataset.token = sessionToken;
    const cleanupToken = () => {
      if (document.documentElement && document.documentElement.dataset.dfSnifferToken) {
        delete document.documentElement.dataset.dfSnifferToken;
      }
      if (script.dataset && script.dataset.token) {
        delete script.dataset.token;
      }
      script.remove();
    };
    script.onload = cleanupToken;
    script.onerror = cleanupToken;
    (document.head || document.documentElement).appendChild(script);
    setTimeout(cleanupToken, 1000);
  } catch (err) {
    console.debug('[DownloadForge] Failed to inject sniffer:', err);
  }
}

// ─────────────────────────────────────────────────────────────
let lastCapturedObj = null;

async function init() {
  injectMainWorldSniffer();
  setupSnifferListener();
  setupMessageListener();

  const onReady = async () => {
    try {
      const settings = await StorageService.getSettings();
      if (settings.autoScan) {
        await runScan(settings);
      }
      if (settings.enableVideoOverlay !== false) {
        initVideoOverlay();
      }
    } catch (err) {
      reportError(`Init failed: ${err.message}`);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}

// ── Listen to Main-World Sniffer Messages ────────────────────
function setupSnifferListener() {
  window.addEventListener('message', async (event) => {
    // Enforce window origin and source tag
    if (event.source !== window || !event.data || event.data.source !== 'DOWNLOADFORGE_SNIFFER') {
      return;
    }
    // Bind session token on first verified sniffer message
    if (!sessionToken && event.data.token) {
      sessionToken = event.data.token;
    }
    if (sessionToken && event.data.token && event.data.token !== sessionToken) {
      return;
    }

    if (event.data.type === 'BUFFER_CHUNK_APPENDED' && event.data.data) {
      onBufferChunkIntercepted(event.data.data);
      return;
    }

    if (event.data.type === 'MEDIA_DETECTED' && event.data.data) {
      const item = event.data.data;
      if (!item.url || typeof item.url !== 'string') return;
      registerDetectedMedia(item);

      // Validate URL protocol strictly against XSS vectors
      if (!item.url.startsWith('http://') && !item.url.startsWith('https://') && !item.url.startsWith('blob:')) {
        return;
      }

      // Determine precise category and extension
      let ext = item.url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
      if (ext.length > 8 || ext.includes('/')) ext = '';

      const category = item.category || inferCategory(item.url, item.mimeType, ext);

      if (!ext) {
        if (category === CATEGORY.MODEL_3D) ext = 'glb';
        else if (category === CATEGORY.STREAM) ext = 'm3u8';
        else if (category === CATEGORY.AUDIO) ext = 'm4a';
        else if (category === CATEGORY.IMAGE) ext = 'jpg';
        else ext = 'mp4';
      }

      // Sanitize filename against path traversal and HTML injection
      const cleanTitle = (item.title || 'media_asset')
        .replace(/\.{2,}/g, '_')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .slice(0, 100);

      const filename = cleanTitle.toLowerCase().endsWith('.' + ext)
        ? cleanTitle
        : `${cleanTitle}.${ext}`;

      const resource = {
        id: `sniff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: item.url,
        category,
        ext,
        filename,
        mimeType: item.mimeType || (category === CATEGORY.STREAM ? 'application/x-mpegURL' : (category === CATEGORY.MODEL_3D ? 'model/gltf-binary' : 'video/mp4')),
        source: SOURCE.NETWORK,
        status: category === CATEGORY.STREAM ? STATUS.STREAM : STATUS.DOWNLOADABLE,
        pageUrl: window.location.href,
        domain: window.location.hostname,
        detectedAt: Date.now(),
        preview: item.preview || null,
        title: cleanTitle,
      };

      try {
        await chrome.runtime.sendMessage({
          type: MSG.SCAN_RESULT,
          payload: {
            resources: [resource],
            scanDurationMs: 0,
            pageUrl: window.location.href,
            incremental: true,
          },
        });
      } catch (e) {
        // SW might be busy or sleeping
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === MSG.START_SCAN || message.type === MSG.RESCAN) {
      StorageService.getSettings()
        .then(settings => runScan(settings))
        .then(() => sendResponse({ ok: true }))
        .catch(err => {
          reportError(err.message);
          sendResponse({ ok: false, error: err.message });
        });
      return true; // async response
    }

    if (message.type === 'DF_TRIGGER_WEBGL_RIP') {
      window.postMessage({ type: 'DF_TRIGGER_WEBGL_RIP' }, '*');
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'DF_GET_CACHED_OBJ') {
      const replyObj = (objData, title) => {
        if (objData && objData.length > 20 * 1024 * 1024) {
          sendResponse({ ok: true, chunked: true, title });
        } else {
          sendResponse({ ok: true, objData, title });
        }
      };

      if (lastCapturedObj && lastCapturedObj.objData) {
        replyObj(lastCapturedObj.objData, lastCapturedObj.title);
        return false;
      }

      // Request live mesh rip from main-world sniffer and await response
      let replied = false;
      const onRipData = (event) => {
        if (!replied && event.data && event.data.source === 'DOWNLOADFORGE_SNIFFER' && event.data.type === 'DF_WEBGL_RIP_DATA' && event.data.objData) {
          replied = true;
          window.removeEventListener('message', onRipData);
          lastCapturedObj = { objData: event.data.objData, title: event.data.title, time: Date.now() };
          replyObj(event.data.objData, event.data.title);
        }
      };

      window.addEventListener('message', onRipData);
      window.postMessage({ type: 'DF_NUDGE_CANVAS' }, '*');
      window.postMessage({ type: 'DF_TRIGGER_WEBGL_RIP' }, '*');
      document.querySelectorAll('iframe').forEach(ifr => {
        try {
          ifr.contentWindow.postMessage({ type: 'DF_NUDGE_CANVAS' }, '*');
          ifr.contentWindow.postMessage({ type: 'DF_TRIGGER_WEBGL_RIP' }, '*');
        } catch (_) {}
      });

      setTimeout(() => {
        if (!replied) {
          replied = true;
          window.removeEventListener('message', onRipData);
          sendResponse({ ok: true, objData: lastCapturedObj ? lastCapturedObj.objData : null });
        }
      }, 1200);
      return true; // Keep message channel open for async response
    }
  });

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'DOWNLOADFORGE_SNIFFER') return;
    if (event.data.type === 'DF_WEBGL_RIP_DATA' && event.data.objData) {
      lastCapturedObj = {
        objData: event.data.objData,
        title: event.data.title,
        drawCalls: event.data.drawCalls || 0,
        vertexCount: event.data.vertexCount || 0,
        faceCount: event.data.faceCount || 0,
        time: Date.now()
      };
      // Guard Chrome's 64MB IPC limit on single sendMessage; SW will pull via active tab or port if larger
      if (event.data.objData.length <= 28 * 1024 * 1024) {
        try {
          chrome.runtime.sendMessage({
            type: 'DF_STORE_CACHED_OBJ',
            payload: {
              objData: event.data.objData,
              title: event.data.title,
              vertexCount: event.data.vertexCount || 0,
              faceCount: event.data.faceCount || 0
            }
          }).catch(() => {});
        } catch (_) {}
      }
    } else if (event.data.type === 'DF_WEBGL_TELEMETRY' && event.data.data) {
      window.__df_last_telemetry = event.data.data;
    }
  });

  // Chunked stream port for multi-megabyte OBJ meshes (bypasses Chrome 64MB single-message limit)
  if (chrome?.runtime?.onConnect) {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'df_obj_stream') return;
      const obj = lastCapturedObj?.objData || '';
      const chunkSize = 4 * 1024 * 1024;
      for (let i = 0; i < obj.length; i += chunkSize) {
        port.postMessage({ type: 'CHUNK', text: obj.slice(i, i + chunkSize) });
      }
      port.postMessage({ type: 'END' });
    });
  }
}

// ─────────────────────────────────────────────────────────────
async function runScan(settings = {}) {
  try {
    const { resources, scanDurationMs } = scanDOM({
      deduplicateUrls: settings.deduplicateUrls ?? true,
      minFileSizeBytes: settings.minFileSizeBytes ?? 1024,
      showImages: settings.showImages ?? true,
    });

    await chrome.runtime.sendMessage({
      type: MSG.SCAN_RESULT,
      payload: {
        resources,
        scanDurationMs,
        pageUrl: window.location.href,
      },
    });
  } catch (err) {
    reportError(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
function reportError(error) {
  try {
    chrome.runtime.sendMessage({
      type: MSG.SCAN_ERROR,
      payload: { error, pageUrl: window.location.href },
    });
  } catch {
    // SW might not be listening yet — silent fail
  }
}
