import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { RenderBudgetError } from '../../src/guard/budget';
import {
  MAX_EVENTS,
  scheduleEvents,
  type ScheduleOptions,
} from '../../src/program/primitives/events';
import { substream } from '../../src/program/random';
import { renderProgram, renderProgramLayers } from '../../src/program/render';

const RATE = 16000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 77 + 131 * i);

function schedule(overrides: Partial<ScheduleOptions>, seed = 1) {
  return scheduleEvents(
    {
      rate: 20,
      regularity: 0,
      clustering: 0,
      sizeSpread: 0.3,
      levelSpread: 6,
      frames: 4 * RATE,
      sampleRate: RATE,
      ...overrides,
    },
    substream(seed, 'timing'),
    substream(seed, 'variation'),
  );
}

describe('mikro-olay zamanlaması', () => {
  it('aynı tohum birebir aynı çizelge; farklı tohum farklı', () => {
    expect(schedule({}, 5)).toEqual(schedule({}, 5));
    expect(schedule({}, 5)).not.toEqual(schedule({}, 6));
  });

  it('oran arttıkça ölçülen yoğunluk monoton artar ve λ = oran·süre etrafında kalır', () => {
    const rates = [2, 8, 32, 128, 512];
    const means = rates.map((rate) => {
      const counts = SEEDS.map((seed) => schedule({ rate }, seed).length);
      const mean = counts.reduce((a, b) => a + b) / counts.length;
      const lambda = rate * 4;
      expect(Math.abs(mean - lambda)).toBeLessThan(4 * Math.sqrt(lambda / SEEDS.length) + 0.5);
      return mean;
    });
    expect(means.every((m, i) => i === 0 || m > means[i - 1])).toBe(true);
  });

  it('Poisson dağılımı: sayım varyansı ≈ ortalama; periyodik: varyans ≈ 0', () => {
    const variance = (regularity: number) => {
      const counts = SEEDS.map((seed) => schedule({ rate: 25, regularity }, seed).length);
      const mean = counts.reduce((a, b) => a + b) / counts.length;
      return counts.reduce((a, v) => a + (v - mean) ** 2, 0) / counts.length / mean;
    };
    expect(variance(0)).toBeGreaterThan(0.4);
    expect(variance(0)).toBeLessThan(1.8);
    expect(variance(1)).toBeLessThan(0.05);
  });

  it('kenarlar: sıfır oran olay yok; çok kısa sürede olay tampon dışına taşmaz', () => {
    expect(schedule({ rate: 0 })).toEqual([]);
    const tiny = schedule({ rate: 1000, frames: 8 });
    expect(tiny.every((e) => e.frame < 8)).toBe(true);
    const clustered = schedule({ rate: 30, clustering: 1, frames: RATE / 10 });
    expect(clustered.every((e) => e.frame < RATE / 10)).toBe(true);
  });

  it('zamanla değişen oran: olaylar oranın yüksek olduğu yarıda toplanır', () => {
    const ramp = Float32Array.from({ length: 4 * RATE }, (_, i) => (i < 2 * RATE ? 5 : 200));
    const events = schedule({ rate: ramp });
    const late = events.filter((e) => e.frame >= 2 * RATE).length;
    expect(late / events.length).toBeGreaterThan(0.9);
  });

  it('yüksek oran ve kümeleme olay sayısını MAX_EVENTS ile sınırlar', () => {
    const flood = schedule({ rate: 2000, clustering: 1, frames: 60 * RATE });
    expect(flood.length).toBe(MAX_EVENTS);
  });

  it('kümeleme olay sayısını artırır, seviye sapması tanımlı aralıkta kalır', () => {
    const plain = schedule({ rate: 10 }).length;
    const clustered = schedule({ rate: 10, clustering: 0.5 });
    expect(clustered.length).toBeGreaterThan(2 * plain);
    expect(clustered.every((e) => e.gain <= 1 && e.gain >= Math.pow(10, -6 / 20))).toBe(true);
  });
});

describe('mikro-olay kaynağı programda', () => {
  const program = (event: string, rate: number, seconds = 1) => ({
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: seconds,
    seed: 3,
    layers: [
      {
        name: 'grains',
        source: { primitive: 'source.micro-events', version: 1, params: { event, rate } },
      },
    ],
    master: { normalize: 'none' },
  });

  it('üç tanecik türü farklı spektral bölgelerde; sıfır oran sessiz', () => {
    const energy = (x: Float32Array) => x.reduce((a, v) => a + v * v, 0);
    const centroids = ['click', 'droplet', 'pop'].map((event) => {
      const x = renderProgramLayers(program(event, 40)).get('grains') as Float32Array;
      expect(energy(x), event).toBeGreaterThan(0);
      return analyzeAudio([x], 48000, 'source-pcm').spectral.centroidHz ?? 0;
    });
    expect(centroids[0]).toBeGreaterThan(centroids[1]);
    expect(centroids[1]).toBeGreaterThan(centroids[2]);
    expect(energy(renderProgramLayers(program('click', 0)).get('grains') as Float32Array)).toBe(0);
  });

  it('bütçe: 2000/sn × 600 sn damla nüfusu render edilmeden reddedilir', () => {
    expect(() => renderProgram(program('droplet', 2000, 600))).toThrow(RenderBudgetError);
  });
});
