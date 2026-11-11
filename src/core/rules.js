// ============================================================
// DownloadForge — core/rules.js
// P4inz Interactive Labs | p4inz
//
// Domain Rules Engine.
// Manages per-domain include/exclude/preference rules.
// ============================================================

import { StorageService } from '../storage/storage.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('Rules');

/**
 * Get all domain rules.
 */
export async function getRules() {
  return StorageService.getDomainRules();
}

/**
 * Add a new domain rule.
 * @param {{ domain: string, action: 'include'|'exclude', note?: string }} rule
 */
export async function addRule(rule) {
  const rules = await getRules();
  const normalized = rule.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Prevent duplicates
  if (rules.some(r => r.domain === normalized && r.action === rule.action)) {
    log.warn(`Rule already exists: ${normalized} → ${rule.action}`);
    return rules;
  }

  rules.push({ ...rule, domain: normalized, createdAt: Date.now() });
  await StorageService.saveDomainRules(rules);
  log.info(`Rule added: ${normalized} → ${rule.action}`);
  return rules;
}

/**
 * Remove a rule by index.
 */
export async function removeRule(index) {
  const rules = await getRules();
  rules.splice(index, 1);
  await StorageService.saveDomainRules(rules);
  return rules;
}

/**
 * Check if a domain is excluded.
 */
export async function isDomainExcluded(domain) {
  const rules = await getRules();
  return rules.some(r => r.action === 'exclude' && domain.includes(r.domain));
}

/**
 * Apply rules to a resource list.
 */
export function applyRules(resources, rules) {
  if (!rules || rules.length === 0) return resources;

  const excludes = rules.filter(r => r.action === 'exclude').map(r => r.domain);
  const includes = rules.filter(r => r.action === 'include').map(r => r.domain);

  return resources.filter(r => {
    const domain = (r.domain || '').toLowerCase();
    if (excludes.some(d => domain.includes(d))) return false;
    if (includes.length > 0) return includes.some(d => domain.includes(d));
    return true;
  });
}
