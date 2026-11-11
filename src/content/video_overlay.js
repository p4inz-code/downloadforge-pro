// ============================================================
// DownloadForge Pro — content/video_overlay.js
// P4inz Interactive Labs | p4inz
//
// In-Page Video Overlay & Live Buffer Recording Engine
// - Attaches subtle Outlinedesk download pill to every video player
// - Displays detected quality (4K, 1080p, 720p)
// - Dispatches safe background tab creation (zero ERR_BLOCKED_BY_CLIENT)
// - Native In-Page Live Buffer Recorder with 1x-16x speedup controls
// ============================================================

import { MSG } from '../shared/constants.js';

const detectedMediaList = [];

export function registerDetectedMedia(item) {
  if (item && item.url) {
    detectedMediaList.unshift(item);
    if (detectedMediaList.length > 50) detectedMediaList.pop();
  }
}

let interceptedMseChunks = [];
let onMseChunkCallback = null;

export function onBufferChunkIntercepted(chunkData) {
  if (chunkData && chunkData.chunk) {
    interceptedMseChunks.push(chunkData.chunk);
    if (onMseChunkCallback) {
      onMseChunkCallback(chunkData);
    }
  }
}

export function initVideoOverlay() {
  const trackedVideos = new WeakSet();

  function attachOverlayToVideo(video) {
    if (!video || trackedVideos.has(video)) return;
    trackedVideos.add(video);

    const parent = video.parentElement;
    if (!parent) return;

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    parent.addEventListener('mouseenter', () => parent.classList.add('df-video-container-hover'));
    parent.addEventListener('mouseleave', () => parent.classList.remove('df-video-container-hover'));

    // Create Overlay Wrapper
    const overlay = document.createElement('div');
    overlay.className = 'df-video-overlay-wrap';

    const pill = document.createElement('button');
    pill.className = 'df-pill-btn';
    pill.title = 'Download video with DownloadForge Pro';

    function getBestMediaSource() {
      const src = video.currentSrc || video.src || '';
      // Check if sniffer detected an M3U8 stream on the page
      const matchingStream = detectedMediaList.find(m => m.url.includes('.m3u8'));
      if (matchingStream) {
        return { type: 'hls', url: matchingStream.url };
      }
      if (src.includes('.m3u8')) {
        return { type: 'hls', url: src };
      }
      if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
        return { type: 'direct', url: src };
      }
      return { type: 'blob', url: src };
    }

    function updatePillState() {
      const source = getBestMediaSource();
      const height = video.videoHeight || 1080;
      const qualityText = height >= 2160 ? '4K' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : `${height}p`;

      if (source.type === 'hls') {
        pill.className = 'df-pill-btn hls-mode';
        pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download Stream</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
      } else if (source.type === 'direct') {
        pill.className = 'df-pill-btn';
        pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
      } else {
        pill.className = 'df-pill-btn record-mode';
        pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>
          <span>Record Video</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
      }
    }

    updatePillState();
    video.addEventListener('loadedmetadata', updatePillState);
    video.addEventListener('play', updatePillState);

    // Click handler on pill
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const source = getBestMediaSource();
      const title = (document.title || 'video').replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 80);

      if (source.type === 'hls') {
        // Safe dispatch to Service Worker (no window.open -> zero ERR_BLOCKED_BY_CLIENT)
        chrome.runtime.sendMessage({
          type: MSG.OPEN_DOWNLOADER || 'OPEN_DOWNLOADER',
          payload: {
            url: source.url,
            filename: `${title}.mp4`,
            mode: 'stream',
            title,
          },
        });
      } else if (source.type === 'direct') {
        chrome.runtime.sendMessage({
          type: MSG.DOWNLOAD_ITEM || 'DOWNLOAD_ITEM',
          payload: {
            url: source.url,
            filename: `${title}.mp4`,
          },
        });
      } else {
        // Live Buffer Recording Mode directly in-page
        startInPageRecording(video, title, parent);
      }
    });

    // Picture-in-Picture Quick Toggle
    const pipBtn = document.createElement('button');
    pipBtn.className = 'df-action-btn';
    pipBtn.title = 'Picture-in-Picture';
    pipBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <rect x="12" y="10" width="8" height="8" rx="1"/>
      </svg>
    `;
    pipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
          await video.requestPictureInPicture();
        }
      } catch (err) {}
    });

    overlay.appendChild(pill);
    overlay.appendChild(pipBtn);
    parent.appendChild(overlay);
  }

  // ── In-Page Live Recording HUD Engine ────────────────────────
  function startInPageRecording(video, title, container) {
    if (container.querySelector('.df-rec-hud')) return;

    let stream = null;
    try {
      if (typeof video.captureStream === 'function') {
        stream = video.captureStream();
      } else if (typeof video.mozCaptureStream === 'function') {
        stream = video.mozCaptureStream();
      }
    } catch (err) {
      console.warn('[DownloadForge] captureStream blocked by CORS:', err);
    }

    if (!stream) {
      // Fallback: Open Stream Studio in record mode safely via background worker
      chrome.runtime.sendMessage({
        type: MSG.OPEN_DOWNLOADER || 'OPEN_DOWNLOADER',
        payload: { mode: 'record', title },
      });
      return;
    }

    const mimeTypes = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const isMp4 = mimeType.includes('mp4');

    let chunks = [];
    let recordedBytes = 0;
    let rawMseBytes = 0;
    let secondsElapsed = 0;
    let timerInterval = null;
    let chronoInterval = null;
    let isChronoActive = false;
    const originalMuted = video.muted;

    // Build Outlinedesk Floating HUD with Chrono-Pacer & Buffer Bar
    const hud = document.createElement('div');
    hud.className = 'df-rec-hud';
    hud.innerHTML = `
      <div class="df-rec-badge"><span class="df-rec-dot"></span>REC</div>
      <div class="df-rec-timer" id="dfRecTimer">00:00</div>
      <div class="df-rec-size" id="dfRecSize">0.0 MB</div>
      <div class="df-buffer-bar" title="Buffer Timeline"><div class="df-buffer-fill" id="dfBufferFill"></div></div>
      <button class="df-rec-chrono-btn" id="dfRecChrono" title="Auto-Seek Turbo Harvesting without audio stutter">
        <span>Turbo Jump</span>
      </button>
      <div class="df-rec-speeds">
        <button class="df-spd-btn active" data-spd="1">1x</button>
        <button class="df-spd-btn" data-spd="2">2x</button>
        <button class="df-spd-btn" data-spd="4">4x</button>
        <button class="df-spd-btn" data-spd="8">8x</button>
        <button class="df-spd-btn" data-spd="16">16x</button>
      </div>
      <button class="df-rec-btn df-rec-save" id="dfRecSave">Stop &amp; Save MP4</button>
      <button class="df-rec-btn df-rec-cancel" id="dfRecCancel">Cancel</button>
    `;

    container.appendChild(hud);

    const timerEl = hud.querySelector('#dfRecTimer');
    const sizeEl = hud.querySelector('#dfRecSize');
    const saveBtn = hud.querySelector('#dfRecSave');
    const cancelBtn = hud.querySelector('#dfRecCancel');
    const speedBtns = hud.querySelectorAll('.df-spd-btn');
    const chronoBtn = hud.querySelector('#dfRecChrono');
    const bufferFill = hud.querySelector('#dfBufferFill');

    // Enable main-world MSE bitstream chunk interception
    window.postMessage({ type: 'DF_RECORD_MODE_TOGGLE', active: true }, '*');
    interceptedMseChunks = [];

    onMseChunkCallback = (chunkData) => {
      rawMseBytes += chunkData.byteLength || 0;
      if (sizeEl) {
        const totalMB = ((recordedBytes + rawMseBytes) / (1024 * 1024)).toFixed(1);
        sizeEl.textContent = `${totalMB} MB${interceptedMseChunks.length > 0 ? ' (Lossless)' : ''}`;
      }
    };

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
        recordedBytes += e.data.size;
      }
    };

    function updateBufferBar() {
      if (!video || !video.duration || video.buffered.length === 0) return;
      const lastEnd = video.buffered.end(video.buffered.length - 1);
      const pct = Math.min(100, (lastEnd / video.duration) * 100);
      if (bufferFill) bufferFill.style.width = `${pct}%`;
    }

    // Chrono-Pacer auto-harvesting click handler
    chronoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isChronoActive = !isChronoActive;
      if (isChronoActive) {
        chronoBtn.classList.add('active');
        chronoBtn.querySelector('span').textContent = 'Pacing...';
        video.muted = true; // silence audio while jumping

        chronoInterval = setInterval(() => {
          if (!video || !video.duration) return;
          updateBufferBar();
          const bLen = video.buffered.length;
          const furthest = bLen > 0 ? video.buffered.end(bLen - 1) : video.currentTime;

          if (furthest < (video.duration - 2)) {
            video.currentTime = furthest + 0.3;
          } else {
            // Buffer harvesting complete!
            clearInterval(chronoInterval);
            isChronoActive = false;
            chronoBtn.classList.remove('active');
            chronoBtn.querySelector('span').textContent = '100% Cached';
            video.currentTime = 0;
            video.muted = originalMuted;
          }
        }, 600);
      } else {
        clearInterval(chronoInterval);
        chronoBtn.classList.remove('active');
        chronoBtn.querySelector('span').textContent = 'Turbo Jump';
        video.muted = originalMuted;
      }
    });

    // Speedup switching
    speedBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const spd = Number(btn.dataset.spd) || 1;
        video.playbackRate = spd;
      });
    });

    // Start recording
    recorder.start(1000);
    if (video.paused) {
      video.play().catch(() => {});
    }

    timerInterval = setInterval(() => {
      secondsElapsed++;
      const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
      const secs = String(secondsElapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      updateBufferBar();
    }, 1000);

    function cleanup() {
      clearInterval(timerInterval);
      if (chronoInterval) clearInterval(chronoInterval);
      video.playbackRate = 1.0;
      video.muted = originalMuted;
      window.postMessage({ type: 'DF_RECORD_MODE_TOGGLE', active: false }, '*');
      interceptedMseChunks = [];
      onMseChunkCallback = null;
      if (hud.parentElement) hud.remove();
    }

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Finalizing...';

      if (isChronoActive) {
        clearInterval(chronoInterval);
        video.muted = originalMuted;
      }

      window.postMessage({ type: 'DF_RECORD_MODE_TOGGLE', active: false }, '*');

      const finishDownload = (blob, ext) => {
        const blobUrl = URL.createObjectURL(blob);
        const filename = `${title}.${ext}`;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        cleanup();
      };

      // Check if lossless MSE bitstream chunks were intercepted
      if (interceptedMseChunks.length > 0) {
        if (recorder.state === 'recording') {
          try { recorder.stop(); } catch (e) {}
        }
        const lossLessBlob = new Blob(interceptedMseChunks, { type: 'video/mp4' });
        finishDownload(lossLessBlob, 'mp4');
      } else {
        recorder.onstop = () => {
          const ext = isMp4 ? 'mp4' : 'webm';
          const blob = new Blob(chunks, { type: mimeType });
          finishDownload(blob, ext);
        };
        recorder.stop();
      }
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recorder.stop();
      cleanup();
    });
  }

  // Recursive video locator across Light and Open Shadow DOM
  function findVideosRecursively(root = document) {
    if (!root) return [];
    let videos = [];
    try {
      if (root.querySelectorAll) {
        videos = Array.from(root.querySelectorAll('video'));
        root.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot) {
            videos = videos.concat(findVideosRecursively(el.shadowRoot));
          }
        });
      }
    } catch (e) {}
    return videos;
  }

  findVideosRecursively(document).forEach(attachOverlayToVideo);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'VIDEO') {
            attachOverlayToVideo(node);
          } else {
            findVideosRecursively(node).forEach(attachOverlayToVideo);
          }
        }
      }
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Attach 3D Viewer Overlays
  init3DOverlay();
}

export function init3DOverlay() {
  const tracked3D = new WeakSet();

  function attachOverlayTo3D(el) {
    if (!el || tracked3D.has(el)) return;
    tracked3D.add(el);

    const parent = el.parentElement;
    if (!parent) return;

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    parent.addEventListener('mouseenter', () => parent.classList.add('df-video-container-hover'));
    parent.addEventListener('mouseleave', () => parent.classList.remove('df-video-container-hover'));

    const overlay = document.createElement('div');
    overlay.className = 'df-video-overlay-wrap df-3d-overlay-wrap';

    const pill = document.createElement('button');
    pill.className = 'df-pill-btn df-3d-pill-btn';
    pill.title = 'Rip & Download 3D Model with DownloadForge Pro';
    pill.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
      <span>3D Rip</span>
    `;

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      let targetUrl = el.getAttribute('src') || el.src || el.getAttribute('url');
      let targetTitle = (document.title || '3D_Model').replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 80);

      // Check if Sketchfab model
      const loc = window.location.href;
      const sfMatch = loc.match(/(?:3d-models\/.*-|models\/)([0-9a-f]{32})/i) ||
                      (el.getAttribute('data-model-id') ? [null, el.getAttribute('data-model-id')] : null) ||
                      (el.src && el.src.match(/models\/([0-9a-f]{32})/i));

      if (sfMatch && sfMatch[1]) {
        targetUrl = `https://sketchfab.com/i/models/${sfMatch[1]}`;
        targetTitle = targetTitle.replace(/\s*-\s*(?:3D\s*model\s*by.*|Sketchfab).*$/i, '').trim();
      }

      if (targetUrl) {
        const ext = targetUrl.split('.').pop().split('?')[0] || 'glb';
        const filename = `${targetTitle || 'model'}.${ext.length <= 4 ? ext : 'glb'}`;
        chrome.runtime.sendMessage({
          type: MSG.DOWNLOAD_ITEM,
          payload: { url: targetUrl, filename }
        });
      } else {
        const found = detectedMediaList.find((m) => m.category === 'model_3d');
        if (found) {
          chrome.runtime.sendMessage({
            type: MSG.DOWNLOAD_ITEM,
            payload: { url: found.url, filename: found.title ? `${found.title}.glb` : 'model.glb' }
          });
        }
      }
    });

    overlay.appendChild(pill);
    parent.appendChild(overlay);
  }

  function scan3D() {
    try {
      // 1. Web Components
      document.querySelectorAll('model-viewer, spline-viewer').forEach(attachOverlayTo3D);

      // 2. Sketchfab Canvas & Containers
      document.querySelectorAll('.c-viewer, canvas.viewer, #sketchfab-viewer, div[data-model-id], div[data-uid]').forEach(attachOverlayTo3D);

      // 3. Sketchfab Embed Iframes
      document.querySelectorAll('iframe[src*="sketchfab.com"]').forEach(attachOverlayTo3D);

      // 4. Three.js / Babylon / WebGL Canvases
      document.querySelectorAll('canvas[data-engine], div.three-container, div.babylon-container').forEach(attachOverlayTo3D);
    } catch (e) {}
  }

  scan3D();
  setInterval(scan3D, 2000);
}
