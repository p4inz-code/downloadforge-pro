// ============================================================
// DownloadForge — core/gltf_packager.js
// P4inz Interactive Labs | p4inz
//
// 3D Model Ripper & GLTF -> GLB Binary Container Packager
// Packs fragmented .gltf JSON, external .bin geometry buffers,
// and image textures into a 100% self-contained .glb binary file
// compatible with Blender, Unity, Unreal Engine, and Windows 3D Viewer.
// ============================================================

import { Logger } from '../utils/logger.js';

const log = new Logger('GltfPackager');

const GLB_HEADER_MAGIC = 0x46546C67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4E4F534A;  // "JSON"
const CHUNK_TYPE_BIN  = 0x004E4942;  // "BIN\0"

/**
 * Align byte length to 4-byte boundary
 * @param {number} value
 * @returns {number}
 */
export function alignTo4Bytes(value) {
  return (value + 3) & ~3;
}

/**
 * Creates a binary .glb container from glTF JSON and an optional binary chunk.
 * @param {object|string} gltfInput - parsed glTF JSON or JSON string
 * @param {Uint8Array|ArrayBuffer|null} binaryBuffer - raw vertex/index/texture buffer
 * @returns {Uint8Array} Packed .glb binary byte array
 */
export function createGlbContainer(gltfInput, binaryBuffer = null) {
  const jsonStr = typeof gltfInput === 'string' ? gltfInput : JSON.stringify(gltfInput);
  const encoder = new TextEncoder();
  const rawJsonBytes = encoder.encode(jsonStr);

  // Align JSON chunk with spaces (0x20)
  const jsonPadding = (4 - (rawJsonBytes.byteLength % 4)) % 4;
  const jsonChunkLength = rawJsonBytes.byteLength + jsonPadding;
  const jsonChunkData = new Uint8Array(jsonChunkLength);
  jsonChunkData.set(rawJsonBytes, 0);
  for (let i = rawJsonBytes.byteLength; i < jsonChunkLength; i++) {
    jsonChunkData[i] = 0x20; // space character padding
  }

  // Handle binary chunk if provided
  let binChunkLength = 0;
  let binChunkData = null;
  if (binaryBuffer) {
    const rawBin = binaryBuffer instanceof Uint8Array
      ? binaryBuffer
      : new Uint8Array(binaryBuffer);
    const binPadding = (4 - (rawBin.byteLength % 4)) % 4;
    binChunkLength = rawBin.byteLength + binPadding;
    binChunkData = new Uint8Array(binChunkLength);
    binChunkData.set(rawBin, 0);
    // binary padding is zeros (already 0)
  }

  // Calculate total GLB file size:
  // 12 bytes header + 8 bytes JSON chunk header + jsonChunkLength
  // + (binChunkData ? 8 bytes BIN chunk header + binChunkLength : 0)
  const hasBin = binChunkData !== null && binChunkLength > 0;
  const totalLength = 12 + 8 + jsonChunkLength + (hasBin ? 8 + binChunkLength : 0);

  const glbBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(glbBuffer);
  const bytes = new Uint8Array(glbBuffer);

  // 1. Write GLB Header (12 bytes, little-endian)
  view.setUint32(0, GLB_HEADER_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  // 2. Write JSON Chunk Header & Data
  let offset = 12;
  view.setUint32(offset, jsonChunkLength, true);
  view.setUint32(offset + 4, CHUNK_TYPE_JSON, true);
  offset += 8;
  bytes.set(jsonChunkData, offset);
  offset += jsonChunkLength;

  // 3. Write BIN Chunk Header & Data (if present)
  if (hasBin) {
    view.setUint32(offset, binChunkLength, true);
    view.setUint32(offset + 4, CHUNK_TYPE_BIN, true);
    offset += 8;
    bytes.set(binChunkData, offset);
  }

  log.debug(`Packed GLB container: ${totalLength} bytes (JSON: ${jsonChunkLength}, BIN: ${binChunkLength})`);
  return bytes;
}

/**
 * Fetch and bundle a remote .gltf and its external .bin buffers into a single .glb Blob
 * @param {string} gltfUrl - Direct URL to .gltf manifest
 * @param {object} options - Optional fetch options / referer
 * @returns {Promise<Blob>} Self-contained .glb Blob
 */
export async function bundleRemoteGltfToGlb(gltfUrl, options = {}) {
  log.info(`Bundling remote glTF from: ${gltfUrl}`);
  const baseUri = new URL(gltfUrl);

  const res = await fetch(gltfUrl, options);
  if (!res.ok) {
    throw new Error(`Failed to fetch glTF JSON (HTTP ${res.status})`);
  }
  const gltf = await res.json();

  if (!gltf.asset || !gltf.asset.version) {
    throw new Error('Invalid glTF manifest: missing asset.version');
  }

  // Fetch external buffers (.bin)
  const binaryParts = [];
  let totalBinByteLength = 0;
  const bufferOffsets = [];

  if (Array.isArray(gltf.buffers)) {
    for (const buf of gltf.buffers) {
      if (!buf.uri) continue;
      let bufUrl;
      if (buf.uri.startsWith('data:')) {
        // Base64 embedded data URI
        const base64Data = buf.uri.split(',')[1];
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8[i] = binaryStr.charCodeAt(i);
        }
        bufferOffsets.push(totalBinByteLength);
        binaryParts.push(u8);
        totalBinByteLength += alignTo4Bytes(u8.byteLength);
      } else {
        // External .bin file
        bufUrl = new URL(buf.uri, baseUri).toString();
        const bRes = await fetch(bufUrl, options);
        if (!bRes.ok) {
          throw new Error(`Failed to fetch buffer ${buf.uri} (HTTP ${bRes.status})`);
        }
        const arrayBuf = await bRes.arrayBuffer();
        const u8 = new Uint8Array(arrayBuf);
        bufferOffsets.push(totalBinByteLength);
        binaryParts.push(u8);
        totalBinByteLength += alignTo4Bytes(u8.byteLength);
      }
    }
  }

  // Combine binary chunks into a single concatenated buffer
  let combinedBin = null;
  if (binaryParts.length > 0) {
    combinedBin = new Uint8Array(totalBinByteLength);
    let writePos = 0;
    for (const part of binaryParts) {
      combinedBin.set(part, writePos);
      writePos += alignTo4Bytes(part.byteLength);
    }

    // Remap gltf.bufferViews to point to buffer 0 with shifted byteOffsets
    if (Array.isArray(gltf.bufferViews)) {
      for (const bv of gltf.bufferViews) {
        const bufIndex = bv.buffer || 0;
        const offsetShift = bufferOffsets[bufIndex] || 0;
        bv.byteOffset = (bv.byteOffset || 0) + offsetShift;
        bv.buffer = 0;
      }
    }

    // Update glTF buffers to a single binary chunk definition
    gltf.buffers = [
      {
        byteLength: totalBinByteLength,
      },
    ];
  }

  const glbBytes = createGlbContainer(gltf, combinedBin);
  return new Blob([glbBytes], { type: 'model/gltf-binary' });
}
