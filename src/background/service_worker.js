// ============================================================
// DownloadForge — background/service_worker.js
// P4inz Interactive Labs | p4inz
//
// MV3 Service Worker — central message hub.
// Responsibilities:
//   - Receive scan results from content scripts
//   - Serve resources to popup on request
//   - Manage icon badge state per tab
//   - Trigger downloads via chrome.downloads API
//   - Route messages to companion bridge
//   - Handle tab lifecycle (cleanup on close/navigate)
// ============================================================

import { MSG, BADGE, STORAGE, LIMITS, DEFAULT_SETTINGS, APP, NATIVE_HOST, UPDATE_CONFIG } from '../shared/constants.js';
import { StorageService } from '../storage/storage.js';
import { Logger } from '../utils/logger.js';
import { startNetworkObserver, stopNetworkObserver, isObserverActive } from './network_observer.js';
import { checkForGitHubUpdate, downloadUpdatePackage } from '../core/updater.js';
import { bundleSketchfabModelPackage, bundleGenericModelPackage, bundlePolyHavenModelPackage, uint8ArrayToDataUrl } from '../core/model_zip_bundler.js';

const log = new Logger('ServiceWorker');

// ── In-memory cache for live GPU WebGL mesh rips ─────────────
let bgCached3DMesh = null;

// ── Per-tab resource store ───────────────────────────────────
// Map<tabId, { resources: [], scannedAt: timestamp, scanning: bool }>
const tabStore = new Map();

// ── DeclarativeNetRequest Anti-Hotlink Engine ──────────────
const DNR_RULE_ID_STRIP_ORIGIN = 9001;

async function configureDeclarativeNetRequestRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID_STRIP_ORIGIN],
      addRules: [
        {
          id: DNR_RULE_ID_STRIP_ORIGIN,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'origin', operation: 'remove' }
            ]
          },
          condition: {
            resourceTypes: ['xmlhttprequest', 'media', 'other'],
            initiatorDomains: [chrome.runtime.id]
          }
        }
      ]
    });
    log.info('DeclarativeNetRequest anti-hotlink rules configured.');
  } catch (err) {
    log.warn('Failed to configure DNR rules:', err.message);
  }
}

// ── Auto-Update Scheduler ──────────────────────────────────
async function initUpdateScheduler() {
  if (!chrome.alarms) return;
  try {
    chrome.alarms.create(UPDATE_CONFIG.ALARM_NAME, {
      periodInMinutes: UPDATE_CONFIG.CHECK_INTERVAL_MINUTES,
    });
    log.info(`Update check alarm scheduled every ${UPDATE_CONFIG.CHECK_INTERVAL_MINUTES} minutes.`);
    // Run an initial check in background
    checkForGitHubUpdate();
  } catch (err) {
    log.warn('Failed to schedule update alarm:', err.message);
  }
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_CONFIG.ALARM_NAME) {
      log.debug('Executing scheduled update check...');
      checkForGitHubUpdate();
    }
  });
}

// ── Install / startup ────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  log.info(`DownloadForge ${APP.VERSION} installed. Reason: ${reason}`);
  await configureDeclarativeNetRequestRules();
  await initUpdateScheduler();

  if (reason === 'install') {
    await StorageService.initDefaults();
    // Open onboarding on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html?view=onboarding') });
  }

  if (reason === 'update') {
    log.info('Extension updated — storage schema preserved.');
  }
});

chrome.runtime.onStartup.addListener(async () => {
  log.info('Browser startup — DownloadForge service worker ready.');
  await configureDeclarativeNetRequestRules();
  await initUpdateScheduler();
  // Re-enable network observer if user previously granted webRequest
  const hasWR = await chrome.permissions.contains({ permissions: ['webRequest'] });
  if (hasWR) startNetworkObserver();
});

// ── Tab lifecycle cleanup ────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStore.has(tabId)) {
    tabStore.delete(tabId);
    log.debug(`Tab ${tabId} closed — cleared resource store.`);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Page navigated — invalidate cached scan
  if (changeInfo.status === 'loading' && changeInfo.url) {
    if (tabStore.has(tabId)) {
      tabStore.delete(tabId);
    }
    setBadgeState(tabId, 'none');
  }
});

