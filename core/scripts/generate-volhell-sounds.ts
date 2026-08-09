import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synth, normalize } from '../src/audio/synth/engine';
import { writeWav } from '../src/audio/synth/writer';
import { Instrument } from '../src/audio/music/instrument';
import type { SynthParams, SynthesisResult } from '../src/audio/synth/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDirArg = process.argv[2];
const filterArg = process.argv[3];

if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-volhell-sounds.ts <out-dir> [filter]');
  console.error('  filter: kategori (ui|player|combat) veya isim oneki (fire, enemy-hit, ...)');
  process.exit(1);
}

const outDir = resolve(outDirArg);

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
} else if (!filterArg) {
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.wav')) {
      rmSync(join(outDir, entry.name));
    } else if (entry.isDirectory()) {
      // Hedef alt dizinleri temizle.
      for (const file of readdirSync(join(outDir, entry.name))) {
        if (file.endsWith('.wav')) rmSync(join(outDir, entry.name, file));
      }
    }
  }
}

const SAMPLE_RATE = 32000;

type SoundCategory = 'ui' | 'player' | 'combat';

type SynthSpec = {
  name: string;
  category: SoundCategory;
  type: 'synth';
  params: SynthParams | SynthParams[];
};

type RenderSpec = {
  name: string;
  category: SoundCategory;
  type: 'render';
  render: () => SynthesisResult;
};

type SoundSpec = SynthSpec | RenderSpec;

const softBell = new Instrument({
  ...Instrument.fromPreset('cyberBell').params,
  sampleRate: SAMPLE_RATE,
  reverb: { amount: 0.25, decay: 1.4, roomSize: 0.6, damp: 0.45 },
  lowpass: { cutoff: 1800 },
  highpass: { cutoff: 180 },
  gain: 0.45,
}).params;

const softPluck = new Instrument({
  ...Instrument.fromPreset('cyberPizz').params,
  sampleRate: SAMPLE_RATE,
  envelope: {
    attack: 0.005,
    hold: 0.02,
    decay: 0.08,
    sustain: 0,
    release: 0.18,
    sustainLevel: 0.4,
    curve: 'cosine',
  },
  lowpass: { cutoff: 1200 },
  highpass: { cutoff: 90 },
  reverb: { amount: 0.14, decay: 0.9, roomSize: 0.55, damp: 0.55 },
  gain: 0.55,
}).params;

function addToBuffer(target: Float32Array, source: Float32Array, offset = 0): void {
  for (let i = 0; i < source.length && i + offset < target.length; i++) {
    target[i + offset] += source[i]!;
  }
}

/** Cam zil kumesi; carpisma/olum gibi olaylar icin. */
function glassCluster(
  notes: Array<{ freq: number; gain: number; offset: number; duration: number }>,
  reverbTail = 0.8,
): SynthesisResult {
  const sampleRate = SAMPLE_RATE;
  const totalDuration = Math.max(...notes.map((n) => n.offset + n.duration + reverbTail));
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const mixBuffer = new Float32Array(totalSamples);

  for (const note of notes) {
    const duration = note.duration + reverbTail;
    const params: SynthParams = { ...softBell, duration, frequency: note.freq, gain: note.gain };
    const result = synth(duration, params);
    const offsetSample = Math.floor(note.offset * sampleRate);
    addToBuffer(mixBuffer, result.channels[0]!, offsetSample);
  }

  return { channels: [normalize(mixBuffer, 0.95)], sampleRate, duration: totalDuration };
}

