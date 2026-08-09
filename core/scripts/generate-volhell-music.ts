import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synth, normalize } from '../src/audio/synth/engine';
import { writeWav } from '../src/audio/synth/writer';
import { Instrument } from '../src/audio/music/instrument';
import type { MelodicPhrase, MelodicNote } from '../src/audio/music/instrument';
import type { SynthesisResult, SynthParams } from '../src/audio/synth/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDirArg = process.argv[2];
const filterArg = process.argv[3];

if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-volhell-music.ts <out-dir> [filter]');
  console.error('  filter: stem ismi oneki (main-menu, combat-bells, ...)');
  process.exit(1);
}

const outDir = resolve(outDirArg);

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
} else if (!filterArg) {
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.wav')) {
      rmSync(join(outDir, entry.name));
    }
  }
}

const SAMPLE_RATE = 32000;
const BPM = 50;
const BEAT = 60 / BPM;
const COMBAT_BPM = 58;
const COMBAT_BEAT = 60 / COMBAT_BPM;
const MASTER_TAIL = 4; // uzun reverb taili loop noktasina dahil

function resolveTime(value: number, bpm = BPM): number {
  return (value * 60) / bpm;
}

function toResult(
  buffer: Float32Array,
  duration: number,
  sampleRate = SAMPLE_RATE,
): SynthesisResult {
  return { channels: [buffer], sampleRate, duration };
}

function addToBuffer(target: Float32Array, source: Float32Array, offset = 0): void {
  for (let i = 0; i < source.length && i + offset < target.length; i++) {
    target[i + offset] += source[i]!;
  }
}

function emptyBuffer(duration: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.floor(duration * sampleRate));
}

function renderPhraseToBuffer(instrument: Instrument, phrase: MelodicPhrase): SynthesisResult {
  const sampleRate = instrument.params.sampleRate ?? SAMPLE_RATE;
  const reverbTail = (instrument.params.reverb?.decay ?? 0) + 0.15;
  const notes = phrase.notes;
  const totalDuration = Math.max(
    ...notes.map((n) => resolveTime(n.beat + n.duration, phrase.bpm) + reverbTail),
  );
  const target = emptyBuffer(totalDuration, sampleRate);

  const env = instrument.params.envelope;
  const attack = env?.attack ?? 0;
  const hold = env?.hold ?? 0;
  const decay = env?.decay ?? 0;
  const release = env?.release ?? 0;

  for (const n of notes) {
    const noteDuration = resolveTime(n.duration, phrase.bpm);
    const start = resolveTime(n.beat, phrase.bpm);
    const baseGain = instrument.params.gain ?? 1;
    const noteGain = (n.gain ?? 1) * baseGain;
    const sustain = Math.max(0, noteDuration - (attack + hold + decay + release));
    const synthDuration = noteDuration + reverbTail;

    const params: SynthParams = {
      ...instrument.params,
      sampleRate,
      frequency: n.freq ?? 220,
      duration: synthDuration,
      envelope: { ...env, sustain, release },
      gain: noteGain,
    };

    const result = synth(synthDuration, params);
    const startSample = Math.floor(start * sampleRate);
    addToBuffer(target, result.channels[0]!, startSample);
  }

  return toResult(normalize(target, 0.95), totalDuration, sampleRate);
}

// --- Obsidian Silence palette ---

const ROOT_D2 = 73.42;
const ROOT_A2 = 110.0;
const ROOT_D3 = 146.83;
const ROOT_F3 = 174.61;
const ROOT_A3 = 220.0;
const ROOT_D4 = 293.66;
const ROOT_F4 = 349.23;
const ROOT_A4 = 440.0;

function coldDrone(freq: number, duration: number, gain = 0.35): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: ['sine', 'sine'],
    frequency: freq,
    detune: 7,
    envelope: {
      attack: 4,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 8),
      release: 4,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 240 },
    highpass: { cutoff: 40 },
    chorus: { depth: 2.5, rate: 0.04, mix: 0.25 },
    reverb: { amount: 0.22, decay: 1.6, roomSize: 0.6, damp: 0.5 },
    gain,
  });
}

function coldWind(duration: number, gain = 0.12): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'pink',
    envelope: {
      attack: 5,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 10),
      release: 5,
      sustainLevel: 0.35,
      curve: 'cosine',
    },
    lowpass: { cutoff: 220 },
    highpass: { cutoff: 90 },
    gain,
  });
}

function softGlassBell(): Instrument {
  return new Instrument({
    ...Instrument.fromPreset('cyberBell').params,
    sampleRate: SAMPLE_RATE,
    reverb: { amount: 0.28, decay: 1.8, roomSize: 0.65, damp: 0.45 },
    lowpass: { cutoff: 1800 },
    gain: 0.42,
  });
}

