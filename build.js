// ============================================================
// DownloadForge — build.js
// P4inz Interactive Labs | p4inz
//
// Esbuild pipeline to bundle:
// 1. content_script.js -> dist/content_script.bundle.js (iife)
// 2. downloader_bundle.js -> dist/downloader.bundle.js (iife, includes mux.js)
// ============================================================

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
    console.log('[Build] ✅ dist/content_script.bundle.js built successfully');

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
    console.log('[Build] ✅ dist/downloader.bundle.js built successfully');

    console.log('[Build] All bundles compiled cleanly!');
  } catch (err) {
    console.error('[Build] Build failed:', err);
    process.exit(1);
  }
}

build();
