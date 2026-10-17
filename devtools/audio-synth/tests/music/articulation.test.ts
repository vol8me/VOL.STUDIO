import { describe, expect, it } from 'vitest';
import type { PlacedVoiceV1 } from '../../src/arrange/render';
import { synthesize } from '../../src/engine/synthesize';
import { AudioParamError } from '../../src/guard/errors';
import {
  LEGATO_OVERLAP_SECONDS,
  MUTE_BRIGHTNESS,
  MUTE_LENGTH_RATIO,
  STACCATO_RATIO,
} from '../../src/music/articulation';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram } from '../../src/music/score';
import { planVoices } from '../../src/music/voices';
import { getPreset } from '../../src/presets';
import type { SynthParams } from '../../src/types';
import { peakFrequency } from '../support/measure';
import { unitProgram } from './fixtures';

type Note = { bar: number; beat: number; beats: number; note: string } & Record<string, unknown>;

/** 120 bpm: bir vuruş 0.5 sn. */
const BEAT = 0.5;

function lane(instrument: string, notes: Note[], laneExtra: Record<string, unknown> = {}) {
  return validateMusicProgram({
    ...unitProgram(),
    lanes: [{ id: 'part', instrument, stem: 'main', ...laneExtra }],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 2],
        targetEnergy: 0.6,
        lanes: ['part'],
        parts: [{ lane: 'part', source: 'notes', notes }],
      },
    ],
  });
}

function voices(instrument: string, notes: Note[], laneExtra: Record<string, unknown> = {}) {
  const score = expandProgram(lane(instrument, notes, laneExtra));
  return { score, voices: planVoices(score, score.events) };
}

const paramsOf = (voice: PlacedVoiceV1): SynthParams => {
  if (!('params' in voice)) throw new Error('preset sesi bekleniyordu');
  return voice.params;
};

const rejects = (fn: () => unknown, fragment: RegExp) => {
  expect(fn).toThrow(AudioParamError);
  expect(fn).toThrow(fragment);
};

describe('artikülasyon verisi', () => {
  it('aynı kümeden iki artikülasyon ve bilinmeyen artikülasyon reddedilir', () => {
    rejects(
      () =>
        lane('preset:warmKeys', [
          { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['staccato', 'legato'] },
        ]),
      /aynı kümede/,
    );
    rejects(
      () =>
        lane('preset:warmKeys', [
          { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['shout'] },
        ]),
      /articulations\[0\]/,
    );
  });

  it('enstrümanın çalamadığı artikülasyon score’a giremez (vurgusal preset tutamaz)', () => {
    rejects(
      () =>
        expandProgram(
          lane('preset:marimba', [
            { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['sustain'] },
          ]),
        ),
      /yalnız/,
    );
  });

  it('şerit varsayılanı notaya eklenir; notanın aynı kümedeki değeri onu ezer', () => {
    const { score } = voices(
      'preset:warmKeys',
      [
        { bar: 0, beat: 0, beats: 1, note: 'C4' },
        { bar: 0, beat: 1, beats: 1, note: 'D4', articulations: ['legato', 'accent'] },
      ],
      { articulation: 'staccato' },
    );
    expect(score.events.map((e) => e.articulations)).toEqual([['staccato'], ['legato', 'accent']]);
  });
});

