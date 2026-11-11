// ============================================================
// DownloadForge — shared/constants.js
// P4inz Interactive Labs | p4inz
// Central source of truth for all constants used across
// the extension. Import from here, never hardcode values.
// ============================================================

// ── App Identity ────────────────────────────────────────────
export const APP = {
  NAME:        'DownloadForge Pro',
  VERSION:     '1.2.0',
  COMPANY:     'P4inz Interactive Labs',
  AUTHOR:      'Atharva Patil (p4inz)',
  WEBSITE:     'https://atharvapatil.tech',
  SUPPORT_URL: 'https://discord.gg/8UKt8s5FbW',
  GITHUB_URL:  'https://github.com/p4inz-code/downloadforge-pro',
  EMAIL:       'atharva.patil.cg@gmail.com',
  STORE_URL:   'https://chromewebstore.google.com',
};

// ── Resource Categories ─────────────────────────────────────
export const CATEGORY = {
  VIDEO:    'video',
  AUDIO:    'audio',
  IMAGE:    'image',
  DOCUMENT: 'document',
  ARCHIVE:  'archive',
  STREAM:   'stream',   // HLS / m3u8 — non-DRM only
  MODEL_3D: 'model_3d', // 3D Meshes, GLTF/GLB, Splats
  OTHER:    'other',
  UNKNOWN:  'unknown',
};

// ── File extension → category map ───────────────────────────
export const EXT_MAP = {
  // Video
  mp4: CATEGORY.VIDEO, webm: CATEGORY.VIDEO, mov: CATEGORY.VIDEO,
  mkv: CATEGORY.VIDEO, avi: CATEGORY.VIDEO,  flv: CATEGORY.VIDEO,
  m4v: CATEGORY.VIDEO, ogv: CATEGORY.VIDEO,  '3gp': CATEGORY.VIDEO,

  // Audio
  mp3: CATEGORY.AUDIO, wav: CATEGORY.AUDIO,  ogg: CATEGORY.AUDIO,
  m4a: CATEGORY.AUDIO, aac: CATEGORY.AUDIO,  flac: CATEGORY.AUDIO,
  opus: CATEGORY.AUDIO, weba: CATEGORY.AUDIO,

  // Images
  jpg:  CATEGORY.IMAGE, jpeg: CATEGORY.IMAGE, png:  CATEGORY.IMAGE,
  webp: CATEGORY.IMAGE, gif:  CATEGORY.IMAGE, bmp:  CATEGORY.IMAGE,
  svg:  CATEGORY.IMAGE, ico:  CATEGORY.IMAGE, avif: CATEGORY.IMAGE,
  tiff: CATEGORY.IMAGE, tif:  CATEGORY.IMAGE,

  // Documents
  pdf:  CATEGORY.DOCUMENT, doc:  CATEGORY.DOCUMENT, docx: CATEGORY.DOCUMENT,
  xls:  CATEGORY.DOCUMENT, xlsx: CATEGORY.DOCUMENT, ppt:  CATEGORY.DOCUMENT,
  pptx: CATEGORY.DOCUMENT, txt:  CATEGORY.DOCUMENT, csv:  CATEGORY.DOCUMENT,
  json: CATEGORY.DOCUMENT, xml:  CATEGORY.DOCUMENT, md:   CATEGORY.DOCUMENT,
  epub: CATEGORY.DOCUMENT, rtf:  CATEGORY.DOCUMENT,

  // Archives
  zip: CATEGORY.ARCHIVE, rar:  CATEGORY.ARCHIVE, '7z': CATEGORY.ARCHIVE,
  tar: CATEGORY.ARCHIVE, gz:   CATEGORY.ARCHIVE, bz2: CATEGORY.ARCHIVE,
  xz:  CATEGORY.ARCHIVE, zst:  CATEGORY.ARCHIVE,

  // Streams (non-DRM, authorized only)
  m3u8: CATEGORY.STREAM, m3u: CATEGORY.STREAM, mpd: CATEGORY.STREAM,

  // 3D Models & Spatial Point Clouds
  glb: CATEGORY.MODEL_3D, gltf: CATEGORY.MODEL_3D, obj: CATEGORY.MODEL_3D,
  mtl: CATEGORY.MODEL_3D, fbx: CATEGORY.MODEL_3D,  stl: CATEGORY.MODEL_3D,
  usdz: CATEGORY.MODEL_3D, splat: CATEGORY.MODEL_3D, ply: CATEGORY.MODEL_3D,
};

