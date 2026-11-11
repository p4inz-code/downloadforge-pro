// ============================================================
// DownloadForge Pro — src/downloader/downloader_bundle.js
// P4inz Interactive Labs | p4inz
//
// Client Controller for DownloadForge Pro Stream Studio.
// Integrates HLSEngine, MPEG-DASH Engine, Direct-to-Disk Streaming,
// Heatmap Visualizer, Time-Range Slicing, Subtitles Extraction,
// and CLI Command Export.
// ============================================================

import { HLSEngine, CONCURRENCY_PROFILES } from '../core/hls_engine.js';
import { parseHLSManifest } from '../core/hls_parser.js';
import { parseDASHManifest } from '../core/dash_parser.js';

let currentEngine = null;
let currentBlob = null;
let currentBlobUrl = null;
let currentManifest = null;
let targetFilename = 'downloaded_video.mp4';
let isRecordMode = false;
let currentCliCmd = 'ytdlp';

// DOM Elements
const streamTitle = document.getElementById('streamTitle');
const streamDomain = document.getElementById('streamDomain');
const streamUrlInput = document.getElementById('streamUrlInput');
const btnLoadStream = document.getElementById('btnLoadStream');
const variantRow = document.getElementById('variantRow');
const variantSelect = document.getElementById('variantSelect');
const subtitleRow = document.getElementById('subtitleRow');
const subtitleSelect = document.getElementById('subtitleSelect');
const btnDownloadSubs = document.getElementById('btnDownloadSubs');
const sliceStart = document.getElementById('sliceStart');
const sliceEnd = document.getElementById('sliceEnd');
const btnClearSlice = document.getElementById('btnClearSlice');
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

// CLI Modal Elements
const btnExportCli = document.getElementById('btnExportCli');
const cliModal = document.getElementById('cliModal');
const btnCloseCliModal = document.getElementById('btnCloseCliModal');
const cliOutputText = document.getElementById('cliOutputText');
const btnCopyCli = document.getElementById('btnCopyCli');
const cliCopiedToast = document.getElementById('cliCopiedToast');
const modalTabs = document.querySelectorAll('.modal-tab');

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

