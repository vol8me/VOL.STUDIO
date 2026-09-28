import type { SoundEvent } from '../../src/config/sounds';

type RetroWave =
  | 'pulse'
  | 'triangle'
  | 'triangle-4bit'
  | 'sawtooth'
  | 'noise-long'
  | 'noise-short'
  | 'table-hollow'
  | 'table-organ'
  | 'table-soft-bell';
type PresetInstrument = 'brightLead' | 'crystalBell' | 'electricPiano2' | 'subBass';
type DrumModel = 'kick' | 'tom' | 'snare' | 'clap' | 'hat' | 'cymbal' | 'perc';

interface RetroLayer {
  readonly kind: 'retro';
  readonly wave: RetroWave;
  readonly hz: number;
  /** Tanımlıysa katman kendi başlangıcına göre üstel perde kayması yapar. */
  readonly to?: number;
  readonly duty?: number;
  readonly arp?: string;
  readonly arpRate?: number;
  readonly bits?: number;
  readonly hold?: number;
  readonly seconds: number;
  readonly attack?: number;
  readonly gainDb?: number;
  readonly start?: number;
}

interface PresetLayer {
  readonly kind: 'preset';
  readonly instrument: PresetInstrument;
  readonly hz: number;
  readonly seconds: number;
  readonly velocity?: number;
  readonly struck?: boolean;
  readonly gainDb?: number;
  readonly start?: number;
}

interface DrumLayer {
  readonly kind: 'drum';
  readonly model: DrumModel;
  readonly velocity?: number;
  readonly tune?: number;
  readonly decay?: number;
  readonly tone?: number;
  readonly attack?: number;
  readonly gainDb?: number;
  readonly start?: number;
}

interface NoiseLayer {
  readonly kind: 'noise';
  readonly color: 'white' | 'pink' | 'brown';
  readonly seconds: number;
  readonly attack?: number;
  readonly gainDb?: number;
  readonly start?: number;
}

export type Layer = RetroLayer | PresetLayer | DrumLayer | NoiseLayer;

export interface SfxSpec {
  readonly layers: readonly Layer[];
  /** Program süresi; verilmezse en uzun katmanın süresi + kuyruk. */
  readonly duration?: number;
  readonly peakDbfs?: number;
  /** Varyant başına perde çarpanı; varyantlı olaylarda zorunludur. */
  readonly scales?: readonly number[];
}

const VARIANT_TWO = [1, 1.19] as const;
const VARIANT_THREE = [1, 0.84, 1.26] as const;

