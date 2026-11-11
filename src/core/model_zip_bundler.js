// ============================================================
// DownloadForge Pro — core/model_zip_bundler.js
// P4inz Interactive Labs | p4inz
//
// Pure In-Browser 3D Model & Textures ZIP Package Builder
// Bundles 3D models (OBJ, GLB, BINZ), MTL materials, and
// PBR textures into clean, organized, zero-dependency ZIP archives.
// ============================================================

import { Logger } from '../utils/logger.js';

const log = new Logger('ModelZipBundler');

// CRC32 Lookup Table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  crcTable[i] = c;
}

export function computeCrc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

/**
 * Build a standard ZIP archive from an array of files.
 * @param {Array<{ name: string, data: Uint8Array|string }>} files
 * @returns {Uint8Array}
 */
export function buildZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = f.data instanceof Uint8Array ? f.data : enc.encode(f.data || '');
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034B50, true); // Local header signature
    lv.setUint16(4, 20, true);         // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // Flags: UTF-8 filename
    lv.setUint16(8, 0, true);          // Compression: 0 (Store)
    lv.setUint16(10, 0, true);         // Mod time
    lv.setUint16(12, 0, true);         // Mod date
    lv.setUint32(14, crc, true);       // CRC-32
    lv.setUint32(18, size, true);      // Compressed size
    lv.setUint32(22, size, true);      // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // Extra length
    lh.set(nameBytes, 30);

    localHeaders.push({ header: lh, data: dataBytes, offset });

    // Central directory header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014B50, true); // Central header signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed
    cv.setUint16(8, 0x0800, true);     // Flags: UTF-8
    cv.setUint16(10, 0, true);         // Compression: Store
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // Comment length
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal attributes
    cv.setUint32(38, 0, true);         // External attributes
    cv.setUint32(42, offset, true);    // Offset of local header
    ch.set(nameBytes, 46);

    centralHeaders.push(ch);
    offset += lh.length + dataBytes.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const ch of centralHeaders) centralSize += ch.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054B50, true); // EOCD signature
  ev.setUint16(4, 0, true);          // Disk number
  ev.setUint16(6, 0, true);          // Start disk
  ev.setUint16(8, files.length, true); // Total entries this disk
  ev.setUint16(10, files.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, centralOffset, true); // Offset of central directory
  ev.setUint16(20, 0, true);         // Comment length

  const totalLength = centralOffset + centralSize + 22;
  const zip = new Uint8Array(totalLength);
  let pos = 0;
  for (const item of localHeaders) {
    zip.set(item.header, pos); pos += item.header.length;
    zip.set(item.data, pos); pos += item.data.length;
  }
  for (const ch of centralHeaders) {
    zip.set(ch, pos); pos += ch.length;
  }
  zip.set(eocd, pos);
  return zip;
}

/**
 * Resolve and package a complete Sketchfab model package with textures into a ZIP archive.
 * @param {string} uid - 32-hex model UID
 * @param {string} requestedTitle - Preferred file title
 * @param {string} [capturedObjMesh] - Optional in-page extracted OBJ mesh string
 * @returns {Promise<{ ok: boolean, zipBytes?: Uint8Array, officialUrl?: string, filename: string, error?: string }>}
 */
