---
name: backend
description: Standards for Chrome Extension MV3 Service Worker architecture, declarativeNetRequest rules, storage management, and native messaging Go companion.
---

# Backend Skill

## Core Principles
1. **MV3 Lifecycle Awareness**: Service workers terminate after 30 seconds of inactivity. Never perform long multi-minute downloads directly inside the service worker; delegate active transfers to dedicated browser tabs or native companion.
2. **DeclarativeNetRequest Rule Engine**: Maintain dynamic rules to modify headers (`Referer`, `Origin`, `User-Agent`) cleanly without blocking page performance.
3. **Storage Schema & Caching**: Cache detected stream variants, segment counts, and history in `chrome.storage.local` with strict capacity limits to avoid storage quota exhaustion.
4. **Native Go Companion**: Provide a clean cross-platform binary for optional external ffmpeg remuxing and high-concurrency downloads via standard stdin/stdout JSON protocol.
