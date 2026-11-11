// ============================================================
// DownloadForge Pro — core/dash_parser.js
// P4inz Interactive Labs | p4inz
//
// In-Browser MPEG-DASH (.mpd) Manifest Parser (ISO/IEC 23009-1)
// Supports:
//   - Static (VOD) and Dynamic (Live) MPD manifests
//   - SegmentTemplate with $Number$, $Time$, $Bandwidth$, $RepresentationID$
//   - SegmentTimeline with <S t="..." d="..." r="..."/> repeats
//   - SegmentList & BaseURL resolution
//   - Multi-period & dual-track video + audio track extraction
// ============================================================

/**
 * Parses ISO 8601 duration strings like "PT1H2M30.5S" into total seconds.
 */
export function parseISODuration(str) {
  if (!str) return 0;
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i;
  const match = str.match(regex);
  if (!match) return 0;
  const hours = parseFloat(match[1] || 0);
  const minutes = parseFloat(match[2] || 0);
  const seconds = parseFloat(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Resolves relative URLs against a base URL.
 */
function resolveUrl(relative, base) {
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return relative;
  }
}

/**
 * Replaces DASH template tokens: $RepresentationID$, $Number$, $Time$, $Bandwidth$
 */
function formatTemplate(template, tokens) {
  let result = template;

  if (tokens.RepresentationID !== undefined) {
    result = result.replace(/\$RepresentationID\$/g, tokens.RepresentationID);
  }
  if (tokens.Bandwidth !== undefined) {
    result = result.replace(/\$Bandwidth\$/g, tokens.Bandwidth);
  }

  // Handle $Number$ and $Number%0Nd$
  result = result.replace(/\$Number(?:%0(\d+)d)?\$/g, (_, pad) => {
    const numStr = String(tokens.Number !== undefined ? tokens.Number : 1);
    const padLen = pad ? parseInt(pad, 10) : 0;
    return numStr.padStart(padLen, '0');
  });

  // Handle $Time$
  if (tokens.Time !== undefined) {
    result = result.replace(/\$Time\$/g, String(tokens.Time));
  }

  return result;
}

/**
 * Main parser entry point for MPEG-DASH (.mpd) manifests.
 * @param {string} mpdUrl
 * @returns {Promise<object>} Parsed DASH playlist representation
 */
export async function parseDASHManifest(mpdUrl) {
  try {
    const res = await fetch(mpdUrl, { cache: 'no-store' });
    if (!res.ok) {
      return { error: `HTTP ${res.status} fetching MPD manifest` };
    }

    const xmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return { error: 'Failed to parse MPD XML document' };
    }

    const mpdEl = doc.querySelector('MPD');
    if (!mpdEl) {
      return { error: 'Invalid DASH manifest: Missing root <MPD> element' };
    }

    const totalDurationSec = parseISODuration(mpdEl.getAttribute('mediaPresentationDuration'));
    const isLive = (mpdEl.getAttribute('type') || '').toLowerCase() === 'dynamic';

    let mpdBaseUrl = mpdUrl;
    const rootBaseEl = mpdEl.querySelector(':scope > BaseURL');
    if (rootBaseEl && rootBaseEl.textContent.trim()) {
      mpdBaseUrl = resolveUrl(rootBaseEl.textContent.trim(), mpdUrl);
    }

    const videoTracks = [];
    const audioTracks = [];

    const periodEls = doc.querySelectorAll('Period');
    const targetPeriod = periodEls[0] || mpdEl;

    const adaptSetEls = targetPeriod.querySelectorAll('AdaptationSet');

    adaptSetEls.forEach((adaptSet) => {
      let mimeType = (adaptSet.getAttribute('mimeType') || '').toLowerCase();
      let contentType = (adaptSet.getAttribute('contentType') || '').toLowerCase();

      // Check inherited SegmentTemplate on AdaptationSet level
      const adaptTemplate = adaptSet.querySelector(':scope > SegmentTemplate');

      const repEls = adaptSet.querySelectorAll('Representation');
      repEls.forEach((rep) => {
        const repId = rep.getAttribute('id') || '';
        const repBandwidth = parseInt(rep.getAttribute('bandwidth') || '0', 10);
        const repWidth = parseInt(rep.getAttribute('width') || '0', 10);
        const repHeight = parseInt(rep.getAttribute('height') || '0', 10);
        const repMime = (rep.getAttribute('mimeType') || mimeType).toLowerCase();
        const repCodecs = rep.getAttribute('codecs') || adaptSet.getAttribute('codecs') || '';

        const isVideo = contentType === 'video' || repMime.includes('video') || repWidth > 0 || repHeight > 0;
        const isAudio = contentType === 'audio' || repMime.includes('audio');

        // Resolve SegmentTemplate (Representation level takes precedence over AdaptationSet)
        const segTemplate = rep.querySelector('SegmentTemplate') || adaptTemplate;
        const segListEl = rep.querySelector('SegmentList') || adaptSet.querySelector('SegmentList');
        const repBaseEl = rep.querySelector('BaseURL') || adaptSet.querySelector('BaseURL');

        const trackBaseUrl = repBaseEl && repBaseEl.textContent.trim()
          ? resolveUrl(repBaseEl.textContent.trim(), mpdBaseUrl)
          : mpdBaseUrl;

        let segments = [];
        let initUrl = null;

        if (segTemplate) {
          const initTemplate = segTemplate.getAttribute('initialization');
          if (initTemplate) {
            initUrl = resolveUrl(
              formatTemplate(initTemplate, { RepresentationID: repId, Bandwidth: repBandwidth }),
              trackBaseUrl
            );
          }

          const mediaTemplate = segTemplate.getAttribute('media') || '';
          const timescale = parseFloat(segTemplate.getAttribute('timescale') || '1');
          const startNumber = parseInt(segTemplate.getAttribute('startNumber') || '1', 10);
          const duration = parseFloat(segTemplate.getAttribute('duration') || '0');

          const timelineEl = segTemplate.querySelector('SegmentTimeline');

          if (timelineEl) {
            // SegmentTimeline: explicit segment durations with repeat count
            const sEls = timelineEl.querySelectorAll('S');
            let currentTime = 0;
            let currentNumber = startNumber;

            sEls.forEach((s) => {
              if (s.getAttribute('t')) {
                currentTime = parseFloat(s.getAttribute('t'));
              }
              const d = parseFloat(s.getAttribute('d'));
              const r = parseInt(s.getAttribute('r') || '0', 10);
              const count = r >= 0 ? r + 1 : 1;

              for (let i = 0; i < count; i++) {
                const segUrl = resolveUrl(
                  formatTemplate(mediaTemplate, {
                    RepresentationID: repId,
                    Number: currentNumber,
                    Time: currentTime,
                    Bandwidth: repBandwidth,
                  }),
                  trackBaseUrl
                );

                segments.push({
                  url: segUrl,
                  duration: d / timescale,
                  sequence: currentNumber,
                });

                currentTime += d;
                currentNumber++;
              }
            });
          } else if (duration > 0 && totalDurationSec > 0) {
            // Number-based template calculation from total duration
            const segDurationSec = duration / timescale;
            const totalSegs = Math.ceil(totalDurationSec / segDurationSec);

            for (let i = 0; i < totalSegs; i++) {
              const num = startNumber + i;
              const segUrl = resolveUrl(
                formatTemplate(mediaTemplate, {
                  RepresentationID: repId,
                  Number: num,
                  Time: i * duration,
                  Bandwidth: repBandwidth,
                }),
                trackBaseUrl
              );

              segments.push({
                url: segUrl,
                duration: segDurationSec,
                sequence: num,
              });
            }
          }
        } else if (segListEl) {
          // Explicit SegmentList
          const initEl = segListEl.querySelector('Initialization');
          if (initEl && initEl.getAttribute('sourceURL')) {
            initUrl = resolveUrl(initEl.getAttribute('sourceURL'), trackBaseUrl);
          }

          const segUrls = segListEl.querySelectorAll('SegmentURL');
          segUrls.forEach((su, idx) => {
            const media = su.getAttribute('media');
            if (media) {
              segments.push({
                url: resolveUrl(media, trackBaseUrl),
                duration: 0,
                sequence: idx + 1,
              });
            }
          });
        }

        const trackInfo = {
          id: repId,
          bandwidth: repBandwidth,
          width: repWidth,
          height: repHeight,
          resolution: repWidth && repHeight ? `${repWidth}x${repHeight}` : (isAudio ? 'Audio Track' : 'Unknown'),
          label: repWidth && repHeight ? `${repHeight}p (${Math.round(repBandwidth / 1000)} kbps)` : (isAudio ? `Audio (${Math.round(repBandwidth / 1000)} kbps)` : repId),
          codecs: repCodecs,
          initUrl,
          segments,
          isAudio,
          isVideo,
        };

        if (isVideo) {
          videoTracks.push(trackInfo);
        } else if (isAudio) {
          audioTracks.push(trackInfo);
        }
      });
    });

    // Sort video tracks descending by bandwidth / resolution
    videoTracks.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
    audioTracks.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

    return {
      type: 'dash',
      isLive,
      totalDurationSec,
      videoTracks,
      audioTracks,
      variants: videoTracks.map((v) => ({
        url: mpdUrl,
        bandwidth: v.bandwidth,
        resolution: v.resolution,
        label: v.label,
        trackId: v.id,
        initUrl: v.initUrl,
        segments: v.segments,
      })),
      defaultAudioTrack: audioTracks[0] || null,
    };
  } catch (err) {
    return { error: `DASH parser exception: ${err.message}` };
  }
}
