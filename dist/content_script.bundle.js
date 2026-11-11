(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // src/shared/constants.js
  var CATEGORY, EXT_MAP, MIME_MAP, CATEGORY_META, SOURCE, STATUS, MSG, STORAGE, DEFAULT_SETTINGS, LIMITS, IGNORED_DOMAINS;
  var init_constants = __esm({
    "src/shared/constants.js"() {
      CATEGORY = {
        VIDEO: "video",
        AUDIO: "audio",
        IMAGE: "image",
        DOCUMENT: "document",
        ARCHIVE: "archive",
        STREAM: "stream",
        // HLS / m3u8 — non-DRM only
        OTHER: "other",
        UNKNOWN: "unknown"
      };
      EXT_MAP = {
        // Video
        mp4: CATEGORY.VIDEO,
        webm: CATEGORY.VIDEO,
        mov: CATEGORY.VIDEO,
        mkv: CATEGORY.VIDEO,
        avi: CATEGORY.VIDEO,
        flv: CATEGORY.VIDEO,
        m4v: CATEGORY.VIDEO,
        ogv: CATEGORY.VIDEO,
        "3gp": CATEGORY.VIDEO,
        // Audio
        mp3: CATEGORY.AUDIO,
        wav: CATEGORY.AUDIO,
        ogg: CATEGORY.AUDIO,
        m4a: CATEGORY.AUDIO,
        aac: CATEGORY.AUDIO,
        flac: CATEGORY.AUDIO,
        opus: CATEGORY.AUDIO,
        weba: CATEGORY.AUDIO,
        // Images
        jpg: CATEGORY.IMAGE,
        jpeg: CATEGORY.IMAGE,
        png: CATEGORY.IMAGE,
        webp: CATEGORY.IMAGE,
        gif: CATEGORY.IMAGE,
        bmp: CATEGORY.IMAGE,
        svg: CATEGORY.IMAGE,
        ico: CATEGORY.IMAGE,
        avif: CATEGORY.IMAGE,
        tiff: CATEGORY.IMAGE,
        tif: CATEGORY.IMAGE,
        // Documents
        pdf: CATEGORY.DOCUMENT,
        doc: CATEGORY.DOCUMENT,
        docx: CATEGORY.DOCUMENT,
        xls: CATEGORY.DOCUMENT,
        xlsx: CATEGORY.DOCUMENT,
        ppt: CATEGORY.DOCUMENT,
        pptx: CATEGORY.DOCUMENT,
        txt: CATEGORY.DOCUMENT,
        csv: CATEGORY.DOCUMENT,
        json: CATEGORY.DOCUMENT,
        xml: CATEGORY.DOCUMENT,
        md: CATEGORY.DOCUMENT,
        epub: CATEGORY.DOCUMENT,
        rtf: CATEGORY.DOCUMENT,
        // Archives
        zip: CATEGORY.ARCHIVE,
        rar: CATEGORY.ARCHIVE,
        "7z": CATEGORY.ARCHIVE,
        tar: CATEGORY.ARCHIVE,
        gz: CATEGORY.ARCHIVE,
        bz2: CATEGORY.ARCHIVE,
        xz: CATEGORY.ARCHIVE,
        zst: CATEGORY.ARCHIVE,
        // Streams (non-DRM, authorized only)
        m3u8: CATEGORY.STREAM,
        m3u: CATEGORY.STREAM,
        mpd: CATEGORY.STREAM
      };
      MIME_MAP = {
        "video/mp4": CATEGORY.VIDEO,
        "video/webm": CATEGORY.VIDEO,
        "video/quicktime": CATEGORY.VIDEO,
        "video/x-msvideo": CATEGORY.VIDEO,
        "video/ogg": CATEGORY.VIDEO,
        "video/3gpp": CATEGORY.VIDEO,
        "audio/mpeg": CATEGORY.AUDIO,
        "audio/wav": CATEGORY.AUDIO,
        "audio/ogg": CATEGORY.AUDIO,
        "audio/mp4": CATEGORY.AUDIO,
        "audio/aac": CATEGORY.AUDIO,
        "audio/flac": CATEGORY.AUDIO,
        "audio/webm": CATEGORY.AUDIO,
        "image/jpeg": CATEGORY.IMAGE,
        "image/png": CATEGORY.IMAGE,
        "image/webp": CATEGORY.IMAGE,
        "image/gif": CATEGORY.IMAGE,
        "image/svg+xml": CATEGORY.IMAGE,
        "image/bmp": CATEGORY.IMAGE,
        "image/avif": CATEGORY.IMAGE,
        "application/pdf": CATEGORY.DOCUMENT,
        "application/msword": CATEGORY.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": CATEGORY.DOCUMENT,
        "application/vnd.ms-excel": CATEGORY.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": CATEGORY.DOCUMENT,
        "application/vnd.ms-powerpoint": CATEGORY.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": CATEGORY.DOCUMENT,
        "text/plain": CATEGORY.DOCUMENT,
        "text/csv": CATEGORY.DOCUMENT,
        "application/json": CATEGORY.DOCUMENT,
        "application/xml": CATEGORY.DOCUMENT,
        "text/xml": CATEGORY.DOCUMENT,
        "application/zip": CATEGORY.ARCHIVE,
        "application/x-rar-compressed": CATEGORY.ARCHIVE,
        "application/x-7z-compressed": CATEGORY.ARCHIVE,
        "application/x-tar": CATEGORY.ARCHIVE,
        "application/gzip": CATEGORY.ARCHIVE,
        "application/x-mpegURL": CATEGORY.STREAM,
        "application/vnd.apple.mpegurl": CATEGORY.STREAM,
        "application/dash+xml": CATEGORY.STREAM
      };
      CATEGORY_META = {
        [CATEGORY.VIDEO]: { label: "Videos", emoji: "\u{1F3AC}", color: "#f97316" },
        [CATEGORY.AUDIO]: { label: "Audio", emoji: "\u{1F3B5}", color: "#a855f7" },
        [CATEGORY.IMAGE]: { label: "Images", emoji: "\u{1F5BC}\uFE0F", color: "#3b82f6" },
        [CATEGORY.DOCUMENT]: { label: "Documents", emoji: "\u{1F4C4}", color: "#22c55e" },
        [CATEGORY.ARCHIVE]: { label: "Archives", emoji: "\u{1F4E6}", color: "#eab308" },
        [CATEGORY.STREAM]: { label: "Streams", emoji: "\u{1F4E1}", color: "#ec4899" },
        [CATEGORY.OTHER]: { label: "Other", emoji: "\u{1F517}", color: "#6b7280" },
        [CATEGORY.UNKNOWN]: { label: "Unknown", emoji: "\u2753", color: "#374151" }
      };
      SOURCE = {
        DOM_ANCHOR: "dom_anchor",
        // <a href="...">
        DOM_MEDIA: "dom_media",
        // <video>, <audio>, <source>
        DOM_LINK: "dom_link",
        // <link rel="...">
        DOM_IMG: "dom_img",
        // <img src="...">
        DOM_EMBED: "dom_embed",
        // <embed>, <object>
        NETWORK: "network",
        // observed via webRequest (optional perm)
        INFERRED: "inferred"
        // text pattern match + verified
      };
      STATUS = {
        DOWNLOADABLE: "downloadable",
        REQUIRES_AUTH: "requires_auth",
        // session-locked, may fail outside context
        UNSUPPORTED: "unsupported",
        DUPLICATE: "duplicate",
        STREAM: "stream",
        // HLS/DASH — needs companion for best results
        PROTECTED: "protected",
        // DRM detected — download blocked
        UNKNOWN: "unknown"
      };
      MSG = {
        // Content → SW
        SCAN_RESULT: "SCAN_RESULT",
        SCAN_ERROR: "SCAN_ERROR",
        // SW → Content
        START_SCAN: "START_SCAN",
        RESCAN: "RESCAN",
        // Popup → SW
        GET_RESOURCES: "GET_RESOURCES",
        DOWNLOAD_ITEM: "DOWNLOAD_ITEM",
        DOWNLOAD_BATCH: "DOWNLOAD_BATCH",
        OPEN_DASHBOARD: "OPEN_DASHBOARD",
        COPY_URL: "COPY_URL",
        // SW → Popup
        RESOURCES_READY: "RESOURCES_READY",
        SCAN_PROGRESS: "SCAN_PROGRESS",
        DOWNLOAD_STARTED: "DOWNLOAD_STARTED",
        DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
        // Companion bridge
        COMPANION_CHECK: "COMPANION_CHECK",
        COMPANION_SEND: "COMPANION_SEND",
        COMPANION_STATUS: "COMPANION_STATUS"
      };
      STORAGE = {
        SETTINGS: "df_settings",
        DOWNLOAD_HISTORY: "df_history",
        DOMAIN_RULES: "df_domain_rules",
        SCAN_CACHE: "df_scan_cache",
        FAVORITES: "df_favorites",
        COMPANION_CONFIG: "df_companion",
        LAST_FILTER: "df_last_filter"
      };
      DEFAULT_SETTINGS = {
        theme: "dark",
        // 'dark' | 'light'
        autoScan: true,
        // scan on page load
        showBadge: true,
        // badge count on icon
        badgeCategories: [CATEGORY.VIDEO, CATEGORY.AUDIO, CATEGORY.DOCUMENT],
        minFileSizeBytes: 1024,
        // ignore < 1KB assets
        deduplicateUrls: true,
        showImages: true,
        showDocuments: true,
        showArchives: true,
        showStreams: true,
        enableVideoOverlay: true,
        // floating in-video download pill
        concurrencyMode: "turbo",
        // 'turbo' (8x) | 'maximum' (16x) | 'balanced' (4x)
        directDiskStream: true,
        // zero-RAM direct streaming via File System Access API
        companionEnabled: false,
        companionHost: "com.P4inz Interactive Labs.downloadforge",
        debugMode: false,
        defaultSaveAs: false,
        // trigger save-as dialog
        historyMaxItems: 500
      };
      LIMITS = {
        MAX_RESOURCES_PER_SCAN: 500,
        MAX_HISTORY_ITEMS: 500,
        MAX_BATCH_DOWNLOAD: 50,
        // safety cap for bulk download
        SCAN_TIMEOUT_MS: 8e3,
        FETCH_TIMEOUT_MS: 5e3,
        CACHE_TTL_MS: 5 * 60 * 1e3
        // 5 min
      };
      IGNORED_DOMAINS = /* @__PURE__ */ new Set([
        "google-analytics.com",
        "analytics.google.com",
        "googletagmanager.com",
        "doubleclick.net",
        "facebook.com/tr",
        "connect.facebook.net",
        "hotjar.com",
        "mouseflow.com"
      ]);
    }
  });

  // src/utils/url.js
  function extractExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split(".");
      if (parts.length < 2) return "";
      const ext = parts[parts.length - 1].split("?")[0].toLowerCase();
      return ext.length <= 6 ? ext : "";
    } catch {
      return "";
    }
  }
  function extractFilename(url) {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split("/");
      const last = decodeURIComponent(parts[parts.length - 1] || "");
      return last.replace(/[?#].*$/, "").trim() || null;
    } catch {
      return null;
    }
  }
  function isValidUrl(url) {
    if (!url || typeof url !== "string") return false;
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_eid"];
      trackingParams.forEach((p) => u.searchParams.delete(p));
      return u.href;
    } catch {
      return url;
    }
  }
  var init_url = __esm({
    "src/utils/url.js"() {
    }
  });

  // src/core/classifier.js
  function inferCategory(url, mimeType, ext) {
    if (mimeType) {
      const base = mimeType.split(";")[0].trim().toLowerCase();
      if (MIME_MAP[base]) return MIME_MAP[base];
      if (base.startsWith("video/")) return CATEGORY.VIDEO;
      if (base.startsWith("audio/")) return CATEGORY.AUDIO;
      if (base.startsWith("image/")) return CATEGORY.IMAGE;
      if (base.startsWith("application/")) return CATEGORY.DOCUMENT;
    }
    if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
    if (url) {
      const lower = url.toLowerCase();
      if (lower.includes(".m3u8") || lower.includes(".m3u") || lower.includes(".mpd")) return CATEGORY.STREAM;
      if (lower.includes("/video/") || lower.includes("video=")) return CATEGORY.VIDEO;
      if (lower.includes("/audio/") || lower.includes("audio=")) return CATEGORY.AUDIO;
    }
    return CATEGORY.UNKNOWN;
  }
  var init_classifier = __esm({
    "src/core/classifier.js"() {
      init_constants();
    }
  });

  // src/content/dom_scanner.js
  function scanDOM(options = {}) {
    const opts = { ...DEFAULT_SETTINGS, ...options };
    const startTime = performance.now();
    const seen = /* @__PURE__ */ new Set();
    const results = [];
    const collectors = [
      collectAnchors,
      collectMediaElements,
      collectImgElements,
      collectSourceElements,
      collectEmbedObjects,
      collectMetaTags,
      collectLinkTags
    ];
    for (const collector of collectors) {
      try {
        const items = collector(document, opts);
        for (const item of items) {
          if (results.length >= LIMITS.MAX_RESOURCES_PER_SCAN) break;
          if (opts.deduplicateUrls && seen.has(item.url)) {
            continue;
          }
          if (isIgnoredDomain(item.url)) continue;
          if (!opts.showImages && item.category === CATEGORY.IMAGE) continue;
          seen.add(item.url);
          results.push(item);
        }
      } catch (err) {
        console.warn(`[DownloadForge] Collector ${collector.name} failed:`, err);
      }
    }
    const duration = Math.round(performance.now() - startTime);
    return { resources: results, scanDurationMs: duration };
  }
  function collectAnchors(doc, opts) {
    const items = [];
    const anchors = doc.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      const url = resolveUrl(href, doc);
      if (!url || !isValidUrl(url)) continue;
      const ext = extractExtension(url);
      const hasDownloadAttr = a.hasAttribute("download");
      const category = inferCategory(url, null, ext);
      if (!EXT_MAP[ext] && !hasDownloadAttr) continue;
      if (category === CATEGORY.IMAGE && !opts.showImages) continue;
      items.push(buildResource({
        url,
        category,
        ext,
        filename: a.getAttribute("download") || extractFilename(url) || a.textContent.trim().slice(0, 80) || null,
        source: SOURCE.DOM_ANCHOR,
        mimeType: null,
        status: STATUS.DOWNLOADABLE,
        label: a.textContent.trim().slice(0, 120) || null
      }));
    }
    return items;
  }
  function collectMediaElements(doc) {
    const items = [];
    const mediaEls = doc.querySelectorAll("video, audio");
    for (const el of mediaEls) {
      if (el.src && el.src !== window.location.href) {
        const url = el.src;
        if (isValidUrl(url)) {
          const ext = extractExtension(url);
          const tag = el.tagName.toLowerCase();
          items.push(buildResource({
            url,
            category: tag === "video" ? CATEGORY.VIDEO : CATEGORY.AUDIO,
            ext,
            filename: extractFilename(url),
            mimeType: el.type || null,
            source: SOURCE.DOM_MEDIA,
            status: STATUS.DOWNLOADABLE,
            // Capture rough duration/dimensions if available
            meta: extractMediaMeta(el)
          }));
        }
      }
      if (el.currentSrc && el.currentSrc !== el.src && el.currentSrc !== window.location.href) {
        const url = el.currentSrc;
        if (isValidUrl(url)) {
          const ext = extractExtension(url);
          const tag = el.tagName.toLowerCase();
          items.push(buildResource({
            url,
            category: tag === "video" ? CATEGORY.VIDEO : CATEGORY.AUDIO,
            ext,
            filename: extractFilename(url),
            mimeType: null,
            source: SOURCE.DOM_MEDIA,
            status: STATUS.DOWNLOADABLE,
            meta: extractMediaMeta(el)
          }));
        }
      }
    }
    return items;
  }
  function collectSourceElements(doc) {
    const items = [];
    const sources = doc.querySelectorAll("source[src]");
    for (const s of sources) {
      const src = s.getAttribute("src");
      if (!src) continue;
      const url = resolveUrl(src, doc);
      if (!url || !isValidUrl(url)) continue;
      const mimeType = s.type || null;
      const ext = extractExtension(url);
      const category = inferCategory(url, mimeType, ext);
      const isStream = ext === "m3u8" || ext === "m3u" || ext === "mpd" || mimeType === "application/x-mpegURL" || mimeType === "application/vnd.apple.mpegurl" || mimeType === "application/dash+xml";
      items.push(buildResource({
        url,
        category: isStream ? CATEGORY.STREAM : category,
        ext,
        filename: extractFilename(url),
        mimeType,
        source: SOURCE.DOM_MEDIA,
        status: isStream ? STATUS.STREAM : STATUS.DOWNLOADABLE
      }));
    }
    return items;
  }
  function collectImgElements(doc, opts) {
    const items = [];
    const imgs = doc.querySelectorAll("img[src]");
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) continue;
      const url = resolveUrl(src, doc);
      if (!url || !isValidUrl(url)) continue;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0 && (w < 8 || h < 8)) continue;
      const ext = extractExtension(url);
      if (ext && !EXT_MAP[ext]) continue;
      items.push(buildResource({
        url,
        category: CATEGORY.IMAGE,
        ext,
        filename: img.alt?.trim().slice(0, 80) || extractFilename(url),
        mimeType: null,
        source: SOURCE.DOM_IMG,
        status: STATUS.DOWNLOADABLE,
        meta: { width: w || null, height: h || null, alt: img.alt || null }
      }));
    }
    return items;
  }
  function collectEmbedObjects(doc) {
    const items = [];
    for (const el of doc.querySelectorAll("embed[src]")) {
      const src = el.getAttribute("src");
      const url = resolveUrl(src, doc);
      if (!url || !isValidUrl(url)) continue;
      const ext = extractExtension(url);
      const mimeType = el.type || null;
      const category = inferCategory(url, mimeType, ext);
      if (!EXT_MAP[ext] && !mimeType) continue;
      items.push(buildResource({ url, category, ext, filename: extractFilename(url), mimeType, source: SOURCE.DOM_EMBED, status: STATUS.DOWNLOADABLE }));
    }
    for (const el of doc.querySelectorAll("object[data]")) {
      const data = el.getAttribute("data");
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
  function collectMetaTags(doc) {
    const items = [];
    const metaSelectors = [
      'meta[property="og:video"][content]',
      'meta[property="og:video:url"][content]',
      'meta[property="og:audio"][content]',
      'meta[property="og:image"][content]',
      'meta[name="twitter:image"][content]',
      'meta[name="twitter:player:stream"][content]'
    ];
    for (const sel of metaSelectors) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      const content = el.getAttribute("content");
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
        label: el.getAttribute("property") || el.getAttribute("name") || null
      }));
    }
    return items;
  }
  function collectLinkTags(doc) {
    const items = [];
    const skipRels = /* @__PURE__ */ new Set(["stylesheet", "preload", "prefetch", "modulepreload", "icon", "shortcut icon", "apple-touch-icon", "canonical", "alternate", "manifest"]);
    for (const link of doc.querySelectorAll("link[href]")) {
      const rel = (link.rel || "").toLowerCase().trim();
      if (skipRels.has(rel)) continue;
      const href = link.getAttribute("href");
      if (!href) continue;
      const url = resolveUrl(href, doc);
      if (!url || !isValidUrl(url)) continue;
      const ext = extractExtension(url);
      if (!EXT_MAP[ext]) continue;
      const category = inferCategory(url, null, ext);
      items.push(buildResource({ url, category, ext, filename: extractFilename(url), mimeType: null, source: SOURCE.DOM_LINK, status: STATUS.DOWNLOADABLE }));
    }
    return items;
  }
  function buildResource({
    url,
    category = CATEGORY.UNKNOWN,
    ext = "",
    filename = null,
    mimeType = null,
    source = SOURCE.DOM_ANCHOR,
    status = STATUS.DOWNLOADABLE,
    meta = {},
    label = null
  }) {
    const normalizedUrl = normalizeUrl(url);
    return {
      id: `df_${Date.now()}_${_idCounter++}`,
      url: normalizedUrl,
      category,
      ext: ext?.toLowerCase() || "",
      filename: sanitizeFilename(filename) || guessFilename(normalizedUrl, ext),
      mimeType: mimeType || null,
      source,
      status,
      pageUrl: window.location.href,
      domain: extractDomain(normalizedUrl),
      detectedAt: Date.now(),
      fileSize: null,
      // populated by metadata.js fetch if needed
      meta,
      label
    };
  }
  function resolveUrl(href, doc) {
    if (!href) return null;
    try {
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
    } catch {
    }
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
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }
  function guessFilename(url, ext) {
    const name = extractFilename(url);
    if (name) return name;
    return ext ? `resource.${ext}` : "resource";
  }
  function sanitizeFilename(name) {
    if (!name) return null;
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().slice(0, 200) || null;
  }
  var _idCounter;
  var init_dom_scanner = __esm({
    "src/content/dom_scanner.js"() {
      init_constants();
      init_url();
      init_classifier();
      _idCounter = 0;
    }
  });

  // src/content/video_overlay.js
  function initVideoOverlay() {
    const trackedVideos = /* @__PURE__ */ new WeakSet();
    function attachOverlayToVideo(video) {
      if (!video || trackedVideos.has(video)) return;
      trackedVideos.add(video);
      const parent = video.parentElement;
      if (!parent) return;
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === "static") {
        parent.style.position = "relative";
      }
      parent.addEventListener("mouseenter", () => parent.classList.add("df-video-container-hover"));
      parent.addEventListener("mouseleave", () => parent.classList.remove("df-video-container-hover"));
      const overlay = document.createElement("div");
      overlay.className = "df-video-overlay-wrap";
      const pill = document.createElement("button");
      pill.className = "df-pill-btn";
      pill.title = "Download video with DownloadForge Pro";
      function updatePillState() {
        const src = video.currentSrc || video.src || "";
        const isBlob = src.startsWith("blob:");
        const height = video.videoHeight || 1080;
        const qualityText = height >= 2160 ? "4K" : height >= 1080 ? "1080p" : height >= 720 ? "720p" : `${height}p`;
        if (isBlob) {
          pill.className = "df-pill-btn record-mode";
          pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>
          <span>Record Video</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
        } else {
          pill.className = "df-pill-btn";
          pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
        }
      }
      updatePillState();
      video.addEventListener("loadedmetadata", updatePillState);
      video.addEventListener("play", updatePillState);
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const src = video.currentSrc || video.src || "";
        const title = document.title || "web_video";
        if (src.startsWith("blob:")) {
          window.__df_record_mode_active = true;
          const studioUrl = chrome.runtime.getURL(
            `src/downloader/downloader.html?mode=record&title=${encodeURIComponent(title)}`
          );
          window.open(studioUrl, "_blank");
        } else {
          const studioUrl = chrome.runtime.getURL(
            `src/downloader/downloader.html?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(title + ".mp4")}`
          );
          window.open(studioUrl, "_blank");
        }
      });
      overlay.appendChild(pill);
      parent.appendChild(overlay);
    }
    function findVideosRecursively(root = document) {
      if (!root) return [];
      let videos = [];
      try {
        if (root.querySelectorAll) {
          videos = Array.from(root.querySelectorAll("video"));
          root.querySelectorAll("*").forEach((el) => {
            if (el.shadowRoot) {
              videos = videos.concat(findVideosRecursively(el.shadowRoot));
            }
          });
        }
      } catch (e) {
      }
      return videos;
    }
    findVideosRecursively(document).forEach(attachOverlayToVideo);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "VIDEO") {
              attachOverlayToVideo(node);
            } else {
              findVideosRecursively(node).forEach(attachOverlayToVideo);
            }
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  var init_video_overlay = __esm({
    "src/content/video_overlay.js"() {
    }
  });

  // src/storage/storage.js
  var StorageService;
  var init_storage = __esm({
    "src/storage/storage.js"() {
      init_constants();
      StorageService = {
        // ── Settings ──────────────────────────────────────────────
        async getSettings() {
          const result = await chrome.storage.local.get(STORAGE.SETTINGS);
          return { ...DEFAULT_SETTINGS, ...result[STORAGE.SETTINGS] ?? {} };
        },
        async saveSettings(partial) {
          const current = await this.getSettings();
          const updated = { ...current, ...partial };
          await chrome.storage.local.set({ [STORAGE.SETTINGS]: updated });
          return updated;
        },
        async initDefaults() {
          const existing = await chrome.storage.local.get(STORAGE.SETTINGS);
          if (!existing[STORAGE.SETTINGS]) {
            await chrome.storage.local.set({ [STORAGE.SETTINGS]: DEFAULT_SETTINGS });
          }
        },
        // ── Download History ──────────────────────────────────────
        async getHistory() {
          const result = await chrome.storage.local.get(STORAGE.DOWNLOAD_HISTORY);
          return result[STORAGE.DOWNLOAD_HISTORY] ?? [];
        },
        async addToHistory(item) {
          const history = await this.getHistory();
          history.unshift(item);
          const trimmed = history.slice(0, LIMITS.MAX_HISTORY_ITEMS);
          await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: trimmed });
        },
        async addBatchToHistory(items) {
          const history = await this.getHistory();
          const newItems = items.filter((i) => i.ok).map((i) => ({
            url: i.url,
            downloadId: i.downloadId,
            startedAt: Date.now(),
            status: "started"
          }));
          const merged = [...newItems, ...history].slice(0, LIMITS.MAX_HISTORY_ITEMS);
          await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: merged });
        },
        async updateHistoryItem(downloadId, updates) {
          const history = await this.getHistory();
          const idx = history.findIndex((h) => h.downloadId === downloadId);
          if (idx !== -1) {
            history[idx] = { ...history[idx], ...updates };
            await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: history });
          }
        },
        async clearHistory() {
          await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: [] });
        },
        // ── Domain Rules ──────────────────────────────────────────
        async getDomainRules() {
          const result = await chrome.storage.local.get(STORAGE.DOMAIN_RULES);
          return result[STORAGE.DOMAIN_RULES] ?? [];
        },
        async saveDomainRules(rules) {
          await chrome.storage.local.set({ [STORAGE.DOMAIN_RULES]: rules });
        },
        // ── Last Filter ───────────────────────────────────────────
        async getLastFilter() {
          const result = await chrome.storage.local.get(STORAGE.LAST_FILTER);
          return result[STORAGE.LAST_FILTER] ?? { category: "all", sort: "type", search: "" };
        },
        async saveLastFilter(filter) {
          await chrome.storage.local.set({ [STORAGE.LAST_FILTER]: filter });
        },
        // ── Companion Config ──────────────────────────────────────
        async getCompanionConfig() {
          const result = await chrome.storage.local.get(STORAGE.COMPANION_CONFIG);
          return result[STORAGE.COMPANION_CONFIG] ?? { enabled: false, savePath: "" };
        },
        async saveCompanionConfig(config) {
          await chrome.storage.local.set({ [STORAGE.COMPANION_CONFIG]: config });
        },
        // ── Clear all ─────────────────────────────────────────────
        async clearAll() {
          await chrome.storage.local.clear();
          await this.initDefaults();
        }
      };
    }
  });

  // src/content/content_script.js
  var require_content_script = __commonJS({
    "src/content/content_script.js"() {
      init_dom_scanner();
      init_video_overlay();
      init_constants();
      init_storage();
      if (!window.__downloadForgeInjected) {
        window.__downloadForgeInjected = true;
        init();
      }
      var sessionToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
      function injectMainWorldSniffer() {
        try {
          document.documentElement.dataset.dfSnifferToken = sessionToken;
          const script = document.createElement("script");
          script.src = chrome.runtime.getURL("src/content/injected_sniffer.js");
          script.dataset.token = sessionToken;
          script.onload = () => script.remove();
          (document.head || document.documentElement).appendChild(script);
        } catch (err) {
          console.debug("[DownloadForge] Failed to inject sniffer:", err);
        }
      }
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
      function setupSnifferListener() {
        window.addEventListener("message", async (event) => {
          if (event.source !== window || !event.data || event.data.source !== "DOWNLOADFORGE_SNIFFER") {
            return;
          }
          if (event.data.token !== sessionToken) {
            return;
          }
          if (event.data.type === "MEDIA_DETECTED" && event.data.data) {
            const item = event.data.data;
            if (!item.url || typeof item.url !== "string") return;
            if (!item.url.startsWith("http://") && !item.url.startsWith("https://") && !item.url.startsWith("blob:")) {
              return;
            }
            const cleanTitle = (item.title || "video_stream").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().slice(0, 100);
            const resource = {
              id: `sniff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              url: item.url,
              category: item.category === "stream" ? CATEGORY.STREAM : CATEGORY.VIDEO,
              ext: item.url.split("?")[0].split(".").pop().toLowerCase() || "m3u8",
              filename: cleanTitle + (item.url.includes("m3u8") ? ".m3u8" : ".mp4"),
              mimeType: item.mimeType || (item.url.includes("m3u8") ? "application/x-mpegURL" : "video/mp4"),
              source: SOURCE.NETWORK,
              status: item.url.includes("m3u8") ? STATUS.STREAM : STATUS.DOWNLOADABLE,
              pageUrl: window.location.href,
              domain: window.location.hostname,
              detectedAt: Date.now()
            };
            try {
              await chrome.runtime.sendMessage({
                type: MSG.SCAN_RESULT,
                payload: {
                  resources: [resource],
                  scanDurationMs: 0,
                  pageUrl: window.location.href,
                  incremental: true
                }
              });
            } catch (e) {
            }
          }
        });
      }
      function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (message.type === MSG.START_SCAN || message.type === MSG.RESCAN) {
            StorageService.getSettings().then((settings) => runScan(settings)).then(() => sendResponse({ ok: true })).catch((err) => {
              reportError(err.message);
              sendResponse({ ok: false, error: err.message });
            });
            return true;
          }
        });
      }
      async function runScan(settings = {}) {
        try {
          const { resources, scanDurationMs } = scanDOM({
            deduplicateUrls: settings.deduplicateUrls ?? true,
            minFileSizeBytes: settings.minFileSizeBytes ?? 1024,
            showImages: settings.showImages ?? true
          });
          await chrome.runtime.sendMessage({
            type: MSG.SCAN_RESULT,
            payload: {
              resources,
              scanDurationMs,
              pageUrl: window.location.href
            }
          });
        } catch (err) {
          reportError(err.message);
        }
      }
      function reportError(error) {
        try {
          chrome.runtime.sendMessage({
            type: MSG.SCAN_ERROR,
            payload: { error, pageUrl: window.location.href }
          });
        } catch {
        }
      }
    }
  });
  require_content_script();
})();
