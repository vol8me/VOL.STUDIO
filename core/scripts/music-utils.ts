/**
 * Müzik üretim script'leri için ortak altyapı.
 * Stereo buffer yönetimi, cosine fade, master mix, akor yardımcıları, CLI.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SynthesisResult } from '../src/audio/synth/types';
import { writeWav, writeOgg } from '../src/audio/synth/writer';

export const SAMPLE_RATE = 44100;

// --- Akor oranları ---

export const MINOR_3 = 1.1892;
export const MAJOR_3 = 1.2599;
export const FIFTH = 1.4983;

// --- Ortak tipler ---

export interface ChordDef {
  root: number;
  type: 'minor' | 'major';
}

export interface MelodyNote {
  freq: number;
  beats: number;
  velocity?: number;
}

export interface ArpNote {
  freq: number;
  velocity: number;
}

// --- Stereo buffer ---

export function emptyBuffer(duration: number): Float32Array {
  return new Float32Array(Math.floor(duration * SAMPLE_RATE));
}

export function toStereo(
  left: Float32Array,
  right: Float32Array,
  duration: number,
): SynthesisResult {
  return { channels: [left, right], sampleRate: SAMPLE_RATE, duration };
}

export function addToStereo(
  targetL: Float32Array,
  targetR: Float32Array,
  source: SynthesisResult,
  offset = 0,
): void {
  const srcL = source.channels[0]!;
  const srcR = source.channels[1] ?? srcL;
  for (let i = 0; i < srcL.length && i + offset < targetL.length; i++) {
    targetL[i + offset] += srcL[i]!;
    targetR[i + offset] += srcR[i]!;
  }
}

// --- Akor yardımcıları ---

/** Verilen beat'te çalan akoru döndürür — 8 beat başına akor. */
export function chordAtBeat(chords: ChordDef[], beat: number): ChordDef {
  return chords[Math.floor(beat / 8) % chords.length]!;
}

// --- Beat-süre bağımlı yardımcılar ---
// Her script farklı BPM kullandığı için beatDuration parametre ile gelir.

export function createBeatUtils(beatDuration: number) {
  const beatToSample = (beat: number): number => Math.floor(beat * beatDuration * SAMPLE_RATE);

  /** Cosine fade in/out — pürüzsüz, tıkı yok. */
  const applyFades = (
    left: Float32Array,
    right: Float32Array,
    fadeInStartBeat: number,
    fadeInEndBeat: number,
    fadeOutStartBeat: number,
    fadeOutEndBeat: number,
  ): void => {
    const fiS = fadeInStartBeat * beatDuration * SAMPLE_RATE;
    const fiE = fadeInEndBeat * beatDuration * SAMPLE_RATE;
    const foS = fadeOutStartBeat * beatDuration * SAMPLE_RATE;
    const foE = fadeOutEndBeat * beatDuration * SAMPLE_RATE;

    for (let i = 0; i < left.length; i++) {
      let gain: number;
      if (i < fiS) {
        gain = 0;
      } else if (i < fiE) {
        const t = (i - fiS) / (fiE - fiS);
        gain = 0.5 - 0.5 * Math.cos(Math.PI * t);
      } else if (i < foS) {
        gain = 1;
      } else if (i < foE) {
        const t = (i - foS) / (foE - foS);
        gain = 0.5 + 0.5 * Math.cos(Math.PI * t);
      } else {
        gain = 0;
      }
      left[i] *= gain;
      right[i] *= gain;
    }
  };

  return { beatToSample, applyFades };
}

// --- CLI ---
// Tek-track menü müziği script'leri (generate-iron-vein/black-tide/
// crimson-horizon) aynı `<out.wav> <out.ogg>` argüman/klasör/yazım bloğunu
// tekrarlıyordu — tek kaynağa taşındı.

/** `<out.wav> <out.ogg>` argümanlarını okur, doğrular, klasörlerini oluşturur. */
export function parseWavOggArgs(scriptName: string): { wavPath: string; oggPath: string } {
  const wavArg = process.argv[2];
  const oggArg = process.argv[3];
  if (!wavArg || !oggArg) {
    console.error(`Kullanim: tsx scripts/${scriptName} <out.wav> <out.ogg>`);
    process.exit(1);
  }
  const wavPath = resolve(wavArg);
  const oggPath = resolve(oggArg);
  if (!existsSync(dirname(wavPath))) mkdirSync(dirname(wavPath), { recursive: true });
  if (!existsSync(dirname(oggPath))) mkdirSync(dirname(oggPath), { recursive: true });
  return { wavPath, oggPath };
}

/** WAV (source-of-truth) + OGG (shipped) çiftini yazar ve sonucu loglar. */
export function writeMenuTrack(wavPath: string, oggPath: string, result: SynthesisResult): void {
  writeWav(wavPath, result, 1.0);
  writeOgg(oggPath, result);
  console.log(
    `Generated: ${wavPath} + ${oggPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`,
  );
}

// --- Master mix ---

/** Normalize + soft clip — temiz, distorsiyonsuz peak kontrolü. */
export function masterMix(left: Float32Array, right: Float32Array): [Float32Array, Float32Array] {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak === 0) return [left, right];
  const scale = 0.95 / peak;
  const outL = new Float32Array(left.length);
  const outR = new Float32Array(right.length);
  for (let i = 0; i < left.length; i++) {
    const l = left[i]! * scale;
    const r = right[i]! * scale;
    outL[i] = Math.max(-0.99, Math.min(0.99, (l / (1 + 0.1 * Math.abs(l))) * 1.1));
    outR[i] = Math.max(-0.99, Math.min(0.99, (r / (1 + 0.1 * Math.abs(r))) * 1.1));
  }
  return [outL, outR];
}