function softPulse(): Instrument {
  return new Instrument({
    ...Instrument.fromPreset('cyberPizz').params,
    sampleRate: SAMPLE_RATE,
    envelope: {
      attack: 0.02,
      hold: 0.05,
      decay: 0.15,
      sustain: 0.1,
      release: 1.2,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 260 },
    highpass: { cutoff: 50 },
    reverb: { amount: 0.18, decay: 1.2, roomSize: 0.55, damp: 0.55 },
    gain: 0.55,
  });
}

function mainMenuPad(duration: number): SynthesisResult {
  // Dmadd9-ish long chord, very slow attack
  const sampleRate = SAMPLE_RATE;
  const target = emptyBuffer(duration, sampleRate);

  const freqs = [ROOT_D2, ROOT_A2, ROOT_D3, ROOT_F3, ROOT_A3, ROOT_D4];
  for (const f of freqs) {
    const partial = coldDrone(f, duration, 0.18);
    addToBuffer(target, partial.channels[0]!, 0);
  }
  return toResult(normalize(target, 0.95), duration, sampleRate);
}

// --- Main menu (one slow evolving piece) ---

function renderMainMenu(): SynthesisResult {
  const loopBeats = 64;
  const fileDuration = resolveTime(loopBeats, BPM) + MASTER_TAIL;
  const master = emptyBuffer(fileDuration);

  const pad = mainMenuPad(fileDuration);
  addToBuffer(master, pad.channels[0]!, 0);

  const drone = coldDrone(ROOT_D2, fileDuration, 0.28);
  addToBuffer(master, drone.channels[0]!, 0);

  const wind = coldWind(fileDuration, 0.09);
  addToBuffer(master, wind.channels[0]!, 0);

  const pulse = renderPhraseToBuffer(softPulse(), {
    bpm: BPM,
    notes: [
      { beat: 0, duration: 2, freq: ROOT_D2 },
      { beat: 16, duration: 2, freq: ROOT_A2 },
      { beat: 32, duration: 2, freq: ROOT_D2 },
      { beat: 48, duration: 2, freq: ROOT_F3 * 0.5 },
    ],
  });
  addToBuffer(master, pulse.channels[0]!, 0);

  const bell = softGlassBell();
  const bells = renderPhraseToBuffer(bell, {
    bpm: BPM,
    notes: [
      { beat: 4, duration: 3, freq: ROOT_D4 },
      { beat: 12, duration: 3, freq: ROOT_A4 },
      { beat: 20, duration: 3, freq: ROOT_F4 },
      { beat: 28, duration: 3, freq: ROOT_A4 },
      { beat: 36, duration: 3, freq: ROOT_D4 },
      { beat: 44, duration: 3, freq: ROOT_F4 },
      { beat: 52, duration: 3, freq: ROOT_A4 },
      { beat: 60, duration: 3, freq: ROOT_D4 },
    ],
  });
  addToBuffer(master, bells.channels[0]!, 0);

  return toResult(normalize(master, 0.95), fileDuration);
}

// --- Gameplay ambience ---

function renderGameplayAmbience(): SynthesisResult {
  const loopBeats = 32;
  const fileDuration = resolveTime(loopBeats, BPM) + MASTER_TAIL;
  const master = emptyBuffer(fileDuration);

  const drone = coldDrone(ROOT_D2, fileDuration, 0.35);
  addToBuffer(master, drone.channels[0]!, 0);

  const drone2 = coldDrone(ROOT_A2, fileDuration, 0.25);
  addToBuffer(master, drone2.channels[0]!, 0);

  const wind = coldWind(fileDuration, 0.12);
  addToBuffer(master, wind.channels[0]!, 0);

  const bell = softGlassBell();
  const bells = renderPhraseToBuffer(bell, {
    bpm: BPM,
    notes: [
      { beat: 0, duration: 4, freq: ROOT_D4, gain: 0.5 },
      { beat: 16, duration: 4, freq: ROOT_A4, gain: 0.5 },
    ],
  });
  addToBuffer(master, bells.channels[0]!, 0);

  return toResult(normalize(master, 0.95), fileDuration);
}

// --- Death screen ---