/** Olay başına arcade tasarımı; varyantlar `scales` ile perdelenir. */
export const SPECS: Record<SoundEvent, SfxSpec> = {
  // ————— UI —————
  menuBlip: {
    scales: VARIANT_TWO,
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1174.66,
        duty: 0.125,
        arp: 'coin',
        arpRate: 14,
        seconds: 0.09,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1567.98,
        seconds: 0.16,
        velocity: 0.5,
        struck: true,
        gainDb: -9,
      },
    ],
    duration: 0.18,
    peakDbfs: -3,
  },
  back: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 783.99,
        to: 392,
        duty: 0.25,
        seconds: 0.17,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'drum', model: 'perc', velocity: 0.4, tone: 0.6, decay: 0.12, gainDb: -15 },
    ],
    duration: 0.3,
    peakDbfs: -3,
  },
  pause: {
    layers: [
      { kind: 'retro', wave: 'triangle', hz: 220, seconds: 0.32, attack: 0.002, gainDb: -3 },
      {
        kind: 'drum',
        model: 'perc',
        velocity: 0.35,
        tune: -5,
        tone: 0.35,
        decay: 0.2,
        gainDb: -13,
      },
    ],
    duration: 0.45,
    peakDbfs: -3,
  },
  resume: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 523.25,
        to: 783.99,
        duty: 0.25,
        arp: 'fifth',
        arpRate: 12,
        seconds: 0.22,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1318.51,
        seconds: 0.2,
        velocity: 0.45,
        struck: true,
        gainDb: -10,
      },
    ],
    duration: 0.4,
    peakDbfs: -3,
  },
  restart: {
    layers: [
      {
        kind: 'retro',
        wave: 'sawtooth',
        hz: 196,
        to: 587.33,
        duty: 0.5,
        seconds: 0.36,
        attack: 0.002,
        gainDb: -3,
      },
      { kind: 'drum', model: 'snare', velocity: 0.5, tone: 0.55, decay: 0.2, gainDb: -10 },
    ],
    duration: 0.52,
    peakDbfs: -3,
  },
  deny: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 146.83,
        duty: 0.5,
        seconds: 0.24,
        attack: 0.002,
        gainDb: -2,
      },
      { kind: 'noise', color: 'white', seconds: 0.12, gainDb: -14 },
    ],
    duration: 0.36,
    peakDbfs: -3,
  },
  cardPick: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 987.77,
        duty: 0.25,
        arp: 'coin',
        arpRate: 16,
        seconds: 0.18,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1318.51,
        seconds: 0.24,
        velocity: 0.5,
        struck: true,
        gainDb: -8,
      },
    ],
    duration: 0.4,
    peakDbfs: -3,
  },
  cardBuy: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 783.99,
        duty: 0.25,
        arp: 'major',
        arpRate: 12,
        seconds: 0.3,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1567.98,
        seconds: 0.3,
        velocity: 0.55,
        struck: true,
        gainDb: -9,
      },
    ],
    duration: 0.55,
    peakDbfs: -3,
  },
  reroll: {
    layers: [
      {
        kind: 'retro',
        wave: 'noise-long',
        hz: 1800,
        bits: 8,
        hold: 12000,
        seconds: 0.16,
        attack: 0.001,
        gainDb: -4,
      },
      {
        kind: 'preset',
        instrument: 'electricPiano2',
        hz: 1046.5,
        seconds: 0.18,
        velocity: 0.5,
        struck: true,
        gainDb: -9,
      },
    ],
    duration: 0.32,
    peakDbfs: -3,
  },
  lock: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1318.51,
        duty: 0.125,
        seconds: 0.07,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'drum', model: 'snare', velocity: 0.3, tune: 7, tone: 0.7, decay: 0.1, gainDb: -13 },
    ],
    duration: 0.2,
    peakDbfs: -1.5,
  },

  // ————— PLAYER —————
  fire: {
    scales: VARIANT_THREE,
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1400,
        to: 300,
        duty: 0.25,
        seconds: 0.12,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'noise', color: 'white', seconds: 0.06, gainDb: -17 },
    ],
    duration: 0.16,
    peakDbfs: -3,
  },
  dash: {
    layers: [
      {
        kind: 'retro',
        wave: 'noise-long',
        hz: 400,
        to: 2400,
        bits: 10,
        hold: 16000,
        seconds: 0.22,
        attack: 0.001,
        gainDb: -4,
      },
      {
        kind: 'retro',
        wave: 'triangle',
        hz: 330,
        to: 660,
        seconds: 0.24,
        attack: 0.002,
        gainDb: -6,
      },
    ],
    duration: 0.4,
    peakDbfs: -3,
  },
  hurt: {
    scales: VARIANT_TWO,
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 330,
        to: 147,
        duty: 0.5,
        seconds: 0.3,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'drum', model: 'perc', velocity: 0.6, tune: -7, tone: 0.3, decay: 0.25, gainDb: -9 },
      {
        kind: 'preset',
        instrument: 'subBass',
        hz: 82.41,
        seconds: 0.22,
        velocity: 0.6,
        gainDb: -10,
      },
    ],
    duration: 0.45,
    peakDbfs: -3,
  },
  death: {
    layers: [
      {
        kind: 'retro',
        wave: 'sawtooth',
        hz: 440,
        to: 55,
        duty: 0.5,
        seconds: 1.1,
        attack: 0.003,
        gainDb: -3,
      },
      { kind: 'noise', color: 'brown', seconds: 0.7, gainDb: -11 },
      { kind: 'preset', instrument: 'subBass', hz: 55, seconds: 1, velocity: 0.7, gainDb: -7 },
    ],
    duration: 1.35,
    peakDbfs: -3,
  },
  fluxPickup: {
    scales: VARIANT_TWO,
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1046.5,
        duty: 0.25,
        arp: 'octave',
        arpRate: 18,
        seconds: 0.14,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1567.98,
        seconds: 0.2,
        velocity: 0.5,
        struck: true,
        gainDb: -11,
      },
    ],
    duration: 0.32,
    peakDbfs: -3,
  },

  // ————— COMBAT —————
  enemyHit: {
    scales: VARIANT_TWO,
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 659.25,
        to: 440,
        duty: 0.125,
        seconds: 0.09,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'drum', model: 'perc', velocity: 0.5, tone: 0.65, decay: 0.1, gainDb: -11 },
    ],
    duration: 0.16,
    peakDbfs: -3,
  },
  enemyDeath: {
    scales: VARIANT_TWO,
    layers: [
      {
        kind: 'retro',
        wave: 'noise-long',
        hz: 900,
        to: 220,
        bits: 6,
        seconds: 0.42,
        attack: 0.001,
        gainDb: -3,
      },
      {
        kind: 'retro',
        wave: 'triangle',
        hz: 220,
        to: 82.41,
        seconds: 0.5,
        attack: 0.002,
        gainDb: -4,
      },
      { kind: 'drum', model: 'kick', velocity: 0.7, tune: -3, decay: 0.35, tone: 0.35, gainDb: -6 },
    ],
    duration: 0.6,
    peakDbfs: -3,
  },
  bulletBounce: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1760,
        duty: 0.125,
        seconds: 0.05,
        attack: 0.001,
        gainDb: -2,
      },
      { kind: 'noise', color: 'white', seconds: 0.04, gainDb: -16 },
    ],
    duration: 0.14,
    peakDbfs: -3,
  },
  eliteSpawn: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 261.63,
        to: 523.25,
        duty: 0.25,
        arp: 'minor',
        arpRate: 10,
        seconds: 0.9,
        attack: 0.003,
        gainDb: -3,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 523.25,
        seconds: 0.8,
        velocity: 0.6,
        struck: true,
        gainDb: -8,
      },
      { kind: 'noise', color: 'pink', seconds: 0.6, gainDb: -15 },
    ],
    duration: 1.1,
    peakDbfs: -3,
  },
  bossSpawn: {
    layers: [
      {
        kind: 'retro',
        wave: 'sawtooth',
        hz: 98,
        to: 65.41,
        duty: 0.5,
        seconds: 1.5,
        attack: 0.005,
        gainDb: -3,
      },
      { kind: 'noise', color: 'brown', seconds: 1.1, gainDb: -10 },
      {
        kind: 'preset',
        instrument: 'subBass',
        hz: 43.65,
        seconds: 1.4,
        velocity: 0.75,
        gainDb: -6,
      },
      { kind: 'drum', model: 'cymbal', velocity: 0.6, tone: 0.4, decay: 0.9, gainDb: -12 },
    ],
    duration: 1.7,
    peakDbfs: -3.5,
  },
  bossEnrage: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 196,
        to: 130.81,
        duty: 0.5,
        arp: 'power',
        arpRate: 22,
        seconds: 1.1,
        attack: 0.003,
        gainDb: -3,
      },
      { kind: 'noise', color: 'white', seconds: 0.8, gainDb: -12 },
      {
        kind: 'preset',
        instrument: 'brightLead',
        hz: 392,
        seconds: 0.9,
        velocity: 0.65,
        gainDb: -8,
      },
    ],
    duration: 1.3,
    peakDbfs: -3.5,
  },
  bossDown: {
    layers: [
      {
        kind: 'retro',
        wave: 'sawtooth',
        hz: 233.08,
        to: 41.2,
        duty: 0.5,
        seconds: 1.5,
        attack: 0.004,
        gainDb: -3,
      },
      { kind: 'noise', color: 'brown', seconds: 1.2, gainDb: -9 },
      { kind: 'preset', instrument: 'subBass', hz: 41.2, seconds: 1.5, velocity: 0.8, gainDb: -5 },
      { kind: 'drum', model: 'kick', velocity: 0.9, tune: -5, decay: 0.8, tone: 0.3, gainDb: -4 },
    ],
    duration: 1.7,
    peakDbfs: -3.5,
  },
  telegraph: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 987.77,
        duty: 0.125,
        seconds: 0.12,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1318.51,
        duty: 0.125,
        seconds: 0.1,
        attack: 0.001,
        gainDb: -4,
        start: 0.16,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1975.53,
        seconds: 0.3,
        velocity: 0.4,
        struck: true,
        gainDb: -13,
      },
    ],
    duration: 0.45,
    peakDbfs: -3,
  },

  // ————— ABILITY —————
  chainLightning: {
    layers: [
      {
        kind: 'retro',
        wave: 'noise-short',
        hz: 2400,
        bits: 6,
        hold: 20000,
        seconds: 0.3,
        attack: 0.001,
        gainDb: -3,
      },
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1046.5,
        to: 2093,
        duty: 0.125,
        arp: 'power',
        arpRate: 24,
        seconds: 0.4,
        attack: 0.001,
        gainDb: -4,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1760,
        seconds: 0.35,
        velocity: 0.5,
        struck: true,
        gainDb: -12,
      },
    ],
    duration: 0.55,
    peakDbfs: -3,
  },
  fireZone: {
    layers: [
      {
        kind: 'retro',
        wave: 'noise-long',
        hz: 500,
        bits: 7,
        hold: 9000,
        seconds: 0.6,
        attack: 0.004,
        gainDb: -3,
      },
      { kind: 'noise', color: 'brown', seconds: 0.55, gainDb: -9 },
      { kind: 'preset', instrument: 'subBass', hz: 65.41, seconds: 0.4, velocity: 0.6, gainDb: -8 },
    ],
    duration: 0.7,
    peakDbfs: -3.5,
  },
  multiShot: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 987.77,
        to: 329.63,
        duty: 0.25,
        arp: 'major',
        arpRate: 20,
        seconds: 0.24,
        attack: 0.001,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'brightLead',
        hz: 659.25,
        seconds: 0.22,
        velocity: 0.55,
        gainDb: -9,
      },
    ],
    duration: 0.34,
    peakDbfs: -3,
  },
  turretDeploy: {
    layers: [
      { kind: 'drum', model: 'perc', velocity: 0.6, tune: -2, tone: 0.5, decay: 0.25, gainDb: -6 },
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 293.66,
        to: 440,
        duty: 0.5,
        seconds: 0.35,
        attack: 0.002,
        gainDb: -4,
      },
      {
        kind: 'preset',
        instrument: 'electricPiano2',
        hz: 587.33,
        seconds: 0.3,
        velocity: 0.5,
        struck: true,
        gainDb: -10,
      },
    ],
    duration: 0.55,
    peakDbfs: -3,
  },
  turretFire: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 1200,
        to: 500,
        duty: 0.125,
        bits: 10,
        seconds: 0.08,
        attack: 0.001,
        gainDb: -3,
      },
      {
        kind: 'preset',
        instrument: 'brightLead',
        hz: 880,
        seconds: 0.08,
        velocity: 0.45,
        struck: true,
        gainDb: -12,
      },
    ],
    duration: 0.14,
    peakDbfs: -3,
  },

  // ————— PROGRESS —————
  waveStart: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 392,
        to: 783.99,
        duty: 0.25,
        arp: 'major',
        arpRate: 12,
        seconds: 0.7,
        attack: 0.002,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1046.5,
        seconds: 0.6,
        velocity: 0.55,
        struck: true,
        gainDb: -9,
      },
    ],
    duration: 0.85,
    peakDbfs: -3,
  },
  waveClear: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 523.25,
        duty: 0.125,
        arp: 'major',
        arpRate: 14,
        seconds: 0.9,
        attack: 0.002,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1567.98,
        seconds: 0.8,
        velocity: 0.6,
        struck: true,
        gainDb: -8,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1864.66,
        seconds: 0.7,
        velocity: 0.45,
        struck: true,
        gainDb: -12,
        start: 0.14,
      },
    ],
    duration: 1.15,
    peakDbfs: -3,
  },
  levelUp: {
    layers: [
      {
        kind: 'retro',
        wave: 'pulse',
        hz: 659.25,
        to: 1318.51,
        duty: 0.125,
        arp: 'coin',
        arpRate: 18,
        seconds: 0.8,
        attack: 0.002,
        gainDb: -2,
      },
      {
        kind: 'preset',
        instrument: 'crystalBell',
        hz: 1760,
        seconds: 0.8,
        velocity: 0.6,
        struck: true,
        gainDb: -8,
      },
      {
        kind: 'preset',
        instrument: 'electricPiano2',
        hz: 880,
        seconds: 0.6,
        velocity: 0.45,
        gainDb: -12,
        start: 0.1,
      },
    ],
    duration: 1.05,
    peakDbfs: -3,
  },
};
