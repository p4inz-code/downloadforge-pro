// ============================================================
// DownloadForge — popup/popup.js
// ObsidianLabs | p4inz
//
// Popup controller. Handles:
//   - Loading and displaying resources from service worker
//   - Filtering, sorting, searching
//   - Single + bulk download actions
//   - Copy URL, open in tab
//   - Rescan trigger
//   - Companion app actions
//   - All UI state transitions
// ============================================================

import { MSG, CATEGORY, CATEGORY_META, STATUS } from '../shared/constants.js';
import { countByCategory } from '../core/classifier.js';
import { formatBytes, formatDuration } from '../utils/format.js';

// ── State ────────────────────────────────────────────────────
let allResources   = [];
let filteredItems  = [];
let selectedIds    = new Set();
let activeCategory = 'all';
let searchQuery    = '';
let sortMode       = 'type';
let currentTabId   = null;
let companionAvailable = false;

// ── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const panels = {
  scanning:    $('state-scanning'),
  empty:       $('state-empty'),
  error:       $('state-error'),
  unsupported: $('state-unsupported'),
  main:        $('main-content'),
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadResources();
  checkCompanion();
});

// ─────────────────────────────────────────────────────────────
// Load resources from service worker
// ─────────────────────────────────────────────────────────────
async function loadResources() {
  showPanel('scanning');

  try {
    // Get active tab info first for page bar
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id;

    if (!tab || isUnsupportedUrl(tab.url)) {
      showPanel('unsupported');
      return;
    }

    updatePageBar(tab);

    const response = await chrome.runtime.sendMessage({
      type: MSG.GET_RESOURCES,
      payload: { tabId: currentTabId },
    });

    if (!response?.ok) {
      showError(response?.error || 'Failed to get resources');
      return;
    }

    if (response.scanning || response.needsScan) {
      // Scan was just triggered — wait for it and poll
      showPanel('scanning');
      await pollForResults(currentTabId);
      return;
    }

    handleResourceResponse(response);

  } catch (err) {
    showError(err.message);
  }
}

// Poll service worker until scan completes (max 8s)
async function pollForResults(tabId, attempts = 0) {
  if (attempts > 16) {
    showError('Scan timed out. Try rescanning.');
    return;
  }

  await sleep(500);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.GET_RESOURCES,
      payload: { tabId },
    });

    if (response?.scanning || response?.needsScan) {
      await pollForResults(tabId, attempts + 1);
      return;
    }

    handleResourceResponse(response);
  } catch (err) {
    showError(err.message);
  }
}

function handleResourceResponse(response) {
  allResources = response.resources ?? [];

  if (response.lastError && allResources.length === 0) {
    showError(response.lastError);
    return;
  }

  if (allResources.length === 0) {
    showPanel('empty');
    return;
  }

  // Update scan time in page bar
  if (response.scannedAt) {
    const ms = response.scanDurationMs ?? 0;
    $('page-scan-time').textContent = ms ? `${ms}ms` : '';
  }

  updateCounts();
  applyFilterAndRender();
  showPanel('main');
}

// ─────────────────────────────────────────────────────────────
// Filter, sort, search, render
// ─────────────────────────────────────────────────────────────
function applyFilterAndRender() {
  let items = [...allResources];

  // Category filter
  if (activeCategory !== 'all') {
    items = items.filter(r => r.category === activeCategory);
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(r =>
      (r.filename || '').toLowerCase().includes(q) ||
      (r.url      || '').toLowerCase().includes(q) ||
      (r.domain   || '').toLowerCase().includes(q) ||
      (r.ext      || '').toLowerCase().includes(q)
    );
  }

  // Sort
  items = sortResources(items, sortMode);

  filteredItems = items;
  renderList(items);
  updateFooter(items.length);
}