function renderDeath(): SynthesisResult {
  const loopBeats = 40;
  const fileDuration = resolveTime(loopBeats, BPM) + MASTER_TAIL;
  const master = emptyBuffer(fileDuration);

  const drone = coldDrone(ROOT_D2, fileDuration, 0.35);
  addToBuffer(master, drone.channels[0]!, 0);

  const drone2 = coldDrone(ROOT_A2, fileDuration, 0.25);
  addToBuffer(master, drone2.channels[0]!, 0);

  const wind = coldWind(fileDuration, 0.14);
  addToBuffer(master, wind.channels[0]!, 0);

  const bell = softGlassBell();
  const lead = renderPhraseToBuffer(bell, {
    bpm: BPM,
    notes: [
      { beat: 4, duration: 5, freq: ROOT_A3 },
      { beat: 12, duration: 5, freq: ROOT_F3 },
      { beat: 20, duration: 5, freq: ROOT_D3 },
      { beat: 28, duration: 6, freq: ROOT_A2 * 2 },
    ],
  });
  addToBuffer(master, lead.channels[0]!, 0);

  return toResult(normalize(master, 0.95), fileDuration);
}

// --- Combat (vertical adaptive stems) ---

const combatLoopBeats = 24;
const combatFileDuration = resolveTime(combatLoopBeats, COMBAT_BPM) + MASTER_TAIL;

function renderCombatDrone(): SynthesisResult {
  const master = emptyBuffer(combatFileDuration);
  const drone = coldDrone(ROOT_D2, combatFileDuration, 0.45);
  const drone2 = coldDrone(ROOT_A2, combatFileDuration, 0.25);
  addToBuffer(master, drone.channels[0]!, 0);
  addToBuffer(master, drone2.channels[0]!, 0);
  return toResult(normalize(master, 0.95), combatFileDuration);
}

function renderCombatPulse(): SynthesisResult {
  const master = emptyBuffer(combatFileDuration);
  const pulse = renderPhraseToBuffer(softPulse(), {
    bpm: COMBAT_BPM,
    notes: [
      { beat: 0, duration: 1, freq: ROOT_D2 },
      { beat: 4, duration: 1, freq: ROOT_D2 },
      { beat: 8, duration: 1, freq: ROOT_A2 },
      { beat: 12, duration: 1, freq: ROOT_D2 },
      { beat: 16, duration: 1, freq: ROOT_D2 },
      { beat: 20, duration: 1, freq: ROOT_A2 },
    ],
  });
  addToBuffer(master, pulse.channels[0]!, 0);
  return toResult(normalize(master, 0.95), combatFileDuration);
}

function renderCombatBells(): SynthesisResult {
  const bell = softGlassBell();
  const notes: MelodicNote[] = [
    { beat: 0, duration: 2, freq: ROOT_D4 },
    { beat: 3, duration: 2, freq: ROOT_F4 },
    { beat: 6, duration: 2, freq: ROOT_A4 },
    { beat: 10, duration: 2, freq: ROOT_D4 },
    { beat: 12, duration: 2, freq: ROOT_F4 },
    { beat: 15, duration: 2, freq: ROOT_A4 },
    { beat: 18, duration: 2, freq: ROOT_D4 },
    { beat: 21, duration: 2, freq: ROOT_F4 },
  ];
  return renderPhraseToBuffer(bell, { bpm: COMBAT_BPM, notes });
}

// --- Yazim ---

interface MusicSpec {
  name: string;
  category: 'main-menu' | 'death' | 'gameplay' | 'combat';
  render: () => SynthesisResult;
}

const specs: MusicSpec[] = [
  { name: 'main-menu', category: 'main-menu', render: renderMainMenu },
  { name: 'death', category: 'death', render: renderDeath },
  { name: 'ambience', category: 'gameplay', render: renderGameplayAmbience },
  { name: 'drone', category: 'combat', render: renderCombatDrone },
  { name: 'pulse', category: 'combat', render: renderCombatPulse },
  { name: 'bells', category: 'combat', render: renderCombatBells },
];

const filter = filterArg?.toLowerCase();

for (const spec of specs) {
  if (
    filter &&
    !spec.name.toLowerCase().startsWith(filter) &&
    !spec.category.toLowerCase().startsWith(filter)
  )
    continue;

  const categoryDir = join(outDir, spec.category);
  if (!existsSync(categoryDir)) mkdirSync(categoryDir, { recursive: true });

  // Eski temaya ait parcalari temizle.
  const oldStemsByCategory: Record<string, string[]> = {
    'main-menu': ['adrift.wav', 'orbit.wav', 'signal.wav'],
    death: ['last-breath.wav', 'drift-away.wav'],
    combat: ['bass.wav', 'arp.wav', 'drone.wav', 'lead.wav', 'tension.wav', 'surge.wav'],
  };
  for (const old of oldStemsByCategory[spec.category] ?? []) {
    const oldPath = join(categoryDir, old);
    if (existsSync(oldPath)) rmSync(oldPath);
  }

  const result = spec.render();
  const outPath = join(categoryDir, `${spec.name}.wav`);
  writeWav(outPath, result);
  console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}

if (filter) {
  console.log(`\nFiltered music stems (${filter}) written to ${outDir}`);
} else {
  console.log(`\nAll music stems written to ${outDir}`);
}
