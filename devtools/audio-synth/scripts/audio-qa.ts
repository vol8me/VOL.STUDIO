/**
 * Gönderilen ses varlıkları için ölçüm aracı — kodek SONRASI çıktı üzerinde.
 *
 * Prosedürel üretimde "kulağa kötü geliyor" tek başına takip edilemez; bu
 * betik somut sayılara çevirir: BS.1770 yükseklik (integrated / en yüksek
 * momentary, LUFS), true peak (dBTP), örnek tepesi, KANAL başına kırpma, DC,
 * tık, stereo ilinti ve bant profili. Yükseklik ve tepe hesabı paketin
 * `Analysis` çekirdeğindedir; betik yalnız çözer, sınıflar ve raporlar.
 *
 * Kullanım: tsx scripts/audio-qa.ts <dizin> [--policy] [--json] [--class ui|sfx|ambience|music]
 *   --policy  sınıf politikasını uygular; ihlal varsa çıkış kodu 1.
 *   --json    makine-okunur rapor (araç sürümü ve politika sürümüyle).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  ASSET_CLASS_POLICIES,
  classifyAssetPath,
  evaluateAssetPolicy,
  measureAsset,
  type AssetClass,
} from '../src/analysis/assetQa';
import { fft } from '../src/analysis/spectrum';
import { ensureFfmpeg } from '../src/writer';
import { decodeWithFfmpeg, ffmpegVersion } from './lib/ffmpeg';

/**
 * Tık eşiği: örnek farkı 0,35'i aşmalı VE ardından gelen ~1 ms'lik
 * pencerede sinyal neredeyse sıfıra düşmeli (içerik bir örnekte "yok olur").
 * Tek başına eşik parlak içeriği tık sayar — ölçüldü: 9 kHz'lik bir kısmi
 * ton, genlik ~0,26'da zaten örnek başına 0,35 fark üretir.
 */
const CLICK_DELTA_THRESHOLD = 0.35;
const CLICK_DROP_LEVEL = 0.05;
const CLICK_DROP_WINDOW = 48;

function countClicks(left: Float32Array, right: Float32Array): number {
  const n = left.length;
  let clicks = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.max(Math.abs(left[i] - left[i - 1]), Math.abs(right[i] - right[i - 1]));
    if (d <= CLICK_DELTA_THRESHOLD) continue;
    let after = 0;
    const count = Math.min(CLICK_DROP_WINDOW, n - i);
    for (let k = i; k < i + count; k++) after += Math.max(Math.abs(left[k]), Math.abs(right[k]));
    if (after / Math.max(1, count) < CLICK_DROP_LEVEL) clicks++;
  }
  return clicks;
}

const BANDS = [
  { name: 'sub', lo: 20, hi: 120 },
  { name: 'low', lo: 120, hi: 500 },
  { name: 'mid', lo: 500, hi: 2500 },
  { name: 'high', lo: 2500, hi: 8000 },
  { name: 'air', lo: 8000, hi: 20000 },
];

/**
 * Bant başına seviye (dBFS RMS) — Hann pencereli FFT ortalaması. Yüzde
 * yerine dB: güç oranında bas her zaman toplamı domine eder ve üst bantlar
 * sıfıra yuvarlanır.
 */
function bandProfile(samples: Float32Array, sampleRate: number): number[] {
  const size = 4096;
  if (samples.length < size) return BANDS.map(() => -Infinity);
  const windowCount = Math.min(48, Math.floor(samples.length / size));
  const step = Math.floor(samples.length / windowCount);
  const energy = new Array<number>(BANDS.length).fill(0);
  for (let w = 0; w < windowCount; w++) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      re[i] = samples[w * step + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    fft(re, im);
    for (let bin = 1; bin < size / 2; bin++) {
      const freq = (bin * sampleRate) / size;
      const band = BANDS.findIndex((b) => freq >= b.lo && freq < b.hi);
      if (band >= 0) energy[band] += 2 * (re[bin] * re[bin] + im[bin] * im[bin]);
    }
  }
  // Hann penceresinin koherent kazancı 0.5.
  return energy.map((e) => {
    const meanPower = e / (windowCount * size * size * 0.25);
    return meanPower > 0 ? 10 * Math.log10(meanPower) : -Infinity;
  });
}

