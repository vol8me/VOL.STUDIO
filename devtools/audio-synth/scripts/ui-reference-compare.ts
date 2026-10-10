/**
 * UI sesleri için yerel referans karşılaştırması (UI-02.9): bant enerjisi, yükseklik ve
 * gövde/vurgu oranı.
 *
 * Referans paketleri (Kenney Interface Sounds, UI Audio; CC0) DEPOYA GİRMEZ: yol komut
 * satırından verilir, yalnız bu makinede ölçülür. Gönderilen set `core/public/assets/audio/ui`
 * altındaki paletlerdir. Hepsi kodek SONRASI, gönderilen OGG üzerinden ölçülür.
 *
 * Bantlar (Hz): sub 20–80, low 80–250, mid 250–2500, high 2500–16000. Bant düzeyi, sesin etkin
 * karelerindeki (en güçlü karenin 40 dB altına inmeyenler) ortalama RMS'idir (dBFS).
 * Gövde/vurgu = (sub+low) gücünün high gücüne oranı (dB); pozitif değer gövde ağırlıklı demektir.
 *
 * Kullanım: tsx scripts/ui-reference-compare.ts <referans-klasörü> [<referans-klasörü> …]
 * Çıktı: devtools/audio-synth/export/ui-reference/compare.json (git dışı) ve özet tablo.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { measureAsset } from '../src/analysis/assetQa';
import { powerSpectrum } from '../src/analysis/spectrum';
import { EXPORT_ROOT } from '../src/protocol/audition';
import { decodeWithFfmpeg } from './lib/ffmpeg';
import { findRepoRoot } from './lib/args';

const FRAME = 2048;
const HOP = FRAME / 2;
const ACTIVE_RANGE_DB = 40;
const BANDS = {
  sub: [20, 80],
  low: [80, 250],
  mid: [250, 2500],
  high: [2500, 16000],
} as const;
type BandName = keyof typeof BANDS;
const BAND_NAMES = Object.keys(BANDS) as BandName[];

interface UiSoundMeasurement {
  readonly id: string;
  readonly set: string;
  readonly durationMs: number;
  readonly maxMomentaryLufs: number | null;
  readonly truePeakDbtp: number | null;
  readonly bandDbfs: Record<BandName, number | null>;
  readonly bodyToAccentDb: number | null;
  readonly centroidHz: number | null;
}

const db = (power: number): number | null => (power > 0 ? 10 * Math.log10(power) : null);
const round = (value: number | null, digits = 1): number | null =>
  value === null ? null : Number(value.toFixed(digits));

/** Parseval: tek taraflı kutular iki katlanır, pencere gücü ve FFT boyu ile normalize edilir. */
function bandLevels(channels: readonly Float32Array[], sampleRate: number) {
  const window = Float64Array.from(
    { length: FRAME },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME),
  );
  const windowPower = window.reduce((sum, w) => sum + w * w, 0);
  const norm = 2 / (FRAME * windowPower);
  const binHz = sampleRate / FRAME;
  const frames: { total: number; bands: Record<BandName, number>; weighted: number }[] = [];
  const length = channels[0]?.length ?? 0;
  for (let from = 0; from < Math.max(1, length - HOP); from += HOP) {
    const frame = { total: 0, weighted: 0, bands: { sub: 0, low: 0, mid: 0, high: 0 } };
    for (const channel of channels) {
      const power = powerSpectrum(channel, from, FRAME, window);
      for (let k = 1; k < power.length; k++) {
        const hz = k * binHz;
        const p = power[k] * norm;
        frame.total += p;
        frame.weighted += p * hz;
        for (const name of BAND_NAMES) {
          const [lo, hi] = BANDS[name];
          if (hz >= lo && hz < hi) frame.bands[name] += p;
        }
      }
    }
    frames.push(frame);
  }
  const peak = Math.max(...frames.map((f) => f.total));
  const floor = peak * 10 ** (-ACTIVE_RANGE_DB / 10);
  const active = frames.filter((f) => f.total >= floor && f.total > 0);
  const channelCount = Math.max(1, channels.length);
  const mean = (pick: (f: (typeof frames)[number]) => number) =>
    active.reduce((sum, f) => sum + pick(f), 0) / Math.max(1, active.length) / channelCount;
  const bands = {
    sub: mean((f) => f.bands.sub),
    low: mean((f) => f.bands.low),
    mid: mean((f) => f.bands.mid),
    high: mean((f) => f.bands.high),
  };
  const total = mean((f) => f.total);
  const weighted = mean((f) => f.weighted);
  return { bands, centroidHz: total > 0 ? weighted / total : null };
}

