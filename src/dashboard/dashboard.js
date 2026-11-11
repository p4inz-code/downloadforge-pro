// ============================================================
// DownloadForge — dashboard/dashboard.js
// P4inz Interactive Labs | p4inz
//
// Dashboard controller.
// Manages: history, domain rules, settings, companion, diagnostics
// ============================================================

import { MSG, APP, CATEGORY_META } from '../shared/constants.js';
import { StorageService }          from '../storage/storage.js';
import { addRule, removeRule, getRules } from '../core/rules.js';
import { checkCompanion }          from '../core/companion_bridge.js';
import { hasWebRequest }           from '../utils/permissions.js';
import { formatBytes, formatRelativeTime } from '../utils/format.js';

// ── State ────────────────────────────────────────────────────
let allHistory    = [];
let filteredHistory = [];
let selectedHistoryIds = new Set();
let currentView   = 'history';

const $ = id => document.getElementById(id);

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  initUpdateNotifier();
  setupNavigation();
  await loadView('history');
  $('diag-version').textContent = APP.VERSION;
});

async function initTheme() {
  const settings = await StorageService.getSettings();
  let theme = settings.theme || 'dark';
  applyTheme(theme);

  const toggleBtn = $('btnThemeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      await StorageService.updateSettings({ theme });
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const label = $('themeLabel');
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function initUpdateNotifier() {
  try {
    chrome.runtime.sendMessage({ type: MSG.CHECK_FOR_UPDATES }, (res) => {
      if (res && res.hasUpdate) {
        const updateBox = $('sidebarUpdateBox');
        const updateBtn = $('btnSidebarUpdate');
        if (updateBox) updateBox.style.display = 'block';
        if (updateBtn) {
          updateBtn.textContent = `Get v${res.latestVersion}`;
          updateBtn.addEventListener('click', () => {
            if (res.zipUrl) {
              chrome.runtime.sendMessage({
                type: MSG.APPLY_UPDATE,
                payload: { zipUrl: res.zipUrl, version: res.latestVersion }
              });
            } else if (res.releaseUrl) {
              window.open(res.releaseUrl, '_blank');
            }
          });
        }
      }
    });
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (!view) return;

      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view').forEach(v => { v.hidden = true; });
      $(`view-${view}`).hidden = false;
      currentView = view;

      await loadView(view);
    });
  });
}

async function loadView(view) {
  switch (view) {
    case 'history':     await loadHistory(); break;
    case 'rules':       await loadRules(); break;
    case 'settings':    await loadSettings(); break;
    case 'diagnostics': await loadDiagnostics(); break;
  }
}

// ─────────────────────────────────────────────────────────────
// History view
// ─────────────────────────────────────────────────────────────
async function loadHistory() {
  allHistory = await StorageService.getHistory();
  renderHistory(allHistory);
  updateHistoryStats(allHistory);
  setupHistoryControls();
}

