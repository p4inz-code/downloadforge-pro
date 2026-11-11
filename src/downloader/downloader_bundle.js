// ============================================================
// DownloadForge Pro — src/downloader/downloader_bundle.js
// P4inz Interactive Labs | p4inz
//
// Client Controller for DownloadForge Pro Stream Studio.
// Integrates HLSEngine, Direct-to-Disk Streaming, Heatmap Visualizer,
// and Advanced FetchV Parity Settings.
// ============================================================

import { HLSEngine, CONCURRENCY_PROFILES } from '../core/hls_engine.js';
import { parseHLSManifest } from '../core/hls_parser.js';

let currentEngine = null;
let currentBlob = null;
let currentBlobUrl = null;
let currentManifest = null;
let targetFilename = 'downloaded_video.mp4';
let isRecordMode = false;

// DOM Elements
const streamTitle = document.getElementById('streamTitle');
const streamDomain = document.getElementById('streamDomain');
const streamUrlInput = document.getElementById('streamUrlInput');
const btnLoadStream = document.getElementById('btnLoadStream');
const variantRow = document.getElementById('variantRow');
const variantSelect = document.getElementById('variantSelect');
const concurrencySelect = document.getElementById('concurrencySelect');
const retrySelect = document.getElementById('retrySelect');
const timeoutSelect = document.getElementById('timeoutSelect');
const formatSelect = document.getElementById('formatSelect');
const customReferer = document.getElementById('customReferer');
const chkDirectDisk = document.getElementById('chkDirectDisk');
const chkSkipBroken = document.getElementById('chkSkipBroken');
const statPercent = document.getElementById('statPercent');
const statSegments = document.getElementById('statSegments');
const statSpeed = document.getElementById('statSpeed');
const statEta = document.getElementById('statEta');
const progressBarFill = document.getElementById('progressBarFill');
const statusMessage = document.getElementById('statusMessage');
const segmentGrid = document.getElementById('segmentGrid');
const btnStart = document.getElementById('btnStart');
const btnCancel = document.getElementById('btnCancel');
const btnSave = document.getElementById('btnSave');
const previewCard = document.getElementById('previewCard');
const previewPlayer = document.getElementById('previewPlayer');
const engineStatus = document.getElementById('engineStatus');

// ── 1. Init from URL Query Params ────────────────────────────
function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const streamUrl = params.get('url');
  const filename = params.get('filename') || params.get('title');
  const mode = params.get('mode');
  const referer = params.get('referer');

  if (referer && customReferer) {
    customReferer.value = referer;
  }

  if (filename) {
    targetFilename = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
    streamTitle.textContent = filename;
  }

  if (mode === 'record') {
    initRecordMode(filename);
    return;
  }

  if (streamUrl) {
    streamUrlInput.value = streamUrl;
    try {
      streamDomain.textContent = new URL(streamUrl).hostname;
    } catch (e) {}
    analyzeStream(streamUrl);
  }
}

