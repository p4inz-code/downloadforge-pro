// ============================================================
// DownloadForge — core/hls_parser.js
// ObsidianLabs | p4inz
//
// HLS / M3U8 manifest parser.
// IMPORTANT CONSTRAINTS:
//   - Only parses openly accessible, non-DRM streams
//   - Does NOT bypass DRM, encryption, or authentication
//   - If DRM/encryption detected → marks as PROTECTED, blocks download
//   - Companion app handles actual HLS download/mux
// ============================================================

import { LIMITS } from '../shared/constants.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('HLSParser');

/**
 * Fetch and parse an m3u8 manifest URL.
 * Returns structured playlist info.
 *
 * @param {string} url
 * @returns {Promise<HLSParseResult>}
 */
export async function parseHLSManifest(url) {
  const result = {
    url,
    type: null,          // 'master' | 'media'
    isProtected: false,
    variants: [],        // master playlist variants
    segments: [],        // media playlist segments
    duration: null,
    targetDuration: null,
    error: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIMITS.FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const text = await response.text();
    return parseM3U8Text(text, url, result);

  } catch (err) {
    result.error = err.name === 'AbortError' ? 'Timeout' : err.message;
    log.warn(`HLS parse failed for ${url}:`, err.message);
    return result;
  }
}

// ─────────────────────────────────────────────────────────────
// M3U8 text parser
// ─────────────────────────────────────────────────────────────

function parseM3U8Text(text, baseUrl, result) {
  if (!text.trim().startsWith('#EXTM3U')) {
    result.error = 'Not a valid M3U8 file';
    return result;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // DRM detection — only block proprietary DRM (FairPlay, Widevine, PlayReady)
  const trueDrmIndicators = ['URI="skd://', 'KEYFORMAT="com.apple.streamingkeydelivery"', 'KEYFORMAT="urn:uuid:edef8ba9', 'KEYFORMAT="com.widevine', 'KEYFORMAT="com.microsoft.playready'];
  for (const line of lines) {
    for (const indicator of trueDrmIndicators) {
      if (line.includes(indicator)) {
        result.isProtected = true;
        result.error = 'Stream is protected by proprietary DRM (Widevine/FairPlay/PlayReady) — download not supported';
        log.warn(`Proprietary DRM detected in manifest: ${baseUrl}`);
        return result;
      }
    }
  }

  // Detect master vs media playlist
  const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));
  result.type = isMaster ? 'master' : 'media';

  if (isMaster) {
    parseMasterPlaylist(lines, baseUrl, result);
  } else {
    parseMediaPlaylist(lines, baseUrl, result);
  }

  return result;
}

function parseMasterPlaylist(lines, baseUrl, result) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const attrs = parseAttributes(line.replace('#EXT-X-STREAM-INF:', ''));
    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.startsWith('#')) continue;

    const variantUrl = resolveUrl(nextLine, baseUrl);
    if (!variantUrl) continue;

    result.variants.push({
      url: variantUrl,
      bandwidth: parseInt(attrs.BANDWIDTH || '0', 10),
      resolution: attrs.RESOLUTION || null,
      codecs: attrs.CODECS || null,
      frameRate: parseFloat(attrs['FRAME-RATE'] || '0') || null,
      label: attrs.RESOLUTION || `${Math.round(parseInt(attrs.BANDWIDTH||'0',10)/1000)}k`,
    });
  }

  // Sort variants best quality first
  result.variants.sort((a, b) => b.bandwidth - a.bandwidth);
}

function parseMediaPlaylist(lines, baseUrl, result) {
  let totalDuration = 0;
  let segDuration = 0;
  let currentKey = null;
  let initMap = null;
  let sequence = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      sequence = parseInt(line.split(':')[1], 10) || 0;
    }
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      result.targetDuration = parseFloat(line.split(':')[1]) || null;
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributes(line.replace('#EXT-X-MAP:', ''));
      if (attrs.URI) {
        initMap = { url: resolveUrl(attrs.URI, baseUrl) };
      }
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.replace('#EXT-X-KEY:', ''));
      if (attrs.METHOD && attrs.METHOD !== 'NONE') {
        currentKey = {
          method: attrs.METHOD,
          uri: attrs.URI ? resolveUrl(attrs.URI, baseUrl) : null,
          iv: attrs.IV || null,
          keyformat: attrs.KEYFORMAT || 'identity',
        };
      } else {
        currentKey = null;
      }
    }
    if (line.startsWith('#EXTINF:')) {
      segDuration = parseFloat(line.split(':')[1].split(',')[0]) || 0;
    }
    if (!line.startsWith('#') && line.length > 0) {
      const segUrl = resolveUrl(line, baseUrl);
      if (segUrl) {
        result.segments.push({
          url: segUrl,
          duration: segDuration,
          key: currentKey ? { ...currentKey } : null,
          initMap: initMap ? { ...initMap } : null,
          sequence: sequence++,
        });
        totalDuration += segDuration;
        segDuration = 0;
      }
    }
  }

  result.duration = totalDuration > 0 ? Math.round(totalDuration) : null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseAttributes(str) {
  const attrs = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]] = match[3] !== undefined ? match[3] : match[4];
  }
  return attrs;
}

function resolveUrl(path, baseUrl) {
  if (!path) return null;
  try {
    if (path.startsWith('http')) return path;
    return new URL(path, baseUrl).href;
  } catch {
    return null;
  }
}