// ── 3. Analyze Stream Manifest (Dual HLS + MPEG-DASH) ─────────
async function analyzeStream(url) {
  statusMessage.textContent = 'Analyzing stream playlist and available tracks...';
  engineStatus.textContent = 'Inspecting';

  // Check if direct static file
  if (/\.(mp4|webm|mkv|mov|mp3|m4a)(\?.*)?$/i.test(url)) {
    statusMessage.textContent = 'Direct media file detected. Click Start to download directly.';
    engineStatus.textContent = 'Direct File';
    variantRow.style.display = 'none';
    if (subtitleRow) subtitleRow.style.display = 'none';
    btnStart.disabled = false;
    return;
  }

  try {
    const isMpd = url.includes('.mpd') || url.includes('/dash/');
    let manifest = null;

    if (isMpd) {
      statusMessage.textContent = 'Parsing MPEG-DASH MPD manifest...';
      manifest = await parseDASHManifest(url);
    } else {
      manifest = await parseHLSManifest(url);
      if (manifest.error && (manifest.error.includes('xml') || manifest.error.includes('MPD'))) {
        manifest = await parseDASHManifest(url);
      }
    }

    currentManifest = manifest;

    if (currentManifest.error) {
      statusMessage.textContent = `Manifest Note: ${currentManifest.error}. Ready to attempt chunked fetch.`;
      engineStatus.textContent = 'Ready';
      btnStart.disabled = false;
      return;
    }

    // Populate Variants / Representations
    if (currentManifest.variants && currentManifest.variants.length > 0) {
      variantSelect.innerHTML = '';
      currentManifest.variants.forEach((v, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const res = v.resolution ? `${v.resolution.width ? v.resolution.width + 'x' + v.resolution.height : v.resolution}` : '';
        const bw = v.bandwidth ? `${Math.round(v.bandwidth / 1000)} kbps` : '';
        opt.textContent = `${v.label || res || 'Track ' + (idx + 1)} ${bw ? `(${bw})` : ''}`;
        variantSelect.appendChild(opt);
      });
      variantRow.style.display = 'flex';

      const firstTrack = currentManifest.variants[0];
      const segCount = firstTrack.segments ? firstTrack.segments.length : (currentManifest.segments ? currentManifest.segments.length : 0);
      statusMessage.textContent = `${currentManifest.type === 'dash' ? 'MPEG-DASH' : 'HLS Master'} playlist loaded with ${currentManifest.variants.length} tracks. Ready to download.`;
      if (segCount > 0) initSegmentGrid(segCount);
    } else {
      variantRow.style.display = 'none';
      const segCount = currentManifest.segments ? currentManifest.segments.length : 0;
      statusMessage.textContent = `Media playlist loaded with ${segCount} segments. Ready to download.`;
      initSegmentGrid(segCount);
    }

    // Populate Subtitles (if present)
    if (subtitleRow && subtitleSelect) {
      if (currentManifest.subtitles && currentManifest.subtitles.length > 0) {
        subtitleSelect.innerHTML = '';
        currentManifest.subtitles.forEach((s, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `${s.name || s.language || 'Subtitle ' + (idx + 1)} (${s.language || 'und'})`;
          subtitleSelect.appendChild(opt);
        });
        subtitleRow.style.display = 'flex';
      } else {
        subtitleRow.style.display = 'none';
      }
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

// ── 4. Subtitles Download Handler ─────────────────────────────
async function downloadSubtitles() {
  if (!currentManifest || !currentManifest.subtitles || currentManifest.subtitles.length === 0) return;
  const idx = parseInt(subtitleSelect.value, 10) || 0;
  const sub = currentManifest.subtitles[idx];
  if (!sub || !sub.url) return;

  statusMessage.textContent = `Fetching subtitles: ${sub.name || 'track'}...`;
  try {
    const res = await fetch(sub.url);
    const text = await res.text();
    let vttContent = text;

    // Check if it's an m3u8 playlist containing WebVTT chunk urls
    if (text.includes('#EXTM3U')) {
      const lines = text.split('\n');
      const segmentUrls = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          try {
            segmentUrls.push(new URL(trimmed, sub.url).href);
          } catch (e) {
            segmentUrls.push(trimmed);
          }
        }
      }

      if (segmentUrls.length > 0) {
        const chunks = [];
        for (const sUrl of segmentUrls) {
          const cRes = await fetch(sUrl);
          const cText = await cRes.text();
          chunks.push(cText);
        }
        vttContent = 'WEBVTT\n\n' + chunks.map(c => c.replace(/^WEBVTT[^\n]*\n+/g, '')).join('\n');
      }
    }

    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);
    const subFilename = targetFilename.replace(/\.[^.]+$/, '') + `_${sub.language || 'sub'}.vtt`;

    if (chrome?.downloads?.download) {
      chrome.downloads.download({
        url: blobUrl,
        filename: subFilename,
        saveAs: true,
      });
    } else {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = subFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    statusMessage.textContent = `Subtitles downloaded: ${subFilename}`;
  } catch (err) {
    statusMessage.textContent = `Failed to download subtitles: ${err.message}`;
  }
}

// ── 5. Time Parsing Helper ────────────────────────────────────
function parseTimeString(str) {
  if (!str) return null;
  const parts = str.trim().split(':').map(val => parseFloat(val));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

// ── 6. Start Download & Transmuxing ───────────────────────────
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
  if (currentManifest?.variants && currentManifest.variants.length > 0) {
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

  // Time-Range Slicing
  let timeRange = null;
  if (sliceStart && sliceEnd) {
    const sStart = parseTimeString(sliceStart.value);
    const sEnd = parseTimeString(sliceEnd.value);
    if (sStart !== null || sEnd !== null) {
      timeRange = {
        startSec: sStart !== null ? sStart : 0,
        endSec: sEnd !== null ? sEnd : Infinity,
      };
      statusMessage.textContent = `Time-Range Slicing enabled: ${timeRange.startSec}s to ${timeRange.endSec === Infinity ? 'End' : timeRange.endSec + 's'}`;
    }
  }

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
      manifest: currentManifest,
      writableStream,
      timeRange,
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

// ── 7. Save to Disk Fallback ──────────────────────────────────
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

// ── 8. CLI Export Modal Logic ─────────────────────────────────
function updateCliCommand() {
  const url = streamUrlInput.value.trim();
  const referer = customReferer ? customReferer.value.trim() : '';
  const filename = targetFilename || 'video.mp4';
  let refArg = referer;
  if (!refArg && url) {
    try {
      refArg = new URL(url).origin;
    } catch (e) {}
  }

  let cmd = '';
  if (currentCliCmd === 'ytdlp') {
    cmd = `yt-dlp "${url}"` + (refArg ? ` --referer "${refArg}"` : '') + ` -o "${filename}"`;
  } else if (currentCliCmd === 'curl') {
    cmd = `curl -L "${url}"` + (refArg ? ` -H "Referer: ${refArg}"` : '') + ` -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${filename}"`;
  } else if (currentCliCmd === 'aria2c') {
    cmd = `aria2c -x 16 -s 16` + (refArg ? ` --header="Referer: ${refArg}"` : '') + ` -o "${filename}" "${url}"`;
  }
  if (cliOutputText) cliOutputText.value = cmd;
}

if (btnExportCli && cliModal) {
  btnExportCli.addEventListener('click', () => {
    updateCliCommand();
    cliModal.style.display = 'flex';
  });

  if (btnCloseCliModal) {
    btnCloseCliModal.addEventListener('click', () => {
      cliModal.style.display = 'none';
    });
  }

  cliModal.addEventListener('click', (e) => {
    if (e.target === cliModal) {
      cliModal.style.display = 'none';
    }
  });

  modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modalTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCliCmd = tab.getAttribute('data-cmd');
      updateCliCommand();
    });
  });

  if (btnCopyCli && cliOutputText) {
    btnCopyCli.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cliOutputText.value);
        if (cliCopiedToast) {
          cliCopiedToast.style.display = 'inline-block';
          setTimeout(() => {
            cliCopiedToast.style.display = 'none';
          }, 2000);
        }
      } catch (err) {
        cliOutputText.select();
        document.execCommand('copy');
      }
    });
  }
}

// ── 9. Slicer Input Listeners ─────────────────────────────────
if (sliceStart && sliceEnd && btnClearSlice) {
  const checkSlicerState = () => {
    if (sliceStart.value.trim() || sliceEnd.value.trim()) {
      btnClearSlice.style.display = 'inline-block';
    } else {
      btnClearSlice.style.display = 'none';
    }
  };
  sliceStart.addEventListener('input', checkSlicerState);
  sliceEnd.addEventListener('input', checkSlicerState);
  btnClearSlice.addEventListener('click', () => {
    sliceStart.value = '';
    sliceEnd.value = '';
    btnClearSlice.style.display = 'none';
  });
}

// ── 10. Event Listeners ──────────────────────────────────────
btnLoadStream.addEventListener('click', () => {
  const url = streamUrlInput.value.trim();
  if (url) analyzeStream(url);
});

if (btnDownloadSubs) {
  btnDownloadSubs.addEventListener('click', downloadSubtitles);
}

btnStart.addEventListener('click', startDownload);

btnCancel.addEventListener('click', () => {
  if (currentEngine) {
    currentEngine.abort();
  }
});

btnSave.addEventListener('click', saveMp4);

document.addEventListener('DOMContentLoaded', initFromUrl);
