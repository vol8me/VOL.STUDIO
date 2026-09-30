import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryRenderCache } from '../../src/engine/renderCache';
import { materialize } from '../../src/program/dimensions';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import { hashPcm } from '../../src/kernel/canonical';
import { loadCanaries } from '../../src/protocol/canary';
import { repoSampleResolver } from '../../src/protocol/samples';
import { probeResolver, probeSample } from '../support/samples';
import { RENDER_BLOCK } from '../support/timeouts';
import { node } from '../support/program';

const REPO = new URL('../../../../', import.meta.url).pathname;
const PACKAGE = new URL('../../', import.meta.url).pathname;

const envelope = node('articulation.envelope', {
  attack: 0.002,
  decay: 0.08,
  sustainLevel: 0.2,
  release: 0.05,
});

/**
 * Üç katman: seri zincir + insert, modülatör dinleyen seri zincir, paralel
 * rezonatör bloğu. Aşama sayıları: a = 4, b = 4, c = 2; ayrıca bir
 * modülatör ve program kökü — ilk render 12 yazma yapar.
 */
function mixed(bFrequency = 1800, reversion = 6): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 16000,
    channels: 1,
    durationSeconds: 0.4,
    seed: 5,
    modulators: {
      wobble: { modulator: 'modulator.walk', version: 1, params: { reversion } },
    },
    layers: [
      {
        name: 'a',
        source: node('source.noise', { color: 'pink' }),
        resonators: [node('resonator.biquad', { mode: 'bandpass', frequency: 900, q: 8 })],
        articulation: envelope,
        inserts: [node('effect.saturation', { driveDb: 12 })],
      },
      {
        name: 'b',
        source: node('source.oscillator', {
          frequency: { value: 220, modulate: [{ by: 'wobble', depth: 0.02 }] },
        }),
        resonators: [
          node('resonator.biquad', { mode: 'lowpass', frequency: 4000, q: 0.7 }),
          node('resonator.biquad', { mode: 'bandpass', frequency: bFrequency, q: 4 }),
        ],
        articulation: envelope,
      },
      {
        name: 'c',
        source: node('source.noise', { color: 'white' }),
        routing: 'parallel',
        resonators: [
          node('resonator.biquad', { mode: 'bandpass', frequency: 600, q: 12 }),
          node('resonator.biquad', { mode: 'bandpass', frequency: 2400, q: 12 }),
        ],
        gainDb: -6,
      },
    ],
  };
}

const pcm = (r: { channels: Float32Array[]; sampleRate: number }) =>
  hashPcm(r.channels, r.sampleRate);

function writesDuring(cache: MemoryRenderCache, fn: () => void): number {
  const before = cache.stats.writes;
  fn();
  return cache.stats.writes - before;
}

describe('artımlı render: önbellek PCM kimliğini değiştirmez', RENDER_BLOCK, () => {
  it('bütün canary ve referans job programlarında önbellek açık, soğuk ve sıcak aynı PCM', () => {
    const samples = repoSampleResolver(REPO);
    const programs: unknown[] = loadCanaries(REPO).map((c) => materialize(c.source, [], {}));
    for (const job of ['platform-reference', 'reference-hybrid', 'reference-sampled']) {
      programs.push(JSON.parse(readFileSync(`${PACKAGE}audio-jobs/${job}/program.json`, 'utf8')));
    }
    programs.push(mixed());
    const cache = new MemoryRenderCache({ maxBytes: 1 << 30 });
    for (const program of programs) {
      const plain = pcm(renderProgram(program, { samples }));
      expect(pcm(renderProgram(program, { samples, cache }))).toBe(plain);
      expect(pcm(renderProgram(program, { samples, cache }))).toBe(plain);
    }
    expect(programs.length).toBeGreaterThanOrEqual(23);
  });

  it('katman render’ı da önbellekle aynı; döndürülen tampon önbelleği kirletmez', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    const plain = renderProgramLayers(mixed());
    const first = renderProgramLayers(mixed(), { cache });
    for (const [name, buffer] of first) {
      expect(buffer).toEqual(plain.get(name));
      buffer.fill(1);
    }
    for (const [name, buffer] of renderProgramLayers(mixed(), { cache })) {
      expect(buffer).toEqual(plain.get(name));
    }
    const root = renderProgram(mixed(), { cache });
    const expected = pcm(renderProgram(mixed()));
    root.channels[0].fill(0);
    expect(pcm(renderProgram(mixed(), { cache }))).toBe(expected);
  });
});

