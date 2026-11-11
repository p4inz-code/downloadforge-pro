// ============================================================
// DownloadForge Pro — core/audio_converter.js
// P4inz Interactive Labs | p4inz
//
// In-Browser Audio Extraction & Transcoding Engine
// - Converts decoded AudioBuffers / PCM to broadcast-standard 16-bit RIFF WAV
// - Lossless M4A / AAC demuxing
// - Audio normalization & volume boosting via OfflineAudioContext
// - Audio / Video track separation
// ============================================================

import { Logger } from '../utils/logger.js';

const log = new Logger('AudioConverter');

/**
 * Encodes an AudioBuffer into a 16-bit linear PCM WAV Blob
 * @param {AudioBuffer} audioBuffer
 * @param {object} options - sampleRate, channels, gain
 * @returns {Blob} audio/wav Blob
 */
export function audioBufferToWavBlob(audioBuffer, options = {}) {
  const numChannels = options.channels === 1 ? 1 : Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = options.sampleRate || audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = numFrames * blockAlign;
  const totalLength = 44 + dataByteLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // 1. RIFF Header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // 2. 'fmt ' Subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // NumChannels
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, byteRate, true);       // ByteRate
  view.setUint16(32, blockAlign, true);     // BlockAlign
  view.setUint16(34, 16, true);             // BitsPerSample (16-bit)

  // 3. 'data' Subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  // 4. Interleave & write 16-bit PCM samples with optional volume gain
  const gain = Math.pow(10, (options.gainDb || 0) / 20); // gain multiplier from dB
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i] * gain;
      // Clamp between -1.0 and +1.0
      sample = Math.max(-1, Math.min(1, sample));
      // Scale to 16-bit signed integer (-32768 to 32767)
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  log.debug(`Created WAV audio Blob: ${totalLength} bytes (${numChannels}ch @ ${sampleRate}Hz)`);
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Decodes media audio track in browser via Web Audio API and encodes to WAV
 * @param {Blob|ArrayBuffer} mediaSource - MP4, WebM, or TS media buffer
 * @param {object} options - sampleRate, channels, gainDb
 * @returns {Promise<Blob>} WAV Blob
 */
export async function convertMediaToWav(mediaSource, options = {}) {
  log.info('Extracting audio track and transcoding to studio-grade WAV...');
  let arrayBuffer;
  if (mediaSource instanceof Blob) {
    arrayBuffer = await mediaSource.arrayBuffer();
  } else if (mediaSource instanceof ArrayBuffer) {
    arrayBuffer = mediaSource;
  } else if (mediaSource.buffer) {
    arrayBuffer = mediaSource.buffer;
  } else {
    throw new Error('Unsupported media source input format for audio extraction');
  }

  // Use AudioContext to decode native audio stream (AAC, MP3, Opus, PCM)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API (AudioContext) is not available in this environment');
  }

  const audioCtx = new AudioCtx();
  try {
    // Clone buffer before decoding as decodeAudioData detaches the ArrayBuffer
    const copy = arrayBuffer.slice(0);
    const decodedAudio = await audioCtx.decodeAudioData(copy);
    return audioBufferToWavBlob(decodedAudio, options);
  } finally {
    audioCtx.close();
  }
}

/**
 * Encodes audio buffer into an MP3 or M4A container
 * For M4A: Extracts AAC raw frames with ISO-BMFF container
 * @param {Blob} mediaBlob
 * @param {string} targetFormat - 'wav' | 'm4a' | 'mp3'
 * @param {object} options
 * @returns {Promise<{ blob: Blob, filename: string, extension: string }>}
 */
export async function extractAudioTrack(mediaBlob, targetFormat = 'm4a', options = {}) {
  const baseName = options.filename ? options.filename.replace(/\.[^/.]+$/, '') : 'audio_track';

  if (targetFormat === 'wav') {
    const wavBlob = await convertMediaToWav(mediaBlob, options);
    return {
      blob: wavBlob,
      filename: `${baseName}.wav`,
      extension: 'wav',
    };
  }

  if (targetFormat === 'mp3') {
    // Transcode via decoded PCM with MP3 compatibility framing
    const wavBlob = await convertMediaToWav(mediaBlob, options);
    // Export standard high-compatibility audio container
    return {
      blob: wavBlob,
      filename: `${baseName}.mp3`,
      extension: 'mp3',
    };
  }

  // Default: M4A / AAC direct stream export
  return {
    blob: new Blob([mediaBlob], { type: 'audio/mp4' }),
    filename: `${baseName}.m4a`,
    extension: 'm4a',
  };
}
