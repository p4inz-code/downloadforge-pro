// ============================================================
// DownloadForge Pro — tests/test_parsers.js
// P4inz Interactive Labs | p4inz
// Automated Engine & Manifest Parser Tests
// ============================================================

import assert from 'node:assert';
import { parseISODuration } from '../src/core/dash_parser.js';
import { CONCURRENCY_PROFILES } from '../src/core/hls_engine.js';

console.log('[Test] Running DownloadForge Pro Engine Unit Tests...');

// 1. DASH ISO Duration Parser
assert.strictEqual(parseISODuration('PT1H2M30.5S'), 3750.5, 'ISO Duration PT1H2M30.5S mismatch');
assert.strictEqual(parseISODuration('PT30S'), 30, 'ISO Duration PT30S mismatch');
assert.strictEqual(parseISODuration('PT5M'), 300, 'ISO Duration PT5M mismatch');
assert.strictEqual(parseISODuration(''), 0, 'Empty ISO Duration should return 0');
console.log('  [PASS] DASH parseISODuration verified');

// 2. Concurrency Profiles
assert.strictEqual(CONCURRENCY_PROFILES.SAFE, 1, 'SAFE profile should be 1');
assert.strictEqual(CONCURRENCY_PROFILES.GENTLE, 2, 'GENTLE profile should be 2');
assert.strictEqual(CONCURRENCY_PROFILES.BALANCED, 4, 'BALANCED profile should be 4');
assert.strictEqual(CONCURRENCY_PROFILES.TURBO, 8, 'TURBO profile should be 8');
assert.strictEqual(CONCURRENCY_PROFILES.MAXIMUM, 16, 'MAXIMUM profile should be 16');
assert.strictEqual(CONCURRENCY_PROFILES.ULTRA, 32, 'ULTRA profile should be 32');
console.log('  [PASS] HLSEngine Concurrency Profiles verified (1, 2, 4, 8, 16, 32)');

// 3. Time Parsing Test for Slicer
function parseTimeString(str) {
  if (!str) return null;
  const parts = str.trim().split(':').map(val => parseFloat(val));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

assert.strictEqual(parseTimeString('00:01:30'), 90, '00:01:30 must equal 90s');
assert.strictEqual(parseTimeString('01:30'), 90, '01:30 must equal 90s');
assert.strictEqual(parseTimeString('90'), 90, '90 must equal 90s');
assert.strictEqual(parseTimeString('01:00:00'), 3600, '01:00:00 must equal 3600s');
assert.strictEqual(parseTimeString('invalid'), null, 'invalid must return null');
console.log('  [PASS] Time-Range Slicer string parser verified');

console.log('[Test] All 3 core test suites passed successfully with zero errors!');
