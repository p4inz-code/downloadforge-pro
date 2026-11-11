// ============================================================
// DownloadForge Pro — content/video_overlay.js
// ObsidianLabs | p4inz
//
// In-Page Floating Video Overlay Engine
// - Attaches subtle glassmorphic download pill to every video player
// - Displays detected quality (1080p, 4K, 720p)
// - 1-Click to launch Stream Studio for fast downloading
// - Fallback to Lossless Buffer Recording for blob: streams
// ============================================================

export function initVideoOverlay() {
  const trackedVideos = new WeakSet();

  function attachOverlayToVideo(video) {
    if (!video || trackedVideos.has(video)) return;
    trackedVideos.add(video);

    const parent = video.parentElement;
    if (!parent) return;

    // Ensure parent has relative or absolute positioning
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    // Hover detection on container
    parent.addEventListener('mouseenter', () => parent.classList.add('df-video-container-hover'));
    parent.addEventListener('mouseleave', () => parent.classList.remove('df-video-container-hover'));

    // Create Overlay Wrapper
    const overlay = document.createElement('div');
    overlay.className = 'df-video-overlay-wrap';

    const pill = document.createElement('button');
    pill.className = 'df-pill-btn';
    pill.title = 'Download video with DownloadForge Pro';

    function updatePillState() {
      const src = video.currentSrc || video.src || '';
      const isBlob = src.startsWith('blob:');
      const height = video.videoHeight || 1080;
      const qualityText = height >= 2160 ? '4K' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : `${height}p`;

      if (isBlob) {
        pill.className = 'df-pill-btn record-mode';
        pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>
          <span>Record Video</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
      } else {
        pill.className = 'df-pill-btn';
        pill.innerHTML = `
          <svg class="df-pill-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download</span>
          <span class="df-quality-tag">${qualityText}</span>
        `;
      }
    }

    updatePillState();
    video.addEventListener('loadedmetadata', updatePillState);
    video.addEventListener('play', updatePillState);

    // Click handler
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const src = video.currentSrc || video.src || '';
      const title = document.title || 'web_video';

      if (src.startsWith('blob:')) {
        // Trigger Buffer Recording Mode
        window.__df_record_mode_active = true;
        const studioUrl = chrome.runtime.getURL(
          `src/downloader/downloader.html?mode=record&title=${encodeURIComponent(title)}`
        );
        window.open(studioUrl, '_blank');
      } else {
        // Trigger HLS / Video Download in Stream Studio
        const studioUrl = chrome.runtime.getURL(
          `src/downloader/downloader.html?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(title + '.mp4')}`
        );
        window.open(studioUrl, '_blank');
      }
    });

    overlay.appendChild(pill);
    parent.appendChild(overlay);
  }

  // Scan existing videos
  document.querySelectorAll('video').forEach(attachOverlayToVideo);

  // Observe dynamically inserted videos
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'VIDEO') {
            attachOverlayToVideo(node);
          } else {
            node.querySelectorAll?.('video').forEach(attachOverlayToVideo);
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
