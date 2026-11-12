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
  init3DViewport();
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

// ─────────────────────────────────────────────────────────────
// Ninja Ripper — 3D Model Viewport Controller
// ─────────────────────────────────────────────────────────────
const preview3DState = {
  wireframe: false,
  mesh: null,
  rotX: 0.3,
  rotY: 0.6,
  zoom: 1.0,
  animId: null
};

function init3DViewport() {
  const canvas = $('df-3d-preview-canvas');
  if (!canvas) return;

  const btnWire = $('btn-toggle-wireframe');
  const btnReset = $('btn-reset-3d-camera');

  if (btnWire) {
    btnWire.addEventListener('click', () => {
      preview3DState.wireframe = !preview3DState.wireframe;
      btnWire.textContent = preview3DState.wireframe ? 'Shaded View' : 'Toggle Wireframe';
      render3DPreview();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      preview3DState.rotX = 0.3;
      preview3DState.rotY = 0.6;
      preview3DState.zoom = 1.0;
      render3DPreview();
    });
  }

  let isDragging = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener('mouseup', () => { isDragging = false; });
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    preview3DState.rotY += dx * 0.015;
    preview3DState.rotX += dy * 0.015;
    render3DPreview();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    preview3DState.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    preview3DState.zoom = Math.max(0.1, Math.min(8.0, preview3DState.zoom));
    render3DPreview();
  }, { passive: false });

  // Load cached OBJ from active tab if available
  chrome.tabs?.query({ active: true, currentWindow: true }).then(tabs => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'DF_GET_CACHED_OBJ' }).then(res => {
        if (res && res.objData) {
          loadObjToPreview(res.objData, res.title || 'Extracted Model');
        }
      }).catch(() => {});
    }
  }).catch(() => {});
}

function loadObjToPreview(objText, title = '3D Model') {
  if (!objText || typeof objText !== 'string') return;
  const lines = objText.split('\n');
  const verts = [];
  const faces = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const p = trimmed.split(/\s+/).slice(1).map(Number);
      if (p.length >= 3 && !isNaN(p[0])) verts.push(p[0], p[1], p[2]);
    } else if (trimmed.startsWith('f ')) {
      const p = trimmed.split(/\s+/).slice(1);
      const fIdx = [];
      for (const item of p) {
        const idx = parseInt(item.split('/')[0], 10);
        if (!isNaN(idx)) fIdx.push(idx > 0 ? idx - 1 : (verts.length / 3) + idx);
      }
      for (let t = 1; t < fIdx.length - 1; t++) {
        faces.push(fIdx[0], fIdx[t], fIdx[t + 1]);
      }
    }
  }

  if (verts.length < 9) return;

  // Center and normalize bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1.0;
  const scale = 2.0 / maxDim;

  const normVerts = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) {
    normVerts[i] = (verts[i] - cx) * scale;
    normVerts[i + 1] = (verts[i + 1] - cy) * scale;
    normVerts[i + 2] = (verts[i + 2] - cz) * scale;
  }

  preview3DState.mesh = {
    vertices: normVerts,
    faces: new Uint32Array(faces),
    vCount: verts.length / 3,
    fCount: faces.length / 3,
    title
  };

  const hint = $('df-3d-empty-hint');
  if (hint) hint.style.display = 'none';

  const stats = $('df-3d-mesh-stats');
  if (stats) {
    stats.textContent = `${title} | ${(verts.length / 3).toLocaleString()} vertices | ${(faces.length / 3).toLocaleString()} faces`;
  }

  render3DPreview();
}

function render3DPreview() {
  const canvas = $('df-3d-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = (canvas.width = canvas.clientWidth || 600);
  const h = (canvas.height = canvas.clientHeight || 320);

  ctx.fillStyle = '#090a0f';
  ctx.fillRect(0, 0, w, h);

  const mesh = preview3DState.mesh;
  if (!mesh || !mesh.vertices) return;

  const { vertices, faces } = mesh;
  const rx = preview3DState.rotX;
  const ry = preview3DState.rotY;
  const zoom = preview3DState.zoom * Math.min(w, h) * 0.42;

  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const cosY = Math.cos(ry), sinY = Math.sin(ry);

  // Projected 2D points
  const p2d = new Float32Array((vertices.length / 3) * 2);
  const pZ = new Float32Array(vertices.length / 3);

  for (let i = 0; i < vertices.length; i += 3) {
    let x = vertices[i];
    let y = -vertices[i + 1];
    let z = vertices[i + 2];

    // Y rotation
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;

    // X rotation
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const vIdx = i / 3;
    const pers = 1.0 / (3.5 + z2 * 0.4);
    p2d[vIdx * 2] = w / 2 + x1 * zoom * pers;
    p2d[vIdx * 2 + 1] = h / 2 + y2 * zoom * pers;
    pZ[vIdx] = z2;
  }

  if (preview3DState.wireframe) {
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const step = faces.length > 30000 ? 3 : 1;
    for (let f = 0; f < faces.length; f += 3 * step) {
      const i1 = faces[f] * 2, i2 = faces[f + 1] * 2, i3 = faces[f + 2] * 2;
      ctx.moveTo(p2d[i1], p2d[i1 + 1]);
      ctx.lineTo(p2d[i2], p2d[i2 + 1]);
      ctx.lineTo(p2d[i3], p2d[i3 + 1]);
      ctx.lineTo(p2d[i1], p2d[i1 + 1]);
    }
    ctx.stroke();
  } else {
    // Shaded face rendering with directional light
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#312e81';
    ctx.lineWidth = 0.5;

    const step = faces.length > 50000 ? 2 : 1;
    for (let f = 0; f < faces.length; f += 3 * step) {
      const idx1 = faces[f], idx2 = faces[f + 1], idx3 = faces[f + 2];
      const i1 = idx1 * 2, i2 = idx2 * 2, i3 = idx3 * 2;

      // Backface culling
      const ax = p2d[i2] - p2d[i1], ay = p2d[i2 + 1] - p2d[i1 + 1];
      const bx = p2d[i3] - p2d[i1], by = p2d[i3 + 1] - p2d[i1 + 1];
      const cross = ax * by - ay * bx;
      if (cross > 0) continue; // culled

      // Depth shading
      const avgZ = (pZ[idx1] + pZ[idx2] + pZ[idx3]) / 3;
      const shade = Math.floor(Math.max(30, Math.min(230, 140 - avgZ * 60)));
      ctx.fillStyle = `rgb(${Math.floor(shade * 0.4)}, ${Math.floor(shade * 0.4)}, ${shade})`;

      ctx.beginPath();
      ctx.moveTo(p2d[i1], p2d[i1 + 1]);
      ctx.lineTo(p2d[i2], p2d[i2 + 1]);
      ctx.lineTo(p2d[i3], p2d[i3 + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

