// ============================================================
// DownloadForge — core/detector.js
// P4inz Interactive Labs | p4inz
//
// Detection Orchestrator.
// Combines results from:
//   1. DOM scanner (always runs — no extra permissions needed)
//   2. Network observer (optional — requires webRequest permission)
//
// Deduplicates across sources, applies domain rules,
// and returns a clean ResourceItem[] ready for display.
// ============================================================

import { scanDOM }                    from '../content/dom_scanner.js';
import { enrichResourcesWithMetadata } from './metadata.js';
import { groupByCategory, countByCategory } from './classifier.js';
import { StorageService }             from '../storage/storage.js';
import { CATEGORY, STATUS, LIMITS }   from '../shared/constants.js';
import { Logger }                     from '../utils/logger.js';

const log = new Logger('Detector');

// ── Network-observed resources (service worker side) ─────────
// Populated by webRequest listener when optional perm granted.
// Map<tabId, ResourceItem[]>
const networkCache = new Map();

/**
 * Run full detection for a tab.
 * Called from content script (DOM part) and SW (network merge).
 *
 * @param {object} options
 * @param {ResourceItem[]} options.domResources   - results from dom_scanner
 * @param {number}         options.tabId
 * @param {boolean}        options.enrichMetadata - HEAD fetch for sizes
 * @returns {Promise<DetectionResult>}
 */
export async function runDetection({ domResources = [], tabId, enrichMetadata = false }) {
  const settings = await StorageService.getSettings();

  let resources = [...domResources];

  // Merge network-observed resources if available
  const netResources = networkCache.get(tabId) ?? [];
  if (netResources.length > 0) {
    log.debug(`Tab ${tabId}: merging ${netResources.length} network-observed resources`);
    resources = mergeResources(resources, netResources);
  }

  // Apply domain rules (include/exclude filters)
  const domainRules = await StorageService.getDomainRules();
  resources = applyDomainRules(resources, domainRules);

  // Filter by settings
  resources = applySettingsFilter(resources, settings);

  // Deduplicate
  if (settings.deduplicateUrls) {
    resources = deduplicateResources(resources);
  }

  // Cap
  resources = resources.slice(0, LIMITS.MAX_RESOURCES_PER_SCAN);

  // Optional metadata enrichment (file sizes via HEAD)
  // Only enrich video/audio/document — not images (too many)
  if (enrichMetadata) {
    const priority = resources.filter(r =>
      r.category === CATEGORY.VIDEO ||
      r.category === CATEGORY.AUDIO ||
      r.category === CATEGORY.DOCUMENT
    );
    const rest = resources.filter(r =>
      r.category !== CATEGORY.VIDEO &&
      r.category !== CATEGORY.AUDIO &&
      r.category !== CATEGORY.DOCUMENT
    );

    const enriched = await enrichResourcesWithMetadata(priority, 3);
    resources = [...enriched, ...rest];
  }

  const counts = countByCategory(resources);
  const groups = groupByCategory(resources);

  log.info(`Detection complete: ${resources.length} resources`, counts);

  return {
    resources,
    counts,
    groups,
    total: resources.length,
  };
}

/**
 * Store a network-observed resource for a tab.
 * Called by webRequest listener in service worker when
 * optional webRequest permission is granted.
 *
 * @param {number} tabId
 * @param {ResourceItem} resource
 */
export function addNetworkResource(tabId, resource) {
  if (!networkCache.has(tabId)) {
    networkCache.set(tabId, []);
  }
  const existing = networkCache.get(tabId);

  // Don't add duplicates
  if (!existing.some(r => r.url === resource.url)) {
    existing.push(resource);
    log.debug(`Network resource observed on tab ${tabId}: ${resource.url}`);
  }
}

/**
 * Clear network cache for a tab (on navigation).
 */
export function clearNetworkCache(tabId) {
  networkCache.delete(tabId);
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/**
 * Merge DOM and network resources, preferring DOM items
 * (they have more context) but adding network-only ones.
 */
function mergeResources(domItems, netItems) {
  const domUrls = new Set(domItems.map(r => normalizeForDedupe(r.url)));
  const newNet  = netItems.filter(r => !domUrls.has(normalizeForDedupe(r.url)));
  return [...domItems, ...newNet];
}

/**
 * Remove duplicate URLs (case-insensitive, strip trailing slash).
 * Keeps the first occurrence (DOM items come first, preferred).
 */
function deduplicateResources(resources) {
  const seen = new Set();
  return resources.filter(r => {
    const key = normalizeForDedupe(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeForDedupe(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Apply user-defined domain include/exclude rules.
 * Rule shape: { domain: string, action: 'include'|'exclude' }
 */
function applyDomainRules(resources, rules) {
  if (!rules || rules.length === 0) return resources;

  const excludes = rules.filter(r => r.action === 'exclude').map(r => r.domain.toLowerCase());
  const includes = rules.filter(r => r.action === 'include').map(r => r.domain.toLowerCase());

  return resources.filter(r => {
    const domain = (r.domain || '').toLowerCase();

    // Explicit exclude wins
    if (excludes.some(d => domain.includes(d))) return false;

    // If includes defined, only allow those
    if (includes.length > 0) return includes.some(d => domain.includes(d));

    return true;
  });
}

/**
 * Apply user settings — hide images, min size, etc.
 */
function applySettingsFilter(resources, settings) {
  return resources.filter(r => {
    if (!settings.showImages && r.category === CATEGORY.IMAGE) return false;
    if (!settings.showDocuments && r.category === CATEGORY.DOCUMENT) return false;
    if (!settings.showArchives && r.category === CATEGORY.ARCHIVE) return false;
    if (!settings.showStreams && r.category === CATEGORY.STREAM) return false;

    // Skip known-protected resources
    if (r.status === STATUS.PROTECTED) return false;

    return true;
  });
}
