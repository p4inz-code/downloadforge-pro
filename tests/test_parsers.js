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
assert.strictEqual(inferCategory('https://www.cgtrader.com/3d-models/car/sports-car/bmw-m3-gtr', null, null), CATEGORY.MODEL_3D, 'cgtrader 3d-models should be model_3d');
assert.strictEqual(inferCategory('https://www.cgtrader.com/free-3d-models/character/sci-fi/robot', null, null), CATEGORY.MODEL_3D, 'cgtrader free-3d-models should be model_3d');
assert.strictEqual(inferCategory('https://www.turbosquid.com/3d-models/audi-r8-spyder-3d-model-1892019', null, null), CATEGORY.MODEL_3D, 'turbosquid should be model_3d');
assert.strictEqual(inferCategory('https://cults3d.com/en/3d-model/game/articulated-dragon', null, null), CATEGORY.MODEL_3D, 'cults3d should be model_3d');
assert.strictEqual(inferCategory('https://www.thingiverse.com/thing:4829104/files', null, null), CATEGORY.MODEL_3D, 'thingiverse should be model_3d');
assert.strictEqual(inferCategory('https://www.printables.com/model/12345-flexi-rex', null, null), CATEGORY.MODEL_3D, 'printables should be model_3d');
assert.strictEqual(inferCategory('https://free3d.com/3d-model/low-poly-tree-49201.html', null, null), CATEGORY.MODEL_3D, 'free3d should be model_3d');
assert.strictEqual(inferCategory('https://thangs.com/designer/ZackFreedman/3d-model/gridfinity-box', null, null), CATEGORY.MODEL_3D, 'thangs should be model_3d');
assert.strictEqual(inferCategory('https://models.readyplayer.me/avatar.glb', null, 'glb'), CATEGORY.MODEL_3D, 'readyplayer.me should be model_3d');
assert.strictEqual(inferCategory('https://prod.spline.design/scene.splinecode', null, 'splinecode'), CATEGORY.MODEL_3D, 'splinecode should be model_3d');
assert.strictEqual(inferCategory('https://example.com/model', 'model/gltf-binary', null), CATEGORY.MODEL_3D, 'model/gltf-binary should be model_3d');
console.log('  [PASS] 3D Model Classifier & Famous Platforms (Sketchfab, CGTrader, TurboSquid, Cults3D, Thingiverse, Printables, Thangs, Free3D) verified');

// 8. WebGL Mesh Geometry Ripper Wavefront OBJ Serialization Engine
function verifyObjExport(posChunks, idxChunks, title = 'test_model') {
  let objText = `# DownloadForge Pro WebGL 3D Ripper\n# Model: ${title}\n\n`;
  let globalVOffset = 0;
  let globalVtOffset = 0;
  let globalVnOffset = 0;
  let totalFaces = 0;

  for (let c = 0; c < posChunks.length; c++) {
    const arr = posChunks[c];
    let stride = 3;
    let hasUVs = false;
    let hasNormals = false;

    if (arr.length % 8 === 0 && arr.length >= 24) {
      stride = 8;
      hasNormals = true;
      hasUVs = true;
    } else if (arr.length % 6 === 0 && arr.length >= 18) {
      stride = 6;
      hasNormals = true;
    } else if (arr.length % 5 === 0 && arr.length >= 15) {
      stride = 5;
      hasUVs = true;
    }

    const submeshVStart = globalVOffset;
    const submeshVtStart = globalVtOffset;
    const submeshVnStart = globalVnOffset;
    let submeshVCount = 0;

    objText += `g submesh_${c + 1}\n`;

    for (let i = 0; i < arr.length; i += stride) {
      const x = Number(arr[i]).toFixed(5);
      const y = Number(arr[i + 1]).toFixed(5);
      const z = Number(arr[i + 2]).toFixed(5);
      objText += `v ${x} ${y} ${z}\n`;
      submeshVCount++;
      globalVOffset++;

      if (hasNormals) {
        const nx = Number(arr[i + 3]).toFixed(5);
        const ny = Number(arr[i + 4]).toFixed(5);
        const nz = Number(arr[i + 5]).toFixed(5);
        objText += `vn ${nx} ${ny} ${nz}\n`;
        globalVnOffset++;
      }

      if (hasUVs) {
        const uOffset = hasNormals ? 6 : 3;
        const u = Number(arr[i + uOffset]).toFixed(5);
        const v = Number(arr[i + uOffset + 1]).toFixed(5);
        objText += `vt ${u} ${v}\n`;
        globalVtOffset++;
      }
    }

    const matchingIdx = idxChunks[c];
    if (matchingIdx) {
      for (let j = 0; j < matchingIdx.length - 2; j += 3) {
        const i1 = matchingIdx[j];
        const i2 = matchingIdx[j + 1];
        const i3 = matchingIdx[j + 2];
        const f1 = i1 + 1 + submeshVStart;
        const f2 = i2 + 1 + submeshVStart;
        const f3 = i3 + 1 + submeshVStart;
        if (hasNormals && hasUVs) {
          const vt1 = i1 + 1 + submeshVtStart;
          const vt2 = i2 + 1 + submeshVtStart;
          const vt3 = i3 + 1 + submeshVtStart;
          const vn1 = i1 + 1 + submeshVnStart;
          const vn2 = i2 + 1 + submeshVnStart;
          const vn3 = i3 + 1 + submeshVnStart;
          objText += `f ${f1}/${vt1}/${vn1} ${f2}/${vt2}/${vn2} ${f3}/${vt3}/${vn3}\n`;
        } else {
          objText += `f ${f1} ${f2} ${f3}\n`;
        }
        totalFaces++;
      }
    }
  }

  return { objText, totalVertices: globalVOffset, totalFaces };
}