describe('kapı süresi ve ifade', () => {
  it('staccato yarıya kısaltır; legato bir sonraki notayı örter', () => {
    const { voices: staccato } = voices('preset:warmKeys', [
      { bar: 0, beat: 0, beats: 2, note: 'C4', articulations: ['staccato'] },
    ]);
    expect(paramsOf(staccato[0]).duration).toBeCloseTo(2 * BEAT * STACCATO_RATIO, 9);
    const { voices: legato } = voices('preset:warmKeys', [
      { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['legato'] },
      { bar: 0, beat: 1, beats: 1, note: 'D4' },
    ]);
    expect(paramsOf(legato[0]).duration).toBeCloseTo(BEAT + LEGATO_OVERLAP_SECONDS, 9);
    expect(paramsOf(legato[1]).duration).toBeCloseTo(BEAT, 9);
  });

  it('tie aynı perdeli bitişik notayla tek notaya birleşir; bağlanacak nota yoksa hata', () => {
    const { score } = voices('preset:warmKeys', [
      { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['tie'] },
      { bar: 0, beat: 1, beats: 1.5, note: 'C4', articulations: ['accent'] },
      { bar: 0, beat: 3, beats: 1, note: 'E4' },
    ]);
    expect(score.events).toHaveLength(2);
    expect(score.events[0]).toMatchObject({ beats: 2.5, midi: 60 });
    expect(score.events[0].articulations).toBeUndefined();
    rejects(
      () =>
        expandProgram(
          lane('preset:warmKeys', [
            { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['tie'] },
            { bar: 0, beat: 1, beats: 1, note: 'D4' },
          ]),
        ),
      /tie bitişinde/,
    );
  });

  it('let-ring vurgusal enstrümanı doğal sönümüne bırakır; mute kısaltır ve karartır', () => {
    const { voices: ring } = voices('preset:guitar', [
      { bar: 0, beat: 0, beats: 0.25, note: 'E3', articulations: ['let-ring'] },
    ]);
    expect(paramsOf(ring[0]).duration).toBeGreaterThan(0.25 * BEAT);
    const { voices: muted } = voices('preset:guitar', [
      { bar: 0, beat: 0, beats: 1, note: 'E3', articulations: ['mute'] },
    ]);
    const plain = getPreset('guitar', paramsOf(muted[0]).frequency, BEAT);
    expect(paramsOf(muted[0]).duration).toBeCloseTo(BEAT * MUTE_LENGTH_RATIO, 9);
    expect(paramsOf(muted[0]).lowpass?.cutoff).toBeCloseTo(
      (plain.lowpass?.cutoff as number) * MUTE_BRIGHTNESS,
      6,
    );
  });

  it('accent velocity’yi yükseltir, ghost düşürür; yazılı velocity tepkiden geçer', () => {
    const { score, voices: v } = voices('preset:warmKeys', [
      { bar: 0, beat: 0, beats: 1, note: 'C4', articulations: ['accent'] },
      { bar: 0, beat: 1, beats: 1, note: 'C4', articulations: ['ghost'] },
      { bar: 0, beat: 2, beats: 1, note: 'C4', velocity: 0.8 },
    ]);
    const unit = score.events.map((e) => e.gain);
    expect(v[0].gain / unit[0]).toBeCloseTo(Math.pow(10, (18 * 0.2) / 20), 9);
    expect(v[1].gain / unit[1]).toBeCloseTo(Math.pow(10, (18 * (0.36 - 0.8)) / 20), 9);
    expect(v[2].gain).toBe(unit[2]);
  });

  it('slide önceki notanın perdesinden kayar (motor glide ile)', () => {
    const { voices: v } = voices('preset:warmKeys', [
      { bar: 0, beat: 0, beats: 1, note: 'C4' },
      { bar: 0, beat: 1, beats: 2, note: 'G4', articulations: ['slide'] },
    ]);
    const glide = paramsOf(v[1]).glide;
    expect(glide).toEqual({ semitones: -7, seconds: 0.08 });
    const rendered = synthesize({
      wave: 'sawtooth',
      frequency: 440,
      duration: 0.6,
      glide: { semitones: -12, seconds: 0.3 },
      normalize: false,
    });
    const x = rendered.channels[0];
    const start = peakFrequency(x, rendered.sampleRate, 0, 1024, [100, 1000]);
    const end = peakFrequency(x, rendered.sampleRate, Math.round(0.4 * 44100), 4096, [100, 1000]);
    expect(start).toBeLessThan(300);
    expect(end).toBeCloseTo(440, -1);
    expect(() =>
      synthesize({ frequency: 440, duration: 0.2, glide: { semitones: 60, seconds: 0.1 } }),
    ).toThrow(/glide.semitones/);
  });
});