describe('artımlı render: yalnız bağımlı torunlar yeniden hesaplanır', RENDER_BLOCK, () => {
  it('ilk render her aşamayı yazar; aynı program yalnız kök isabetiyle döner', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    expect(writesDuring(cache, () => renderProgram(mixed(), { cache }))).toBe(12);
    const hits = cache.stats.hits;
    expect(writesDuring(cache, () => renderProgram(mixed(), { cache }))).toBe(0);
    expect(cache.stats.hits).toBe(hits + 1);
  });

  it('b katmanının ikinci rezonatörü değişince yalnız o aşama, ardılı ve kök yazılır', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    renderProgram(mixed(), { cache });
    const changed = writesDuring(cache, () => renderProgram(mixed(2600), { cache }));
    expect(changed).toBe(3);
    expect(pcm(renderProgram(mixed(2600), { cache: null }))).toBe(
      pcm(renderProgram(mixed(2600), { cache })),
    );
  });

  it('modülatör değişince yalnız onu dinleyen katman yeniden render edilir', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    renderProgram(mixed(), { cache });
    const changed = writesDuring(cache, () => renderProgram(mixed(1800, 9), { cache }));
    expect(changed).toBe(1 + 4 + 1);
    expect(pcm(renderProgram(mixed(1800, 9), { cache }))).toBe(pcm(renderProgram(mixed(1800, 9))));
  });

  it('tohum ve kalite anahtarın parçasıdır', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    renderProgram(mixed(), { cache });
    expect(writesDuring(cache, () => renderProgram(mixed(), { cache, seed: 6 }))).toBe(12);
    expect(writesDuring(cache, () => renderProgram(mixed(), { cache, quality: 'draft' }))).toBe(12);
  });

  it('önbellek doluyken de bildirimi tutmayan sample verisi aynı hatayla düşer', () => {
    const probe = probeSample(3);
    const program = {
      schema: 'AcousticProgramV1',
      sampleRate: 44100,
      channels: 1,
      durationSeconds: 0.3,
      seed: 1,
      samples: { hit: probe.decl },
      layers: [{ name: 's', source: node('source.sample', { sample: 'hit' }) }],
    };
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    const plain = pcm(renderProgram(program, { samples: probeResolver }));
    expect(pcm(renderProgram(program, { samples: probeResolver, cache }))).toBe(plain);
    const wrongLength = () => ({ channels: [new Float32Array(10)], sampleRate: 44100 });
    expect(() => renderProgram(program, { samples: wrongLength, cache })).toThrow(/uyuşmuyor/);
  });
});

describe('render kalitesi: aynı program, farklı iç aşırı örnekleme', RENDER_BLOCK, () => {
  it('taslak doygunluk içeren programı farklı ama aynı uzunlukta üretir', () => {
    const final = renderProgram(mixed());
    const draft = renderProgram(mixed(), { quality: 'draft' });
    expect(draft.channels[0].length).toBe(final.channels[0].length);
    expect(pcm(draft)).not.toBe(pcm(final));
    expect(pcm(renderProgram(mixed(), { quality: 'draft' }))).toBe(pcm(draft));
  });

  it('taslak önbellek girdisi nihai render’a sızmaz', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    renderProgram(mixed(), { cache, quality: 'draft' });
    expect(pcm(renderProgram(mixed(), { cache }))).toBe(pcm(renderProgram(mixed())));
  });
});
