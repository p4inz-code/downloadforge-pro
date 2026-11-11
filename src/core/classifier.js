// ============================================================
// DownloadForge — core/classifier.js
// P4inz Interactive Labs | p4inz
// ============================================================

import { EXT_MAP, MIME_MAP, CATEGORY } from '../shared/constants.js';

/**
 * Infer the category of a resource from URL, MIME, and extension.
 * Priority: MIME > extension > URL pattern > UNKNOWN
 */
export function inferCategory(url, mimeType, ext) {
  // 1. MIME type is most reliable
  if (mimeType) {
    const base = mimeType.split(';')[0].trim().toLowerCase();
    if (MIME_MAP[base]) return MIME_MAP[base];
    if (base.startsWith('video/'))       return CATEGORY.VIDEO;
    if (base.startsWith('audio/'))       return CATEGORY.AUDIO;
    if (base.startsWith('image/'))       return CATEGORY.IMAGE;
    if (base.startsWith('model/'))       return CATEGORY.MODEL_3D;
    if (base.startsWith('application/')) return CATEGORY.DOCUMENT;
  }

  // 2. File extension
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];

  // 3. URL pattern hints
  if (url) {
    const lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('.m3u') || lower.includes('.mpd')) return CATEGORY.STREAM;
    if (/\.(glb|gltf|obj|mtl|fbx|stl|usdz|splat|ply)(\?|$)/i.test(lower)) return CATEGORY.MODEL_3D;
    if (lower.includes('/video/') || lower.includes('video=')) return CATEGORY.VIDEO;
    if (lower.includes('/audio/') || lower.includes('audio=')) return CATEGORY.AUDIO;
  }

  return CATEGORY.UNKNOWN;
}

/**
 * Group an array of resources by category.
 * Returns: { [category]: ResourceItem[] }
 */
export function groupByCategory(resources) {
  return resources.reduce((acc, r) => {
    const cat = r.category || CATEGORY.UNKNOWN;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});
}

/**
 * Count resources by category.
 * Returns: { [category]: number }
 */
export function countByCategory(resources) {
  return resources.reduce((acc, r) => {
    const cat = r.category || CATEGORY.UNKNOWN;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
}