function collectOggs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectOggs(full));
    else if (entry.isFile() && entry.name.endsWith('.ogg')) out.push(full);
  }
  return out.sort();
}

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--class');
const classIndex = args.indexOf('--class');
const forcedClass = classIndex >= 0 ? (args[classIndex + 1] as AssetClass) : undefined;
const enforce = args.includes('--policy');
const asJson = args.includes('--json');

if (!dirArg) {
  console.error('Kullanım: tsx scripts/audio-qa.ts <dizin> [--policy] [--json] [--class <sınıf>]');
  process.exit(1);
}
if (forcedClass && !(forcedClass in ASSET_CLASS_POLICIES.classes)) {
  console.error(`Bilinmeyen sınıf: ${forcedClass}`);
  process.exit(1);
}
const root = resolve(dirArg);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Klasör bulunamadı: ${root}`);
  process.exit(1);
}

ensureFfmpeg();
const files = collectOggs(root);
const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fmt = (v: number | null, digits = 1): string => (v === null ? '   —' : v.toFixed(digits));

const rows = files.map((file) => {
  const label = relative(root, file).replace(/\\/g, '/');
  const { channels, sampleRate } = decodeWithFfmpeg(file);
  const left = channels[0];
  const right = channels[1] ?? left;
  const measurement = measureAsset(channels, sampleRate);
  const assetClass = forcedClass ?? classifyAssetPath(label);
  const verdict = evaluateAssetPolicy(measurement, assetClass);
  let sumSq = 0;
  let corrNum = 0;
  let leftSq = 0;
  let rightSq = 0;
  const dc = channels.map((ch) => ch.reduce((a, v) => a + v, 0) / Math.max(1, ch.length));
  for (let i = 0; i < left.length; i++) {
    sumSq += (left[i] * left[i] + right[i] * right[i]) / 2;
    corrNum += left[i] * right[i];
    leftSq += left[i] * left[i];
    rightSq += right[i] * right[i];
  }
  const denom = Math.sqrt(leftSq * rightSq);
  return {
    file: label,
    sampleRate,
    ...measurement,
    rmsDbfs: toDb(Math.sqrt(sumSq / Math.max(1, left.length))),
    dc,
    clicks: countClicks(left, right),
    correlation: denom > 0 ? corrNum / denom : 1,
    bands: bandProfile(left, sampleRate),
    assetClass,
    violations: verdict.violations,
  };
});

const failing = rows.filter((r) => r.violations.length > 0);
if (asJson) {
  console.log(
    JSON.stringify(
      {
        tool: ffmpegVersion(),
        policyVersion: ASSET_CLASS_POLICIES.version,
        measuredFrom: 'decoded-ogg',
        files: rows,
      },
      (_k, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? null : v),
      1,
    ),
  );
} else if (rows.length === 0) {
  console.log(`${root} altında .ogg yok — önce paketin ses üretim reçetesini koş.`);
} else {
  console.log(
    `Ölçüm: ${rows.length} dosya, kodek sonrası (${ffmpegVersion()}); politika v${
      ASSET_CLASS_POLICIES.version
    }\n`,
  );
  for (const r of rows) {
    const bandText = BANDS.map(
      (b, i) => `${b.name}:${(r.bands[i] > -Infinity ? r.bands[i] : -99).toFixed(0).padStart(4)}`,
    ).join(' ');
    console.log(
      [
        r.file.padEnd(34),
        r.assetClass.padEnd(8),
        `${r.durationSeconds.toFixed(1).padStart(5)}s`,
        `I${fmt(r.integratedLufs).padStart(6)}`,
        `Mmax${fmt(r.maxMomentaryLufs).padStart(6)}`,
        `TP${fmt(r.truePeakDbtp, 2).padStart(7)}`,
        `SP${fmt(r.samplePeakDbfs, 2).padStart(7)}`,
        `rms${r.rmsDbfs.toFixed(1).padStart(6)}`,
        `clip ${r.clips.perChannel.join('/')}`,
        `click${String(r.clicks).padStart(3)}`,
        `corr${r.correlation >= 0 ? ' ' : ''}${r.correlation.toFixed(2)}`,
        bandText,
        r.violations.length > 0 ? `✗ ${r.violations.join('; ')}` : '✓',
      ].join('  '),
    );
  }
  const clipped = rows.reduce((n, r) => n + r.clips.channelSamples, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  console.log(
    `\nToplam: ${clicks} tık, ${clipped} kırpılmış kanal örneği; ` +
      `politika ihlali ${failing.length}/${rows.length} dosya.`,
  );
}

if (enforce && failing.length > 0) process.exit(1);
