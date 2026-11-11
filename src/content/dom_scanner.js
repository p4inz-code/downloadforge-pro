// ============================================================
// DownloadForge — content/dom_scanner.js
// P4inz Interactive Labs | p4inz
//
// DOM Scanner — runs inside the page context.
// Responsible for extracting all downloadable resource URLs
// from the live DOM. Does NOT modify the page in any way.
//
// Detection sources covered:
//   1. <a href> anchor tags with downloadable extensions
//   2. <video>, <audio>, <source> media elements
//   3. <img> tags
//   4. <link> tags (stylesheets excluded, assets included)
//   5. <embed> and <object> tags
//   6. Open graph / meta tags with media URLs
//
// Returns: ResourceItem[]
// ============================================================

import {
  EXT_MAP, MIME_MAP, CATEGORY, SOURCE, STATUS,
  LIMITS, IGNORED_DOMAINS, DEFAULT_SETTINGS
} from '../shared/constants.js';

import { extractExtension, extractFilename, isValidUrl, normalizeUrl } from '../utils/url.js';
import { inferCategory } from '../core/classifier.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Run a full DOM scan on the current document.
 * @param {object} options
 * @param {boolean} options.deduplicateUrls
 * @param {number}  options.minFileSizeBytes - skip tiny resources (size hint from DOM only)
 * @param {boolean} options.showImages
 * @returns {ResourceItem[]}
 */
export function scanDOM(options = {}) {
  const opts = { ...DEFAULT_SETTINGS, ...options };
  const startTime = performance.now();
  const seen = new Set();
  const results = [];

  const collectors = [
    collectAnchors,
    collectMediaElements,
    collectImgElements,
    collectSourceElements,
    collectEmbedObjects,
    collect3DViewerElements,
    collectMetaTags,
    collectLinkTags,
  ];

  for (const collector of collectors) {
    try {
      const items = collector(document, opts);
      for (const item of items) {
        if (results.length >= LIMITS.MAX_RESOURCES_PER_SCAN) break;

        // Deduplicate
        if (opts.deduplicateUrls && seen.has(item.url)) {
          continue;
        }

        // Skip ignored domains
        if (isIgnoredDomain(item.url)) continue;

        // Skip images if disabled
        if (!opts.showImages && item.category === CATEGORY.IMAGE) continue;

        seen.add(item.url);
        results.push(item);
      }
    } catch (err) {
      // One collector failing should not kill the whole scan
      console.warn(`[DownloadForge] Collector ${collector.name} failed:`, err);
    }
  }

  const duration = Math.round(performance.now() - startTime);
  return { resources: results, scanDurationMs: duration };
}

// ─────────────────────────────────────────────────────────────
// Collectors
// ─────────────────────────────────────────────────────────────

/**
 * Collect downloadable <a href> links.
 * Includes anchors with known file extensions OR download attribute.
 */
function collectAnchors(doc, opts) {
  const items = [];
  const anchors = doc.querySelectorAll('a[href]');

  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

    const url = resolveUrl(href, doc);
    if (!url || !isValidUrl(url)) continue;

    const ext = extractExtension(url);
    const hasDownloadAttr = a.hasAttribute('download');
    const category = inferCategory(url, null, ext);

    // Include if: known downloadable extension OR explicit download attribute
    if (!EXT_MAP[ext] && !hasDownloadAttr) continue;
    if (category === CATEGORY.IMAGE && !opts.showImages) continue;

    items.push(buildResource({
      url,
      category,
      ext,
      filename: a.getAttribute('download') || extractFilename(url) || a.textContent.trim().slice(0, 80) || null,
      source: SOURCE.DOM_ANCHOR,
      mimeType: null,
      status: STATUS.DOWNLOADABLE,
      label: a.textContent.trim().slice(0, 120) || null,
    }));
  }

  return items;
}

/**
 * Collect <video> and <audio> elements and their nested <source> children.
 */
