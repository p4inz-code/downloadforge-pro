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
import { initVideoOverlay } from './video_overlay.js';
import { MSG, CATEGORY, SOURCE, STATUS } from '../shared/constants.js';
import { StorageService }  from '../storage/storage.js';

// ── Guard against double injection ───────────────────────────
if (!window.__downloadForgeInjected) {
  window.__downloadForgeInjected = true;
  init();
}

const sessionToken = Math.random().toString(36).slice(2) + Date.now().toString(36);

function injectMainWorldSniffer() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/injected_sniffer.js');
    script.dataset.token = sessionToken;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.debug('[DownloadForge] Failed to inject sniffer:', err);
  }
}

// ─────────────────────────────────────────────────────────────
async function init() {
  injectMainWorldSniffer();
  setupSnifferListener();
  setupMessageListener();

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
}

// ── Listen to Main-World Sniffer Messages ────────────────────
function setupSnifferListener() {
  window.addEventListener('message', async (event) => {
    // Enforce window origin, source tag, and security token
    if (event.source !== window || !event.data || event.data.source !== 'DOWNLOADFORGE_SNIFFER') {
      return;
    }
    if (event.data.token !== sessionToken) {
      return;
    }

    if (event.data.type === 'MEDIA_DETECTED' && event.data.data) {
      const item = event.data.data;
      if (!item.url || typeof item.url !== 'string') return;

      // Validate URL protocol strictly against XSS vectors
      if (!item.url.startsWith('http://') && !item.url.startsWith('https://') && !item.url.startsWith('blob:')) {
        return;
      }

      // Sanitize filename against path traversal and HTML injection
      const cleanTitle = (item.title || 'video_stream')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .slice(0, 100);

      const resource = {
        id: `sniff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: item.url,
        category: item.category === 'stream' ? CATEGORY.STREAM : CATEGORY.VIDEO,
        ext: item.url.split('?')[0].split('.').pop().toLowerCase() || 'm3u8',
        filename: cleanTitle + (item.url.includes('m3u8') ? '.m3u8' : '.mp4'),
        mimeType: item.mimeType || (item.url.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'),
        source: SOURCE.NETWORK,
        status: item.url.includes('m3u8') ? STATUS.STREAM : STATUS.DOWNLOADABLE,
        pageUrl: window.location.href,
        domain: window.location.hostname,
        detectedAt: Date.now(),
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
  });
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
