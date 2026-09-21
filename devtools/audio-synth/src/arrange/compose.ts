import { applyGlobalEffects, synth } from '../engine';
import { estimateDelayTail, Reverb } from '../effects';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkSampleRate } from '../guard/read';
import { BUS_EFFECT_KEYS, DEFAULT_SAMPLE_RATE, resolveBusParams } from '../guard/synth';
import { mixSampleLayer, processSample } from '../synthesis/sample';
import type { SequenceParams, SynthesisResult, SynthParams } from '../types';
import { addVoice, createMix } from './mix';

/** Nota başına anlamı olmayan, dizinin tamamına ait alanlar. */
const SEQUENCE_LEVEL_KEYS = [...BUS_EFFECT_KEYS, 'sampleRate', 'sample'] as const;

function resolveTime(value: number, bpm?: number): number {
  return bpm ? (value * 60) / bpm : value;
}

/**
 * Nota parametresi: bus efektleri, örnek oranı ve sample katmanı DİZİYE
 * aittir. Eskiden nota başına verildiklerinde sessizce siliniyordu (ve liste
 * flanger/phaser'ı unuttuğu için bu ikisi iki kez uygulanıyordu); artık
 * adıyla reddedilir.
 */
function noteOverrides(params: unknown, path: string): Partial<SynthParams> {
  if (params === undefined) return {};
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new AudioParamError(path, 'type', 'nesne olmalı', params);
  }
  const o = params as Record<string, unknown>;
  for (const key of SEQUENCE_LEVEL_KEYS) {
    if (o[key] !== undefined) {
      throw new AudioParamError(
        `${path}.${key}`,
        'combination',
        'dizinin tamamına aittir; baseParams ile verilmeli',
        o[key],
      );
    }
  }
  return o as Partial<SynthParams>;
}

/**
 * Notaları art arda dizer — kanonik mix veriyolu üzerinde ince uyumluluk
 * adaptörü. Notalar `normalize: false` ile render edilir ve mono mix'e
 * toplanır; bus efektleri, kazanç ve normalizasyon diziye BİR KEZ, tek bir
 * sesin çıkış yoluyla (`applyGlobalEffects`) uygulanır.
 */
export function compose(
  sequence: SequenceParams,
  baseParams: Omit<SynthParams, 'duration'>,
): SynthesisResult {
  const sampleRate = checkSampleRate(baseParams.sampleRate ?? DEFAULT_SAMPLE_RATE, 'sampleRate');
  const bus = resolveBusParams(baseParams);
  const notes = checkArray(sequence.notes, 'notes');
  if (notes.length === 0) throw new AudioParamError('notes', 'range', 'en az bir nota', notes);
  const bpm =
    sequence.bpm === undefined ? undefined : checkNumber(sequence.bpm, 'bpm', { above: 0 });
  const loop = checkNumber(sequence.loop ?? 1, 'loop', { min: 1, integer: true });
  const loopDelay = resolveTime(checkNumber(sequence.loopDelay ?? 0, 'loopDelay', { min: 0 }), bpm);
  const rootFreq = checkNumber(sequence.rootFreq ?? baseParams.frequency ?? 440, 'rootFreq', {
    above: 0,
  });

  const placed = sequence.notes.map((note, index) => {
    const path = `notes[${index}]`;
    const semitone = checkNumber(note.semitone ?? 0, `${path}.semitone`);
    return {
      duration: resolveTime(checkNumber(note.duration, `${path}.duration`, { above: 0 }), bpm),
      delay: resolveTime(checkNumber(note.delay ?? 0, `${path}.delay`, { min: 0 }), bpm),
      frequency:
        note.freq !== undefined
          ? checkNumber(note.freq, `${path}.freq`, { above: 0 })
          : rootFreq * Math.pow(2, semitone / 12),
      overrides: noteOverrides(note.params, `${path}.params`),
    };
  });

  const sequenceDuration = placed.reduce((sum, note) => sum + note.duration + note.delay, 0);
  const musicDuration = sequenceDuration * loop + (loop - 1) * loopDelay;
  // Kuyruk gerçek sönümden: reverb RT60'ı ve delay'in -60 dB süresi.
  const tail = Math.max(
    bus.reverb ? new Reverb(bus.reverb, sampleRate).tailSeconds : 0,
    bus.delay ? estimateDelayTail(bus.delay) : 0,
  );
  const totalDuration = musicDuration + tail;
  const mix = createMix(totalDuration, sampleRate, 1);

  const noteBase: Record<string, unknown> = { ...baseParams };
  for (const key of [...SEQUENCE_LEVEL_KEYS, 'gain', 'normalize', 'seed']) delete noteBase[key];

  let offset = 0;
  let noteIndex = 0;
  for (let l = 0; l < loop; l++) {
    for (const note of placed) {
      const { gain: noteGain = 1, ...overrides } = note.overrides;
      const rendered = synth(note.duration, {
        ...(noteBase as Omit<SynthParams, 'duration'>),
        ...overrides,
        frequency: note.frequency,
        sampleRate,
        // Seviye diziye bir kez verilir; notayı ayrıca normalize etmek
        // notalar arası dinamiği silerdi.
        normalize: false,
        // Her nota ayrı tohum: aynı gürültü dizisi tekrarlanıp yapay bir
        // "aynılık" oluşturmasın. Dizi yine deterministiktir.
        seed: (baseParams.seed ?? 0) + noteIndex,
      });
      noteIndex++;
      addVoice(mix, rendered, offset, { gain: noteGain });
      offset += note.duration + note.delay;
    }
    offset += loopDelay;
  }

  const dry = mix.channels[0];
  if (baseParams.sample) {
    mixSampleLayer(dry, processSample(baseParams.sample, sampleRate, dry.length), 0);
  }
  return applyGlobalEffects(dry, baseParams, sampleRate, totalDuration, baseParams.gain ?? 1);
}