function sortResources(items, mode) {
  return [...items].sort((a, b) => {
    switch (mode) {
      case 'name':
        return (a.filename || '').localeCompare(b.filename || '');
      case 'domain':
        return (a.domain || '').localeCompare(b.domain || '');
      case 'detected':
        return (b.detectedAt || 0) - (a.detectedAt || 0);
      case 'type':
      default: {
        const order = [CATEGORY.VIDEO, CATEGORY.AUDIO, CATEGORY.DOCUMENT, CATEGORY.ARCHIVE, CATEGORY.IMAGE, CATEGORY.STREAM, CATEGORY.OTHER, CATEGORY.UNKNOWN];
        return order.indexOf(a.category) - order.indexOf(b.category);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Render resource list
// ─────────────────────────────────────────────────────────────
function renderList(items) {
  const list = $('resource-list');

  if (items.length === 0) {
    list.innerHTML = `<div class="no-results">No results match your filter</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.appendChild(buildItemEl(item));
  }

  list.innerHTML = '';
  list.appendChild(fragment);
}

function buildItemEl(item) {
  const el = document.createElement('div');
  el.className = 'resource-item' + (selectedIds.has(item.id) ? ' selected' : '');
  el.dataset.id = item.id;
  el.role = 'listitem';

  const meta = CATEGORY_META[item.category] ?? CATEGORY_META[CATEGORY.UNKNOWN];
  const isStream = item.category === CATEGORY.STREAM || item.status === STATUS.STREAM;
  const isAuth   = item.status === STATUS.REQUIRES_AUTH;

  const sizeHtml = item.fileSize
    ? `<span class="item-size">${formatBytes(item.fileSize)}</span>`
    : '';

  const badgeHtml = isStream
    ? `<span class="item-badge stream">HLS</span>`
    : isAuth
      ? `<span class="item-badge auth">Auth</span>`
      : '';

  const companionBtn = companionAvailable
    ? `<button class="act-btn companion" data-action="companion" title="Send to desktop app">🖥</button>`
    : '';

  el.innerHTML = `
    <input type="checkbox" class="item-check" ${selectedIds.has(item.id) ? 'checked' : ''}/>
    <div class="item-icon cat-${item.category}">${meta.emoji}</div>
    <div class="item-body">
      <div class="item-name" title="${escHtml(item.url)}">${escHtml(item.filename || item.url)}</div>
      <div class="item-meta">
        ${item.ext ? `<span class="item-ext">${escHtml(item.ext)}</span>` : ''}
        <span class="item-domain">${escHtml(item.domain || '')}</span>
        ${sizeHtml}
        ${badgeHtml}
      </div>
    </div>
    <div class="item-actions">
      <button class="act-btn download" data-action="download" title="Download">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <button class="act-btn copy" data-action="copy" title="Copy URL">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="act-btn open" data-action="open" title="Open in new tab">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      ${companionBtn}
    </div>
  `;

  // Checkbox toggle
  el.querySelector('.item-check').addEventListener('change', (e) => {
    toggleSelect(item.id, e.target.checked);
  });

  // Action buttons
  el.querySelector('.item-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    handleItemAction(btn.dataset.action, item);
  });

  return el;
}

// ─────────────────────────────────────────────────────────────
// Item actions
// ─────────────────────────────────────────────────────────────
async function handleItemAction(action, item) {
  switch (action) {
    case 'download':
      await downloadItem(item);
      break;
    case 'copy':
      await copyToClipboard(item.url);
      showToast('URL copied');
      break;
    case 'open':
      chrome.tabs.create({ url: item.url, active: false });
      break;
    case 'companion':
      await sendToCompanion(item);
      break;
  }
}

async function downloadItem(item) {
  const isStream = item.category === CATEGORY.STREAM || item.status === STATUS.STREAM || item.url.includes('.m3u8');

  if (isStream) {
    const studioUrl = chrome.runtime.getURL(
      `src/downloader/downloader.html?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || 'stream_video.mp4')}`
    );
    chrome.tabs.create({ url: studioUrl, active: true });
    window.close();
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.DOWNLOAD_ITEM,
      payload: { url: item.url, filename: item.filename },
    });
    if (response?.ok) {
      showToast(`Downloading ${item.filename || 'file'}…`);
    } else {
      showToast(`Failed: ${response?.error || 'unknown error'}`);
    }
  } catch (err) {
    showToast('Download failed');
  }
}

async function sendToCompanion(item) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.COMPANION_SEND,
      payload: { url: item.url, filename: item.filename, category: item.category },
    });
    if (response?.ok) showToast('Sent to desktop app');
    else showToast('Companion unavailable');
  } catch {
    showToast('Companion unavailable');
  }
}

// ─────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else         selectedIds.delete(id);

  // Update item visual
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.toggle('selected', checked);

  updateBulkBar();
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.resource-item.selected').forEach(el => {
    el.classList.remove('selected');
    const cb = el.querySelector('.item-check');
    if (cb) cb.checked = false;
  });
  updateBulkBar();
}

function selectAll() {
  filteredItems.forEach(item => {
    selectedIds.add(item.id);
    const el = document.querySelector(`[data-id="${item.id}"]`);
    if (el) {
      el.classList.add('selected');
      const cb = el.querySelector('.item-check');
      if (cb) cb.checked = true;
    }
  });
  updateBulkBar();
}

function updateBulkBar() {
  const count = selectedIds.size;
  const bar   = $('bulk-bar');
  if (count > 0) {
    bar.hidden = false;
    $('bulk-count').textContent = `${count} selected`;
  } else {
    bar.hidden = true;
  }
}

// ─────────────────────────────────────────────────────────────
// Bulk actions
// ─────────────────────────────────────────────────────────────
async function bulkDownload() {
  const items = filteredItems.filter(r => selectedIds.has(r.id));
  if (!items.length) return;

  showToast(`Starting ${items.length} downloads…`);
  clearSelection();

  await chrome.runtime.sendMessage({
    type: MSG.DOWNLOAD_BATCH,
    payload: { items: items.map(i => ({ url: i.url, filename: i.filename })) },
  });
}

async function bulkCopyUrls() {
  const items = filteredItems.filter(r => selectedIds.has(r.id));
  const text  = items.map(i => i.url).join('\n');
  await copyToClipboard(text);
  showToast(`${items.length} URLs copied`);
  clearSelection();
}

// ─────────────────────────────────────────────────────────────
// Counts + UI updates
// ─────────────────────────────────────────────────────────────
function updateCounts() {
  const counts = countByCategory(allResources);
  const total  = allResources.length;

  $('count-all').textContent = total;

  const cats = ['video','audio','image','document','archive','stream'];
  for (const cat of cats) {
    const el = $(`count-${cat}`);
    if (el) {
      const n = counts[cat] || 0;
      el.textContent = n;
      el.closest('.filter-tab')?.setAttribute('data-count', n);
    }
  }

  // Hide tabs with 0 results
  document.querySelectorAll('.filter-tab[data-cat]').forEach(tab => {
    const cat = tab.dataset.cat;
    if (cat === 'all') return;
    const n = counts[cat] || 0;
    tab.style.display = n === 0 ? 'none' : '';
  });
}

function updateFooter(count) {
  $('footer-count').textContent = `${count} resource${count !== 1 ? 's' : ''}`;
}

function updatePageBar(tab) {
  $('page-domain').textContent = extractDomain(tab.url) || tab.url;
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.src = tab.favIconUrl;
    img.onerror = () => img.remove();
    $('page-favicon').appendChild(img);
  }
}

// ─────────────────────────────────────────────────────────────
// Panel management
// ─────────────────────────────────────────────────────────────
function showPanel(name) {
  Object.entries(panels).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function showError(msg) {
  showPanel('error');
  $('error-text').textContent = msg || 'Something went wrong';
}

// ─────────────────────────────────────────────────────────────
// Companion check
// ─────────────────────────────────────────────────────────────
async function checkCompanion() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.COMPANION_CHECK });
    companionAvailable = response?.available === true;
    $('companion-banner').hidden = !companionAvailable;
  } catch {
    companionAvailable = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────
function setupEventListeners() {
  // Rescan
  $('btn-rescan').addEventListener('click', async () => {
    $('btn-rescan').classList.add('spinning');
    allResources  = [];
    selectedIds.clear();
    showPanel('scanning');

    try {
      await chrome.runtime.sendMessage({ type: MSG.RESCAN, payload: { tabId: currentTabId } });
      await pollForResults(currentTabId);
    } catch (err) {
      showError(err.message);
    } finally {
      $('btn-rescan').classList.remove('spinning');
    }
  });

  // Stream Studio
  const btnStudio = $('btn-studio');
  if (btnStudio) {
    btnStudio.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/downloader/downloader.html') });
    });
  }

  // Dashboard
  $('btn-dashboard').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Error retry
  $('btn-error-retry').addEventListener('click', () => loadResources());

  // Filter tabs
  $('filter-bar').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;

    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeCategory = tab.dataset.cat;
    clearSelection();
    applyFilterAndRender();
  });

  // Search
  const searchInput = $('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    $('search-clear').hidden = !searchQuery;
    applyFilterAndRender();
  });

  $('search-clear').addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    $('search-clear').hidden = true;
    applyFilterAndRender();
    searchInput.focus();
  });

  // Sort
  $('sort-select').addEventListener('change', (e) => {
    sortMode = e.target.value;
    applyFilterAndRender();
  });

  // Select all
  $('btn-select-all').addEventListener('click', () => {
    if (selectedIds.size === filteredItems.length) {
      clearSelection();
    } else {
      selectAll();
    }
  });

  // Bulk actions
  $('btn-bulk-download').addEventListener('click', bulkDownload);
  $('btn-bulk-copy').addEventListener('click', bulkCopyUrls);
  $('btn-bulk-cancel').addEventListener('click', clearSelection);
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for clipboard API restrictions
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function isUnsupportedUrl(url) {
  if (!url) return true;
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('about:') ||
         url.startsWith('edge://') ||
         url.startsWith('devtools://');
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
