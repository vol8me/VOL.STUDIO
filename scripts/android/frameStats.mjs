/**
 * Android `dumpsys gfxinfo <paket> framestats` ayrıştırıcısı ve özeti (UI-00.6).
 *
 * Resmi kare zamanlaması: her satır bir karedir ve tek saat tabanında (CLOCK_MONOTONIC,
 * ns) şu damgaları taşır: `IntendedVsync`, `HandleInputStart`, `FrameDeadline`,
 * `FrameCompleted`, `GpuCompleted` ve (destekleyen sürümlerde) `DisplayPresentTime`
 * ile `InputEventId`. `DisplayPresentTime` ekrana sunulan kare zamanıdır; sütun
 * yoksa ya da hep sıfırsa sunum kapsamı `unsupported` raporlanır, tahmin edilmez.
 *
 * Sınırlar: tampon yalnız son ~120 kareyi tutar (120 Hz'de ≈1 sn). Girdi bağı
 * `HandleInputStart → DisplayPresentTime`dir: çekirdek olay zamanı ve sürücü
 * gecikmesi dahil DEĞİLDİR. Süreç içi WebView içeriği de bu pencere karelerinden
 * ölçülür; WebView'in kendi iç birleştiricisi ayrıdır.
 */

const NOMINAL_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

/** `---PROFILEDATA---` bloklarındaki kare satırları (sütun adıyla). */
export function parseFrameStats(text) {
  const frames = [];
  let columns = null;
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '---PROFILEDATA---') {
      inBlock = !inBlock;
      continue;
    }
    if (!inBlock || line === '') continue;
    if (line.startsWith('Flags,')) {
      columns = line.replace(/,$/, '').split(',');
      continue;
    }
    if (columns === null || !/^\d/.test(line)) continue;
    const values = line.replace(/,$/, '').split(',').map(Number);
    if (values.length !== columns.length || values.some((value) => !Number.isFinite(value)))
      continue;
    frames.push(Object.fromEntries(columns.map((name, index) => [name, values[index]])));
  }
  return { columns: columns ?? [], frames };
}

function percentile(sorted, fraction) {
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function distribution(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

const ms = (ns) => ns / 1e6;

/** Aralıktan (ms) en yakın bilinen yenileme hızı; hiçbirine ±%4 yakın değilse `null`. */
export function nominalHz(intervalMs) {
  if (!(intervalMs > 0)) return null;
  const hz = 1000 / intervalMs;
  return NOMINAL_HZ.find((candidate) => Math.abs(candidate - hz) / candidate <= 0.04) ?? null;
}

/**
 * Kare özeti. Tüm süreler ms'dir. Kapsamlar ayrı durumludur: sunum, GPU ve girdi
 * bağı desteklenmiyorsa `status: 'unsupported'` ve gerekçe taşır; 0 değildir.
 */
export function summarizeFrameStats({ columns, frames }) {
  const valid = frames.filter((frame) => frame.Flags === 0);
  const intervals = [];
  for (let index = 1; index < valid.length; index += 1) {
    intervals.push(ms(valid[index].IntendedVsync - valid[index - 1].IntendedVsync));
  }
  const intervalP50 = distribution(intervals)?.p50 ?? null;

  const hasPresent = columns.includes('DisplayPresentTime');
  const presented = hasPresent ? valid.filter((frame) => frame.DisplayPresentTime > 0) : [];
  const presentation = !hasPresent
    ? { status: 'unsupported', reason: 'DisplayPresentTime sütunu yok (Android sürümü)' }
    : presented.length === 0
      ? { status: 'unsupported', reason: 'DisplayPresentTime hiçbir karede dolu değil' }
      : {
          status: 'measured',
          basis: 'display-present-time',
          unpresentedFrames: valid.length - presented.length,
          intendedToPresentMs: distribution(
            presented.map((frame) => ms(frame.DisplayPresentTime - frame.IntendedVsync)),
          ),
        };

  const gpuFrames = columns.includes('GpuCompleted')
    ? valid.filter((frame) => frame.GpuCompleted > 0)
    : [];
  const render = {
    intendedToFrameCompletedMs: distribution(
      valid.map((frame) => ms(frame.FrameCompleted - frame.IntendedVsync)),
    ),
    intendedToGpuCompletedMs: distribution(
      gpuFrames.map((frame) => ms(frame.GpuCompleted - frame.IntendedVsync)),
    ),
    deadlineMisses: valid.filter((frame) => frame.FrameCompleted > frame.FrameDeadline).length,
  };

  const hasInput = columns.includes('InputEventId') && hasPresent;
  const inputFrames = hasInput
    ? presented.filter((frame) => frame.InputEventId !== 0 && frame.HandleInputStart > 0)
    : [];
  const input = !hasInput
    ? { status: 'unsupported', reason: 'InputEventId/DisplayPresentTime sütunları yok' }
    : inputFrames.length === 0
      ? {
          status: 'not-run',
          reason:
            'örnekleme penceresinde girdi karesi yok (tampon ≈120 kare); girdiyi hemen ardından örnekle',
        }
      : {
          status: 'measured',
          basis: 'handle-input-start-to-display-present',
          note: 'çekirdek olay zamanı ve sürücü gecikmesi dahil değildir',
          handleToPresentMs: distribution(
            inputFrames.map((frame) => ms(frame.DisplayPresentTime - frame.HandleInputStart)),
          ),
        };

  return {
    frames: frames.length,
    validFrames: valid.length,
    skippedFrames: frames.length - valid.length,
    vsyncIntervalMs: intervalP50,
    hz: nominalHz(intervalP50),
    presentation,
    render,
    input,
  };
}

/** Birden çok örneklemden gelen kareleri tekilleştirir (`FrameTimelineVsyncId` + `IntendedVsync`). */
export function mergeFrames(...parsed) {
  const columns = parsed.find((entry) => entry.columns.length > 0)?.columns ?? [];
  const seen = new Set();
  const frames = [];
  for (const entry of parsed) {
    for (const frame of entry.frames) {
      const key = `${frame.FrameTimelineVsyncId}:${frame.IntendedVsync}`;
      if (seen.has(key)) continue;
      seen.add(key);
      frames.push(frame);
    }
  }
  frames.sort((a, b) => a.IntendedVsync - b.IntendedVsync);
  return { columns, frames };
}