function collectMediaElements(doc) {
  const items = [];

  const mediaEls = doc.querySelectorAll('video, audio');
  for (const el of mediaEls) {
    // Direct src attribute
    if (el.src && el.src !== window.location.href) {
      const url = el.src;
      if (isValidUrl(url)) {
        const ext = extractExtension(url);
        const tag = el.tagName.toLowerCase();
        items.push(buildResource({
          url,
          category: tag === 'video' ? CATEGORY.VIDEO : CATEGORY.AUDIO,
          ext,
          filename: extractFilename(url),
          mimeType: el.type || null,
          source: SOURCE.DOM_MEDIA,
          status: STATUS.DOWNLOADABLE,
          // Capture rough duration/dimensions if available
          meta: extractMediaMeta(el),
        }));
      }
    }

    // currentSrc — what the browser actually resolved
    if (el.currentSrc && el.currentSrc !== el.src && el.currentSrc !== window.location.href) {
      const url = el.currentSrc;
      if (isValidUrl(url)) {
        const ext = extractExtension(url);
        const tag = el.tagName.toLowerCase();
        items.push(buildResource({
          url,
          category: tag === 'video' ? CATEGORY.VIDEO : CATEGORY.AUDIO,
          ext,
          filename: extractFilename(url),
          mimeType: null,
          source: SOURCE.DOM_MEDIA,
          status: STATUS.DOWNLOADABLE,
          meta: extractMediaMeta(el),
        }));
      }
    }
  }

  return items;
}

/**
 * Collect <source> elements (inside <video>/<audio>/<picture>).
 */
function collectSourceElements(doc) {
  const items = [];
  const sources = doc.querySelectorAll('source[src]');

  for (const s of sources) {
    const src = s.getAttribute('src');
    if (!src) continue;

    const url = resolveUrl(src, doc);
    if (!url || !isValidUrl(url)) continue;

    const mimeType = s.type || null;
    const ext = extractExtension(url);
    const category = inferCategory(url, mimeType, ext);

    // Detect HLS / DASH manifests
    const isStream = ext === 'm3u8' || ext === 'm3u' || ext === 'mpd' ||
      mimeType === 'application/x-mpegURL' ||
      mimeType === 'application/vnd.apple.mpegurl' ||
      mimeType === 'application/dash+xml';

    items.push(buildResource({
      url,
      category: isStream ? CATEGORY.STREAM : category,
      ext,
      filename: extractFilename(url),
      mimeType,
      source: SOURCE.DOM_MEDIA,
      status: isStream ? STATUS.STREAM : STATUS.DOWNLOADABLE,
    }));
  }

  return items;
}

/**
 * Collect <img> elements. Only non-tiny images.
 */
function collectImgElements(doc, opts) {
  const items = [];
  const imgs = doc.querySelectorAll('img[src]');

  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) continue;

    const url = resolveUrl(src, doc);
    if (!url || !isValidUrl(url)) continue;

    // Skip tiny tracking pixels / icons
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w > 0 && h > 0 && (w < 8 || h < 8)) continue;

    const ext = extractExtension(url);
    if (ext && !EXT_MAP[ext]) continue; // not a known image ext

    items.push(buildResource({
      url,
      category: CATEGORY.IMAGE,
      ext,
      filename: img.alt?.trim().slice(0, 80) || extractFilename(url),
      mimeType: null,
      source: SOURCE.DOM_IMG,
      status: STATUS.DOWNLOADABLE,
      meta: { width: w || null, height: h || null, alt: img.alt || null },
    }));
  }

  return items;
}

/**
 * Collect <embed> and <object> tags.
 */
function collectEmbedObjects(doc) {
  const items = [];

  // <embed src="...">
  for (const el of doc.querySelectorAll('embed[src]')) {
    const src = el.getAttribute('src');
    const url = resolveUrl(src, doc);
    if (!url || !isValidUrl(url)) continue;

    const ext = extractExtension(url);
    const mimeType = el.type || null;
    const category = inferCategory(url, mimeType, ext);
    if (!EXT_MAP[ext] && !mimeType) continue;

    items.push(buildResource({ url, category, ext, filename: extractFilename(url), mimeType, source: SOURCE.DOM_EMBED, status: STATUS.DOWNLOADABLE }));
  }

  // <object data="...">
  for (const el of doc.querySelectorAll('object[data]')) {
    const data = el.getAttribute('data');
    const url = resolveUrl(data, doc);
    if (!url || !isValidUrl(url)) continue;

    const ext = extractExtension(url);
    const mimeType = el.type || null;
    const category = inferCategory(url, mimeType, ext);
    if (!EXT_MAP[ext] && !mimeType) continue;

    items.push(buildResource({ url, category, ext, filename: extractFilename(url), mimeType, source: SOURCE.DOM_EMBED, status: STATUS.DOWNLOADABLE }));
  }

  return items;
}

