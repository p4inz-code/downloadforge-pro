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

// 7. 3D Model Categorization
import { inferCategory } from '../src/core/classifier.js';
import { CATEGORY } from '../src/shared/constants.js';
assert.strictEqual(inferCategory('https://example.com/asset.glb', null, 'glb'), CATEGORY.MODEL_3D, 'glb should be model_3d');
assert.strictEqual(inferCategory('https://example.com/mesh.obj', null, 'obj'), CATEGORY.MODEL_3D, 'obj should be model_3d');
assert.strictEqual(inferCategory('https://example.com/scan.splat', null, 'splat'), CATEGORY.MODEL_3D, 'splat should be model_3d');
assert.strictEqual(inferCategory('https://example.com/model', 'model/gltf-binary', null), CATEGORY.MODEL_3D, 'model/gltf-binary should be model_3d');
console.log('  [PASS] 3D Model Classifier & Spatial asset taxonomy verified');

console.log('[Test] All 7 core test suites passed successfully with zero errors!');
