// ============================================================
// DownloadForge — dashboard/dashboard.js
// ObsidianLabs | p4inz
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
  setupNavigation();
  await loadView('history');
  $('diag-version').textContent = APP.VERSION;
});

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
    case 'companion':   await loadCompanion(); break;
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
    const catMeta  = CATEGORY_META[item.category] || { emoji: '🔗' };

    tr.innerHTML = `
      <td><input type="checkbox" class="hist-check"/></td>
      <td class="filename" title="${escHtml(item.url)}">${catMeta.emoji} ${escHtml(filename)}</td>
      <td class="mono">${escHtml(item.category || '—')}</td>
      <td><span class="status-pill ${status}">${status}</span></td>
      <td class="mono">${escHtml(date)}</td>
      <td>
        <button class="table-action" data-action="redownload" data-url="${escHtml(item.url)}" data-filename="${escHtml(filename)}" title="Re-download">↓</button>
        <button class="table-action del" data-action="delete" title="Remove">✕</button>
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
    if (!confirm('Clear all download history?')) return;
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
      <button class="table-action del" data-idx="${idx}" title="Remove rule">✕</button>
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

  // Populate toggles
  const boolKeys = ['autoScan','deduplicateUrls','showImages','showDocuments','showArchives','showStreams','defaultSaveAs','showBadge','debugMode'];
  for (const key of boolKeys) {
    const el = $(`s-${key}`);
    if (el) el.checked = settings[key] ?? false;
  }

  const minSize = $('s-minFileSizeBytes');
  if (minSize) minSize.value = settings.minFileSizeBytes ?? 1024;

  // Save
  $('btn-save-settings')?.addEventListener('click', async () => {
    const updated = {};
    for (const key of boolKeys) {
      const el = $(`s-${key}`);
      if (el) updated[key] = el.checked;
    }
    const minSizeVal = parseInt($('s-minFileSizeBytes')?.value || '0', 10);
    if (!isNaN(minSizeVal)) updated.minFileSizeBytes = minSizeVal;

    await StorageService.saveSettings(updated);
    showToast('Settings saved');
  });

  // Clear all data
  $('btn-clear-all-data')?.addEventListener('click', async () => {
    if (!confirm('This will clear ALL DownloadForge data including history, rules, and settings. Continue?')) return;
    await StorageService.clearAll();
    showToast('All data cleared');
    await loadSettings();
  });
}

// ─────────────────────────────────────────────────────────────
// Companion view
// ─────────────────────────────────────────────────────────────
async function loadCompanion() {
  await checkAndShowCompanionStatus();

  $('btn-check-companion')?.addEventListener('click', async () => {
    $('companion-status-text').textContent = 'Checking…';
    await checkAndShowCompanionStatus();
  });
}

async function checkAndShowCompanionStatus() {
  const indicator = $('companion-indicator');
  const text      = $('companion-status-text');

  try {
    const result = await checkCompanion();
    if (result.available) {
      indicator.className = 'status-indicator online';
      text.textContent = `Connected — v${result.version}`;
    } else {
      indicator.className = 'status-indicator offline';
      text.textContent = `Not found — ${result.error || 'Install the companion app'}`;
    }
  } catch (err) {
    indicator.className = 'status-indicator offline';
    text.textContent = 'Check failed';
  }
}

// ─────────────────────────────────────────────────────────────
// Diagnostics view
// ─────────────────────────────────────────────────────────────
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

  // Companion
  try {
    const c = await checkCompanion();
    setDiag('companion', c.available ? `Connected v${c.version}` : 'Not installed', c.available ? 'ok' : 'warn');
  } catch {
    setDiag('companion', 'Error', 'error');
  }

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