// ── MIME type → category map ─────────────────────────────────
export const MIME_MAP = {
  'video/mp4':        CATEGORY.VIDEO,
  'video/webm':       CATEGORY.VIDEO,
  'video/quicktime':  CATEGORY.VIDEO,
  'video/x-msvideo':  CATEGORY.VIDEO,
  'video/ogg':        CATEGORY.VIDEO,
  'video/3gpp':       CATEGORY.VIDEO,

  'audio/mpeg':       CATEGORY.AUDIO,
  'audio/wav':        CATEGORY.AUDIO,
  'audio/ogg':        CATEGORY.AUDIO,
  'audio/mp4':        CATEGORY.AUDIO,
  'audio/aac':        CATEGORY.AUDIO,
  'audio/flac':       CATEGORY.AUDIO,
  'audio/webm':       CATEGORY.AUDIO,

  'image/jpeg':       CATEGORY.IMAGE,
  'image/png':        CATEGORY.IMAGE,
  'image/webp':       CATEGORY.IMAGE,
  'image/gif':        CATEGORY.IMAGE,
  'image/svg+xml':    CATEGORY.IMAGE,
  'image/bmp':        CATEGORY.IMAGE,
  'image/avif':       CATEGORY.IMAGE,

  'application/pdf':  CATEGORY.DOCUMENT,
  'application/msword':                                         CATEGORY.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': CATEGORY.DOCUMENT,
  'application/vnd.ms-excel':                                   CATEGORY.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       CATEGORY.DOCUMENT,
  'application/vnd.ms-powerpoint':                              CATEGORY.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': CATEGORY.DOCUMENT,
  'text/plain':       CATEGORY.DOCUMENT,
  'text/csv':         CATEGORY.DOCUMENT,
  'application/json': CATEGORY.DOCUMENT,
  'application/xml':  CATEGORY.DOCUMENT,
  'text/xml':         CATEGORY.DOCUMENT,

  'application/zip':              CATEGORY.ARCHIVE,
  'application/x-rar-compressed': CATEGORY.ARCHIVE,
  'application/x-7z-compressed':  CATEGORY.ARCHIVE,
  'application/x-tar':            CATEGORY.ARCHIVE,
  'application/gzip':             CATEGORY.ARCHIVE,

  'application/x-mpegURL':        CATEGORY.STREAM,
  'application/vnd.apple.mpegurl': CATEGORY.STREAM,
  'application/dash+xml':         CATEGORY.STREAM,

  'model/gltf-binary':            CATEGORY.MODEL_3D,
  'model/gltf+json':              CATEGORY.MODEL_3D,
  'model/obj':                    CATEGORY.MODEL_3D,
  'model/stl':                    CATEGORY.MODEL_3D,
  'model/vnd.usdz+zip':           CATEGORY.MODEL_3D,
  'application/octet-stream-splat': CATEGORY.MODEL_3D,
};

// ── Category UI Config ───────────────────────────────────────
export const CATEGORY_META = {
  [CATEGORY.VIDEO]:    { label: 'Videos',    icon: 'video',     color: '#f97316' },
  [CATEGORY.AUDIO]:    { label: 'Audio',     icon: 'music',     color: '#a855f7' },
  [CATEGORY.IMAGE]:    { label: 'Images',    icon: 'image',     color: '#3b82f6' },
  [CATEGORY.MODEL_3D]: { label: '3D Models', icon: 'box',       color: '#06b6d4' },
  [CATEGORY.DOCUMENT]: { label: 'Documents', icon: 'file-text', color: '#22c55e' },
  [CATEGORY.ARCHIVE]:  { label: 'Archives',  icon: 'archive',   color: '#eab308' },
  [CATEGORY.STREAM]:   { label: 'Streams',   icon: 'radio',     color: '#ec4899' },
  [CATEGORY.OTHER]:    { label: 'Other',     icon: 'link',      color: '#6b7280' },
  [CATEGORY.UNKNOWN]:  { label: 'Unknown',   icon: 'help',      color: '#374151' },
};

// ── Detection Sources ────────────────────────────────────────
export const SOURCE = {
  DOM_ANCHOR:    'dom_anchor',    // <a href="...">
  DOM_MEDIA:     'dom_media',     // <video>, <audio>, <source>
  DOM_LINK:      'dom_link',      // <link rel="...">
  DOM_IMG:       'dom_img',       // <img src="...">
  DOM_EMBED:     'dom_embed',     // <embed>, <object>
  NETWORK:       'network',       // observed via webRequest (optional perm)
  INFERRED:      'inferred',      // text pattern match + verified
};

// ── Resource Status Flags ────────────────────────────────────
export const STATUS = {
  DOWNLOADABLE:   'downloadable',
  REQUIRES_AUTH:  'requires_auth',   // session-locked, may fail outside context
  UNSUPPORTED:    'unsupported',
  DUPLICATE:      'duplicate',
  STREAM:         'stream',          // HLS/DASH — needs companion for best results
  PROTECTED:      'protected',       // DRM detected — download blocked
  UNKNOWN:        'unknown',
};

