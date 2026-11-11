// ============================================================
// DownloadForge — core/updater.js
// P4inz Interactive Labs | p4inz
//
// Background GitHub Release Update Engine:
//   - Polls GitHub releases API
//   - Compares semantic versioning
//   - Dispatches update notifications
//   - Orchestrates automated update package downloads
// ============================================================

import { APP, UPDATE_CONFIG, STORAGE, MSG } from '../shared/constants.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('Updater');

/**
 * Compare two semver strings (e.g. 'v1.1.0' vs '1.0.3')
 * @param {string} latest
 * @param {string} current
 * @returns {boolean} true if latest is strictly greater than current
 */
export function isNewerVersion(latest, current) {
  const parse = (v) => (v || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const l = parse(latest);
  const c = parse(current);

  for (let i = 0; i < 3; i++) {
    const lPart = l[i] !== undefined ? l[i] : 0;
    const cPart = c[i] !== undefined ? c[i] : 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }
  return false;
}

/**
 * Fetch latest release from GitHub API and evaluate update availability.
 * @returns {Promise<object>} Update status metadata
 */
export async function checkForGitHubUpdate() {
  try {
    log.debug('Checking for updates from GitHub releases...');
    const res = await fetch(UPDATE_CONFIG.RELEASES_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      log.warn(`GitHub releases API responded with HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const latestTag = data.tag_name || '';
    const cleanLatest = latestTag.replace(/^v/, '');
    const currentVersion = APP.VERSION;
    const hasUpdate = isNewerVersion(cleanLatest, currentVersion);

    // Find attached zip asset if available
    let zipUrl = data.zipball_url;
    if (data.assets && Array.isArray(data.assets)) {
      const zipAsset = data.assets.find((a) => a.name && a.name.endsWith('.zip'));
      if (zipAsset && zipAsset.browser_download_url) {
        zipUrl = zipAsset.browser_download_url;
      }
    }

    const updateInfo = {
      ok: true,
      hasUpdate,
      latestVersion: cleanLatest,
      currentVersion,
      releaseName: data.name || latestTag,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      releaseUrl: data.html_url || `https://github.com/${UPDATE_CONFIG.GITHUB_REPO}/releases`,
      zipUrl,
      checkedAt: Date.now(),
    };

    // Save in extension storage
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ [STORAGE.UPDATE_INFO]: updateInfo });
    }

    if (hasUpdate) {
      log.info(`Update available: v${currentVersion} -> v${cleanLatest}`);
    } else {
      log.debug(`Extension is up to date: v${currentVersion}`);
    }

    return updateInfo;
  } catch (err) {
    log.warn('Update check failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Trigger update package download via chrome.downloads API.
 * @param {string} zipUrl
 * @param {string} version
 * @returns {Promise<number>} Download ID
 */
export async function downloadUpdatePackage(zipUrl, version) {
  if (!chrome?.downloads) {
    throw new Error('chrome.downloads API not available');
  }
  const filename = `downloadforge-pro-v${version || 'update'}.zip`;
  return await chrome.downloads.download({
    url: zipUrl,
    filename,
    saveAs: true,
    conflictAction: 'uniquify',
  });
}
