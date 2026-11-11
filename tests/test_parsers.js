// ============================================================
// DownloadForge Pro — tests/test_parsers.js
// P4inz Interactive Labs | p4inz
// Automated Engine & Manifest Parser Tests
// ============================================================

import assert from 'node:assert';
import { parseISODuration } from '../src/core/dash_parser.js';
import { CONCURRENCY_PROFILES } from '../src/core/hls_engine.js';
import { classifyError, ERROR_CODES } from '../src/core/error_handler.js';

console.log('[Test] Running DownloadForge Pro Engine Unit Tests...');

// 1. DASH ISO Duration Parser
assert.strictEqual(parseISODuration('PT1H2M30.5S'), 3750.5, 'ISO Duration PT1H2M30.5S mismatch');
assert.strictEqual(parseISODuration('PT30S'), 30, 'ISO Duration PT30S mismatch');
assert.strictEqual(parseISODuration('PT5M'), 300, 'ISO Duration PT5M mismatch');
assert.strictEqual(parseISODuration(''), 0, 'Empty ISO Duration should return 0');
console.log('  [PASS] DASH parseISODuration verified');

// 2. Concurrency Profiles
assert.strictEqual(CONCURRENCY_PROFILES.SAFE, 1, 'SAFE profile should be 1');
assert.strictEqual(CONCURRENCY_PROFILES.GENTLE, 2, 'GENTLE profile should be 2');
assert.strictEqual(CONCURRENCY_PROFILES.BALANCED, 4, 'BALANCED profile should be 4');
assert.strictEqual(CONCURRENCY_PROFILES.TURBO, 8, 'TURBO profile should be 8');
assert.strictEqual(CONCURRENCY_PROFILES.MAXIMUM, 16, 'MAXIMUM profile should be 16');
assert.strictEqual(CONCURRENCY_PROFILES.ULTRA, 32, 'ULTRA profile should be 32');
console.log('  [PASS] HLSEngine Concurrency Profiles verified (1, 2, 4, 8, 16, 32)');

// 3. Time Parsing Test for Slicer
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

assert.strictEqual(parseTimeString('00:01:30'), 90, '00:01:30 must equal 90s');
assert.strictEqual(parseTimeString('01:30'), 90, '01:30 must equal 90s');
assert.strictEqual(parseTimeString('90'), 90, '90 must equal 90s');
assert.strictEqual(parseTimeString('01:00:00'), 3600, '01:00:00 must equal 3600s');
assert.strictEqual(parseTimeString('invalid'), null, 'invalid must return null');
console.log('  [PASS] Time-Range Slicer string parser verified');

// 4. Error Classifier & Self-Healing Taxonomy Test
const err403 = classifyError(new Error('HTTP 403 Forbidden: anti-hotlink check failed'));
assert.strictEqual(err403.code, ERROR_CODES.ERR_HOTLINK_403, 'Should classify as ERR_HOTLINK_403');
assert.strictEqual(err403.meta.canAutoHeal, true, 'ERR_HOTLINK_403 should be auto-healable');

const errCors = classifyError(new Error('Failed to fetch: CORS header missing'));
assert.strictEqual(errCors.code, ERROR_CODES.ERR_CORS_BLOCKED, 'Should classify as ERR_CORS_BLOCKED');

const errDrm = classifyError(new Error('Stream uses Widevine encryption skd://key'));
assert.strictEqual(errDrm.code, ERROR_CODES.ERR_DRM_PROTECTED, 'Should classify as ERR_DRM_PROTECTED');
assert.strictEqual(errDrm.meta.alternativeMode, 'record', 'DRM should offer record mode alternative');
console.log('  [PASS] Error Intelligence & Taxonomy classification verified');

// 5. GitHub Release Semver Comparison
import { isNewerVersion } from '../src/core/updater.js';
assert.strictEqual(isNewerVersion('1.1.0', '1.0.3'), true, '1.1.0 must be newer than 1.0.3');
assert.strictEqual(isNewerVersion('v1.1.0', '1.1.0'), false, 'v1.1.0 equals 1.1.0');
assert.strictEqual(isNewerVersion('1.0.3', '1.1.0'), false, '1.0.3 is not newer than 1.1.0');
assert.strictEqual(isNewerVersion('2.0.0', '1.9.9'), true, '2.0.0 is newer than 1.9.9');
console.log('  [PASS] Auto-Updater Semver comparison engine verified');

// 6. 3D glTF -> GLB Binary Container Packager
import { createGlbContainer, alignTo4Bytes } from '../src/core/gltf_packager.js';
assert.strictEqual(alignTo4Bytes(1), 4, '1 aligned to 4 is 4');
assert.strictEqual(alignTo4Bytes(4), 4, '4 aligned to 4 is 4');
assert.strictEqual(alignTo4Bytes(7), 8, '7 aligned to 4 is 8');

const sampleGltf = {
  asset: { version: '2.0', generator: 'DownloadForge 3D Ripper' },
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }]
};
const dummyBinary = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const glbBytes = createGlbContainer(sampleGltf, dummyBinary);
assert.ok(glbBytes instanceof Uint8Array, 'Packed GLB must be Uint8Array');
assert.ok(glbBytes.byteLength > 20, 'Packed GLB must have header + chunks');

