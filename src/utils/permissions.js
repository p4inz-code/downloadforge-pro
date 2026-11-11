// ============================================================
// DownloadForge — utils/permissions.js
// P4inz Interactive Labs | p4inz
// ============================================================

import { Logger } from './logger.js';
const log = new Logger('Permissions');

export async function hasWebRequest() {
  return chrome.permissions.contains({ permissions: ['webRequest'] });
}

export async function requestWebRequest() {
  try {
    return await chrome.permissions.request({ permissions: ['webRequest'], origins: ['<all_urls>'] });
  } catch (err) {
    log.warn('webRequest permission request failed:', err.message);
    return false;
  }
}

export async function hasAllUrls() {
  return chrome.permissions.contains({ origins: ['<all_urls>'] });
}
