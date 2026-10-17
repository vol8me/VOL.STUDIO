import { describe, expect, it } from 'vitest';
import type { PlacedVoiceV1 } from '../../src/arrange/render';
import { AudioParamError } from '../../src/guard/errors';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram } from '../../src/music/score';
import { midiToHz } from '../../src/music/tonal';
import { frequencyOf, parseNote, validateTuning } from '../../src/music/tuning';
import { planVoices } from '../../src/music/voices';
import { unitProgram } from './fixtures';

const JUST = [
  [1, 1],
  [16, 15],
  [9, 8],
  [6, 5],
  [5, 4],
  [4, 3],
  [45, 32],
  [3, 2],
  [8, 5],
  [5, 3],
  [9, 5],
  [15, 8],
];
/** Çeyrek komalı ortalama ses (meantone), C kökünden cent. */
const MEANTONE = [0, 76.0, 193.2, 310.3, 386.3, 503.4, 579.5, 696.6, 772.6, 889.7, 1006.8, 1082.9];

const frequencyOfVoice = (voice: PlacedVoiceV1) =>
  'params' in voice ? voice.params.frequency : NaN;

function program(tuning: unknown, notes: string[]) {
  return validateMusicProgram({
    ...unitProgram(),
    ...(tuning === undefined ? {} : { tuning }),
    lanes: [{ id: 'keys', instrument: 'preset:warmKeys', stem: 'main' }],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 2],
        targetEnergy: 0.5,
        lanes: ['keys'],
        parts: [
          {
            lane: 'keys',
            source: 'notes',
            notes: notes.map((note, i) => ({ bar: 0, beat: i * 0.5, beats: 0.5, note })),
          },
        ],
      },
    ],
  });
}

describe('perde çözücü ve ayar', () => {
  it('ayar yoksa 12-TET yolu midiToHz ile birebir aynıdır', () => {
    for (let midi = 0; midi <= 127; midi++)
      expect(frequencyOf(midi, undefined)).toBe(midiToHz(midi));
    const score = expandProgram(program(undefined, ['C4', 'E4', 'G4']));
    expect(score.tuning).toBeUndefined();
    expect(planVoices(score, score.events).map(frequencyOfVoice)).toEqual(
      [60, 64, 67].map(midiToHz),
    );
  });

  it('eşit ayar başka referansla; saf ses oranları ve ortalama ses cent tablosu', () => {
    expect(frequencyOf(69, undefined, validateTuning({ kind: 'equal', referenceHz: 432 }))).toBe(
      432,
    );
    const just = validateTuning({ kind: 'ratios', root: 'C', ratios: JUST });
    const c4 = frequencyOf(60, undefined, just);
    expect(c4).toBe(midiToHz(60));
    expect(frequencyOf(64, undefined, just) / c4).toBeCloseTo(5 / 4, 12);
    expect(frequencyOf(67, undefined, just) / c4).toBeCloseTo(3 / 2, 12);
    expect(frequencyOf(72, undefined, just) / c4).toBeCloseTo(2, 12);
    expect(frequencyOf(55, undefined, just) / frequencyOf(48, undefined, just)).toBeCloseTo(
      1.5,
      12,
    );
    const meantone = validateTuning({ kind: 'cents', root: 'C', cents: MEANTONE });
    const cents = (a: number, b: number) =>
      1200 * Math.log2(frequencyOf(b, undefined, meantone) / frequencyOf(a, undefined, meantone));
    expect(cents(60, 64)).toBeCloseTo(386.3, 9);
    expect(cents(62, 69)).toBeCloseTo(889.7 - 193.2, 9);
  });

  it('programdaki ayar score’a girer ve seslerin frekansını belirler', () => {
    const score = expandProgram(
      program({ kind: 'ratios', root: 'C', ratios: JUST }, ['C4', 'E4', 'A4+50c']),
    );
    const [c = NaN, e = NaN, a = NaN] = planVoices(score, score.events).map(frequencyOfVoice);
    expect(e / c).toBeCloseTo(5 / 4, 12);
    expect(a / c).toBeCloseTo((5 / 3) * Math.pow(2, 50 / 1200), 12);
    expect(score.events[2]).toMatchObject({ midi: 69, cents: 50 });
  });

  it('mikrotonal nota adı ve geçersiz ayar adıyla reddedilir', () => {
    expect(parseNote('Eb4-14c', 'n')).toEqual({ midi: 63, cents: -14 });
    expect(parseNote('C4', 'n')).toEqual({ midi: 60 });
    expect(() => parseNote('C4+150c', 'n')).toThrow(/±100/);
    const rejects = (value: unknown, fragment: RegExp) => {
      expect(() => validateTuning(value)).toThrow(AudioParamError);
      expect(() => validateTuning(value)).toThrow(fragment);
    };
    rejects({ kind: 'cents', root: 'C', cents: [10, ...MEANTONE.slice(1)] }, /0 cent/);
    rejects({ kind: 'cents', root: 'C', cents: [0, 200, ...MEANTONE.slice(2)] }, /artan/);
    rejects({ kind: 'ratios', root: 'C', ratios: [...JUST.slice(0, 11), [2, 1]] }, /2\/1 altında/);
    rejects({ kind: 'ratios', root: 'H', ratios: JUST }, /perde sınıfı/);
    rejects({ kind: 'cents', root: 'C', cents: MEANTONE.slice(1) }, /12 kromatik/);
  });
});