// ── Message routing ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;
  const tabId = sender.tab?.id ?? payload?.tabId;

  log.debug(`Message received: ${type}`, { tabId });

  switch (type) {

    // ── Content script → SW: scan completed ─────────────────
    case MSG.SCAN_RESULT:
      handleScanResult(tabId, payload, sendResponse);
      return true;

    // ── Content script → SW: scan errored ───────────────────
    case MSG.SCAN_ERROR:
      handleScanError(tabId, payload);
      sendResponse({ ok: true });
      return false;

    // ── Popup → SW: get cached resources for current tab ────
    case MSG.GET_RESOURCES:
      handleGetResources(tabId, sendResponse);
      return true;

    // ── Popup → SW: trigger single download ─────────────────
    case MSG.DOWNLOAD_ITEM:
      handleDownload(payload, sendResponse);
      return true;

    // ── Popup → SW: batch download ───────────────────────────
    case MSG.DOWNLOAD_BATCH:
      handleBatchDownload(payload, sendResponse);
      return true;

    // ── Popup → SW: open full dashboard ─────────────────────
    case MSG.OPEN_DASHBOARD:
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;

    // ── Content/Popup → SW: open Stream Studio ──────────────
    case MSG.OPEN_DOWNLOADER:
    case 'OPEN_DOWNLOADER':
      handleOpenDownloader(payload, sender, sendResponse);
      return true;

    // ── Content/Popup → SW: open arbitrary tab safely ───────
    case MSG.OPEN_TAB:
    case 'OPEN_TAB':
      if (payload?.url) {
        chrome.tabs.create({ url: payload.url, active: payload.active !== false });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'No URL provided' });
      }
      return false;

    // ── Popup/Dashboard → SW: rescan current tab ────────────
    case MSG.RESCAN:
      handleRescan(tabId ?? payload?.tabId, sendResponse);
      return true;

    // ── Popup/Dashboard → SW: check GitHub for updates ───────
    case MSG.CHECK_FOR_UPDATES:
      checkForGitHubUpdate().then((info) => sendResponse(info));
      return true;

    // ── Popup/Dashboard → SW: download update package ────────
    case MSG.APPLY_UPDATE:
      downloadUpdatePackage(payload?.zipUrl, payload?.version)
        .then((downloadId) => sendResponse({ ok: true, downloadId }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    // ── Content Script → SW: store live WebGL ripped mesh ───
    case 'DF_STORE_CACHED_OBJ':
      if (payload && payload.objData) {
        bgCached3DMesh = {
          objData: payload.objData,
          title: payload.title || '3D_Model',
          time: Date.now()
        };
      }
      sendResponse({ ok: true });
      return false;

    default:
      log.warn(`Unknown message type: ${type}`);
      sendResponse({ ok: false, error: `Unknown message type: ${type}` });
      return false;
  }
});

