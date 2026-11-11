// ============================================================
// DownloadForge Pro — core/worker/stream_worker.js
// P4inz Interactive Labs | p4inz
//
// Dedicated Offscreen Web Worker for High-Throughput Media Ingestion
// - Runs on an isolated hardware thread (Zero UI main-thread jank)
// - Hardware WebCrypto AES-128 parallel decryption
// - Zero-copy memory handoffs via Transferable Objects
// - Supports both HLS (.m3u8) and MPEG-DASH (.mpd)
// ============================================================

import muxjs from 'mux.js';

let isAborted = false;
const keyCache = new Map();

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};

  if (type === 'ABORT') {
    isAborted = true;
    self.postMessage({ type: 'STATUS', message: 'Download aborted by user' });
    return;
  }

  if (type === 'START') {
    isAborted = false;
    try {
      await runDownloadPipeline(payload);
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message });
    }
  }
};

/**
 * Main ingestion pipeline running inside Web Worker.
 */
async function runDownloadPipeline(config) {
  const {
    streamType = 'hls',
    segments = [],
    initUrl = null,
    audioSegments = [],
    concurrency = 8,
    maxRetries = 3,
    timeoutMs = 15000,
    skipFailedSegments = true,
    referer = null,
  } = config;

  if (!segments || segments.length === 0) {
    throw new Error('No segments provided to download worker');
  }

  const total = segments.length;
  let completedCount = 0;
  let totalBytes = 0;
  const startTime = performance.now();

  self.postMessage({ type: 'STATUS', message: `Worker initialized. Downloading ${total} segments (${concurrency} threads)...` });

  // 1. Fetch Init fragment if provided (e.g. DASH or fMP4 #EXT-X-MAP)
  if (initUrl) {
    try {
      self.postMessage({ type: 'STATUS', message: 'Fetching initialization fragment...' });
      const initBuf = await fetchBufferWithRetry(initUrl, null, 1, { maxRetries, timeoutMs, referer });
      totalBytes += initBuf.byteLength;
      // Transfer init buffer to main thread
      self.postMessage({
        type: 'CHUNK',
        chunk: initBuf,
        index: -1,
        isInit: true,
      }, [initBuf]);
    } catch (e) {
      console.warn('[DownloadForge Worker] Init fetch error:', e.message);
    }
  }

  // 2. Setup Transmuxer for HLS Transport Streams
  let transmuxer = null;
  if (streamType === 'hls') {
    transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: false });
    transmuxer.on('data', (segment) => {
      const initData = segment.initSegment;
      const mediaData = segment.data;

      if (initData && initData.byteLength > 0) {
        const copyInit = initData.buffer.slice(initData.byteOffset, initData.byteOffset + initData.byteLength);
        self.postMessage({ type: 'CHUNK', chunk: copyInit, index: -1, isInit: true }, [copyInit]);
      }
      if (mediaData && mediaData.byteLength > 0) {
        const copyMedia = mediaData.buffer.slice(mediaData.byteOffset, mediaData.byteOffset + mediaData.byteLength);
        self.postMessage({ type: 'CHUNK', chunk: copyMedia, index: -2, isInit: false }, [copyMedia]);
      }
    });
  }

  // 3. Worker queue with sequential ingestion pump
  let nextExpected = 0;
  const downloadedBuffers = new Array(total).fill(null);

  function pumpSequential() {
    while (nextExpected < total && downloadedBuffers[nextExpected] !== null) {
      const buf = downloadedBuffers[nextExpected];
      downloadedBuffers[nextExpected] = null; // free memory

      if (buf.byteLength > 0) {
        if (streamType === 'hls' && transmuxer) {
          transmuxer.push(new Uint8Array(buf));
        } else {
          // DASH / progressive MP4: transfer directly to main thread disk stream
          self.postMessage({
            type: 'CHUNK',
            chunk: buf,
            index: nextExpected,
            isInit: false,
          }, [buf]);
        }
      }

      nextExpected++;
    }
  }

  let queueIndex = 0;

  async function worker() {
    while (queueIndex < total && !isAborted) {
      const index = queueIndex++;
      const seg = segments[index];

      try {
        let segData = await fetchBufferWithRetry(seg.url, seg.byteRange, 1, { maxRetries, timeoutMs, referer });

        // AES-128 Decryption if encrypted
        if (seg.key && seg.key.method === 'AES-128') {
          segData = await decryptSegment(segData, seg.key, seg.sequence || index);
        }

        downloadedBuffers[index] = segData;
        completedCount++;
        totalBytes += segData.byteLength;

        pumpSequential();

        const elapsedSec = (performance.now() - startTime) / 1000;
        const speedBps = elapsedSec > 0 ? (totalBytes / elapsedSec) : 0;
        const percent = Math.round((completedCount / total) * 100);
        const etaSec = speedBps > 0 ? Math.round((total - completedCount) * (totalBytes / completedCount) / speedBps) : 0;

        self.postMessage({
          type: 'PROGRESS',
          completed: completedCount,
          total,
          percent,
          speedMBs: (speedBps / (1024 * 1024)).toFixed(2),
          etaSec,
          index,
          failed: false,
        });

      } catch (err) {
        if (isAborted) throw new Error('Download cancelled by user');

        if (skipFailedSegments) {
          console.warn(`[Worker] Skipping failed segment ${index}:`, err.message);
          downloadedBuffers[index] = new ArrayBuffer(0);
          completedCount++;
          pumpSequential();

          self.postMessage({
            type: 'PROGRESS',
            completed: completedCount,
            total,
            percent: Math.round((completedCount / total) * 100),
            speedMBs: '0.00',
            etaSec: 0,
            index,
            failed: true,
          });
        } else {
          throw new Error(`Segment ${index} failed: ${err.message}`);
        }
      }
    }
  }

  // Launch worker threads
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (isAborted) {
    self.postMessage({ type: 'STATUS', message: 'Download cancelled' });
    return;
  }

  // Drain remaining segments
  pumpSequential();

  if (transmuxer) {
    transmuxer.flush();
  }

  self.postMessage({
    type: 'COMPLETE',
    totalBytes,
    durationSec: ((performance.now() - startTime) / 1000).toFixed(1),
  });
}

