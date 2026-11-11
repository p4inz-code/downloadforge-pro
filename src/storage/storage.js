// ============================================================
// DownloadForge — storage/storage.js
// ObsidianLabs | p4inz
//
// Storage abstraction layer.
// All chrome.storage.local access goes through here.
// Never call chrome.storage directly from UI or core files.
// ============================================================

import { STORAGE, DEFAULT_SETTINGS, LIMITS } from '../shared/constants.js';

export const StorageService = {

  // ── Settings ──────────────────────────────────────────────

  async getSettings() {
    const result = await chrome.storage.local.get(STORAGE.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE.SETTINGS] ?? {}) };
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
    history.unshift(item); // newest first
    const trimmed = history.slice(0, LIMITS.MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: trimmed });
  },

  async addBatchToHistory(items) {
    const history = await this.getHistory();
    const newItems = items.filter(i => i.ok).map(i => ({
      url: i.url,
      downloadId: i.downloadId,
      startedAt: Date.now(),
      status: 'started',
    }));
    const merged = [...newItems, ...history].slice(0, LIMITS.MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ [STORAGE.DOWNLOAD_HISTORY]: merged });
  },

  async updateHistoryItem(downloadId, updates) {
    const history = await this.getHistory();
    const idx = history.findIndex(h => h.downloadId === downloadId);
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
    return result[STORAGE.LAST_FILTER] ?? { category: 'all', sort: 'type', search: '' };
  },

  async saveLastFilter(filter) {
    await chrome.storage.local.set({ [STORAGE.LAST_FILTER]: filter });
  },

  // ── Companion Config ──────────────────────────────────────

  async getCompanionConfig() {
    const result = await chrome.storage.local.get(STORAGE.COMPANION_CONFIG);
    return result[STORAGE.COMPANION_CONFIG] ?? { enabled: false, savePath: '' };
  },

  async saveCompanionConfig(config) {
    await chrome.storage.local.set({ [STORAGE.COMPANION_CONFIG]: config });
  },

  // ── Clear all ─────────────────────────────────────────────

  async clearAll() {
    await chrome.storage.local.clear();
    await this.initDefaults();
  },
};
