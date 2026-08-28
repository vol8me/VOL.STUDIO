import type { SequenceParams, SequenceNote, SynthesisResult, SynthParams } from './types';
import { applyGlobalEffects, synth } from './engine';
import { estimateDelayTail, Reverb } from './effects';
import { mixSampleLayer, processSample } from './sample';

const DEFAULT_SAMPLE_RATE = 44100;

/** Global (master) efektler; nota başına değil, final mix üzerinde uygulanır. */
const GLOBAL_PARAM_KEYS = [
  'delay',
  'chorus',
  'reverb',
  'pan',
  'stereoWidth',
  'gain',
  'sampleRate',
] as const;

function stripGlobalParams(params: Partial<SynthParams>): Partial<SynthParams> {
  const result = { ...params } as Partial<SynthParams> & Record<string, unknown>;
  for (const key of GLOBAL_PARAM_KEYS) {
    delete result[key];
  }
  return result;
}

function resolveTime(value: number, bpm?: number): number {
  if (!bpm) return value;
  return (value * 60) / bpm;
}

function resolveFrequency(note: SequenceNote, rootFreq: number): number {
  if (note.freq !== undefined) return note.freq;
  if (note.semitone !== undefined) return rootFreq * Math.pow(2, note.semitone / 12);
  return rootFreq;
}

/** Birden fazla notayı sırayla çalar ve tek bir buffer'da birleştirir. */
export function compose(
  sequence: SequenceParams,
  baseParams: Omit<SynthParams, 'duration'>,
): SynthesisResult {
  const sampleRate = baseParams.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const rootFreq = sequence.rootFreq ?? baseParams.frequency ?? 440;
  const bpm = sequence.bpm;

  // Toplam süreyi hesapla (reverb tail için müzik kısmından ayrı tail ekle)
  let sequenceDuration = 0;
  for (const note of sequence.notes) {
    sequenceDuration += resolveTime(note.duration, bpm) + resolveTime(note.delay ?? 0, bpm);
  }

  const loop = Math.max(1, Math.floor(sequence.loop ?? 1));
  const loopDelay = resolveTime(sequence.loopDelay ?? 0, bpm);
  const musicDuration = sequenceDuration * loop + (loop - 1) * loopDelay;
  // Kuyruk süreleri gerçek sönüm süresinden hesaplanır.
  const reverbTail = baseParams.reverb ? new Reverb(baseParams.reverb, sampleRate).tailSeconds : 0;
  const delayTail = baseParams.delay ? estimateDelayTail(baseParams.delay) : 0;
  const tail = Math.max(reverbTail, delayTail);
  const totalDuration = musicDuration + tail;
  const totalSamples = Math.floor(sampleRate * totalDuration);

  const mixBuffer = new Float32Array(totalSamples);
  const baseSample = baseParams.sample;
  const noteBase = stripGlobalParams(baseParams);
  delete (noteBase as Record<string, unknown>).sample;
  let currentOffset = 0;
  let noteIndex = 0;

  for (let l = 0; l < loop; l++) {
    for (const note of sequence.notes) {
      const noteDuration = resolveTime(note.duration, bpm);
      const noteDelay = resolveTime(note.delay ?? 0, bpm);
      const noteFreq = resolveFrequency(note, rootFreq);
      const noteGain = note.params?.gain ?? 1;

      const noteParams: SynthParams = {
        ...noteBase,
        ...stripGlobalParams(note.params ?? {}),
        frequency: noteFreq,
        duration: noteDuration,
        sampleRate,
        // Normalize yalnızca final mix'e uygulanır; nota bazında yapılırsa
        // notalar arası dinamik fark kaybolur.
        normalize: false,
        // Her nota farklı bir seed alır; aynı gürültü dizisi tekrarlanıp
        // yapay bir "aynılık" oluşturmasın. Dizi yine deterministiktir.
        seed: (baseParams.seed ?? 0) + noteIndex,
      };
      noteIndex++;

      const result = synth(noteDuration, noteParams);
      const noteBuffer = result.channels[0];
      const startSample = Math.floor(currentOffset * sampleRate);

      for (let i = 0; i < noteBuffer.length; i++) {
        const idx = startSample + i;
        if (idx < mixBuffer.length) {
          mixBuffer[idx] += noteBuffer[i] * noteGain;
        }
      }

      currentOffset += noteDuration + noteDelay;
    }
    currentOffset += loopDelay;
  }

  // Base sample varsa tüm diziye bir kez karıştır; per-note sample hala `note.params.sample` ile çalışır.
  if (baseSample) {
    const sampleBuffer = processSample(baseSample, sampleRate, totalSamples);
    mixSampleLayer(mixBuffer, sampleBuffer, 0);
  }

  // Master efektleri (delay, chorus, reverb, normalize, pan/stereo) final mix'e uygula
  const gain = baseParams.gain ?? 1;
  return applyGlobalEffects(mixBuffer, baseParams, sampleRate, totalDuration, gain);
}
