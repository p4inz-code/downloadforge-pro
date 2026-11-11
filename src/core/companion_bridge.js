// ============================================================
// DownloadForge — core/companion_bridge.js
// P4inz Interactive Labs | p4inz
//
// Native Messaging Bridge to the Go desktop companion app.
// Handles: ping/check, download task dispatch, status query.
// Gracefully degrades when companion is not installed.
// ============================================================

import { NATIVE_HOST } from '../shared/constants.js';
import { Logger } from '../utils/logger.js';

const log = new Logger('CompanionBridge');

let _port = null;
let _pendingCallbacks = new Map();
let _msgId = 0;

/**
 * Check if companion app is installed and responding.
 * @returns {Promise<{ available: boolean, version?: string }>}
 */
export function checkCompanion() {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST);

      const timeout = setTimeout(() => {
        port.disconnect();
        resolve({ available: false, error: 'Timeout' });
      }, 3000);

      port.onMessage.addListener((msg) => {
        clearTimeout(timeout);
        port.disconnect();
        if (msg.type === 'PONG') {
          resolve({ available: true, version: msg.version || 'unknown' });
        } else {
          resolve({ available: false });
        }
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        const err = chrome.runtime.lastError?.message || 'Not installed';
        resolve({ available: false, error: err });
      });

      port.postMessage({ type: 'PING', id: 'ping_check' });

    } catch (err) {
      resolve({ available: false, error: err.message });
    }
  });
}

/**
 * Send a download task to the companion app.
 * @param {{ url, filename, category, savePath? }} task
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export function sendDownloadTask(task) {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST);
      const id = ++_msgId;

      const timeout = setTimeout(() => {
        port.disconnect();
        resolve({ ok: false, error: 'Companion timeout' });
      }, 5000);

      port.onMessage.addListener((msg) => {
        if (msg.id === id || msg.type === 'DOWNLOAD_ACK') {
          clearTimeout(timeout);
          port.disconnect();
          resolve({ ok: true, taskId: msg.taskId });
        }
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        }
      });

      port.postMessage({ type: 'DOWNLOAD', id, payload: task });

    } catch (err) {
      log.error('Companion send failed:', err.message);
      resolve({ ok: false, error: err.message });
    }
  });
}
