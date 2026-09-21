import { describe, it, expect } from 'vitest';
import { pluck } from '@volstudio/audio-synth';

function allFinite(channels: Float32Array[]): boolean {
  return channels.every((ch) => ch.every((s) => Number.isFinite(s)));
}

describe('pluck (Karplus-Strong physical modeling)', () => {
  it('aynı seed ile deterministik çıktı üretir', () => {
    const a = pluck({ frequency: 220, duration: 0.2, seed: 42 });
    const b = pluck({ frequency: 220, duration: 0.2, seed: 42 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
  });

  it('farklı seed farklı çıktı üretir', () => {
    const a = pluck({ frequency: 220, duration: 0.2, seed: 1 });
    const b = pluck({ frequency: 220, duration: 0.2, seed: 2 });
    expect(a.channels[0]).not.toEqual(b.channels[0]);
  });

  it('varsayılan parametrelerle tamamen sonlu (finite) çıktı üretir', () => {
    const result = pluck({ frequency: 220, duration: 0.5 });
    expect(allFinite(result.channels)).toBe(true);
  });

  it('decay >= 1 geri besleme döngüsünü patlatmaz (Inf/NaN üretmez)', () => {
    // KS feedback: her örnekte `feedback = filtered * decay`. decay >= 1 ise
    // enerji sönmek yerine katlanarak büyür; birkaç bin örnek içinde Float32
    // taşmasıyla Inf/NaN'a gider. Sonlu üst değer 0.999'da kelepçelenir;
    // sonlu olmayan değer ise sınırda reddedilir.
    for (const decay of [1, 1.5, 10]) {
      const result = pluck({ frequency: 220, duration: 1.5, decay });
      expect(allFinite(result.channels)).toBe(true);
    }
    for (const decay of [Infinity, NaN]) {
      expect(() => pluck({ frequency: 220, duration: 1.5, decay })).toThrow(
        expect.objectContaining({ path: 'pluck.decay', issue: 'non-finite' }),
      );
    }
  });

  it('uzun süre boyunca decay ile genlik gerçekten söner', () => {
    const result = pluck({ frequency: 220, duration: 2, decay: 0.995, gain: 1 });
    const ch = result.channels[0];
    const head = ch.slice(0, 1000).reduce((sum, s) => sum + Math.abs(s), 0);
    const tail = ch.slice(-1000).reduce((sum, s) => sum + Math.abs(s), 0);
    expect(tail).toBeLessThan(head);
  });

  it('sonlu olmayan değer ve geçersiz temel nicelik adıyla reddedilir', () => {
    // NaN'ı aralığın tabanına sabitlemek bozuk girdiyi geçerli bir sese
    // çevirirdi; süre/frekans/örnek oranı da sessizce kaydırılmaz.
    const cases: [Record<string, number>, string, string][] = [
      [{ frequency: NaN }, 'pluck.frequency', 'non-finite'],
      [{ frequency: Infinity }, 'pluck.frequency', 'non-finite'],
      [{ frequency: -100 }, 'pluck.frequency', 'range'],
      [{ duration: NaN }, 'pluck.duration', 'non-finite'],
      [{ duration: -1 }, 'pluck.duration', 'range'],
      [{ sampleRate: 0 }, 'pluck.sampleRate', 'range'],
      [{ sampleRate: NaN }, 'pluck.sampleRate', 'non-finite'],
      [{ frequency: 0 }, 'pluck.frequency', 'range'],
      [{ sampleRate: -44100 }, 'pluck.sampleRate', 'range'],
      [{ seed: NaN }, 'pluck.seed', 'non-finite'],
    ];
    for (const [overrides, path, issue] of cases) {
      expect(() => pluck({ frequency: 220, duration: 0.2, ...overrides })).toThrow(
        expect.objectContaining({ name: 'AudioParamError', path, issue }),
      );
    }
  });

  it('sonlu şekillendirme değerleri modelin fiziksel aralığına kelepçelenir', () => {
    const cases = [{ decay: 5 }, { excitationHarmonics: 40 }, { stereoWidth: -1 }];
    for (const overrides of cases) {
      const result = pluck({ frequency: 220, duration: 0.2, ...overrides });
      expect(result.channels[0].length).toBeGreaterThan(0);
      expect(allFinite(result.channels)).toBe(true);
    }
  });

  it('bodyResonance sıfıra çok yakın değerlerde dev buffer ayırmadan sonlu çıktı üretir', () => {
    const result = pluck({
      frequency: 220,
      duration: 0.2,
      bodyResonance: 0.0001,
      bodyAmount: 0.5,
    });
    expect(allFinite(result.channels)).toBe(true);
  });

  it('bodyResonance normal değerde ek rezonans katar (çıktı bodyResonance=0dan farklı)', () => {
    const withoutBody = pluck({ frequency: 220, duration: 0.3, bodyResonance: 0 });
    const withBody = pluck({ frequency: 220, duration: 0.3, bodyResonance: 300, bodyAmount: 0.8 });
    expect(withBody.channels[0]).not.toEqual(withoutBody.channels[0]);
  });

  it('excitationMix/excitationHarmonics/stereoWidth aralık dışı değerlerde sonlu kalır', () => {
    const result = pluck({
      frequency: 220,
      duration: 0.2,
      excitationMix: 5,
      excitationHarmonics: 100,
      stereoWidth: -3,
    });
    expect(allFinite(result.channels)).toBe(true);
  });

  it('stereoWidth 0 iken kanallar özdeşe yakın, geniş değerde belirgin farklı', () => {
    const mono = pluck({ frequency: 220, duration: 0.2, stereoWidth: 0 });
    const wide = pluck({ frequency: 220, duration: 0.2, stereoWidth: 1 });
    const diff = (ch: Float32Array[]) => {
      let maxDiff = 0;
      for (let i = 0; i < ch[0].length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(ch[0][i] - ch[1][i]));
      }
      return maxDiff;
    };
    expect(diff(wide.channels)).toBeGreaterThan(diff(mono.channels));
  });
});
