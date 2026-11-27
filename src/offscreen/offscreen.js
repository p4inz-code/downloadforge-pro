// ============================================================
// DownloadForge Pro — offscreen/offscreen.js
// P4inz Interactive Labs | p4inz
//
// MV3 Offscreen Document for arbitrary-size Blob URL creation.
// Bypasses Chrome's 2MB data: URL download cap cleanly while
// tracking and revoking Blob URLs after download completion.
// ============================================================

const activeBlobUrls = new Map();

function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'df_offscreen_blob') return;

  let chunks = [];
  let mimeType = 'application/zip';

  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'BEGIN') {
      chunks = [];
      mimeType = msg.mimeType || 'application/zip';
    } else if (msg.type === 'CHUNK' && msg.b64) {
      chunks.push(base64ToBytes(msg.b64));
    } else if (msg.type === 'END') {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        chunks = [];
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrls.set(blobUrl, Date.now());
        // Safety sweep after 10 minutes if download listener missed event
        setTimeout(() => {
          if (activeBlobUrls.has(blobUrl)) {
            URL.revokeObjectURL(blobUrl);
            activeBlobUrls.delete(blobUrl);
          }
        }, 10 * 60 * 1000);
        port.postMessage({ ok: true, blobUrl });
      } catch (err) {
        port.postMessage({ ok: false, error: err.message });
      }
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return false;
  if (message.type === 'DF_REVOKE_BLOB_URL' && message.blobUrl) {
    try {
      URL.revokeObjectURL(message.blobUrl);
      activeBlobUrls.delete(message.blobUrl);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return false;
  }
  return false;
});
