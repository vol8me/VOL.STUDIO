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
import { estimateProgramCost, renderProgram } from '../src/program/render';
import { resolveProgram } from '../src/program/schema';

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

const OSC = {
  primitive: 'source.oscillator',
  version: 2,
  params: { waveform: 'sawtooth', frequency: 1760 },
};
const ENV = {
  primitive: 'articulation.envelope',
  version: 1,
  params: { attack: 0.005, decay: 0.3, sustainLevel: 0.5, release: 0.2 },
};
const prog = (extra: Record<string, unknown>, channels = 1): Record<string, unknown> => ({
  schema: 'AcousticProgramV1',
  sampleRate: 48000,
  channels,
  durationSeconds: 10,
  seed: 5,
  layers: [{ name: 'body', source: OSC, articulation: ENV, ...extra }],
  master: { normalize: 'peak', peakDbfs: -6 },
});

/**
 * `prog-*` senaryoları `AcousticProgramV1` üzerinden koşar: pahalı
 * düğümlerin (BLEP osilatör, air-absorption, width, treatment, addBurst)
 * `estimateProgramCost` modelini gerçek render süresiyle karşılaştırır.
 * 10 sn'lik süre JIT ve çözüm sabitlerinin ns/birim oranını şişirmesini
 * sınırlar; oran marjinal birim maliyetine yaklaşır.
 */
const PROGRAM_SCENARIOS: Record<string, { doc: Record<string, unknown> }> = {
  'prog-blep-osc': { doc: prog({}) },
  'prog-air-absorption': {
    doc: prog({
      inserts: [{ primitive: 'effect.air-absorption', version: 1, params: { distance: 400 } }],
    }),
  },
  'prog-width': {
    // Stereo: `effect.width` mono tamponda etkisizdir — delta ölçümü ancak
    // stereo senaryoda düğümün gerçek maliyetini görür.
    doc: prog({ inserts: [{ primitive: 'effect.width', version: 1, params: { width: 0.5 } }] }, 2),
  },
  'prog-base-stereo': { doc: prog({}, 2) },
  // Treatment zincirinin düğümlerini tek tek ayıran senaryolar: küçümseyen
  // düğümü zincir toplamından ayırt etmek için.
  'prog-treatment-eq': {
    doc: {
      ...prog({}),
      treatment: {
        chain: [
          {
            primitive: 'effect.eq-pass',
            version: 1,
            params: { response: 'lowpass', frequency: 1800, order: 1 },
          },
        ],
        tailSeconds: 0.9,
        levelLu: -5,
      },
    },
  },
  'prog-treatment-reverb': {
    doc: {
      ...prog({}),
      treatment: {
        chain: [
          {
            primitive: 'effect.reverb',
            version: 1,
            params: { decay: 1, roomSize: 0.6, damp: 0.6, preDelay: 0.02, amount: 0.25 },
          },
        ],
        tailSeconds: 0.9,
        levelLu: -5,
      },
    },
  },
  'prog-treatment-occluded': {
    doc: {
      ...prog({}),
      treatment: {
        chain: [
          {
            primitive: 'effect.eq-pass',
            version: 1,
            params: { response: 'lowpass', frequency: 1800, order: 1 },
          },
          {
            primitive: 'effect.transient-shaper',
            version: 1,
            params: { attackDb: -6, sustainDb: 0 },
          },
          {
            primitive: 'effect.reverb',
            version: 1,
            params: { decay: 1, roomSize: 0.6, damp: 0.6, preDelay: 0.02, amount: 0.25 },
          },
        ],
        tailSeconds: 0.9,
        levelLu: -5,
      },
    },
  },
  'prog-addburst-wind': {
    doc: {
      schema: 'AcousticProgramV1',
      sampleRate: 48000,
      channels: 1,
      durationSeconds: 10,
      seed: 5,
      layers: [
        {
          name: 'wind',
          source: {
            primitive: 'source.wind',
            version: 2,
            params: { speed: 14, gustiness: 0.7, whistle: 0.5 },
          },
        },
      ],
      master: { normalize: 'peak', peakDbfs: -6 },
    },
  },
};

function runProgramOne(name: string): void {
  const doc = PROGRAM_SCENARIOS[name].doc;
  const estimate = estimateProgramCost(resolveProgram(doc));
  const start = performance.now();
  const result = renderProgram(doc);
  const renderMs = performance.now() - start;
  console.log(
    JSON.stringify({
      name,
      estimatePeakMiB: +(estimate.peakBytes / 1024 ** 2).toFixed(1),
      workUnits: estimate.workUnits,
      renderMs: Math.round(renderMs),
      nsPerUnit: +((renderMs * 1e6) / estimate.workUnits).toFixed(2),
      outputMiB: +((result.channels.length * result.channels[0].byteLength) / 1024 ** 2).toFixed(2),
    }),
  );
}

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

const ALL = { ...SCENARIOS, ...PROGRAM_SCENARIOS };
const only = process.argv[2];
if (only) {
  if (PROGRAM_SCENARIOS[only]) runProgramOne(only);
  else runOne(only);
} else {
  const self = fileURLToPath(import.meta.url);
  const timeTool = existsSync('/usr/bin/time') ? '/usr/bin/time' : undefined;
  for (const name of Object.keys(ALL)) {
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