function renderHistory(items) {
  const tbody = $('history-tbody');
  const empty = $('history-empty');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  tbody.innerHTML = '';

  const frag = document.createDocumentFragment();
  for (const item of items) {
    const tr = document.createElement('tr');
    tr.dataset.id = item.downloadId || item.url;

    const filename = item.filename || extractFilename(item.url) || 'Unknown';
    const status   = item.status || 'unknown';
    const date     = item.startedAt ? formatRelativeTime(item.startedAt) : '—';
    const catMeta  = CATEGORY_META[item.category] || { label: 'Other', color: '#6b7280' };

    tr.innerHTML = `
      <td><input type="checkbox" class="hist-check"/></td>
      <td class="filename" title="${escHtml(item.url)}">
        <span class="file-icon-dot" style="background:${catMeta.color}; display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:6px;"></span>
        ${escHtml(filename)}
      </td>
      <td class="mono">${escHtml(item.category || '—')}</td>
      <td><span class="status-pill ${status}">${status}</span></td>
      <td class="mono">${escHtml(date)}</td>
      <td>
        <button class="table-action" data-action="redownload" data-url="${escHtml(item.url)}" data-filename="${escHtml(filename)}" title="Re-download">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="table-action del" data-action="delete" title="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;

    tr.querySelector('.hist-check').addEventListener('change', (e) => {
      const id = item.downloadId || item.url;
      if (e.target.checked) selectedHistoryIds.add(id);
      else selectedHistoryIds.delete(id);
      tr.classList.toggle('selected', e.target.checked);
    });

    tr.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleHistoryAction(btn.dataset.action, item, tr));
    });

    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function updateHistoryStats(items) {
  const today = new Date().setHours(0,0,0,0);
  $('stat-total').textContent    = items.length;
  $('stat-today').textContent    = items.filter(i => i.startedAt >= today).length;
  $('stat-complete').textContent = items.filter(i => i.status === 'complete').length;
  $('stat-failed').textContent   = items.filter(i => i.status === 'interrupted').length;
}

function setupHistoryControls() {
  const searchEl = $('history-search');
  const filterEl = $('history-filter-cat');
  const checkAll = $('history-check-all');
  const clearBtn = $('btn-clear-history');

  searchEl?.addEventListener('input', filterHistory);
  filterEl?.addEventListener('change', filterHistory);

  checkAll?.addEventListener('change', (e) => {
    document.querySelectorAll('.hist-check').forEach(cb => {
      cb.checked = e.target.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  clearBtn?.addEventListener('click', async () => {
    const ok = await showCustomConfirm('Clear History', 'Are you sure you want to clear all download history?', 'Clear History', true);
    if (!ok) return;
    await StorageService.clearHistory();
    allHistory = [];
    renderHistory([]);
    updateHistoryStats([]);
    showToast('History cleared');
  });
}

function filterHistory() {
  const q   = ($('history-search')?.value || '').toLowerCase();
  const cat = $('history-filter-cat')?.value || 'all';

  filteredHistory = allHistory.filter(item => {
    const fname = (item.filename || '').toLowerCase();
    const url   = (item.url || '').toLowerCase();
    const matchQ   = !q || fname.includes(q) || url.includes(q);
    const matchCat = cat === 'all' || item.category === cat;
    return matchQ && matchCat;
  });

  renderHistory(filteredHistory);
}

async function handleHistoryAction(action, item, tr) {
  if (action === 'redownload') {
    try {
      await chrome.runtime.sendMessage({
        type: MSG.DOWNLOAD_ITEM,
        payload: { url: item.url, filename: item.filename },
      });
      showToast('Re-download started');
    } catch { showToast('Failed to start download'); }
  }
  if (action === 'delete') {
    const history = await StorageService.getHistory();
    const updated = history.filter(h => (h.downloadId || h.url) !== (item.downloadId || item.url));
    await chrome.storage.local.set({ df_history: updated });
    allHistory = updated;
    tr.remove();
    updateHistoryStats(allHistory);
    showToast('Removed from history');
  }
}

// ─────────────────────────────────────────────────────────────
// Rules view
// ─────────────────────────────────────────────────────────────
async function loadRules() {
  const rules = await getRules();
  renderRules(rules);

  $('btn-add-rule')?.addEventListener('click', async () => {
    const domain = $('rule-domain')?.value.trim();
    const action = $('rule-action')?.value;
    const note   = $('rule-note')?.value.trim();

    if (!domain) { showToast('Enter a domain first'); return; }

    await addRule({ domain, action, note });
    $('rule-domain').value = '';
    $('rule-note').value = '';
    const updated = await getRules();
    renderRules(updated);
    showToast(`Rule added: ${domain}`);
  });
}

function renderRules(rules) {
  const list  = $('rules-list');
  const empty = $('rules-empty');
  if (!list) return;

  if (!rules.length) {
    list.innerHTML = '';
    if (empty) { list.appendChild(empty); empty.hidden = false; }
    return;
  }

  if (empty) empty.hidden = true;
  list.innerHTML = '';

  rules.forEach((rule, idx) => {
    const el = document.createElement('div');
    el.className = 'rule-item';
    el.innerHTML = `
      <span class="rule-domain">${escHtml(rule.domain)}</span>
      <span class="rule-action-badge ${rule.action}">${rule.action}</span>
      ${rule.note ? `<span class="rule-note">${escHtml(rule.note)}</span>` : ''}
      <button class="table-action del" data-idx="${idx}" title="Remove rule"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
    `;
    el.querySelector('[data-idx]').addEventListener('click', async () => {
      await removeRule(idx);
      const updated = await getRules();
      renderRules(updated);
      showToast('Rule removed');
    });
    list.appendChild(el);
  });
}

// ─────────────────────────────────────────────────────────────
// Settings view
// ─────────────────────────────────────────────────────────────
async function loadSettings() {
  const settings = await StorageService.getSettings();

  // Subtab switching
  const subnav = $('settings-subnav');
  if (subnav) {
    subnav.addEventListener('click', (e) => {
      const btn = e.target.closest('.subtab-btn');
      if (!btn) return;
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const secName = btn.dataset.sec;
      document.querySelectorAll('.settings-section').forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
      });
      const activeSec = $(`sec-${secName}`);
      if (activeSec) {
        activeSec.style.display = 'flex';
        activeSec.classList.add('active');
      }
    });
  }

  // Populate toggles
  const boolKeys = [
    'autoScan', 'deduplicateUrls', 'showImages', 'showDocuments',
    'showArchives', 'showStreams', 'enableVideoOverlay', 'directDiskStream',
    'defaultSaveAs', 'showBadge', 'debugMode', 'sniff3d', 'packGltf',
    'enable3dOverlay', 'autoHealErrors'
  ];

  for (const key of boolKeys) {
    const el = $(`s-${key}`);
    if (el) el.checked = settings[key] ?? true;
  }

  // Selects
  const selectKeys = [
    { id: 's-concurrencyMode',     key: 'concurrencyMode',     default: 'turbo' },
    { id: 's-recordModeFramerate', key: 'recordModeFramerate', default: '60' },
    { id: 's-audioDefaultFormat',  key: 'audioDefaultFormat',  default: 'mp4' },
    { id: 's-audioDefaultGain',    key: 'audioDefaultGain',    default: '0' },
  ];

  for (const item of selectKeys) {
    const el = $(item.id);
    if (el) el.value = String(settings[item.key] ?? item.default);
  }

  const minSize = $('s-minFileSizeBytes');
  if (minSize) minSize.value = settings.minFileSizeBytes ?? 1024;

  // Save Settings
  $('btn-save-settings')?.addEventListener('click', async () => {
    const updated = {};
    for (const key of boolKeys) {
      const el = $(`s-${key}`);
      if (el) updated[key] = el.checked;
    }
    for (const item of selectKeys) {
      const el = $(item.id);
      if (el) updated[item.key] = el.value;
    }

    const minSizeVal = parseInt($('s-minFileSizeBytes')?.value || '0', 10);
    if (!isNaN(minSizeVal)) updated.minFileSizeBytes = minSizeVal;

    await StorageService.saveSettings(updated);
    showToast('Settings saved successfully');
  });

  // Reset to Defaults
  $('btn-reset-defaults')?.addEventListener('click', async () => {
    const ok = await showCustomConfirm(
      'Reset Settings',
      'Reset all settings to default factory values?',
      'Reset Defaults',
      false
    );
    if (!ok) return;
    await StorageService.saveSettings(DEFAULT_SETTINGS);
    showToast('Settings reset to defaults');
    await loadSettings();
  });

  // Clear all data
  $('btn-clear-all-data')?.addEventListener('click', async () => {
    const ok = await showCustomConfirm(
      'Clear All Data',
      'This will clear ALL DownloadForge data including history, domain rules, and settings. Continue?',
      'Erase All Data',
      true
    );
    if (!ok) return;
    await StorageService.clearAll();
    showToast('All data cleared');
    await loadSettings();
  });

  // Software Update Actions
  let latestUpdateData = null;
  const updateRow = $('update-action-row');
  const updateTitle = $('update-status-title');
  const updateDesc = $('update-status-desc');

  $('btn-check-updates-now')?.addEventListener('click', async () => {
    showToast('Checking for GitHub updates...');
    try {
      chrome.runtime.sendMessage({ type: MSG.CHECK_FOR_UPDATES }, (res) => {
        if (res && res.hasUpdate) {
          latestUpdateData = res;
          if (updateRow) updateRow.style.display = 'flex';
          if (updateTitle) updateTitle.textContent = `Update Ready: v${res.latestVersion}`;
          if (updateDesc) updateDesc.textContent = res.releaseName ? `${res.releaseName} is available for installation.` : 'New release package is available.';
          showToast(`v${res.latestVersion} update available!`);
        } else {
          showToast('DownloadForge is up to date!');
          if (updateRow) updateRow.style.display = 'none';
        }
      });
    } catch (e) {
      showToast('Update check failed');
    }
  });

  $('btn-download-update-now')?.addEventListener('click', () => {
    if (latestUpdateData?.zipUrl) {
      chrome.runtime.sendMessage({
        type: MSG.APPLY_UPDATE,
        payload: { zipUrl: latestUpdateData.zipUrl, version: latestUpdateData.latestVersion }
      }, (res) => {
        if (res?.ok) {
          showToast('Update package downloaded. Click Reload Extension to apply.');
        }
      });
    } else if (latestUpdateData?.releaseUrl) {
      chrome.tabs.create({ url: latestUpdateData.releaseUrl });
    }
  });

  $('btn-reload-runtime-now')?.addEventListener('click', () => {
    showToast('Reloading DownloadForge runtime...');
    setTimeout(() => {
      if (chrome?.runtime?.reload) {
        chrome.runtime.reload();
      } else {
        window.location.reload();
      }
    }, 400);
  });
}

// ── Diagnostics view ─────────────────────────────────────────
async function loadDiagnostics() {
  $('btn-run-diag')?.addEventListener('click', runDiagnostics);
  await runDiagnostics();
}

async function runDiagnostics() {
  // Storage
  try {
    const bytes = await estimateStorageUsage();
    setDiag('storage', formatBytes(bytes), 'ok');
  } catch {
    setDiag('storage', 'Error', 'error');
  }

  // Core permissions
  try {
    const hasDl = await chrome.permissions.contains({ permissions: ['downloads'] });
    const hasStorage = await chrome.permissions.contains({ permissions: ['storage'] });
    setDiag('permissions', hasDl && hasStorage ? 'OK' : 'Missing some', hasDl && hasStorage ? 'ok' : 'warn');
  } catch {
    setDiag('permissions', 'Error', 'error');
  }

  // Anti-Hotlink DNR
  setDiag('dnr', 'Active (Origin Stripped)', 'ok');

  // webRequest optional
  try {
    const has = await hasWebRequest();
    setDiag('webrequest', has ? 'Granted' : 'Not granted (optional)', has ? 'ok' : 'warn');
  } catch {
    setDiag('webrequest', 'Error', 'error');
  }
}

function setDiag(id, text, cls) {
  const el = $(`diag-${id}`)?.querySelector('.diag-val');
  if (el) { el.textContent = text; el.className = `diag-val ${cls}`; }
}

async function estimateStorageUsage() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return est.usage || 0;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function extractFilename(url) {
  try { return new URL(url).pathname.split('/').pop() || 'file'; } catch { return 'file'; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showCustomConfirm(title, message, confirmText = 'Confirm', isDanger = false) {
  return new Promise((resolve) => {
    const modal = $('confirmModal');
    const titleEl = $('confirmModalTitle');
    const msgEl = $('confirmModalMessage');
    const btnOk = $('btnConfirmOk');
    const btnCancel = $('btnConfirmCancel');
    const btnClose = $('btnConfirmClose');

    if (!modal || !btnOk || !btnCancel) {
      resolve(true);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    btnOk.textContent = confirmText;
    btnOk.className = isDanger ? 'btn-secondary btn-danger' : 'btn-primary';

    modal.style.display = 'flex';

    const cleanup = (confirmed) => {
      modal.style.display = 'none';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      btnClose?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      resolve(confirmed);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup(false);
      else if (e.key === 'Enter') cleanup(true);
    };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    btnClose?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
  });
}