// ── Message Types (popup ↔ SW ↔ content script) ─────────────
export const MSG = {
  // Content → SW
  SCAN_RESULT:       'SCAN_RESULT',
  SCAN_ERROR:        'SCAN_ERROR',

  // SW → Content
  START_SCAN:        'START_SCAN',
  RESCAN:            'RESCAN',

  // Popup / Content → SW
  GET_RESOURCES:     'GET_RESOURCES',
  DOWNLOAD_ITEM:     'DOWNLOAD_ITEM',
  DOWNLOAD_BATCH:    'DOWNLOAD_BATCH',
  OPEN_DASHBOARD:    'OPEN_DASHBOARD',
  OPEN_DOWNLOADER:   'OPEN_DOWNLOADER',
  OPEN_TAB:          'OPEN_TAB',
  COPY_URL:          'COPY_URL',

  // SW → Popup
  RESOURCES_READY:   'RESOURCES_READY',
  SCAN_PROGRESS:     'SCAN_PROGRESS',
  DOWNLOAD_STARTED:  'DOWNLOAD_STARTED',
  DOWNLOAD_FAILED:   'DOWNLOAD_FAILED',

  // Update System
  CHECK_FOR_UPDATES: 'CHECK_FOR_UPDATES',
  UPDATE_AVAILABLE:  'UPDATE_AVAILABLE',
  APPLY_UPDATE:      'APPLY_UPDATE',
};

// ── Storage Keys ─────────────────────────────────────────────
export const STORAGE = {
  SETTINGS:         'df_settings',
  DOWNLOAD_HISTORY: 'df_history',
  DOMAIN_RULES:     'df_domain_rules',
  SCAN_CACHE:       'df_scan_cache',
  FAVORITES:        'df_favorites',
  COMPANION_CONFIG: 'df_companion',
  LAST_FILTER:      'df_last_filter',
  UPDATE_INFO:      'df_update_info',
};

// ── Auto-Update Configuration ───────────────────────────────
export const UPDATE_CONFIG = {
  GITHUB_REPO:            'p4inz-code/downloadforge-pro',
  RELEASES_API:           'https://api.github.com/repos/p4inz-code/downloadforge-pro/releases/latest',
  CHECK_INTERVAL_MINUTES: 240, // 4 hours
  ALARM_NAME:             'df_update_check_alarm',
};

// ── Default Settings ─────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  theme:                'dark',          // 'dark' | 'light'
  autoScan:             true,            // scan on page load
  showBadge:            true,            // badge count on icon
  badgeCategories:      [CATEGORY.VIDEO, CATEGORY.AUDIO, CATEGORY.DOCUMENT],
  minFileSizeBytes:     1024,            // ignore < 1KB assets
  deduplicateUrls:      true,
  showImages:           true,
  showDocuments:        true,
  showArchives:         true,
  showStreams:          true,
  enableVideoOverlay:   true,            // floating in-video download pill
  concurrencyMode:      'turbo',         // 'turbo' (8x) | 'maximum' (16x) | 'balanced' (4x)
  directDiskStream:     true,            // zero-RAM direct streaming via File System Access API
  companionEnabled:     false,
  companionHost:        'com.P4inz Interactive Labs.downloadforge',
  debugMode:            false,
  defaultSaveAs:        false,           // trigger save-as dialog
  historyMaxItems:      500,
};

// ── Native Messaging Host Name ───────────────────────────────
export const NATIVE_HOST = 'com.P4inz Interactive Labs.downloadforge';

// ── Limits ───────────────────────────────────────────────────
export const LIMITS = {
  MAX_RESOURCES_PER_SCAN: 500,
  MAX_HISTORY_ITEMS:      500,
  MAX_BATCH_DOWNLOAD:     50,           // safety cap for bulk download
  SCAN_TIMEOUT_MS:        8000,
  FETCH_TIMEOUT_MS:       5000,
  CACHE_TTL_MS:           5 * 60 * 1000, // 5 min
};

// ── Noise domains/paths to auto-ignore ───────────────────────
// Common CDN noise — tiny tracking pixels, analytics etc.
export const IGNORED_DOMAINS = new Set([
  'google-analytics.com', 'analytics.google.com',
  'googletagmanager.com', 'doubleclick.net',
  'facebook.com/tr', 'connect.facebook.net',
  'hotjar.com', 'mouseflow.com',
]);

// ── Icon badge colors ────────────────────────────────────────
export const BADGE = {
  COLOR_ACTIVE:   '#f97316',  // orange — resources found
  COLOR_SCANNING: '#3b82f6',  // blue   — scanning in progress
  COLOR_NONE:     '#6b7280',  // gray   — nothing found
  COLOR_ERROR:    '#ef4444',  // red    — scan error
};
