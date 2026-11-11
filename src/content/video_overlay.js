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

    overlay.appendChild(pill);
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
    let secondsElapsed = 0;
    let timerInterval = null;

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
        recordedBytes += e.data.size;
      }
    };

    // Build Outlinedesk Floating HUD
    const hud = document.createElement('div');
    hud.className = 'df-rec-hud';
    hud.innerHTML = `
      <div class="df-rec-badge"><span class="df-rec-dot"></span>REC</div>
      <div class="df-rec-timer" id="dfRecTimer">00:00</div>
      <div class="df-rec-size" id="dfRecSize">0.0 MB</div>
      <div class="df-rec-speeds">
        <button class="df-spd-btn active" data-spd="1">1x</button>
        <button class="df-spd-btn" data-spd="2">2x</button>
        <button class="df-spd-btn" data-spd="4">4x</button>
        <button class="df-spd-btn" data-spd="8">8x</button>
        <button class="df-spd-btn" data-spd="16">16x</button>
      </div>
      <button class="df-rec-btn df-rec-save" id="dfRecSave">Stop &amp; Save ${isMp4 ? 'MP4' : 'Video'}</button>
      <button class="df-rec-btn df-rec-cancel" id="dfRecCancel">Cancel</button>
    `;

    container.appendChild(hud);

    const timerEl = hud.querySelector('#dfRecTimer');
    const sizeEl = hud.querySelector('#dfRecSize');
    const saveBtn = hud.querySelector('#dfRecSave');
    const cancelBtn = hud.querySelector('#dfRecCancel');
    const speedBtns = hud.querySelectorAll('.df-spd-btn');

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
      if (sizeEl) sizeEl.textContent = `${(recordedBytes / (1024 * 1024)).toFixed(1)} MB`;
    }, 1000);

    function cleanup() {
      clearInterval(timerInterval);
      video.playbackRate = 1.0;
      if (hud.parentElement) hud.remove();
    }

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Finalizing...';

      recorder.onstop = () => {
        const ext = isMp4 ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
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

      recorder.stop();
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
}
