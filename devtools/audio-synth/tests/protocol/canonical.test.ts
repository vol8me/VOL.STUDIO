import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  CanonicalJsonError,
  hashCanonical,
  hashPcm,
  prettyCanonicalJson,
  sha256Bytes,
} from '../../src/protocol/canonical';

describe('kanonik JSON', () => {
  it('anahtar sırası ve girinti özeti değiştirmez', () => {
    const a = { b: 1, a: { d: [1, 2, { z: true, y: null }], c: 'x' } };
    const b: unknown = JSON.parse('{"a":{"c":"x","d":[1,2,{"y":null,"z":true}]},"b":1}');
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,2,{"y":null,"z":true}]},"b":1}');
    expect(hashCanonical(a)).toBe(hashCanonical(b));
    expect(JSON.parse(prettyCanonicalJson(a))).toEqual(a);
    expect(prettyCanonicalJson(b)).toBe(prettyCanonicalJson(a));
  });

  it('dizi sırası anlamlıdır', () => {
    expect(hashCanonical([1, 2])).not.toBe(hashCanonical([2, 1]));
  });

  it('-0 ile 0 aynı belgedir; sayı biçimi JSON kısa gösterimidir', () => {
    expect(canonicalJson({ x: -0 })).toBe('{"x":0}');
    expect(canonicalJson([1e21, 0.1, 1.5e-7])).toBe('[1e+21,0.1,1.5e-7]');
  });

  it.each([
    ['NaN', { x: Number.NaN }, '$.x'],
    ['Infinity', [1, Number.POSITIVE_INFINITY], '$[1]'],
    ['undefined', { x: undefined }, '$.x'],
    ['fonksiyon', { f: () => 1 }, '$.f'],
    ['bigint', { n: 1n }, '$.n'],
    ['typed array', { pcm: new Float32Array(2) }, '$.pcm'],
    ['Date', { at: new Date(0) }, '$.at'],
  ])('%s SESSİZCE düşmez, yoluyla reddedilir', (_label, value, path) => {
    expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
    try {
      canonicalJson(value);
    } catch (error) {
      expect((error as CanonicalJsonError).path).toBe(path);
    }
  });

  it('döngüsel başvuru reddedilir ama paylaşılan alt nesne geçerlidir', () => {
    const shared = { v: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => canonicalJson(loop)).toThrow(/döngüsel/);
  });

  it('özet biçimi sha256:<64 hex>', () => {
    expect(sha256Bytes('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('kanonik PCM özeti', () => {
  const tone = (n: number, scale = 0.5) =>
    Float32Array.from({ length: n }, (_, i) => scale * Math.sin(i / 7));

  it('aynı örnekler aynı özet; tek örnek farkı yeni özet', () => {
    const a = tone(10000);
    const b = a.slice();
    expect(hashPcm([a], 48000)).toBe(hashPcm([b], 48000));
    b[5000] += 1e-6;
    expect(hashPcm([a], 48000)).not.toBe(hashPcm([b], 48000));
  });

  it('biçim başlığı özete girer: oran ve kanal düzeni', () => {
    const a = tone(512);
    expect(hashPcm([a], 48000)).not.toBe(hashPcm([a], 44100));
    expect(hashPcm([a, a], 48000)).not.toBe(hashPcm([a], 48000));
  });

  it('yazıcı gibi [-1, 1]e kelepçeler: kodlayıcıya giden baytlar özetlenir', () => {
    const loud = Float32Array.from([2, -3, 0.25]);
    const clamped = Float32Array.from([1, -1, 0.25]);
    expect(hashPcm([loud], 8000)).toBe(hashPcm([clamped], 8000));
  });

  it('parça sınırı (4096 kare) özeti değiştirmez — akış deterministik', () => {
    const a = tone(4096 * 3 + 17);
    const reference = hashPcm([a], 48000);
    expect(hashPcm([a.slice()], 48000)).toBe(reference);
  });
});