// ── 2. Record Mode Setup ─────────────────────────────────────
function initRecordMode(title) {
  isRecordMode = true;
  engineStatus.textContent = 'Record Mode';
  streamTitle.textContent = `Live Buffer Recorder: ${title || 'Active Video'}`;
  streamUrlInput.value = 'In-page recorder active. Play the video in the source tab to buffer chunks.';
  streamUrlInput.disabled = true;
  btnLoadStream.disabled = true;
  statusMessage.textContent = 'Stream Studio is ready. To record directly inside the webpage with 1x-16x speedup, use the floating in-video overlay.';
  btnStart.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>Save Active Buffer</span>
  `;
}

// ── 3. Analyze Stream Manifest ───────────────────────────────
async function analyzeStream(url) {
  statusMessage.textContent = 'Analyzing stream playlist and available variants...';
  engineStatus.textContent = 'Inspecting';

  try {
    currentManifest = await parseHLSManifest(url);

    if (currentManifest.error) {
      // Check if it's a direct video link
      if (/\.(mp4|webm|mkv|mov|mp3|m4a)(\?.*)?$/i.test(url)) {
        statusMessage.textContent = 'Direct media file detected. Click Start to download directly.';
        engineStatus.textContent = 'Direct File';
        btnStart.disabled = false;
        return;
      }
      statusMessage.textContent = `Manifest Note: ${currentManifest.error}. Ready to attempt chunked fetch.`;
      engineStatus.textContent = 'Ready';
      btnStart.disabled = false;
      return;
    }

    if (currentManifest.type === 'master' && currentManifest.variants.length > 0) {
      variantSelect.innerHTML = '';
      currentManifest.variants.forEach((v, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const res = v.resolution ? `${v.resolution.width}x${v.resolution.height}` : '';
        const bw = v.bandwidth ? `${Math.round(v.bandwidth / 1000)} kbps` : '';
        opt.textContent = `${v.label || res || 'Track ' + (idx + 1)} ${bw ? `(${bw})` : ''}`;
        variantSelect.appendChild(opt);
      });
      variantRow.style.display = 'flex';
      statusMessage.textContent = `Master playlist loaded with ${currentManifest.variants.length} tracks. Ready to download.`;
    } else {
      variantRow.style.display = 'none';
      const segCount = currentManifest.segments ? currentManifest.segments.length : 0;
      statusMessage.textContent = `Media playlist loaded with ${segCount} segments. Ready to download.`;
      initSegmentGrid(segCount);
    }

    engineStatus.textContent = 'Ready';
    btnStart.disabled = false;
  } catch (err) {
    statusMessage.textContent = `Analysis note: ${err.message}`;
    engineStatus.textContent = 'Ready';
    btnStart.disabled = false;
  }
}

function initSegmentGrid(total) {
  segmentGrid.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'seg-dot';
    dot.id = `seg_${i}`;
    segmentGrid.appendChild(dot);
  }
  statSegments.textContent = `0 / ${total}`;
}

// ── 4. Start Download & Transmuxing ───────────────────────────
async function startDownload() {
  const url = streamUrlInput.value.trim();
  if (!url) return;

  // Handle direct file URLs
  if (/\.(mp4|webm|mkv|mov|mp3|m4a)(\?.*)?$/i.test(url) && (!currentManifest || currentManifest.error)) {
    statusMessage.textContent = 'Starting direct media download...';
    try {
      if (chrome?.downloads?.download) {
        chrome.downloads.download({
          url,
          filename: targetFilename,
          saveAs: true,
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = targetFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      statusMessage.textContent = 'Direct download started successfully!';
      engineStatus.textContent = 'Downloading';
    } catch (e) {
      statusMessage.textContent = `Download error: ${e.message}`;
    }
    return;
  }

  btnStart.style.display = 'none';
  btnCancel.style.display = 'inline-flex';
  btnSave.style.display = 'none';
  previewCard.style.display = 'none';
  engineStatus.textContent = 'Downloading';

  let selectedVariant = null;
  if (currentManifest?.type === 'master' && currentManifest.variants.length > 0) {
    const selectedIndex = parseInt(variantSelect.value, 10) || 0;
    selectedVariant = currentManifest.variants[selectedIndex];
  }

  // Concurrency mapping
  const modeKey = concurrencySelect ? concurrencySelect.value : 'turbo';
  let concurrency = CONCURRENCY_PROFILES.TURBO;
  if (modeKey === 'ultra') concurrency = CONCURRENCY_PROFILES.ULTRA;
  else if (modeKey === 'maximum') concurrency = CONCURRENCY_PROFILES.MAXIMUM;
  else if (modeKey === 'balanced') concurrency = CONCURRENCY_PROFILES.BALANCED;
  else if (modeKey === 'gentle') concurrency = CONCURRENCY_PROFILES.GENTLE;
  else if (modeKey === 'safe') concurrency = CONCURRENCY_PROFILES.SAFE;

  // Advanced settings
  const maxRetries = retrySelect ? parseInt(retrySelect.value, 10) || 3 : 3;
  const timeoutMs = timeoutSelect ? parseInt(timeoutSelect.value, 10) || 15000 : 15000;
  const skipFailedSegments = chkSkipBroken ? chkSkipBroken.checked : true;
  const referer = customReferer ? customReferer.value.trim() : null;
  const audioOnly = formatSelect ? formatSelect.value === 'audio' : false;

  // Direct-to-Disk writable stream setup
  let writableStream = null;
  const useDirectDisk = chkDirectDisk && chkDirectDisk.checked && window.showSaveFilePicker;

  if (useDirectDisk && !audioOnly) {
    try {
      statusMessage.textContent = 'Choose destination file on local disk...';
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: targetFilename,
        types: [{
          description: 'MP4 Video (*.mp4)',
          accept: { 'video/mp4': ['.mp4'] }
        }]
      });
      writableStream = await fileHandle.createWritable();
      statusMessage.textContent = 'Streaming segments directly to disk (0% RAM bloat)...';
    } catch (e) {
      statusMessage.textContent = 'Download cancelled: No destination file selected';
      btnStart.style.display = 'inline-flex';
      btnCancel.style.display = 'none';
      engineStatus.textContent = 'Cancelled';
      return;
    }
  }

  currentEngine = new HLSEngine({
    concurrency,
    maxRetries,
    timeoutMs,
    skipFailedSegments,
    referer,
    audioOnly,
    onStatus: (msg) => {
      statusMessage.textContent = msg;
    },
    onProgress: (info) => {
      statPercent.textContent = `${info.percent}%`;
      statSegments.textContent = `${info.completed} / ${info.total}`;
      statSpeed.textContent = `${info.speedMBs} MB/s`;
      statEta.textContent = info.etaSec > 0 ? `${info.etaSec}s` : '--';
      progressBarFill.style.width = `${info.percent}%`;

      const dot = document.getElementById(`seg_${info.index}`);
      if (dot) {
        dot.className = info.failed ? 'seg-dot failed' : 'seg-dot done';
      }
    }
  });

  try {
    const result = await currentEngine.downloadAndMux(url, {
      selectedVariant,
      writableStream,
    });

    engineStatus.textContent = 'Complete';
    btnCancel.style.display = 'none';

    if (result.directStream) {
      statusMessage.textContent = `Saved directly to disk: ${targetFilename}`;
      progressBarFill.style.width = '100%';
      statPercent.textContent = '100%';
    } else {
      currentBlob = result.blob;
      statusMessage.textContent = 'Transmuxing complete! MP4 is ready.';
      btnSave.style.display = 'inline-flex';

      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = URL.createObjectURL(currentBlob);
      previewPlayer.src = currentBlobUrl;
      previewCard.style.display = 'block';
    }

  } catch (err) {
    engineStatus.textContent = 'Stopped';
    statusMessage.textContent = `Download stopped: ${err.message}`;
    btnStart.style.display = 'inline-flex';
    btnCancel.style.display = 'none';
  }
}

// ── 5. Save to Disk Fallback ──────────────────────────────────
function saveMp4() {
  if (!currentBlobUrl) return;

  try {
    if (chrome?.downloads?.download) {
      chrome.downloads.download({
        url: currentBlobUrl,
        filename: targetFilename,
        saveAs: true,
      });
      return;
    }
  } catch (e) {}

  const a = document.createElement('a');
  a.href = currentBlobUrl;
  a.download = targetFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── 6. Event Listeners ───────────────────────────────────────
btnLoadStream.addEventListener('click', () => {
  const url = streamUrlInput.value.trim();
  if (url) analyzeStream(url);
});

btnStart.addEventListener('click', startDownload);

btnCancel.addEventListener('click', () => {
  if (currentEngine) {
    currentEngine.abort();
  }
});

btnSave.addEventListener('click', saveMp4);

document.addEventListener('DOMContentLoaded', initFromUrl);