const specs: SoundSpec[] = [
  // UI — kisa, temiz, ayni oda reverb'li
  {
    name: 'menu-blip-0',
    category: 'ui',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.08,
      frequency: 587.33,
      gain: 0.35,
      reverb: { ...softBell.reverb, amount: 0.08 },
    },
  },
  {
    name: 'menu-blip-1',
    category: 'ui',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.09,
      frequency: 659.26,
      gain: 0.35,
      reverb: { ...softBell.reverb, amount: 0.08 },
    },
  },
  {
    name: 'confirm-0',
    category: 'ui',
    type: 'render',
    render: () =>
      glassCluster(
        [
          { freq: 293.66, gain: 0.35, offset: 0, duration: 0.5 },
          { freq: 369.99, gain: 0.35, offset: 0, duration: 0.5 },
          { freq: 440.0, gain: 0.35, offset: 0, duration: 0.5 },
        ],
        0.35,
      ),
  },
  {
    name: 'back-0',
    category: 'ui',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.16,
      frequency: 220.0,
      gain: 0.4,
      reverb: { ...softBell.reverb, amount: 0.08 },
    },
  },
  {
    name: 'pause-0',
    category: 'ui',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.35,
      frequency: 174.61,
      gain: 0.45,
      reverb: { ...softBell.reverb, amount: 0.12 },
    },
  },
  {
    name: 'resume-0',
    category: 'ui',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.25,
      frequency: 261.63,
      gain: 0.4,
      reverb: { ...softBell.reverb, amount: 0.1 },
    },
  },
  {
    name: 'restart-0',
    category: 'ui',
    type: 'render',
    render: () =>
      glassCluster(
        [
          { freq: 293.66, gain: 0.35, offset: 0, duration: 0.35 },
          { freq: 369.99, gain: 0.35, offset: 0.18, duration: 0.35 },
          { freq: 440.0, gain: 0.4, offset: 0.36, duration: 0.45 },
        ],
        0.35,
      ),
  },

  // Player — yumusak, cammsi, sert patlama yok
  {
    name: 'fire-0',
    category: 'player',
    type: 'synth',
    params: { ...softPluck, duration: 0.13, frequency: 392.0, slide: -30, gain: 0.55 },
  },
  {
    name: 'fire-1',
    category: 'player',
    type: 'synth',
    params: { ...softPluck, duration: 0.12, frequency: 440.0, slide: -35, gain: 0.52 },
  },
  {
    name: 'fire-2',
    category: 'player',
    type: 'synth',
    params: { ...softPluck, duration: 0.11, frequency: 349.23, slide: -25, gain: 0.5 },
  },
  {
    name: 'dash-0',
    category: 'player',
    type: 'synth',
    params: {
      duration: 0.5,
      sampleRate: SAMPLE_RATE,
      wave: ['sine', 'pink'],
      frequency: 220.0,
      slide: 120,
      gain: 0.55,
      envelope: {
        attack: 0.02,
        hold: 0.05,
        decay: 0.1,
        sustain: 0.1,
        release: 0.3,
        sustainLevel: 0.5,
        curve: 'cosine',
      },
      lowpass: { cutoff: 900 },
      highpass: { cutoff: 120 },
      reverb: { amount: 0.15, decay: 0.6, roomSize: 0.45, damp: 0.55 },
    },
  },
  {
    name: 'hurt-0',
    category: 'player',
    type: 'synth',
    params: {
      ...softPluck,
      duration: 0.25,
      frequency: 293.66,
      detune: 700,
      gain: 0.6,
      lowpass: { cutoff: 1800 },
      highpass: { cutoff: 150 },
    },
  },
  {
    name: 'hurt-1',
    category: 'player',
    type: 'synth',
    params: {
      ...softPluck,
      duration: 0.22,
      frequency: 329.63,
      detune: 700,
      gain: 0.58,
      lowpass: { cutoff: 1900 },
      highpass: { cutoff: 150 },
    },
  },
  {
    name: 'death-0',
    category: 'player',
    type: 'synth',
    params: {
      duration: 2.0,
      sampleRate: SAMPLE_RATE,
      wave: 'sine',
      frequency: 73.42,
      fm: {
        modulatorWave: 'sine',
        ratio: 2,
        index: 0.6,
        modulatorEnvelope: {
          attack: 0.05,
          decay: 0.8,
          sustain: 0,
          release: 1,
          sustainLevel: 0,
          curve: 'cosine',
        },
      },
      gain: 0.75,
      envelope: {
        attack: 0.05,
        hold: 0.2,
        decay: 0.8,
        sustain: 0.2,
        release: 1.5,
        sustainLevel: 0.4,
        curve: 'cosine',
      },
      lowpass: { cutoff: 500 },
      highpass: { cutoff: 40 },
      reverb: { amount: 0.22, decay: 1.6, roomSize: 0.55, damp: 0.5 },
    },
  },

  // Combat — kirlgan cam vuruslar
  {
    name: 'enemy-hit-0',
    category: 'combat',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.06,
      frequency: 587.33,
      gain: 0.55,
      highpass: { cutoff: 300 },
      reverb: { ...softBell.reverb, amount: 0.08 },
    },
  },
  {
    name: 'enemy-hit-1',
    category: 'combat',
    type: 'synth',
    params: {
      ...softBell,
      duration: 0.05,
      frequency: 659.26,
      gain: 0.52,
      highpass: { cutoff: 350 },
      reverb: { ...softBell.reverb, amount: 0.08 },
    },
  },
  {
    name: 'enemy-death-0',
    category: 'combat',
    type: 'render',
    render: () =>
      glassCluster([
        { freq: 587.33, gain: 0.6, offset: 0, duration: 0.45 },
        { freq: 440.0, gain: 0.45, offset: 0.25, duration: 0.45 },
        { freq: 349.23, gain: 0.35, offset: 0.5, duration: 0.45 },
      ]),
  },
  {
    name: 'enemy-death-1',
    category: 'combat',
    type: 'render',
    render: () =>
      glassCluster([
        { freq: 523.25, gain: 0.55, offset: 0, duration: 0.42 },
        { freq: 392.0, gain: 0.45, offset: 0.22, duration: 0.42 },
        { freq: 293.66, gain: 0.35, offset: 0.44, duration: 0.45 },
      ]),
  },
  {
    name: 'bullet-bounce-0',
    category: 'combat',
    type: 'synth',
    params: {
      ...softPluck,
      duration: 0.18,
      frequency: 392.0,
      slide: 60,
      gain: 0.5,
      lowpass: { cutoff: 1400 },
      highpass: { cutoff: 200 },
    },
  },
];

const filter = filterArg?.toLowerCase();

for (const spec of specs) {
  if (filter) {
    const nameMatch = spec.name.toLowerCase().startsWith(filter);
    const categoryMatch = spec.category.toLowerCase() === filter;
    if (!nameMatch && !categoryMatch) continue;
  }

  const categoryDir = join(outDir, spec.category);
  if (!existsSync(categoryDir)) mkdirSync(categoryDir, { recursive: true });

  let result: SynthesisResult;
  if (spec.type === 'render') {
    result = spec.render();
  } else {
    const paramList = Array.isArray(spec.params) ? spec.params : [spec.params];
    const buffers = paramList.map((p) => synth(p.duration, p).channels[0]!);
    const totalLen = Math.max(...buffers.map((b) => b.length));
    const mixed = new Float32Array(totalLen);
    for (const b of buffers) {
      for (let i = 0; i < b.length; i++) {
        mixed[i] += b[i]!;
      }
    }
    result = {
      channels: [normalize(mixed, 0.95)],
      sampleRate: SAMPLE_RATE,
      duration: totalLen / SAMPLE_RATE,
    };
  }

  const outPath = join(categoryDir, `${spec.name}.wav`);
  writeWav(outPath, result);
  console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}

if (filter) {
  console.log(`\nFiltered SFX (${filter}) written to ${outDir}`);
} else {
  console.log(`\nAll SFX written to ${outDir}`);
}