/**
 * Collect 3D Web Viewers (<model-viewer>, <spline-viewer>, Sketchfab, Thingiverse, WebGL).
 */
function collect3DViewerElements(doc) {
  const items = [];

  // 1. Standard HTML5 3D Web Components
  const viewers = doc.querySelectorAll('model-viewer, spline-viewer');
  for (const el of viewers) {
    const src = el.getAttribute('src') || el.src || el.getAttribute('url');
    const url = resolveUrl(src, doc);
    if (url && isValidUrl(url)) {
      const ext = extractExtension(url) || 'glb';
      items.push(buildResource({
        url,
        category: CATEGORY.MODEL_3D,
        ext,
        filename: extractFilename(url) || `model_${Date.now()}.${ext}`,
        mimeType: ext === 'glb' ? 'model/gltf-binary' : (ext === 'gltf' ? 'model/gltf+json' : null),
        source: SOURCE.DOM_EMBED,
        title: el.getAttribute('alt') || extractFilename(url) || '3D Model',
        status: STATUS.DOWNLOADABLE,
      }));
    }

    const iosSrc = el.getAttribute('ios-src');
    const iosUrl = resolveUrl(iosSrc, doc);
    if (iosUrl && isValidUrl(iosUrl)) {
      items.push(buildResource({
        url: iosUrl,
        category: CATEGORY.MODEL_3D,
        ext: 'usdz',
        filename: extractFilename(iosUrl) || `model_${Date.now()}.usdz`,
        mimeType: 'model/vnd.usdz+zip',
        source: SOURCE.DOM_EMBED,
        title: (el.getAttribute('alt') || '3D Model') + ' (USDZ)',
        status: STATUS.DOWNLOADABLE,
      }));
    }
  }

  // 2. Sketchfab In-Page Model & Embed Scanner
  try {
    const loc = window.location.href;
    const sfMatch = loc.match(/(?:3d-models\/.*-|models\/)([0-9a-f]{32})/i);
    if (sfMatch) {
      const uid = sfMatch[1];
      const title = (doc.title || 'Sketchfab 3D Model').replace(/\s*-\s*(?:3D\s*model\s*by.*|Sketchfab).*$/i, '').trim();
      items.push(buildResource({
        url: `https://sketchfab.com/i/models/${uid}`,
        category: CATEGORY.MODEL_3D,
        ext: 'glb',
        filename: `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sketchfab_model'}.glb`,
        mimeType: 'model/gltf+json',
        source: SOURCE.DOM_EMBED,
        title: title || 'Sketchfab 3D Model',
        status: STATUS.DOWNLOADABLE,
      }));
    }

    // Embed iframes on other pages
    const sfFrames = doc.querySelectorAll('iframe[src*="sketchfab.com"]');
    for (const frame of sfFrames) {
      const src = frame.src || frame.getAttribute('src');
      const m = src ? src.match(/models\/([0-9a-f]{32})/i) : null;
      if (m) {
        items.push(buildResource({
          url: `https://sketchfab.com/i/models/${m[1]}`,
          category: CATEGORY.MODEL_3D,
          ext: 'glb',
          filename: `sketchfab_${m[1].slice(0, 8)}.glb`,
          mimeType: 'model/gltf+json',
          source: SOURCE.DOM_EMBED,
          title: frame.getAttribute('title') || 'Embedded Sketchfab Model',
          status: STATUS.DOWNLOADABLE,
        }));
      }
    }
  } catch (e) {}

  return items;
}

