import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { analyzeScore } from '../../src/music/analyze';
import { programInstrumentSurfaces } from '../../src/music/instrumentResolve';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram, type ScoreEventV1 } from '../../src/music/score';
import { renderMusicRaw } from '../../src/music/stem';
import { hashPcm } from '../../src/kernel/canonical';
import { RENDER_BLOCK } from '../support/timeouts';
import { unitProgram } from './fixtures';

/**
 * Orkestrasyon görevi enstrüman adından ayrıdır: aynı score iki paletle
 * çalındığında YAZILAN notalar, armoni ve olay kimlikleri aynı kalır.
 */
const CHIP_LEAD = {
  id: 'chip-lead',
  role: 'lead',
  range: ['C3', 'C8'],
  preferred: ['C5', 'C7'],
  polyphony: 2,
  articulations: ['sustain', 'staccato'],
  source: { kind: 'retro', patch: { waveform: 'pulse', duty: 0.25 } },
};
const CHIP_BASS = {
  id: 'chip-bass',
  role: 'bass',
  range: ['E1', 'C4'],
  polyphony: 1,
  articulations: ['sustain', 'staccato'],
  source: { kind: 'retro', patch: { waveform: 'triangle-4bit' } },
};

function orchestrated(palette: string, extra: Record<string, unknown> = {}) {
  const base = unitProgram();
  return {
    ...base,
    instruments: [CHIP_LEAD, CHIP_BASS],
    palettes: [
      {
        id: 'chip',
        roles: {
          lead: { instrument: 'inst:chip-lead', transposition: 'auto' },
          bass: { instrument: 'inst:chip-bass' },
          harmony: { instrument: 'preset:warmKeys', gainDb: -6 },
        },
      },
      {
        id: 'acoustic',
        roles: {
          lead: { instrument: 'preset:flute', transposition: 'auto' },
          bass: { instrument: 'preset:cello' },
          harmony: { instrument: 'preset:warmKeys' },
        },
      },
    ],
    orchestration: { palette },
    lanes: [
      { id: 'bass', role: 'bass', stem: 'main', gain: 0.8, groove: 'flat' },
      { id: 'keys', role: 'harmony', stem: 'main', gain: 0.5 },
      { id: 'lead', role: 'lead', stem: 'main', gain: 0.4, octave: 1, groove: 'flat' },
    ],
    ...extra,
  };
}

/** Yazılan nota ve armoni kimliği: seslendiren enstrüman ve seslenen perde hariç. */
const identity = (events: readonly ScoreEventV1[]) =>
  events.map((e) => ({
    id: e.id,
    written: e.written ?? e.midi,
    gridBeat: e.gridBeat,
    beats: e.beats,
    provenance: e.provenance,
  }));

describe('orkestrasyon görevleri ve paletler', RENDER_BLOCK, () => {
  it('iki palet: nota/armoni kimliği aynı, seslendiren ve PCM farklı', () => {
    const chip = validateMusicProgram(orchestrated('chip'));
    const acoustic = validateMusicProgram(orchestrated('acoustic'));
    const a = expandProgram(chip);
    const b = expandProgram(acoustic);
    expect(identity(a.events)).toEqual(identity(b.events));
    expect(a.lanes.map((l) => l.instrument)).toEqual([
      'inst:chip-bass',
      'preset:warmKeys',
      'inst:chip-lead',
    ]);
    expect(b.lanes.map((l) => l.orchestration)).toEqual(['bass', 'harmony', 'lead']);
    const render = (p: typeof chip) => {
      const r = renderMusicRaw(p, expandProgram(p), undefined, undefined);
      return hashPcm(r.channels, r.sampleRate);
    };
    expect(render(chip)).not.toBe(render(acoustic));
  });

  it('auto kaydırma yazılanı tercih edilen register’a oturtur; palet kazancı olaya iner', () => {
    const chip = expandProgram(validateMusicProgram(orchestrated('chip')));
    const acoustic = expandProgram(validateMusicProgram(orchestrated('acoustic')));
    const lead = chip.events.filter((e) => e.lane === 'lead');
    expect(lead.every((e) => e.midi - (e.written as number) === 24)).toBe(true);
    expect(lead.every((e) => e.midi >= 72 && e.midi <= 96)).toBe(true);
    const keys = (s: typeof chip) => s.events.filter((e) => e.lane === 'keys').map((e) => e.gain);
    keys(chip).forEach((gain, i) => expect(gain / keys(acoustic)[i]).toBeCloseTo(0.5012, 3));
  });

  it('eksik görev, bilinmeyen palet ve görevsiz enstrümansız şerit adıyla reddedilir', () => {
    const rejects = (value: unknown, fragment: RegExp) => {
      expect(() => validateMusicProgram(value)).toThrow(AudioParamError);
      expect(() => validateMusicProgram(value)).toThrow(fragment);
    };
    rejects(orchestrated('yok'), /tanımlı bir palet/);
    const lanes = orchestrated('chip').lanes as Record<string, unknown>[];
    rejects(
      orchestrated('chip', { lanes: [...lanes, { id: 'pad', role: 'texture', stem: 'main' }] }),
      /"texture" görevi yok/,
    );
    rejects(
      orchestrated('chip', { lanes: [...lanes, { id: 'pad', stem: 'main' }] }),
      /enstrüman ya da orkestrasyon görevi/,
    );
  });

  it('görev raporu yalnız görev yazılınca eklenir; yoğunluk ve register bandı ölçülür', () => {
    const program = validateMusicProgram(orchestrated('acoustic'));
    const report = analyzeScore({ program, score: expandProgram(program) });
    expect(report.roles?.map((r) => r.role)).toEqual(['bass', 'harmony', 'lead']);
    const bass = report.roles?.find((r) => r.role === 'bass');
    expect(bass?.register.band).toEqual([28, 55]);
    expect(bass?.register.inBandRatio).toBe(1);
    const plain = validateMusicProgram(unitProgram());
    expect('roles' in analyzeScore({ program: plain, score: expandProgram(plain) })).toBe(false);
  });

  it('render yüzeyi etkin paletin seslendirenlerini kaydeder', () => {
    const ids = (palette: string) =>
      programInstrumentSurfaces(validateMusicProgram(orchestrated(palette))).map((s) => s.id);
    expect(ids('chip')).toEqual(['backend:retro', 'preset:warmKeys']);
    expect(ids('acoustic')).toEqual(['preset:cello', 'preset:flute', 'preset:warmKeys']);
  });
});
