// ============================================================
// DownloadForge Pro — core/hls_engine.js
// P4inz Interactive Labs | p4inz
//
// In-Browser Multi-Threaded HLS Downloader & Transmuxer
// Features:
//   - 3 Concurrency Modes: Balanced (4), Turbo (8), Max (16)
//   - Zero-RAM Direct-to-Disk Streaming via File System Access API
//   - RFC 8216 AES-128 Decryption via native WebCrypto API
//   - In-browser TS-to-MP4 transmuxing via mux.js
//   - Discontinuity and PTS/DTS timestamp alignment
//   - Real-time progress, speed, and ETA estimation
// ============================================================

import muxjs from 'mux.js';
import { parseHLSManifest } from './hls_parser.js';
import { parseDASHManifest } from './dash_parser.js';

export const CONCURRENCY_PROFILES = {
  SAFE: 1,
  GENTLE: 2,
  BALANCED: 4,
  TURBO: 8,
  MAXIMUM: 16,
  ULTRA: 32,
};

export class HLSEngine {
  constructor(options = {}) {
    this.concurrency = options.concurrency || CONCURRENCY_PROFILES.TURBO;
    this.maxRetries = options.maxRetries || 3;
    this.timeoutMs = options.timeoutMs || 15000;
    this.skipFailedSegments = options.skipFailedSegments !== false;
    this.referer = options.referer || null;
    this.audioOnly = options.audioOnly || false;
    this.useWorker = options.useWorker !== false;
    this.onProgress = options.onProgress || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.aborted = false;
    this.paused = false;
    this.activeWorker = null;
    this.keyCache = new Map();
  }

  abort() {
    this.aborted = true;
    if (this.activeWorker) {
      try {
        this.activeWorker.postMessage({ type: 'ABORT' });
        this.activeWorker.terminate();
      } catch (e) {}
      this.activeWorker = null;
    }
  }

