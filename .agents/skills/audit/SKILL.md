---
name: audit
description: Systematic security, memory, and runtime auditing across CSP, CORS, declarativeNetRequest, XSS, token nonces, and stream buffer leaks.
---

# Audit Skill

## Audit Checklist
1. **Security & Context Isolation**:
   - Verify all Main-World <-> Content Script bridges use per-session unguessable random nonces.
   - Enforce strict protocol validation (`https?://`, `blob:` only) to prevent `javascript:` or `data:` URL injections.
   - Sanitize all file titles against path traversal (`../`) and forbidden OS characters (`<>:"/\\|?*`).
2. **CORS & CDN Protections**:
   - Validate declarativeNetRequest rules stripping `chrome-extension://` origin headers and spoofing origin page referrers to eliminate 403 Forbidden errors.
3. **Memory Footprint**:
   - Ensure multi-gigabyte streams pipe into `showSaveFilePicker()` writable streams rather than accumulating in unbounded JavaScript `ArrayBuffer` arrays.
4. **Stream Integrity**:
   - Verify DTS/PTS timestamp alignment across discontinuities (`#EXT-X-DISCONTINUITY`) to prevent frozen frames and audio drift.
