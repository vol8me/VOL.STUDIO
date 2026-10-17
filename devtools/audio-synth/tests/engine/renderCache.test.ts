import { describe, expect, it } from 'vitest';
import { OVERSAMPLE_FACTOR } from '../../src/kernel/constants';
import { cacheKey, MemoryRenderCache } from '../../src/engine/renderCache';
import {
  QUALITY_PROFILES,
  qualityProfile,
  renderSession,
  withRenderSession,
} from '../../src/kernel/session';
import { synthesize } from '../../src/engine/synthesize';
import { hashPcm } from '../../src/kernel/canonical';

const buffer = (length: number, value = 0.5) => new Float32Array(length).fill(value);

describe('render oturumu', () => {
  it('oturum yokken nihai kalite ve önbelleksiz render', () => {
    expect(renderSession()).toEqual({ quality: 'final', cache: null });
    expect(qualityProfile()).toBe(QUALITY_PROFILES.final);
  });

  it('iç içe oturum verilmeyen alanı miras alır ve çıkışta — hata olsa bile — geri döner', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1024 });
    withRenderSession({ cache }, () => {
      withRenderSession({ quality: 'draft' }, () => {
        expect(renderSession()).toEqual({ quality: 'draft', cache });
      });
      expect(() =>
        withRenderSession({ cache: null }, () => {
          expect(renderSession().cache).toBeNull();
          throw new Error('içeride');
        }),
      ).toThrow('içeride');
      expect(renderSession()).toEqual({ quality: 'final', cache });
    });
    expect(renderSession()).toEqual({ quality: 'final', cache: null });
  });

  it('nihai profil bugünkü üretim katsayılarıdır; taslak her katsayıyı düşürür', () => {
    expect(QUALITY_PROFILES.final).toEqual({
      voiceOversample: OVERSAMPLE_FACTOR,
      saturationOversample: 4,
      truePeakOversample: 4,
    });
    for (const [knob, value] of Object.entries(QUALITY_PROFILES.draft)) {
      expect(value).toBeLessThan(
        QUALITY_PROFILES.final[knob as keyof typeof QUALITY_PROFILES.final],
      );
    }
  });
});

describe('bellek önbelleği', () => {
  it('okuma ve yazma kopyadır: çağıranın değişikliği girdiyi bozmaz', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 20 });
    const key = cacheKey({ id: 1 });
    const source = [buffer(8)];
    cache.write(key, source);
    source[0].fill(9);
    const read = cache.read(key) as Float32Array[];
    expect(read[0][0]).toBe(0.5);
    read[0].fill(7);
    expect((cache.read(key) as Float32Array[])[0][0]).toBe(0.5);
    expect(cache.stats).toMatchObject({ hits: 2, misses: 0, writes: 1 });
  });

  it('bayt sınırında en az yakın zamanda kullanılanı atar; tek girdi sınırını aşanı saklamaz', () => {
    const cache = new MemoryRenderCache({ maxBytes: 3 * 64, maxEntryBytes: 64 });
    const keys = [0, 1, 2, 3].map((i) => cacheKey({ i }));
    for (const key of keys.slice(0, 3)) cache.write(key, [buffer(16)]);
    cache.read(keys[0]);
    cache.write(keys[3], [buffer(16)]);
    expect(cache.read(keys[1])).toBeUndefined();
    expect(cache.read(keys[0])).toBeDefined();
    expect(cache.stats.evictions).toBe(1);
    cache.write(cacheKey({ big: true }), [buffer(32)]);
    expect(cache.stats.skipped).toBe(1);
    expect(cache.byteSize).toBeLessThanOrEqual(3 * 64);
  });

  it('anahtar tanımsız alanı atar; sonlu olmayan sayı ve düz olmayan nesne reddedilir', () => {
    expect(cacheKey({ a: 1, b: undefined })).toBe(cacheKey({ a: 1 }));
    expect(() => cacheKey({ a: Number.NaN })).toThrow();
    expect(() => cacheKey({ a: new Float32Array(2) })).toThrow();
  });
});

describe('ses önbelleği', () => {
  const voice = () => ({
    wave: 'sawtooth' as const,
    frequency: 330,
    duration: 0.2,
    sampleRate: 16000,
  });

  it('önbellek açık ve kapalı ses aynıdır; tekrar isabet eder', () => {
    const plain = synthesize(voice());
    const cache = new MemoryRenderCache({ maxBytes: 1 << 24 });
    const [first, second] = withRenderSession({ cache }, () => [
      synthesize(voice()),
      synthesize(voice()),
    ]);
    expect(hashPcm(first.channels, 16000)).toBe(hashPcm(plain.channels, 16000));
    expect(hashPcm(second.channels, 16000)).toBe(hashPcm(plain.channels, 16000));
    expect(second.duration).toBe(plain.duration);
    expect(cache.stats).toMatchObject({ hits: 1, writes: 1 });
  });

  it('taslakta iç oran örnek oranıdır: uzunluk aynı, örnekler farklı', () => {
    const final = synthesize(voice());
    const draft = withRenderSession({ quality: 'draft' }, () => synthesize(voice()));
    expect(draft.channels[0].length).toBe(final.channels[0].length);
    expect(hashPcm(draft.channels, 16000)).not.toBe(hashPcm(final.channels, 16000));
  });

  it('sample verisi taşıyan ses önbelleğe girmez', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 24 });
    withRenderSession({ cache }, () =>
      synthesize({ ...voice(), sample: { data: buffer(800, 0.1) } }),
    );
    expect(cache.stats.writes).toBe(0);
  });
});