// ── Handler: open Stream Studio ──────────────────────────────
function handleOpenDownloader(payload, sender, sendResponse) {
  try {
    const { url, filename, mode, title } = payload || {};
    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    if (url) params.set('url', url);
    if (filename) params.set('filename', filename);
    if (title) params.set('title', title);
    if (sender?.tab?.id) params.set('tabId', String(sender.tab.id));
    if (sender?.tab?.url) {
      try {
        const u = new URL(sender.tab.url);
        params.set('referer', u.origin);
      } catch (e) {}
    }

    const queryStr = params.toString();
    const studioUrl = chrome.runtime.getURL(
      queryStr ? `src/downloader/downloader.html?${queryStr}` : 'src/downloader/downloader.html'
    );
    chrome.tabs.create({ url: studioUrl, active: true }, (tab) => {
      sendResponse({ ok: true, tabId: tab?.id });
    });
  } catch (err) {
    log.error('Failed to open downloader:', err);
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Handler: scan result from content script ─────────────────
function handleScanResult(tabId, payload, sendResponse) {
  if (!tabId) {
    log.warn('SCAN_RESULT received without tabId — dropping.');
    sendResponse({ ok: false, error: 'missing tabId' });
    return;
  }

  const { resources = [], scanDurationMs = 0, pageUrl = '', incremental = false } = payload;

  let finalResources = resources;
  if (incremental && tabStore.has(tabId)) {
    const existing = tabStore.get(tabId)?.resources || [];
    const urlSet = new Set(existing.map(r => r.url));
    const newItems = resources.filter(r => !urlSet.has(r.url));
    finalResources = [...newItems, ...existing];
  }

  // Enforce resource cap
  const capped = finalResources.slice(0, LIMITS.MAX_RESOURCES_PER_SCAN);

  tabStore.set(tabId, {
    resources: capped,
    scannedAt: Date.now(),
    scanDurationMs,
    pageUrl: pageUrl || tabStore.get(tabId)?.pageUrl || '',
    scanning: false,
  });

  const count = capped.length;
  log.info(`Tab ${tabId}: scan complete — ${count} resources found in ${scanDurationMs}ms`);

  // Update badge
  if (count > 0) {
    setBadgeState(tabId, 'active', count);
  } else {
    setBadgeState(tabId, 'none');
  }

  sendResponse({ ok: true, count });
}

// ── Handler: scan error from content script ──────────────────
function handleScanError(tabId, payload) {
  const { error = 'unknown error' } = payload;
  log.error(`Tab ${tabId}: scan error — ${error}`);

  if (tabId) {
    setBadgeState(tabId, 'error');
    // Preserve any previously scanned resources
    const existing = tabStore.get(tabId);
    if (existing) {
      existing.scanning = false;
      existing.lastError = error;
    } else {
      tabStore.set(tabId, {
        resources: [],
        scannedAt: Date.now(),
        scanning: false,
        lastError: error,
      });
    }
  }
}

// ── Handler: popup requests resources ────────────────────────
async function handleGetResources(tabId, sendResponse) {
  if (!tabId) {
    // Popup opened without knowing tabId — resolve active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    } catch (err) {
      log.error('Failed to resolve active tab:', err);
      sendResponse({ ok: false, error: 'Cannot resolve active tab', resources: [] });
      return;
    }
  }

  const entry = tabStore.get(tabId);

  if (!entry) {
    // No scan yet — trigger one now
    sendResponse({ ok: true, resources: [], scanning: true, needsScan: true, tabId });
    triggerScanOnTab(tabId);
    return;
  }

  sendResponse({
    ok: true,
    resources: entry.resources,
    scannedAt: entry.scannedAt,
    scanDurationMs: entry.scanDurationMs,
    pageUrl: entry.pageUrl,
    scanning: entry.scanning,
    lastError: entry.lastError ?? null,
    tabId,
  });
}

// ── Handler: trigger rescan ───────────────────────────────────
async function handleRescan(tabId, sendResponse) {
  if (!tabId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    } catch (err) {
      sendResponse({ ok: false, error: 'Cannot resolve active tab' });
      return;
    }
  }

  // Clear existing cache
  tabStore.delete(tabId);
  setBadgeState(tabId, 'scanning');

  triggerScanOnTab(tabId);
  sendResponse({ ok: true, tabId });
}

// ── Trigger content script scan via scripting API ────────────
async function triggerScanOnTab(tabId) {
  try {
    // Mark as scanning
    const entry = tabStore.get(tabId) ?? { resources: [], scannedAt: null };
    entry.scanning = true;
    tabStore.set(tabId, entry);
    setBadgeState(tabId, 'scanning');

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content_script.bundle.js'],
    });

    log.debug(`Scan triggered on tab ${tabId}`);
  } catch (err) {
    log.error(`Failed to inject content script on tab ${tabId}:`, err.message);
    setBadgeState(tabId, 'error');
  }
}

