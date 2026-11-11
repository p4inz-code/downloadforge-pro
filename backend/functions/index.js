// ============================================================
// DownloadForge Backend — functions/index.js
// ObsidianLabs | p4inz
//
// Firebase Cloud Functions for:
//   - Remote config delivery (feature flags, ad config)
//   - Future: license validation, usage analytics (anonymous)
//
// Deploy: firebase deploy --only functions
// ============================================================

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── Remote Config ─────────────────────────────────────────────
// Returns feature flags and config for the extension.
// No auth required — public endpoint.
exports.getConfig = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const doc = await db.collection('config').doc('public').get();
    const config = doc.exists ? doc.data() : getDefaultConfig();

    res.json({
      ok: true,
      version: '1.0.0',
      config,
      company: 'ObsidianLabs',
    });
  } catch (err) {
    functions.logger.error('getConfig error:', err);
    res.json({ ok: true, config: getDefaultConfig() }); // fail safe
  }
});

// ── Anonymous Usage Ping ──────────────────────────────────────
// Records anonymous install/active pings (no personal data).
// Extension version and browser only. Opt-in.
exports.ping = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')    { res.status(405).send(''); return; }

  const { version, event } = req.body || {};

  // Only accept known safe events
  const allowedEvents = ['install', 'active'];
  if (!allowedEvents.includes(event)) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    await db.collection('pings').add({
      version: String(version || 'unknown').slice(0, 20),
      event:   String(event),
      ts:      admin.firestore.FieldValue.serverTimestamp(),
      // No IP, no user ID, no browsing data stored
    });
    res.json({ ok: true });
  } catch (err) {
    functions.logger.error('ping error:', err);
    res.json({ ok: true }); // always succeed silently
  }
});

// ── Health check ──────────────────────────────────────────────
exports.health = functions.https.onRequest((req, res) => {
  res.json({ ok: true, service: 'DownloadForge', company: 'ObsidianLabs' });
});

// ── Default config ────────────────────────────────────────────
function getDefaultConfig() {
  return {
    adEnabled:          true,
    adPlacement:        'dashboard_sidebar', // only in dashboard
    maxResourcesPerScan: 500,
    hlsEnabled:         true,
    companionEnabled:   true,
    supportUrl:         'https://discord.gg/obsidianlabs',
    privacyUrl:         'https://obsidianlabs.pages.dev/privacy',
  };
}
