# DownloadForge

**By ObsidianLabs — Built by p4inz**

A production-quality Chrome extension for detecting and downloading resources from any webpage.
Supports videos, audio, images, documents, archives, and non-DRM HLS streams.

---

## Project Structure

```
downloadforge/
├── manifest.json                    ← Chrome MV3 manifest
├── package.json                     ← Build tools (esbuild, mux.js)
├── build.js                         ← Bundling pipeline
├── dist/                            ← Compiled bundles (content_script, downloader)
├── src/
│   ├── background/service_worker.js ← Message hub, badge, downloads
│   ├── content/
│   │   ├── injected_sniffer.js      ← Main-world dynamic stream sniffer
│   │   ├── content_script.js        ← Content script bridge
│   │   └── dom_scanner.js           ← DOM resource detection
│   ├── downloader/                  ← Dedicated Stream Studio (HLS & Transmuxer)
│   │   ├── downloader.html
│   │   ├── downloader.css
│   │   └── downloader_bundle.js
│   ├── popup/                       ← Extension popup UI
│   ├── dashboard/                   ← Full manager page
│   ├── core/
│   │   ├── hls_engine.js            ← In-browser multi-threaded HLS engine
│   │   ├── hls_parser.js            ← AES-128 & manifest parser
│   │   ├── detector.js              ← Detection orchestrator
│   │   ├── classifier.js            ← Type inference
│   │   ├── metadata.js              ← HEAD fetcher for file sizes
│   │   ├── downloads.js             ← Download manager
│   │   ├── rules.js                 ← Domain rules engine
│   │   └── companion_bridge.js      ← Native messaging bridge
│   ├── storage/storage.js           ← chrome.storage abstraction
│   ├── utils/                       ← Shared utilities
│   └── shared/constants.js          ← All constants
├── companion/                       ← Go native app
└── backend/                         ← Firebase Cloud Functions
```

---

## Building the Extension Bundles

```bash
npm install
npm run build
```

---

## Loading the Extension (Development)

1. Run `npm run build` to compile the bundles into `dist/`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `downloadforge/` folder
6. The extension appears in your toolbar

---

## Building the Companion App

```bash
cd companion
go build -o downloadforge-companion .
```

### Register native messaging host

**macOS / Linux:**
```bash
cp com.obsidianlabs.downloadforge.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
# Edit the file — set "path" to the full path of your built binary
```

**Windows:**
```
Copy com.obsidianlabs.downloadforge.json to:
HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.obsidianlabs.downloadforge
Set default value = full path to the JSON file
```

Update `allowed_origins` in the JSON with your extension's ID from `chrome://extensions`.

---

## Firebase Backend

```bash
cd backend
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only functions,firestore:rules
```

---

## Permissions Explained

| Permission | Why |
|---|---|
| `activeTab` | Scan current tab on user click only |
| `scripting` | Inject content script to scan DOM |
| `downloads` | Trigger downloads via Chrome API |
| `storage` | Save settings and history locally |
| `tabs` | Get current tab URL for page bar |
| `nativeMessaging` | Talk to desktop companion app |
| `webRequest` *(optional)* | Observe network requests for resources |

---

## Privacy

- All data stored locally via `chrome.storage.local`
- No personal data sent to any server
- Anonymous usage pings are opt-in and contain only extension version + event name
- No browsing history collected or stored
- Ads appear only in the dashboard page, never in the popup

---

## Important Constraints

- ❌ Does NOT bypass DRM, paywalls, or authentication
- ❌ Does NOT support YouTube (Chrome Web Store policy)
- ❌ HLS download only for non-DRM, openly accessible streams
- ✅ Only downloads resources directly accessible in your browser session

---

## Support

Discord: **discord.gg/obsidianlabs**
Website: **obsidianlabs.pages.dev**

© 2026 ObsidianLabs — Built by p4inz