/**
 * Collect Open Graph and Twitter Card meta tags with media URLs.
 */
function collectMetaTags(doc) {
  const items = [];
  const metaSelectors = [
    'meta[property="og:video"][content]',
    'meta[property="og:video:url"][content]',
    'meta[property="og:audio"][content]',
    'meta[property="og:image"][content]',
    'meta[name="twitter:image"][content]',
    'meta[name="twitter:player:stream"][content]',
  ];

  for (const sel of metaSelectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;

    const content = el.getAttribute('content');
    if (!content) continue;

    const url = resolveUrl(content, doc);
    if (!url || !isValidUrl(url)) continue;

    const ext = extractExtension(url);
    const category = inferCategory(url, null, ext);

    items.push(buildResource({
      url,
      category,
      ext,
      filename: extractFilename(url),
      mimeType: null,
      source: SOURCE.DOM_LINK,
      status: STATUS.DOWNLOADABLE,
      label: el.getAttribute('property') || el.getAttribute('name') || null,
    }));
  }

  return items;
}

/**
 * Collect <link> tags pointing to downloadable assets (not stylesheets/scripts).
 */
function collectLinkTags(doc) {
  const items = [];
  const skipRels = new Set(['stylesheet', 'preload', 'prefetch', 'modulepreload', 'icon', 'shortcut icon', 'apple-touch-icon', 'canonical', 'alternate', 'manifest']);

  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.rel || '').toLowerCase().trim();
    if (skipRels.has(rel)) continue;

    const href = link.getAttribute('href');
    if (!href) continue;

    const url = resolveUrl(href, doc);
    if (!url || !isValidUrl(url)) continue;

    const ext = extractExtension(url);
    if (!EXT_MAP[ext]) continue; // only known downloadable types

    const category = inferCategory(url, null, ext);
    items.push(buildResource({ url, category, ext, filename: extractFilename(url), mimeType: null, source: SOURCE.DOM_LINK, status: STATUS.DOWNLOADABLE }));
  }

  return items;
}

// ─────────────────────────────────────────────────────────────
// Resource builder — normalizes all fields
// ─────────────────────────────────────────────────────────────

let _idCounter = 0;

function buildResource({
  url,
  category   = CATEGORY.UNKNOWN,
  ext        = '',
  filename   = null,
  mimeType   = null,
  source     = SOURCE.DOM_ANCHOR,
  status     = STATUS.DOWNLOADABLE,
  meta       = {},
  label      = null,
}) {
  const normalizedUrl = normalizeUrl(url);

  return {
    id:          `df_${Date.now()}_${_idCounter++}`,
    url:         normalizedUrl,
    category,
    ext:         ext?.toLowerCase() || '',
    filename:    sanitizeFilename(filename) || guessFilename(normalizedUrl, ext),
    mimeType:    mimeType || null,
    source,
    status,
    pageUrl:     window.location.href,
    domain:      extractDomain(normalizedUrl),
    detectedAt:  Date.now(),
    fileSize:    null,   // populated by metadata.js fetch if needed
    meta,
    label,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function resolveUrl(href, doc) {
  if (!href) return null;
  try {
    // Use document.baseURI for proper relative resolution
    return new URL(href, doc.baseURI).href;
  } catch {
    return null;
  }
}

function isIgnoredDomain(url) {
  try {
    const host = new URL(url).hostname;
    for (const d of IGNORED_DOMAINS) {
      if (host.includes(d)) return true;
    }
  } catch {}
  return false;
}

function extractMediaMeta(el) {
  const meta = {};
  if (el.duration && isFinite(el.duration)) meta.duration = Math.round(el.duration);
  if (el.videoWidth) meta.width = el.videoWidth;
  if (el.videoHeight) meta.height = el.videoHeight;
  return meta;
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function guessFilename(url, ext) {
  const name = extractFilename(url);
  if (name) return name;
  return ext ? `resource.${ext}` : 'resource';
}

function sanitizeFilename(name) {
  if (!name) return null;
  // Remove illegal filename chars, trim whitespace
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 200) || null;
}
