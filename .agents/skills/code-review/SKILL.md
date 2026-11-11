---
name: code-review
description: Enforces clean modular JavaScript/Go standards, zero unnecessary dependencies, consistent error propagation, and clear file boundaries.
---

# Code Review Skill

## Standards
1. **Separation of Concerns**: DOM scanning in content scripts, network sniffer in main world, message routing in service worker, streaming & muxing in core engine.
2. **Error Propagation**: No silent swallowed errors in download pipelines; surface clear actionable status strings to UI.
3. **Dependency Discipline**: Zero CDN script injection (prohibited by MV3 CSP); vendor lightweight, proven libraries (`mux.js`, `esbuild`) bundled into local `dist/`.
4. **Performance**: Avoid continuous polling loops; use event-driven reactive observers (`MutationObserver`, `postMessage`, chrome runtime listeners).
