// ============================================================
// DownloadForge — core/metadata.js
// P4inz Interactive Labs | p4inz
//
// Fetches real file metadata (size, mime type, filename) via
// HTTP HEAD requests. Only runs for resources where size is
// unknown. Never fetches full file content — HEAD only.
//
// Browser constraint: fetch() in content scripts is subject
// to CORS. For cross-origin resources, HEAD may be blocked.
// We handle this gracefully and fall back to null.
// ============================================================

import { LIMITS } from '../shared/constants.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('Metadata');

/**
 * Attempt to fetch metadata for a single resource URL.
 * Returns partial metadata — missing fields stay null.
 *
 * @param {string} url
 * @returns {Promise<{ fileSize: number|null, mimeType: string|null, filename: string|null }>}
 */
export async function fetchResourceMetadata(url) {
  const result = { fileSize: null, mimeType: null, filename: null };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIMITS.FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      credentials: 'omit',    // no cookies — privacy-safe
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.debug(`HEAD ${url} → ${response.status}`);
      return result;
    }

    // Content-Length → file size
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > 0) result.fileSize = size;
    }

    // Content-Type → mime type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      result.mimeType = contentType.split(';')[0].trim();
    }

    // Content-Disposition → real filename
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      result.filename = parseFilenameFromDisposition(disposition);
    }

  } catch (err) {
    // CORS, network error, abort — all silent
    if (err.name !== 'AbortError') {
      log.debug(`HEAD fetch failed for ${url}:`, err.message);
    }
  }

  return result;
}

/**
 * Enrich an array of resources with metadata.
 * Only fetches for resources missing size.
 * Respects a concurrency limit to avoid hammering servers.
 *
 * @param {ResourceItem[]} resources
 * @param {number} concurrency
 * @returns {Promise<ResourceItem[]>}
 */
export async function enrichResourcesWithMetadata(resources, concurrency = 3) {
  const needsMeta = resources.filter(r => r.fileSize === null);
  if (needsMeta.length === 0) return resources;

  const results = new Map();

  // Process in chunks
  for (let i = 0; i < needsMeta.length; i += concurrency) {
    const chunk = needsMeta.slice(i, i + concurrency);
    const fetches = chunk.map(async (r) => {
      const meta = await fetchResourceMetadata(r.url);
      results.set(r.id, meta);
    });
    await Promise.allSettled(fetches);
  }

  // Merge metadata into resources
  return resources.map(r => {
    const meta = results.get(r.id);
    if (!meta) return r;
    return {
      ...r,
      fileSize: meta.fileSize ?? r.fileSize,
      mimeType: meta.mimeType ?? r.mimeType,
      filename: meta.filename ?? r.filename,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Parse filename from Content-Disposition header.
 * Handles both filename= and filename*=UTF-8'' forms.
 */
function parseFilenameFromDisposition(header) {
  if (!header) return null;

  // RFC 5987 extended notation: filename*=UTF-8''encoded-name
  const extMatch = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extMatch) {
    try { return decodeURIComponent(extMatch[1]).trim(); } catch {}
  }

  // Standard: filename="name.ext" or filename=name.ext
  const stdMatch = header.match(/filename\s*=\s*"?([^";\n]+)"?/i);
  if (stdMatch) {
    return stdMatch[1].trim().replace(/^["']|["']$/g, '') || null;
  }

  return null;
}