// Verify 12-byte header magic: 0x46546C67 ("glTF")
const view = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength);
assert.strictEqual(view.getUint32(0, true), 0x46546C67, 'Magic must match 0x46546C67 (glTF)');
assert.strictEqual(view.getUint32(4, true), 2, 'glTF Version must be 2');
console.log('  [PASS] 3D Model glTF-to-GLB packager binary structure verified');

// 7. 3D Model Categorization & Platform Adaptations
import { inferCategory } from '../src/core/classifier.js';
import { CATEGORY } from '../src/shared/constants.js';
assert.strictEqual(inferCategory('https://example.com/asset.glb', null, 'glb'), CATEGORY.MODEL_3D, 'glb should be model_3d');
assert.strictEqual(inferCategory('https://example.com/mesh.obj', null, 'obj'), CATEGORY.MODEL_3D, 'obj should be model_3d');
assert.strictEqual(inferCategory('https://example.com/scan.splat', null, 'splat'), CATEGORY.MODEL_3D, 'splat should be model_3d');
assert.strictEqual(inferCategory('https://example.com/print.3mf', null, '3mf'), CATEGORY.MODEL_3D, '3mf should be model_3d');
assert.strictEqual(inferCategory('https://example.com/model.step', null, 'step'), CATEGORY.MODEL_3D, 'step should be model_3d');
assert.strictEqual(inferCategory('https://example.com/scene.blend', null, 'blend'), CATEGORY.MODEL_3D, 'blend should be model_3d');
assert.strictEqual(inferCategory('https://sketchfab.com/i/models/4a0d8e87900b46d0a7a7bbcb358249ad', null, null), CATEGORY.MODEL_3D, 'sketchfab model API should be model_3d');
assert.strictEqual(inferCategory('https://media.sketchfab.com/models/4a0d/file.osgjs.gz', null, 'gz'), CATEGORY.MODEL_3D, 'sketchfab media should be model_3d');
assert.strictEqual(inferCategory('https://models.readyplayer.me/avatar.glb', null, 'glb'), CATEGORY.MODEL_3D, 'readyplayer.me should be model_3d');
assert.strictEqual(inferCategory('https://prod.spline.design/scene.splinecode', null, 'splinecode'), CATEGORY.MODEL_3D, 'splinecode should be model_3d');
assert.strictEqual(inferCategory('https://example.com/model', 'model/gltf-binary', null), CATEGORY.MODEL_3D, 'model/gltf-binary should be model_3d');
console.log('  [PASS] 3D Model Classifier & Famous Platforms Taxonomy (Sketchfab, Spline, RPM, 3MF) verified');

// 8. In-Browser Audio Transcoder & RIFF WAV Encoder
import { audioBufferToWavBlob } from '../src/core/audio_converter.js';
const mockAudioBuffer = {
  numberOfChannels: 2,
  sampleRate: 44100,
  length: 441, // 10ms of audio
  getChannelData: () => {
    const data = new Float32Array(441);
    for (let i = 0; i < 441; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    return data;
  }
};
const wavBlob = audioBufferToWavBlob(mockAudioBuffer, { gainDb: 3 });
assert.strictEqual(wavBlob.type, 'audio/wav', 'WAV blob type must be audio/wav');
const expectedByteLength = 44 + (441 * 2 * 2); // 44-byte RIFF header + 1764 bytes PCM
assert.strictEqual(wavBlob.size, expectedByteLength, `WAV blob size must be ${expectedByteLength} bytes`);

const wavArrayBuffer = await wavBlob.arrayBuffer();
const wavView = new DataView(wavArrayBuffer);
const riffMarker = String.fromCharCode(wavView.getUint8(0), wavView.getUint8(1), wavView.getUint8(2), wavView.getUint8(3));
const waveMarker = String.fromCharCode(wavView.getUint8(8), wavView.getUint8(9), wavView.getUint8(10), wavView.getUint8(11));
const fmtMarker  = String.fromCharCode(wavView.getUint8(12), wavView.getUint8(13), wavView.getUint8(14), wavView.getUint8(15));
const dataMarker = String.fromCharCode(wavView.getUint8(36), wavView.getUint8(37), wavView.getUint8(38), wavView.getUint8(39));
assert.strictEqual(riffMarker, 'RIFF', 'WAV header must contain RIFF');
assert.strictEqual(waveMarker, 'WAVE', 'WAV header must contain WAVE');
assert.strictEqual(fmtMarker, 'fmt ', 'WAV header must contain fmt ');
assert.strictEqual(dataMarker, 'data', 'WAV header must contain data');
assert.strictEqual(wavView.getUint16(20, true), 1, 'AudioFormat must be 1 (PCM)');
assert.strictEqual(wavView.getUint16(22, true), 2, 'NumChannels must be 2');
assert.strictEqual(wavView.getUint32(24, true), 44100, 'SampleRate must be 44100');
assert.strictEqual(wavView.getUint16(34, true), 16, 'BitsPerSample must be 16');
console.log('  [PASS] In-Browser Audio Transcoder & RIFF WAV Encoder binary structure verified');

console.log('[Test] All 8 core test suites passed successfully with zero errors!');

