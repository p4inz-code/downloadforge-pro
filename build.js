// ============================================================
// DownloadForge — build.js
// P4inz Interactive Labs | p4inz
//
// Esbuild pipeline to bundle:
// 1. content_script.js -> dist/content_script.bundle.js (iife)
// 2. downloader_bundle.js -> dist/downloader.bundle.js (iife, includes mux.js)
// 3. stream_worker.js -> dist/stream_worker.bundle.js (iife, includes mux.js)
// ============================================================

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

async function build() {
  console.log('[Build] Starting DownloadForge bundle build...');

  try {
    // 1. Bundle content script
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/content/content_script.js')],
      bundle: true,
      outfile: path.join(distDir, 'content_script.bundle.js'),
      format: 'iife',
      platform: 'browser',
      target: ['chrome100'],
      minify: false,
    });
    console.log('[Build] [OK] dist/content_script.bundle.js built successfully');

    // 2. Bundle downloader studio
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/downloader/downloader_bundle.js')],
      bundle: true,
      outfile: path.join(distDir, 'downloader.bundle.js'),
      format: 'iife',
      platform: 'browser',
      target: ['chrome100'],
      minify: false,
    });
    console.log('[Build] [OK] dist/downloader.bundle.js built successfully');

    // 3. Bundle offscreen stream worker
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/core/worker/stream_worker.js')],
      bundle: true,
      outfile: path.join(distDir, 'stream_worker.bundle.js'),
      format: 'iife',
      platform: 'browser',
      target: ['chrome100'],
      minify: false,
    });
    console.log('[Build] [OK] dist/stream_worker.bundle.js built successfully');

    console.log('[Build] All bundles compiled cleanly!');
  } catch (err) {
    console.error('[Build Error]', err);
    process.exit(1);
  }
}

build();
