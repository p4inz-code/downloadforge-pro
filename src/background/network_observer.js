// ============================================================
// DownloadForge — background/network_observer.js
// P4inz Interactive Labs | p4inz
//
// Optional network observer — only active when the user has
// granted the optional webRequest + <all_urls> permissions.
//
// Observes network responses for downloadable resource URLs
// that the DOM scanner may have missed (e.g. dynamically
// loaded media, XHR-fetched files, HLS manifests).
//
// IMPORTANT:
//   - Never reads response bodies — headers only
//   - Never blocks requests — observe only
//   - Respects user privacy — no logging of non-media URLs
//   - Only active on tabs the user is browsing
// ============================================================

import { EXT_MAP, MIME_MAP, CATEGORY, SOURCE, STATUS } from '../shared/constants.js';
import { addNetworkResource, clearNetworkCache } from '../core/detector.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('NetworkObserver');

let _active = false;

// ─────────────────────────────────────────────────────────────
// Start observing — call only after webRequest permission granted
// ─────────────────────────────────────────────────────────────
export function startNetworkObserver() {
  if (_active) return;
  _active = true;

  chrome.webRequest.onResponseStarted.addListener(
    handleResponse,
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );

  log.info('Network observer active');
}

export function stopNetworkObserver() {
  if (!_active) return;
  _active = false;

  try {
    chrome.webRequest.onResponseStarted.removeListener(handleResponse);
    log.info('Network observer stopped');
  } catch (err) {
    log.warn('Failed to remove listener:', err.message);
  }
}

export function isObserverActive() {
  return _active;
}

// ─────────────────────────────────────────────────────────────
// Response handler
// ─────────────────────────────────────────────────────────────
function handleResponse(details) {
  const { url, tabId, responseHeaders, statusCode, type } = details;

  // Only care about successful responses on real tabs
  if (tabId < 0) return;
  if (statusCode < 200 || statusCode >= 300) return;

  // Skip non-media request types that we don't care about
  const skipTypes = new Set(['stylesheet', 'script', 'font', 'ping', 'csp_report', 'other']);
  if (skipTypes.has(type)) return;

  // Skip extension pages
  if (url.startsWith('chrome-extension://') || url.startsWith('chrome://')) return;

  const headers = parseHeaders(responseHeaders || []);
  const mimeType  = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const disposition = headers['content-disposition'] || '';

  // Determine if this response is downloadable
  const category = inferCategoryFromNetwork(url, mimeType, disposition);
  if (!category) return;

  // Extract filename from Content-Disposition or URL
  const filename = parseFilenameFromDisposition(disposition) || extractFilenameFromUrl(url);

  // Get file size if available
  const contentLength = parseInt(headers['content-length'] || '0', 10);
  const fileSize = contentLength > 0 ? contentLength : null;

  const resource = {
    id:         `net_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url,
    category,
    ext:        extractExtension(url),
    filename,
    mimeType:   mimeType || null,
    source:     SOURCE.NETWORK,
    status:     STATUS.DOWNLOADABLE,
    pageUrl:    null,   // will be resolved by detector
    domain:     extractDomain(url),
    detectedAt: Date.now(),
    fileSize,
    meta:       {},
    label:      null,
  };

  addNetworkResource(tabId, resource);
  log.debug(`Network resource: [${category}] ${url}`);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function inferCategoryFromNetwork(url, mimeType, disposition) {
  // Content-Disposition: attachment always means downloadable
  if (disposition && disposition.toLowerCase().includes('attachment')) {
    return inferCategoryFromMimeAndUrl(url, mimeType) || CATEGORY.OTHER;
  }

  // Check MIME type
  const cat = inferCategoryFromMimeAndUrl(url, mimeType);
  return cat;
}

function inferCategoryFromMimeAndUrl(url, mimeType) {
  // MIME first
  if (mimeType && MIME_MAP[mimeType]) return MIME_MAP[mimeType];

  // Broad MIME prefix
  if (mimeType) {
    if (mimeType.startsWith('video/'))       return CATEGORY.VIDEO;
    if (mimeType.startsWith('audio/'))       return CATEGORY.AUDIO;
    if (mimeType.startsWith('image/'))       return CATEGORY.IMAGE;
    if (mimeType === 'application/x-mpegurl' || mimeType === 'application/vnd.apple.mpegurl') return CATEGORY.STREAM;
    if (mimeType === 'application/dash+xml') return CATEGORY.STREAM;
  }

  // Extension fallback
  const ext = extractExtension(url);
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];

  return null; // not a recognized downloadable type
}

function parseHeaders(rawHeaders) {
  const map = {};
  for (const h of rawHeaders) {
    map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

function parseFilenameFromDisposition(header) {
  if (!header) return null;
  const extMatch = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extMatch) { try { return decodeURIComponent(extMatch[1]).trim(); } catch {} }
  const stdMatch = header.match(/filename\s*=\s*"?([^";\n]+)"?/i);
  if (stdMatch) return stdMatch[1].trim().replace(/^["']|["']$/g, '') || null;
  return null;
}

function extractExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts    = pathname.split('.');
    if (parts.length < 2) return '';
    const ext = parts[parts.length - 1].split('?')[0].toLowerCase();
    return ext.length <= 6 ? ext : '';
  } catch { return ''; }
}

function extractFilenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts    = pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || '').replace(/[?#].*$/, '').trim() || null;
  } catch { return null; }
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
