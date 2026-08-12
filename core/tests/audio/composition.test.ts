import { describe, it, expect } from 'vitest';
import {
  generateProgression,
  generateProgressionFromPool,
} from '../../scripts/composition/harmony';
import { generateMotif, MAJOR_SCALE } from '../../scripts/composition/motif';
import { generateArrangement } from '../../scripts/composition/arrangement';
import { Presets } from '../../src/audio/synth';

describe('Kompozisyon primitifleri', () => {
  it('generateProgression istenen uzunlukta akor döner', () => {
    const chords = generateProgression({
      root: 220,
      scale: MAJOR_SCALE,
      changeBeats: 4,
      length: 8,
      chordTypes: ['major', 'fifth'],
      seed: 7,
    });
    expect(chords.length).toBe(8);
    for (const chord of chords) {
      expect(chord.root).toBeGreaterThan(0);
      expect(['major', 'fifth']).toContain(chord.type);
    }
  });

  it('generateProgressionFromPool verilen havuzu kullanır', () => {
    const pool = [
      { root: 110, type: 'fifth' as const },
      { root: 146.83, type: 'fifth' as const },
    ];
    const chords = generateProgressionFromPool(pool, 4, 0, 0.5, 3);
    expect(chords.length).toBe(4);
    expect(pool.map((c) => c.root)).toContain(chords[0].root);
  });

  it('generateMotif explicit frekanslarla çalışır', () => {
    const motif = generateMotif({
      frequencies: [220, 261.63, 329.63],
      durations: 0.5,
      delays: 0.25,
    });
    expect(motif.length).toBe(3);
    expect(motif[0].freq).toBe(220);
    expect(motif[0].delay).toBe(0);
    expect(motif[1].delay).toBe(0.25);
  });

  it('generateArrangement katman zamanlaması üretir', () => {
    const arr = generateArrangement({
      totalBeats: 16,
      layers: ['a', 'b'],
      intensityPoints: [
        [0, 0.2],
        [8, 0.8],
        [16, 0.2],
      ],
      layerRanges: {
        a: [0, 16],
        b: [8, 16],
      },
    });
    expect(arr.totalBeats).toBe(16);
    expect(arr.intensityCurve.length).toBe(16);
    expect(arr.events.length).toBe(2);
    const b = arr.events.find((e) => e.layer === 'b')!;
    expect(b.startBeat).toBe(8);
    expect(b.endBeat).toBe(16);
  });

  it('katalog role bazlı filtreleme destekler', () => {
    const bass = Presets.findPresets({ role: 'bass' });
    expect(bass.length).toBeGreaterThan(0);
    expect(bass).toContain('subBass');
    const keys = Presets.findPresets({ role: 'keys' });
    expect(keys).toContain('warmKeys');
  });
});
