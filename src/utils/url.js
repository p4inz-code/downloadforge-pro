// ============================================================
// DownloadForge — utils/url.js
// ObsidianLabs | p4inz
// ============================================================

/** Extract file extension from a URL, lowercase, no dot. */
export function extractExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('.');
    if (parts.length < 2) return '';
    const ext = parts[parts.length - 1].split('?')[0].toLowerCase();
    return ext.length <= 6 ? ext : ''; // sanity check
  } catch {
    return '';
  }
}

/** Extract a guessed filename from a URL path. */
export function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    const last = decodeURIComponent(parts[parts.length - 1] || '');
    return last.replace(/[?#].*$/, '').trim() || null;
  } catch {
    return null;
  }
}

/** Check if a string is a valid absolute HTTP(S) URL. */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Strip tracking params, normalize URL. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Remove common tracking params
    const trackingParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','mc_eid'];
    trackingParams.forEach(p => u.searchParams.delete(p));
    return u.href;
  } catch {
    return url;
  }
}

/** Extract domain (hostname) from a URL. */
export function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
