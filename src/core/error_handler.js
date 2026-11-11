// ============================================================
// DownloadForge Pro — core/error_handler.js
// P4inz Interactive Labs | p4inz
//
// Structured Error Taxonomy, Diagnostics & Self-Healing Engine
// Provides human-readable error analysis and automated recovery
// strategies for stream ingestion issues.
// ============================================================

export const ERROR_CODES = {
  ERR_HOTLINK_403:       'ERR_HOTLINK_403',
  ERR_CORS_BLOCKED:      'ERR_CORS_BLOCKED',
  ERR_CHUNK_404:         'ERR_CHUNK_404',
  ERR_LIVE_DESYNC:       'ERR_LIVE_DESYNC',
  ERR_DRM_PROTECTED:     'ERR_DRM_PROTECTED',
  ERR_STREAM_ABORT:      'ERR_STREAM_ABORT',
  ERR_TIMEOUT_CDN:       'ERR_TIMEOUT_CDN',
  ERR_CODEC_UNSUPPORTED: 'ERR_CODEC_UNSUPPORTED',
  ERR_UNKNOWN:           'ERR_UNKNOWN',
};

export const ERROR_METADATA = {
  [ERROR_CODES.ERR_HOTLINK_403]: {
    code: ERROR_CODES.ERR_HOTLINK_403,
    title: 'Hotlink / Anti-Leech Protection (403 Forbidden)',
    description: 'The media server rejected the chunk request because the Referer header or origin was missing or expired.',
    suggestedAction: 'Auto-injecting active page origin into network rules and retrying with spoofed headers.',
    canAutoHeal: true,
  },
  [ERROR_CODES.ERR_CORS_BLOCKED]: {
    code: ERROR_CODES.ERR_CORS_BLOCKED,
    title: 'Cross-Origin Resource Sharing (CORS) Blocked',
    description: 'The media CDN restricts direct browser client fetches from non-whitelisted origins.',
    suggestedAction: 'Routing segment fetch through privileged background extension channel.',
    canAutoHeal: true,
  },
  [ERROR_CODES.ERR_CHUNK_404]: {
    code: ERROR_CODES.ERR_CHUNK_404,
    title: 'Missing Media Segment (404 Not Found)',
    description: 'A media segment was not found on the CDN storage cluster.',
    suggestedAction: 'Skipping broken segment and interpolating duration to preserve remaining stream.',
    canAutoHeal: true,
  },
  [ERROR_CODES.ERR_LIVE_DESYNC]: {
    code: ERROR_CODES.ERR_LIVE_DESYNC,
    title: 'Live Stream Window Desynchronization',
    description: 'The broadcast sliding window advanced past the requested chunk before it was fetched.',
    suggestedAction: 'Resynchronizing sequence index to current live broadcast window.',
    canAutoHeal: true,
  },
  [ERROR_CODES.ERR_DRM_PROTECTED]: {
    code: ERROR_CODES.ERR_DRM_PROTECTED,
    title: 'Proprietary DRM Encryption Detected',
    description: 'Stream uses hardware CDM encryption (Widevine / PlayReady / FairPlay). Direct download is restricted.',
    suggestedAction: 'Use the floating In-Page Buffer Recorder HUD on the video player to capture the playback stream.',
    canAutoHeal: false,
    alternativeMode: 'record',
  },
  [ERROR_CODES.ERR_STREAM_ABORT]: {
    code: ERROR_CODES.ERR_STREAM_ABORT,
    title: 'Stream Ingestion Aborted',
    description: 'The download was stopped by user request or disk handle was closed.',
    suggestedAction: 'Partial stream has been safely finalized to prevent file corruption.',
    canAutoHeal: false,
  },
  [ERROR_CODES.ERR_TIMEOUT_CDN]: {
    code: ERROR_CODES.ERR_TIMEOUT_CDN,
    title: 'CDN Connection Timeout',
    description: 'The CDN server exceeded the latency timeout threshold without delivering data.',
    suggestedAction: 'Exponential backoff retry with alternative connection threads.',
    canAutoHeal: true,
  },
  [ERROR_CODES.ERR_CODEC_UNSUPPORTED]: {
    code: ERROR_CODES.ERR_CODEC_UNSUPPORTED,
    title: 'Non-Standard Audio/Video Codec',
    description: 'The stream uses a container codec not natively decodable by the browser sandbox (e.g. AC-3 Dolby).',
    suggestedAction: 'Export CLI command to download via terminal tools (yt-dlp).',
    canAutoHeal: false,
    alternativeMode: 'cli',
  },
  [ERROR_CODES.ERR_UNKNOWN]: {
    code: ERROR_CODES.ERR_UNKNOWN,
    title: 'Unexpected Stream Error',
    description: 'An unclassified runtime exception occurred during stream processing.',
    suggestedAction: 'Check network connectivity or retry with Safe Concurrency mode (1 Worker).',
    canAutoHeal: false,
  },
};

export class StreamError extends Error {
  constructor(code, customMessage = null, originalError = null, context = {}) {
    const meta = ERROR_METADATA[code] || ERROR_METADATA[ERROR_CODES.ERR_UNKNOWN];
    super(customMessage || meta.description);
    this.name = 'StreamError';
    this.code = code;
    this.meta = meta;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Classifies an unknown error into a structured StreamError.
 */
export function classifyError(err, context = {}) {
  if (err instanceof StreamError) return err;

  const msg = (err?.message || String(err)).toLowerCase();
  const status = err?.status || context?.status;

  if (status === 403 || msg.includes('403') || msg.includes('forbidden') || msg.includes('hotlink')) {
    return new StreamError(ERROR_CODES.ERR_HOTLINK_403, null, err, context);
  }
  if (status === 404 || msg.includes('404') || msg.includes('not found')) {
    return new StreamError(ERROR_CODES.ERR_CHUNK_404, null, err, context);
  }
  if (msg.includes('cors') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return new StreamError(ERROR_CODES.ERR_CORS_BLOCKED, null, err, context);
  }
  if (msg.includes('drm') || msg.includes('widevine') || msg.includes('skd://') || msg.includes('fairplay')) {
    return new StreamError(ERROR_CODES.ERR_DRM_PROTECTED, null, err, context);
  }
  if (msg.includes('abort') || msg.includes('cancelled')) {
    return new StreamError(ERROR_CODES.ERR_STREAM_ABORT, null, err, context);
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return new StreamError(ERROR_CODES.ERR_TIMEOUT_CDN, null, err, context);
  }
  if (msg.includes('desync') || msg.includes('rolling window')) {
    return new StreamError(ERROR_CODES.ERR_LIVE_DESYNC, null, err, context);
  }
  if (msg.includes('codec') || msg.includes('unsupported') || msg.includes('ac-3')) {
    return new StreamError(ERROR_CODES.ERR_CODEC_UNSUPPORTED, null, err, context);
  }

  return new StreamError(ERROR_CODES.ERR_UNKNOWN, err?.message, err, context);
}