// ── Handler: single download ──────────────────────────────────
async function handleDownload(payload, sendResponse) {
  const { url, filename, saveAs } = payload;

  if (!url) {
    sendResponse({ ok: false, error: 'No URL provided' });
    return;
  }

  try {
    let downloadUrl = url;
    let targetFilename = filename || extractFilenameFromUrl(url);

    // 1. Sketchfab 3D Asset Package (Model + Textures + Materials ZIP)
    const sfMatch = url.match(/(?:sketchfab\.com\/(?:[a-z0-9_-]+\/)*?(?:3d-models\/[a-z0-9_-]+-|models\/|i\/models\/)|models\/)([0-9a-f]{32})/i) ||
                    (url.includes('sketchfab.com') ? url.match(/([0-9a-f]{32})/i) : null);
    if (sfMatch && sfMatch[1]) {
      const uid = sfMatch[1];
      try {
        let capturedObjMesh = bgCached3DMesh && bgCached3DMesh.objData ? bgCached3DMesh.objData : null;
        if (!capturedObjMesh) {
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0] && tabs[0].id) {
              const tabRes = await chrome.tabs.sendMessage(tabs[0].id, { type: 'DF_GET_CACHED_OBJ' });
              if (tabRes && tabRes.objData) {
                capturedObjMesh = tabRes.objData;
              }
            }
          } catch (e) {}
        }

        const bundle = await bundleSketchfabModelPackage(uid, filename, capturedObjMesh);
        if (bundle.officialUrl) {
          downloadUrl = bundle.officialUrl;
          targetFilename = bundle.filename;
        } else if (bundle.zipBytes) {
          downloadUrl = uint8ArrayToDataUrl(bundle.zipBytes, 'application/zip');
          targetFilename = bundle.filename;
        }
      } catch (e) {
        log.warn('Sketchfab bundle resolution note:', e.message);
      }
    }

    // 2. Poly Haven 3D Asset Package (Model + Textures ZIP)
    if (url.includes('polyhaven.com/a/')) {
      const polyMatch = url.match(/polyhaven\.com\/a\/([a-zA-Z0-9_-]+)/i);
      if (polyMatch && polyMatch[1]) {
        try {
          const bundle = await bundlePolyHavenModelPackage(polyMatch[1], filename);
          if (bundle.zipBytes) {
            downloadUrl = uint8ArrayToDataUrl(bundle.zipBytes, 'application/zip');
            targetFilename = bundle.filename;
          }
        } catch (e) {
          log.warn('Poly Haven bundle resolution note:', e.message);
        }
      }
    }

    // 3. CGTrader direct download resolution or GPU WebGL Rip Package
    if (url.includes('cgtrader.com/')) {
      if (url.includes('/3d-models/') && !url.match(/\.(glb|gltf|zip|obj|stl|fbx|blend)(\?|$)/i)) {
        let cgtResolved = false;
        try {
          const res = await fetch(url, { credentials: 'include' });
          if (res.ok) {
            const html = await res.text();
            const dlMatch = html.match(/href="([^"]*(?:\/download|download-locations)[^"]*)"/i);
            if (dlMatch) {
              downloadUrl = new URL(dlMatch[1], 'https://www.cgtrader.com').href;
              targetFilename = (filename || 'cgtrader_model').replace(/\.[^/.]+$/, '') + '.zip';
              cgtResolved = true;
            }
          }
        } catch (e) {
          log.warn('CGTrader download resolution note:', e.message);
        }

        if (!cgtResolved) {
          let capturedObj = bgCached3DMesh && bgCached3DMesh.objData ? bgCached3DMesh.objData : null;
          if (!capturedObj) {
            try {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              if (tabs && tabs[0] && tabs[0].id) {
                const tabRes = await chrome.tabs.sendMessage(tabs[0].id, { type: 'DF_GET_CACHED_OBJ' });
                if (tabRes && tabRes.objData) capturedObj = tabRes.objData;
              }
            } catch (e) {}
          }

          const zipBytes = bundleGenericModelPackage(filename || 'cgtrader_model', capturedObj);
          downloadUrl = uint8ArrayToDataUrl(zipBytes, 'application/zip');
          targetFilename = `${(filename || 'cgtrader_model').replace(/\.[^/.]+$/, '')}_CGTrader_Package.zip`;
        }
      }
    }

    // 4. TurboSquid 3D Asset Package (Hardware GPU Mesh + Textures ZIP)
    if (url.includes('turbosquid.com/')) {
      if (url.includes('/3d-models/') && !url.match(/\.(glb|gltf|zip|obj|stl|fbx|blend)(\?|$)/i)) {
        let capturedObj = bgCached3DMesh && bgCached3DMesh.objData ? bgCached3DMesh.objData : null;
        if (!capturedObj) {
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0] && tabs[0].id) {
              const tabRes = await chrome.tabs.sendMessage(tabs[0].id, { type: 'DF_GET_CACHED_OBJ' });
              if (tabRes && tabRes.objData) capturedObj = tabRes.objData;
            }
          } catch (e) {}
        }

        const zipBytes = bundleGenericModelPackage(filename || 'turbosquid_model', capturedObj);
        downloadUrl = uint8ArrayToDataUrl(zipBytes, 'application/zip');
        targetFilename = `${(filename || 'turbosquid_model').replace(/\.[^/.]+$/, '')}_TurboSquid_Package.zip`;
      }
    }

    // Universal Safety Guard: Never download raw web page URLs as 3D model files
    if (url.startsWith('http') && !downloadUrl.match(/\.(glb|gltf|zip|obj|stl|fbx|blend|3mf|step|stp|iges|binz|osgjs|splat|ply|usdz|splinecode)(\?|$)/i)) {
      if (url.includes('/3d-models/') || url.includes('/3d-model/') || url.includes('/models/')) {
        let capturedObj = bgCached3DMesh && bgCached3DMesh.objData ? bgCached3DMesh.objData : null;
        if (!capturedObj) {
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0] && tabs[0].id) {
              const tabRes = await chrome.tabs.sendMessage(tabs[0].id, { type: 'DF_GET_CACHED_OBJ' });
              if (tabRes && tabRes.objData) capturedObj = tabRes.objData;
            }
          } catch (e) {}
        }

        const zipBytes = bundleGenericModelPackage(filename || '3d_model', capturedObj);
        downloadUrl = uint8ArrayToDataUrl(zipBytes, 'application/zip');
        targetFilename = `${(filename || '3d_model').replace(/\.[^/.]+$/, '')}_3D_Package.zip`;
      }
    }

    const settings = await StorageService.getSettings();

    const downloadId = await chrome.downloads.download({
      url: downloadUrl,
      filename: targetFilename || undefined,
      saveAs: saveAs ?? settings.defaultSaveAs ?? false,
      conflictAction: 'uniquify',
    });

    log.info(`Download started: id=${downloadId} url=${downloadUrl}`);

    // Save to history
    await StorageService.addToHistory({
      url,
      filename: filename || extractFilenameFromUrl(url),
      downloadId,
      startedAt: Date.now(),
      status: 'started',
    });

    sendResponse({ ok: true, downloadId });
  } catch (err) {
    log.error('Download failed:', err.message);
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Handler: batch download ───────────────────────────────────
async function handleBatchDownload(payload, sendResponse) {
  const { items = [] } = payload;

  if (!items.length) {
    sendResponse({ ok: false, error: 'No items provided' });
    return;
  }

  // Safety cap
  const capped = items.slice(0, LIMITS.MAX_BATCH_DOWNLOAD);
  const results = [];

  for (const item of capped) {
    try {
      const downloadId = await chrome.downloads.download({
        url: item.url,
        filename: item.filename || undefined,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      results.push({ url: item.url, downloadId, ok: true });

      // Small delay between batch items to avoid hammering
      await sleep(120);
    } catch (err) {
      log.warn(`Batch item failed: ${item.url} — ${err.message}`);
      results.push({ url: item.url, ok: false, error: err.message });
    }
  }

  const failedCount = results.filter(r => !r.ok).length;
  await StorageService.addBatchToHistory(results);
  sendResponse({ ok: failedCount === 0, count: results.length, failedCount, results });
}

// ── Badge helpers ─────────────────────────────────────────────
function setBadgeState(tabId, state, count = 0) {
  let text  = '';
  let color = BADGE.COLOR_NONE;

  switch (state) {
    case 'active':
      text  = count > 99 ? '99+' : String(count);
      color = BADGE.COLOR_ACTIVE;
      break;
    case 'scanning':
      text  = '…';
      color = BADGE.COLOR_SCANNING;
      break;
    case 'error':
      text  = '!';
      color = BADGE.COLOR_ERROR;
      break;
    case 'none':
    default:
      text  = '';
      color = BADGE.COLOR_NONE;
      break;
  }

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// ── Keyboard command handler ──────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'rescan-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      log.debug(`Keyboard rescan triggered on tab ${tab.id}`);
      handleRescan(tab.id, () => {});
    }
  }
});

// ── Download state change tracking ───────────────────────────
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state) {
    const { current } = delta.state;
    if (current === 'complete' || current === 'interrupted') {
      await StorageService.updateHistoryItem(delta.id, { status: current });
      log.debug(`Download ${delta.id} → ${current}`);
    }
  }
});

// ── Utils ─────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractFilenameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    return parts[parts.length - 1] || 'download';
  } catch {
    return 'download';
  }
}

log.info(`DownloadForge service worker loaded — v${APP.VERSION} by ${APP.COMPANY}`);
