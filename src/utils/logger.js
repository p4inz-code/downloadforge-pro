// ============================================================
// DownloadForge — utils/logger.js
// P4inz Interactive Labs | p4inz
// ============================================================

export class Logger {
  constructor(prefix = 'DownloadForge') {
    this.prefix = `[DF:${prefix}]`;
  }

  info(...args)  { console.info(this.prefix, ...args); }
  warn(...args)  { console.warn(this.prefix, ...args); }
  error(...args) { console.error(this.prefix, ...args); }

  debug(...args) {
    // Only log debug if debug mode flag set
    if (typeof window !== 'undefined' && window.__dfDebug) {
      console.debug(this.prefix, ...args);
    } else if (typeof globalThis !== 'undefined' && globalThis.__dfDebug) {
      console.debug(this.prefix, ...args);
    }
  }
}
