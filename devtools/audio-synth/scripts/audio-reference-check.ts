/**
 * Ölçüm çekirdeğinin referans araçla çapraz denetimi — kodek SONRASI.
 *
 * Sentetik fixture'lar `writeOgg` ile Vorbis'e encode edilir, FFmpeg ile
 * çözülür ve aynı dosya iki kez ölçülür: paketin `Analysis` çekirdeği ve
 * FFmpeg `ebur128` (BS.1770 kapılı integrated, 4× true peak). Tolerans: EBU
 * R128'in ölçüm payı — integrated ±0.2 LU, true peak ±0.3 dB. Fark aşılırsa
 * çıkış kodu 1: analizör referanstan kaymıştır.
 *
 * Kullanım: tsx scripts/audio-reference-check.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureAsset } from '../src/analysis/assetQa';
import { Arrange, Presets, synthesize } from '../src/index';
import type { SynthesisResult } from '../src/types';
import { ensureFfmpeg, writeOgg } from '../src/writer';
import { decodeWithFfmpeg, ffmpegEbur128, ffmpegVersion } from './lib/ffmpeg';

const INTEGRATED_TOLERANCE_LU = 0.2;
const TRUE_PEAK_TOLERANCE_DB = 0.3;

function tone(seconds: number, dbfs: number, frequency: number, sampleRate: number, phase = 0) {
  const amplitude = Math.pow(10, dbfs / 20);
  const x = Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase),
  );
  const ramp = Math.round(0.02 * sampleRate);
  for (let i = 0; i < ramp; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / ramp);
    x[i] *= g;
    x[x.length - 1 - i] *= g;
  }
  return x;
}

function phrase(): SynthesisResult {
  const t = new Arrange.Timeline({ bpm: 110, beatsPerBar: 4, humanizeSeed: 3 });
  for (let bar = 0; bar < 2; bar++) {
    t.chord({
      instrument: Presets.mellowKeys,
      notes: Arrange.scaleChord('C3', Arrange.SCALES.major, bar * 3, 3),
      bar,
      beats: 4,
      gain: 0.7,
      spread: 0.4,
    });
  }
  return t.render({ targetRms: 0.12, tailSeconds: 1 });
}

const FIXTURES: { name: string; build: () => SynthesisResult }[] = [
  {
    name: 'EBU #1 — 1 kHz stereo −23 dBFS, 48 kHz',
    build: () => {
      const x = tone(20, -23, 1000, 48000);
      return { channels: [x, x.slice()], sampleRate: 48000, duration: 20 };
    },
  },
  {
    name: 'EBU #16 — fs/4, 45°, 0.5 FFS, 48 kHz',
    build: () => {
      const x = tone(2, -6.0206, 12000, 48000, Math.PI / 4);
      return { channels: [x, x.slice()], sampleRate: 48000, duration: 2 };
    },
  },
  { name: 'preset laser (SFX, kısa)', build: () => synthesize(Presets.laser(880, 0.3)) },
  {
    name: 'gürültü + reverb (ambiyans benzeri)',
    build: () =>
      synthesize({
        wave: 'pink',
        duration: 6,
        lowpass: { cutoff: 1800, poles: 2 },
        reverb: { amount: 0.4, decay: 2.5 },
        gain: 0.5,
      }),
  },
  { name: 'Timeline cümlesi (müzik benzeri)', build: phrase },
];

ensureFfmpeg();
const dir = mkdtempSync(join(tmpdir(), 'audio-reference-'));
let failures = 0;
try {
  console.log(`Referans: ${ffmpegVersion()} — ebur128 (BS.1770, 4× true peak)\n`);
  FIXTURES.forEach((fixture, index) => {
    const path = join(dir, `${index}.ogg`);
    writeOgg(path, fixture.build(), { quality: 5 });
    const decoded = decodeWithFfmpeg(path);
    const ours = measureAsset(decoded.channels, decoded.sampleRate);
    const reference = ffmpegEbur128(path);
    const deltaI =
      ours.integratedLufs === null || reference.integrated === null
        ? ours.integratedLufs === reference.integrated
          ? 0
          : Number.POSITIVE_INFINITY
        : Math.abs(ours.integratedLufs - reference.integrated);
    const deltaTp = Math.abs((ours.truePeakDbtp ?? -Infinity) - reference.truePeak);
    const ok = deltaI <= INTEGRATED_TOLERANCE_LU && deltaTp <= TRUE_PEAK_TOLERANCE_DB;
    if (!ok) failures++;
    const show = (v: number | null) => (v === null ? '—' : v.toFixed(2));
    console.log(
      `${ok ? '✓' : '✗'} ${fixture.name.padEnd(40)} I ${show(ours.integratedLufs).padStart(7)} / ` +
        `${show(reference.integrated).padStart(7)} LUFS  TP ${show(ours.truePeakDbtp).padStart(
          6,
        )} / ` +
        `${reference.truePeak.toFixed(2).padStart(6)} dBTP  (Δ ${deltaI.toFixed(
          3,
        )} LU, ${deltaTp.toFixed(3)} dB)`,
    );
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  `\n${FIXTURES.length - failures}/${FIXTURES.length} fixture tolerans içinde ` +
    `(integrated ±${INTEGRATED_TOLERANCE_LU} LU, true peak ±${TRUE_PEAK_TOLERANCE_DB} dB).`,
);
if (failures > 0) process.exit(1);
