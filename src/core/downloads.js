// ============================================================
// DownloadForge — core/downloads.js
// ObsidianLabs | p4inz
//
// Download manager layer.
// Wraps chrome.downloads API with:
//   - Filename sanitization
//   - Conflict handling
//   - History recording
//   - Batch download with safety controls
// ============================================================

import { StorageService } from '../storage/storage.js';
import { LIMITS } from '../shared/constants.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('Downloads');

/**
 * Initiate a single download.
 */
export async function downloadResource(item, options = {}) {
  const { saveAs = false } = options;

  if (!item?.url) throw new Error('No URL provided');

  const filename = sanitizeFilename(item.filename) || undefined;

  try {
    const downloadId = await chrome.downloads.download({
      url: item.url,
      filename,
      saveAs,
      conflictAction: 'uniquify',
    });

    await StorageService.addToHistory({
      url: item.url,
      filename: filename || extractFilename(item.url),
      category: item.category,
      downloadId,
      startedAt: Date.now(),
      status: 'started',
    });

    log.info(`Download started: id=${downloadId}`);
    return { ok: true, downloadId };
  } catch (err) {
    log.error('Download failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Batch download with safety cap and delay.
 */
export async function downloadBatch(items) {
  const capped = items.slice(0, LIMITS.MAX_BATCH_DOWNLOAD);
  const results = [];

  for (const item of capped) {
    const result = await downloadResource(item);
    results.push({ url: item.url, ...result });
    await sleep(100);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  if (!name) return null;
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 200) || null;
}

function extractFilename(url) {
  try {
    const parts = new URL(url).pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || 'download');
  } catch { return 'download'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