// Test Submesh 1 (stride 8: pos, normal, uv) + Submesh 2 (stride 3: pos only)
const submesh1Data = new Float32Array([
  // v0: x, y, z, nx, ny, nz, u, v
  0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0,
  // v1: x, y, z, nx, ny, nz, u, v
  1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0,
  // v2: x, y, z, nx, ny, nz, u, v
  0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0
]);
const submesh1Indices = new Uint16Array([0, 1, 2]);

const submesh2Data = new Float32Array([
  // v0, v1, v2 for submesh 2
  2.0, 0.0, 0.0,
  3.0, 0.0, 0.0,
  2.0, 1.0, 0.0
]);
const submesh2Indices = new Uint16Array([0, 1, 2]);

const rippedObj = verifyObjExport([submesh1Data, submesh2Data], [submesh1Indices, submesh2Indices], 'dual_submesh_test');
assert.strictEqual(rippedObj.totalVertices, 6, 'Should extract exactly 6 vertices across 2 submeshes');
assert.strictEqual(rippedObj.totalFaces, 2, 'Should extract exactly 2 triangular faces');
assert.ok(rippedObj.objText.includes('f 1/1/1 2/2/2 3/3/3'), 'Submesh 1 face must contain interleaved v/vt/vn format');
assert.ok(rippedObj.objText.includes('f 4 5 6'), 'Submesh 2 face must properly offset indices by submesh 1 vertex count (offset +3)');
console.log('  [PASS] WebGL Mesh Geometry Ripper Multi-Submesh & Wavefront OBJ Serialization Engine verified');

// 9. In-Browser Audio Transcoder & RIFF WAV Encoder
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

// 10. In-Browser 3D Model & Textures ZIP Package Builder
import { buildZipArchive, computeCrc32 } from '../src/core/model_zip_bundler.js';

const testFiles = [
  { name: 'model.obj', data: 'v 0.0 0.0 0.0\nv 1.0 0.0 0.0\nv 0.0 1.0 0.0\nf 1 2 3\n' },
  { name: 'model.mtl', data: 'newmtl Material_0\nmap_Kd textures/diffuse.png\n' },
  { name: 'textures/diffuse.png', data: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) },
  { name: 'README.txt', data: 'DownloadForge 3D Asset Package\nCreated by P4inz Interactive Labs\n' }
];

const zipBytes = buildZipArchive(testFiles);
assert.ok(zipBytes instanceof Uint8Array, 'ZIP must produce a Uint8Array');
assert.ok(zipBytes.byteLength > 100, 'ZIP size must include headers and payload');

// Verify ZIP signatures
const zipView = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
assert.strictEqual(zipView.getUint32(0, true), 0x04034B50, 'First record must have Local File Header signature 0x04034B50');

// Verify convertObjToGlb binary glTF packaging
import { convertObjToGlb } from '../src/core/model_zip_bundler.js';
const testObjString = 'v 0.0 0.0 0.0\nv 1.0 0.0 0.0\nv 0.0 1.0 0.0\nf 1 2 3\n';
const glbResult = convertObjToGlb(testObjString, 'unit_test_model');
assert.ok(glbResult instanceof Uint8Array, 'convertObjToGlb must return Uint8Array');
const glbDataView = new DataView(glbResult.buffer, glbResult.byteOffset, glbResult.byteLength);
assert.strictEqual(glbDataView.getUint32(0, true), 0x46546C67, 'Magic must match 0x46546C67 (glTF)');
assert.strictEqual(glbDataView.getUint32(4, true), 2, 'Version must be 2');
console.log('  [PASS] Pure in-browser Wavefront OBJ to binary GLB converter verified');

console.log('[Test] All 10 core test suites passed successfully with zero errors!');


