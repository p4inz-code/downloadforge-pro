// ============================================================
// DownloadForge Pro — src/downloader/downloader_bundle.js
// ObsidianLabs | p4inz
//
// Client Controller for DownloadForge Pro Studio.
// Integrates HLSEngine, Direct-to-Disk Streaming, and Record Mode.
// ============================================================

import { HLSEngine, CONCURRENCY_PROFILES } from '../core/hls_engine.js';
import { parseHLSManifest } from '../core/hls_parser.js';

let currentEngine = null;
let currentBlob = null;
let currentBlobUrl = null;
let currentManifest = null;
let targetFilename = 'downloaded_video.mp4';
let isRecordMode = false;

// Elements
const streamTitle = document.getElementById('streamTitle');
const streamDomain = document.getElementById('streamDomain');
const streamUrlInput = document.getElementById('streamUrlInput');
const btnLoadStream = document.getElementById('btnLoadStream');
const variantRow = document.getElementById('variantRow');
const variantSelect = document.getElementById('variantSelect');
const concurrencySelect = document.getElementById('concurrencySelect');
const chkDirectDisk = document.getElementById('chkDirectDisk');
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
  streamUrlInput.value = 'Capturing active browser player buffer (MSE/blob)...';
  streamUrlInput.disabled = true;
  btnLoadStream.disabled = true;
  statusMessage.textContent = 'Play or fast-forward the video in the source tab to buffer data, then click End & Save.';
  btnStart.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
    <span>End Buffer Recording & Save MP4</span>
  `;
}

// ── 3. Analyze Stream Manifest ───────────────────────────────
async function analyzeStream(url) {
  statusMessage.textContent = 'Analyzing stream playlist...';
  engineStatus.textContent = 'Inspecting';

  try {
    currentManifest = await parseHLSManifest(url);

    if (currentManifest.error) {
      statusMessage.textContent = `Error: ${currentManifest.error}`;
      engineStatus.textContent = 'Error';
      return;
    }

    if (currentManifest.type === 'master' && currentManifest.variants.length > 0) {
      variantSelect.innerHTML = '';
      currentManifest.variants.forEach((v, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${v.label || v.resolution || 'Auto'} (${Math.round(v.bandwidth / 1000)} kbps)`;
        variantSelect.appendChild(opt);
      });
      variantRow.style.display = 'flex';
      statusMessage.textContent = `Master playlist loaded with ${currentManifest.variants.length} quality tracks. Ready to download.`;
    } else {
      variantRow.style.display = 'none';
      const segCount = currentManifest.segments ? currentManifest.segments.length : 0;
      statusMessage.textContent = `Media playlist loaded with ${segCount} segments. Ready to download.`;
      initSegmentGrid(segCount);
    }

    engineStatus.textContent = 'Ready';
    btnStart.disabled = false;
  } catch (err) {
    statusMessage.textContent = `Failed to analyze stream: ${err.message}`;
    engineStatus.textContent = 'Error';
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

  btnStart.style.display = 'none';
  btnCancel.style.display = 'inline-block';
  btnSave.style.display = 'none';
  previewCard.style.display = 'none';
  engineStatus.textContent = 'Downloading';

  let selectedVariant = null;
  if (currentManifest?.type === 'master' && currentManifest.variants.length > 0) {
    const selectedIndex = parseInt(variantSelect.value, 10) || 0;
    selectedVariant = currentManifest.variants[selectedIndex];
  }

  // Concurrency profile selection
  const concurrencyMode = concurrencySelect ? concurrencySelect.value : 'turbo';
  const concurrency = concurrencyMode === 'maximum'
    ? CONCURRENCY_PROFILES.MAXIMUM
    : concurrencyMode === 'balanced'
      ? CONCURRENCY_PROFILES.BALANCED
      : CONCURRENCY_PROFILES.TURBO;

  // Direct-to-Disk writable stream setup (0% RAM)
  let writableStream = null;
  const useDirectDisk = chkDirectDisk && chkDirectDisk.checked && window.showSaveFilePicker;

  if (useDirectDisk) {
    try {
      statusMessage.textContent = 'Choose destination file on disk...';
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
      btnStart.style.display = 'inline-block';
      btnCancel.style.display = 'none';
      engineStatus.textContent = 'Cancelled';
      return;
    }
  }

  currentEngine = new HLSEngine({
    concurrency,
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
        dot.className = 'seg-dot done';
      }
    }
  });

  try {
    const result = await currentEngine.downloadAndMux(url, {
      selectedVariant,
      writableStream,
    });

    // Complete!
    engineStatus.textContent = 'Complete';
    btnCancel.style.display = 'none';

    if (result.directStream) {
      statusMessage.textContent = `Saved directly to disk: ${targetFilename}`;
      progressBarFill.style.width = '100%';
      statPercent.textContent = '100%';
    } else {
      currentBlob = result.blob;
      statusMessage.textContent = 'Transmuxing complete! MP4 is ready.';
      btnSave.style.display = 'inline-block';

      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = URL.createObjectURL(currentBlob);
      previewPlayer.src = currentBlobUrl;
      previewCard.style.display = 'block';
    }

  } catch (err) {
    engineStatus.textContent = 'Stopped';
    statusMessage.textContent = `Download stopped: ${err.message}`;
    btnStart.style.display = 'inline-block';
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