export async function bundleSketchfabModelPackage(uid, requestedTitle, capturedObjMesh = null) {
  try {
    log.info(`Bundling Sketchfab model ${uid}...`);

    // 1. Fetch metadata
    const metaRes = await fetch(`https://sketchfab.com/i/models/${uid}`);
    let meta = null;
    if (metaRes.ok) {
      meta = await metaRes.json();
    }

    const modelName = ((meta && meta.name) || requestedTitle || 'sketchfab_model')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .slice(0, 100);

    // 2. Check official download endpoint (if logged in or free archive available)
    try {
      const dlRes = await fetch(`https://sketchfab.com/v3/models/${uid}/download`, {
        credentials: 'include'
      });
      if (dlRes.ok) {
        const dlData = await dlRes.json();
        if (dlData.gltf && dlData.gltf.url) {
          return { ok: true, officialUrl: dlData.gltf.url, filename: `${modelName}.zip` };
        } else if (dlData.glb && dlData.glb.url) {
          return { ok: true, officialUrl: dlData.glb.url, filename: `${modelName}.glb` };
        } else if (dlData.usdz && dlData.usdz.url) {
          return { ok: true, officialUrl: dlData.usdz.url, filename: `${modelName}.usdz` };
        }
      }
    } catch (e) {}

    // 3. Fallback package: Fetch textures & stream files
    const zipFiles = [];

    // A. Textures from /i/models/<uid>/textures
    const texturesRes = await fetch(`https://sketchfab.com/i/models/${uid}/textures`);
    const textureNames = [];
    if (texturesRes.ok) {
      const texJson = await texturesRes.json();
      if (texJson && Array.isArray(texJson.results)) {
        for (const texItem of texJson.results) {
          if (texItem && Array.isArray(texItem.images) && texItem.images.length > 0) {
            // Pick highest resolution image
            const best = texItem.images.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            if (best && best.url) {
              try {
                const imgRes = await fetch(best.url);
                if (imgRes.ok) {
                  const imgBuf = await imgRes.arrayBuffer();
                  const filename = texItem.name || best.url.split('/').pop().split('?')[0] || `texture_${Date.now()}.png`;
                  zipFiles.push({
                    name: `textures/${filename}`,
                    data: new Uint8Array(imgBuf)
                  });
                  textureNames.push(filename);
                }
              } catch (texErr) {
                log.warn('Texture fetch failed:', best.url);
              }
            }
          }
        }
      }
    }

    // B. Model Geometry: If captured OBJ exists, use it!
    if (capturedObjMesh && capturedObjMesh.length > 100) {
      zipFiles.push({
        name: `${modelName}.obj`,
        data: capturedObjMesh
      });

      // Generate matching .mtl material file
      let mtlContent = `# DownloadForge Pro Material Library\n# Model: ${modelName}\n\n`;
      if (textureNames.length > 0) {
        mtlContent += `newmtl Material_Main\n`;
        mtlContent += `Ka 1.000 1.000 1.000\n`;
        mtlContent += `Kd 1.000 1.000 1.000\n`;
        mtlContent += `Ks 0.500 0.500 0.500\n`;
        mtlContent += `Ns 250.000\n`;
        mtlContent += `illum 2\n`;

        // Map primary diffuse/albedo texture
        const diffuseTex = textureNames.find(n => !n.includes('_nrm') && !n.includes('_a') && !n.includes('refl')) || textureNames[0];
        if (diffuseTex) {
          mtlContent += `map_Kd textures/${diffuseTex}\n`;
        }
        // Map normal map if present
        const normalTex = textureNames.find(n => n.includes('_nrm') || n.includes('normal'));
        if (normalTex) {
          mtlContent += `map_Bump textures/${normalTex}\n`;
        }
      } else {
        mtlContent += `newmtl Material_Default\nKd 0.8 0.8 0.8\n`;
      }

      zipFiles.push({
        name: `${modelName}.mtl`,
        data: mtlContent
      });
    }

    // C. Binary stream geometry fallback (.binz / .osgjs)
    if (meta && Array.isArray(meta.files) && meta.files.length > 0 && meta.files[0].osgjsUrl) {
      try {
        const binzRes = await fetch(meta.files[0].osgjsUrl);
        if (binzRes.ok) {
          const binzBuf = await binzRes.arrayBuffer();
          const ext = meta.files[0].osgjsUrl.split('.').pop().split('?')[0] || 'binz';
          zipFiles.push({
            name: `source/model_stream.${ext}`,
            data: new Uint8Array(binzBuf)
          });
        }
      } catch (binzErr) {}
    }

    // D. Documentation / README.txt
    const author = (meta && meta.user && (meta.user.displayName || meta.user.username)) || 'Creator';
    const license = (meta && meta.license && meta.license.fullname) || 'Creative Commons Attribution';
    const readme = [
      `DownloadForge Pro — 3D Asset Package`,
      `====================================`,
      `Model Name : ${modelName}`,
      `Author     : ${author}`,
      `License    : ${license}`,
      `Extracted  : ${new Date().toISOString()}`,
      ``,
      `Contents:`,
      `- Model    : ${capturedObjMesh ? `${modelName}.obj & ${modelName}.mtl` : 'source/model_stream.binz'}`,
      `- Textures : ${textureNames.length} high-resolution PBR textures in textures/`,
      ``,
      `Import Instructions:`,
      `1. Blender: File -> Import -> Wavefront (.obj)`,
      `2. Viewport: Press Z -> Select 'Material Preview' to render textures.`,
    ].join('\n');

    zipFiles.push({
      name: 'README.txt',
      data: readme
    });

    const zipBytes = buildZipArchive(zipFiles);
    return {
      ok: true,
      zipBytes,
      filename: `${modelName}_3D_Package.zip`
    };
  } catch (err) {
    log.error('Failed to bundle Sketchfab model package:', err.message);
    return { ok: false, error: err.message, filename: `${requestedTitle || 'model'}.zip` };
  }
}
