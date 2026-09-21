/**
 * Kaynak bütçesinin referans ölçümü — tekrar üretilebilir senaryolar.
 *
 * Her senaryo AYRI bir süreçte koşar ki tepe RSS birbirine karışmasın;
 * Linux'ta `/usr/bin/time -f %M` tepe RSS'i (KB) verir. Araç yoksa RSS
 * "ölçülmedi" yazılır — tahmin uydurulmaz.
 *
 * Kullanım: tsx scripts/render-budget-bench.ts            (hepsi)
 *           tsx scripts/render-budget-bench.ts <senaryo>  (tek, alt süreç)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesize } from '../src/engine/synthesize';
import { estimateSynthCost } from '../src/guard/budget';
import { resolveSynthParams } from '../src/guard/synth';
import type { SynthParams } from '../src/types';
import { writeOgg } from '../src/writer';

const SCENARIOS: Record<string, { params: SynthParams; ogg?: boolean }> = {
  'sine-10s-44k': { params: { wave: 'sine', frequency: 440, duration: 10 } },
  'additive16-60s-48k-reverb': {
    params: {
      sampleRate: 48000,
      duration: 60,
      frequency: 220,
      detune: 8,
      harmonics: Array.from({ length: 16 }, (_, i) => ({ ratio: i + 1, gain: 1 / (i + 1) })),
      lowpass: { cutoff: 3000, resonance: 0.1, poles: 2 },
      reverb: { amount: 0.3, decay: 2.5, roomSize: 0.8, damp: 0.5 },
    },
  },
  'max-600s-48k-stereo': {
    params: {
      sampleRate: 48000,
      duration: 600,
      wave: 'sawtooth',
      frequency: 110,
      lowpass: { cutoff: 2000, poles: 2 },
      pan: -0.2,
      reverb: { amount: 0.3, decay: 3, roomSize: 0.8, damp: 0.5 },
    },
  },
  'max-600s-48k-stereo-sample': {
    params: {
      sampleRate: 48000,
      duration: 600,
      wave: 'sawtooth',
      frequency: 110,
      lowpass: { cutoff: 2000, poles: 2 },
      pan: -0.2,
      reverb: { amount: 0.3, decay: 3, roomSize: 0.8, damp: 0.5 },
      sample: {
        data: Float32Array.from({ length: 48000 * 10 }, (_, i) => Math.sin(i / 7) * 0.3),
        sampleRate: 48000,
        loop: true,
      },
    },
  },
  'max-600s-48k-stereo-ogg': {
    params: {
      sampleRate: 48000,
      duration: 600,
      wave: 'sawtooth',
      frequency: 110,
      lowpass: { cutoff: 2000, poles: 2 },
      pan: -0.2,
      reverb: { amount: 0.3, decay: 3, roomSize: 0.8, damp: 0.5 },
    },
    ogg: true,
  },
};

function runOne(name: string): void {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`bilinmeyen senaryo: ${name}`);
  const estimate = estimateSynthCost(resolveSynthParams(scenario.params));
  const start = performance.now();
  const result = synthesize(scenario.params);
  const renderMs = performance.now() - start;
  let oggMs: number | undefined;
  if (scenario.ogg) {
    const dir = mkdtempSync(join(tmpdir(), 'audio-bench-'));
    try {
      const t = performance.now();
      writeOgg(join(dir, 'out.ogg'), result);
      oggMs = performance.now() - t;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(
    JSON.stringify({
      name,
      estimatePeakMiB: +(estimate.peakBytes / 1024 ** 2).toFixed(1),
      workUnits: estimate.workUnits,
      renderMs: Math.round(renderMs),
      nsPerUnit: +((renderMs * 1e6) / estimate.workUnits).toFixed(2),
      outputMiB: +((result.channels.length * result.channels[0].byteLength) / 1024 ** 2).toFixed(1),
      oggMs: oggMs === undefined ? undefined : Math.round(oggMs),
    }),
  );
}

const only = process.argv[2];
if (only) {
  runOne(only);
} else {
  const self = fileURLToPath(import.meta.url);
  const timeTool = existsSync('/usr/bin/time') ? '/usr/bin/time' : undefined;
  for (const name of Object.keys(SCENARIOS)) {
    const command = timeTool ?? process.execPath;
    const args = timeTool
      ? ['-f', 'maxRssKB=%M', process.execPath, '--import', 'tsx', self, name]
      : ['--import', 'tsx', self, name];
    const run = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const rss = /maxRssKB=(\d+)/.exec(run.stderr ?? '');
    const line = (run.stdout ?? '').trim().split('\n').pop() ?? '';
    if (run.status !== 0) {
      console.log(JSON.stringify({ name, failed: true, stderr: run.stderr?.slice(-400) }));
      continue;
    }
    const data = JSON.parse(line) as Record<string, unknown>;
    data.peakRssMiB = rss ? +(Number(rss[1]) / 1024).toFixed(1) : 'ölçülmedi';
    console.log(JSON.stringify(data));
  }
}