/**
 * Native WebCrypto AES-128 Decryption
 */
async function decryptSegment(encryptedBuffer, keyInfo, sequenceNumber) {
  let rawKey = keyCache.get(keyInfo.uri);
  if (!rawKey) {
    const res = await fetch(keyInfo.uri);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching AES key`);
    rawKey = await res.arrayBuffer();
    keyCache.set(keyInfo.uri, rawKey);
  }

  const ivBuffer = new Uint8Array(16);
  if (keyInfo.iv) {
    const hex = keyInfo.iv.startsWith('0x') ? keyInfo.iv.slice(2) : keyInfo.iv;
    for (let i = 0; i < 16; i++) {
      ivBuffer[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
    }
  } else {
    const view = new DataView(ivBuffer.buffer);
    view.setUint32(12, sequenceNumber, false);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  return await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: ivBuffer },
    cryptoKey,
    encryptedBuffer
  );
}

/**
 * Chunk fetch with AbortController timeout & exponential backoff
 */
async function fetchBufferWithRetry(url, byteRange, attempt, opts) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);

  try {
    const headers = {};
    if (opts.referer) headers['Referer'] = opts.referer;
    if (byteRange && byteRange.length > 0) {
      const end = byteRange.offset + byteRange.length - 1;
      headers['Range'] = `bytes=${byteRange.offset}-${end}`;
    }

    const res = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < opts.maxRetries && !isAborted) {
      const backoff = Math.min(600 * attempt, 2500);
      await new Promise(r => setTimeout(r, backoff));
      return fetchBufferWithRetry(url, byteRange, attempt + 1, opts);
    }
    throw err;
  }
}