  /**
   * Main entry point to download an HLS stream and produce an MP4 file.
   * Can stream directly to disk if writableStream is provided.
   *
   * @param {string} manifestUrl
   * @param {object} options
   * @param {object} [options.selectedVariant]
   * @param {FileSystemWritableFileStream} [options.writableStream]
   * @returns {Promise<{ blob?: Blob, directStream: boolean }>}
   */
  async downloadAndMux(manifestUrl, options = {}) {
    const { selectedVariant = null, writableStream = null, timeRange = null, manifest = null } = options;
    this.aborted = false;
    this.onStatus('Fetching playlist manifest...');

    const isDash = manifestUrl.includes('.mpd') || manifest?.type === 'dash';
    let streamType = isDash ? 'dash' : 'hls';
    let segments = [];
    let audioSegments = [];
    let initUrl = null;

    if (isDash) {
      this.onStatus('Parsing MPEG-DASH MPD manifest...');
      const dashResult = manifest && manifest.type === 'dash' ? manifest : await parseDASHManifest(manifestUrl);
      if (dashResult.error) throw new Error(dashResult.error);

      const track = selectedVariant || dashResult.variants[0];
      if (!track || !track.segments) throw new Error('No valid MPEG-DASH representation found');

      segments = track.segments;
      initUrl = track.initUrl || null;

      if (dashResult.defaultAudioTrack && dashResult.defaultAudioTrack.segments) {
        audioSegments = dashResult.defaultAudioTrack.segments;
      }
    } else {
      const parseResult = manifest && manifest.type ? manifest : await parseHLSManifest(manifestUrl);
      if (parseResult.error) {
        throw new Error(`Playlist parse error: ${parseResult.error}`);
      }

      let mediaUrl = manifestUrl;
      let targetPlaylist = parseResult;

      if (parseResult.type === 'master') {
        const variant = selectedVariant || parseResult.variants[0];
        if (!variant) throw new Error('No valid video variants found in master playlist');
        mediaUrl = variant.url;
        this.onStatus(`Loading video track: ${variant.label || variant.resolution || 'best'}...`);
        targetPlaylist = await parseHLSManifest(mediaUrl);
        if (targetPlaylist.error) throw new Error(targetPlaylist.error);
      }

      segments = targetPlaylist.segments;
      if (!segments || segments.length === 0) {
        throw new Error('Playlist contains zero media segments');
      }

      // Dual-track separate audio stream detection
      if (parseResult.type === 'master' && parseResult.audioTracks?.length > 0) {
        const matchTrack = parseResult.audioTracks.find(t => t.default) || parseResult.audioTracks[0];
        if (matchTrack?.url) {
          try {
            this.onStatus(`Found paired audio track (${matchTrack.name || matchTrack.language}). Fetching...`);
            const audioResult = await parseHLSManifest(matchTrack.url);
            if (audioResult.segments?.length > 0) {
              audioSegments = audioResult.segments;
            }
          } catch (e) {
            console.debug('Failed to load separate audio track:', e);
          }
        }
      }
    }

    // Apply Time-Range Slice (if specified)
    if (timeRange && (timeRange.startSec > 0 || (timeRange.endSec && timeRange.endSec < Infinity))) {
      const { startSec = 0, endSec = Infinity } = timeRange;
      const filtered = segments.filter(seg => {
        const segStart = seg.startTime !== undefined ? seg.startTime : 0;
        const segEnd = segStart + (seg.duration || 0);
        return segEnd >= startSec && segStart <= endSec;
      });
      if (filtered.length > 0) {
        segments = filtered;
        this.onStatus(`Time slice applied: ${segments.length} segments selected (${startSec}s -> ${endSec}s).`);
      }
    }

    this.onStatus(`Found ${segments.length} media segments${audioSegments.length > 0 ? ` + ${audioSegments.length} audio segments` : ''}. Initializing engine...`);

    // Attempt Offscreen Web Worker Execution (Zero UI Jank)
    if (this.useWorker && typeof Worker !== 'undefined') {
      try {
        this.onStatus('Spawning dedicated offscreen Web Worker...');
        return await this.runWithWorker({
          streamType,
          segments,
          initUrl,
          audioSegments,
          concurrency: this.concurrency,
          maxRetries: this.maxRetries,
          timeoutMs: this.timeoutMs,
          skipFailedSegments: this.skipFailedSegments,
          referer: this.referer,
        }, writableStream);
      } catch (workerErr) {
        console.warn('[DownloadForge] Web Worker execution fallback to in-thread:', workerErr.message);
      }
    }

    // Prepare In-Thread Transmuxer with DTS/PTS alignment
    const transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: false,
    });

    const inMemoryInit = [];
    const inMemoryMedia = [];

    // Serialized write queue for direct disk streaming to prevent concurrent stream lock errors
    let writeChain = Promise.resolve();
    const queueStreamWrite = (u8) => {
      if (writableStream) {
        writeChain = writeChain.then(() => writableStream.write(u8));
      }
    };

    transmuxer.on('data', (segment) => {
      if (segment.initSegment) {
        const u8 = new Uint8Array(segment.initSegment);
        if (writableStream) {
          queueStreamWrite(u8);
        } else {
          inMemoryInit.push(u8);
        }
      }
      if (segment.data) {
        const u8 = new Uint8Array(segment.data);
        if (writableStream) {
          queueStreamWrite(u8);
        } else {
          inMemoryMedia.push(u8);
        }
      }
    });

    // Handle initialization map (fMP4 / CMAF)
    if (segments[0].initMap?.url) {
      this.onStatus('Downloading stream initialization map...');
      const initBuffer = await this.fetchBufferWithRetry(segments[0].initMap.url);
      const u8 = new Uint8Array(initBuffer);
      if (writableStream) {
        queueStreamWrite(u8);
      } else {
        inMemoryInit.push(u8);
      }
    }

    // Segment queue & Sequential Ingestion Pump (True Zero-RAM)
    const total = segments.length;
    let completedCount = 0;
    let totalBytes = 0;
    const startTime = performance.now();
    const downloadedBuffers = new Array(total);
    let nextToPumpIndex = 0;

    // Pumps ready chunks sequentially into transmuxer and immediately releases RAM
    const pumpNextSegments = () => {
      while (nextToPumpIndex < total && downloadedBuffers[nextToPumpIndex] !== undefined) {
        const buf = downloadedBuffers[nextToPumpIndex];
        if (buf) {
          transmuxer.push(buf);
          if (writableStream) {
            // Free memory to GC immediately in direct-to-disk mode
            downloadedBuffers[nextToPumpIndex] = null;
          }
        }
        nextToPumpIndex++;
      }
    };

    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < total && !this.aborted) {
        const index = currentIndex++;
        const seg = segments[index];

        try {
          let segData = await this.fetchBufferWithRetry(seg.url, seg.byteRange);

          // Standard RFC 8216 AES-128 Decryption
          if (seg.key && seg.key.method === 'AES-128') {
            segData = await this.decryptSegment(segData, seg.key, seg.sequence);
          }

          downloadedBuffers[index] = new Uint8Array(segData);
          completedCount++;
          totalBytes += segData.byteLength;

          // Sequential pump immediately flushes and frees RAM
          pumpNextSegments();

          const elapsedSec = (performance.now() - startTime) / 1000;
          const speedBps = elapsedSec > 0 ? (totalBytes / elapsedSec) : 0;
          const percent = Math.round((completedCount / total) * 100);
          const etaSec = speedBps > 0 ? Math.round((total - completedCount) * (totalBytes / completedCount) / speedBps) : 0;

          this.onProgress({
            completed: completedCount,
            total,
            percent,
            speedMBs: (speedBps / (1024 * 1024)).toFixed(2),
            etaSec,
            index,
          });

        } catch (err) {
          if (this.aborted) throw new Error('Download cancelled by user');
          console.warn(`[DownloadForge] Failed segment ${index}:`, err.message);

          if (this.skipFailedSegments) {
            // Fill with empty array buffer so sequential pump can advance
            downloadedBuffers[index] = new Uint8Array(0);
            completedCount++;
            pumpNextSegments();

            this.onProgress({
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
    };

    // Run parallel workers based on selected concurrency
    const workers = [];
    for (let i = 0; i < Math.min(this.concurrency, total); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    if (this.aborted) {
      if (writableStream) await writableStream.abort().catch(() => {});
      throw new Error('Download cancelled');
    }

    // Final drain pump
    pumpNextSegments();

    // Feed paired audio segments into transmuxer if present
    if (audioSegments.length > 0 && !this.aborted) {
      this.onStatus('Multiplexing synchronized audio track into MP4...');
      for (let i = 0; i < audioSegments.length && !this.aborted; i++) {
        const aSeg = audioSegments[i];
        try {
          let aBuf = await this.fetchBufferWithRetry(aSeg.url, aSeg.byteRange);
          if (aSeg.key && aSeg.key.method === 'AES-128') {
            aBuf = await this.decryptSegment(aBuf, aSeg.key, aSeg.sequence);
          }
          transmuxer.push(new Uint8Array(aBuf));
        } catch (e) {
          console.debug(`Audio segment ${i} fetch error:`, e);
        }
      }
    }

    transmuxer.flush();

    if (writableStream) {
      this.onStatus('Finalizing direct disk stream...');
      await writeChain;
      await writableStream.close();
      return { directStream: true };
    }

    this.onStatus('Assembling MP4 file in memory...');
    let finalBlob;
    if (inMemoryInit.length > 0 && inMemoryMedia.length > 0) {
      finalBlob = new Blob([...inMemoryInit, ...inMemoryMedia], { type: 'video/mp4' });
    } else {
      const remaining = downloadedBuffers.filter(Boolean);
      finalBlob = new Blob(remaining, { type: 'video/mp4' });
    }

    this.onStatus('Download complete!');
    return { blob: finalBlob, directStream: false };
  }

  /**
   * Decrypt standard RFC 8216 AES-128 HLS segment via native WebCrypto.
   */
  async decryptSegment(encryptedBuffer, keyInfo, sequenceNumber) {
    const rawKey = await this.getKeyBytes(keyInfo.uri);

    // Prepare IV: 16-byte big-endian sequence number or explicit hex
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

  async getKeyBytes(keyUri) {
    if (this.keyCache.has(keyUri)) {
      return this.keyCache.get(keyUri);
    }
    const res = await fetch(keyUri);
    if (!res.ok) throw new Error(`HTTP error ${res.status} fetching key`);
    const keyBuf = await res.arrayBuffer();
    this.keyCache.set(keyUri, keyBuf);
    return keyBuf;
  }

  async fetchBufferWithRetry(url, byteRange = null, attempt = 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs || 15000);

    try {
      const headers = {};
      if (this.referer) {
        headers['Referer'] = this.referer;
      }
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
      if (attempt < this.maxRetries && !this.aborted) {
        const backoff = Math.min(800 * attempt, 3000);
        await new Promise(r => setTimeout(r, backoff));
        return this.fetchBufferWithRetry(url, byteRange, attempt + 1);
      }
      throw err;
    }
  }

  /**
   * Offloads ingestion and transmuxing to dedicated Web Worker.
   */
  async runWithWorker(config, writableStream) {
    return new Promise((resolve, reject) => {
      let workerUrl;
      try {
        workerUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL('dist/stream_worker.bundle.js') : 'dist/stream_worker.bundle.js';
      } catch (e) {
        return reject(new Error('Extension context unavailable for worker'));
      }

      let worker;
      try {
        worker = new Worker(workerUrl);
      } catch (err) {
        return reject(err);
      }

      this.activeWorker = worker;
      let writeChain = Promise.resolve();
      const collectedBuffers = [];

      worker.onmessage = async (e) => {
        const { type, chunk, message, error, ...rest } = e.data || {};

        if (type === 'STATUS') {
          this.onStatus(message);
        } else if (type === 'PROGRESS') {
          this.onProgress(rest);
        } else if (type === 'CHUNK') {
          if (writableStream) {
            writeChain = writeChain.then(() => writableStream.write(chunk));
          } else {
            collectedBuffers.push(chunk);
          }
        } else if (type === 'COMPLETE') {
          worker.terminate();
          this.activeWorker = null;

          if (writableStream) {
            this.onStatus('Finalizing direct disk stream...');
            await writeChain;
            await writableStream.close();
            resolve({ directStream: true });
          } else {
            const finalBlob = new Blob(collectedBuffers, { type: 'video/mp4' });
            resolve({ blob: finalBlob, directStream: false });
          }
        } else if (type === 'ERROR') {
          worker.terminate();
          this.activeWorker = null;
          reject(new Error(error || 'Worker error'));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        this.activeWorker = null;
        reject(err);
      };

      worker.postMessage({ type: 'START', payload: config });
    });
  }
}