function measureUiSound(path: string, set: string, root: string): UiSoundMeasurement {
  const decoded = decodeWithFfmpeg(path, relative(root, path));
  const asset = measureAsset(decoded.channels, decoded.sampleRate);
  const { bands, centroidHz } = bandLevels(decoded.channels, decoded.sampleRate);
  const body = bands.sub + bands.low;
  return {
    id: relative(root, path).replace(/\\/g, '/'),
    set,
    durationMs: Math.round(asset.durationSeconds * 1000),
    maxMomentaryLufs: round(asset.maxMomentaryLufs),
    truePeakDbtp: round(asset.truePeakDbtp),
    bandDbfs: {
      sub: round(db(bands.sub)),
      low: round(db(bands.low)),
      mid: round(db(bands.mid)),
      high: round(db(bands.high)),
    },
    bodyToAccentDb: bands.high > 0 && body > 0 ? round(10 * Math.log10(body / bands.high)) : null,
    centroidHz: round(centroidHz, 0),
  };
}

function listOgg(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listOgg(full);
    return /\.(ogg|wav)$/i.test(entry.name) ? [full] : [];
  });
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
}

interface SetSummary {
  readonly set: string;
  readonly count: number;
  readonly lufs: Range;
  readonly truePeak: Range;
  readonly bands: Record<BandName, Range>;
  readonly bodyToAccent: Range;
  readonly centroid: Range;
  readonly durationMs: Range;
}
interface Range {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

function range(values: readonly (number | null)[]): Range {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return { p10: NaN, p50: NaN, p90: NaN };
  return {
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

function summarize(set: string, items: readonly UiSoundMeasurement[]): SetSummary {
  return {
    set,
    count: items.length,
    lufs: range(items.map((i) => i.maxMomentaryLufs)),
    truePeak: range(items.map((i) => i.truePeakDbtp)),
    bands: {
      sub: range(items.map((i) => i.bandDbfs.sub)),
      low: range(items.map((i) => i.bandDbfs.low)),
      mid: range(items.map((i) => i.bandDbfs.mid)),
      high: range(items.map((i) => i.bandDbfs.high)),
    },
    bodyToAccent: range(items.map((i) => i.bodyToAccentDb)),
    centroid: range(items.map((i) => i.centroidHz)),
    durationMs: range(items.map((i) => i.durationMs)),
  };
}

const fmt = (r: Range, digits = 1): string =>
  Number.isNaN(r.p50)
    ? '—'
    : `${r.p50.toFixed(digits)} (${r.p10.toFixed(digits)}…${r.p90.toFixed(digits)})`;

function markdownTable(summaries: readonly SetSummary[]): string {
  const header =
    '| Set | Ses | Tepe anlık LUFS | True peak dBTP | sub dBFS | low dBFS | mid dBFS | high dBFS | Gövde/vurgu dB | Ağırlık merkezi Hz | Süre ms |';
  const separator = '| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = summaries.map((s) =>
    [
      s.set,
      s.count,
      fmt(s.lufs),
      fmt(s.truePeak),
      fmt(s.bands.sub),
      fmt(s.bands.low),
      fmt(s.bands.mid),
      fmt(s.bands.high),
      fmt(s.bodyToAccent),
      fmt(s.centroid, 0),
      fmt(s.durationMs, 0),
    ].join(' | '),
  );
  return [header, separator, ...rows.map((row) => `| ${row} |`)].join('\n');
}

function main(): void {
  const referenceDirs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (referenceDirs.length === 0) {
    process.stderr.write('kullanım: tsx scripts/ui-reference-compare.ts <referans-klasörü> …\n');
    process.exit(2);
  }
  const repo = findRepoRoot(process.cwd());
  const shippedRoot = join(repo, 'core/public/assets/audio/ui');
  const all: UiSoundMeasurement[] = [];
  const summaries: SetSummary[] = [];

  for (const reference of referenceDirs) {
    if (!statSync(reference).isDirectory()) throw new Error(`klasör değil: ${reference}`);
    const label = `Kenney ${basename(join(reference, '..'))}`;
    const items = listOgg(reference).map((file) => measureUiSound(file, label, reference));
    all.push(...items);
    summaries.push(summarize(label, items));
  }
  for (const palette of readdirSync(shippedRoot)) {
    const dir = join(shippedRoot, palette);
    if (!statSync(dir).isDirectory()) continue;
    const label = `VOL ${palette}`;
    const items = listOgg(dir).map((file) => measureUiSound(file, label, shippedRoot));
    all.push(...items);
    summaries.push(summarize(label, items));
  }

  const out = join(repo, EXPORT_ROOT, 'ui-reference');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'compare.json'),
    `${JSON.stringify({ bands: BANDS, activeRangeDb: ACTIVE_RANGE_DB, summaries, items: all }, null, 2)}\n`,
  );
  process.stdout.write(`${markdownTable(summaries)}\n`);
}

main();
