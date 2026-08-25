import { describe, it, expect } from 'vitest';
import { FieldBufferPool } from '../../src/visualSynth/field/buffer';
import {
  compileField,
  createCompileContext,
  evaluateInto,
  releaseCompiled,
} from '../../src/visualSynth/field/evaluate';
import { createUnitSpace } from '../../src/visualSynth/field/space';
import { renderSprite } from '../../src/visualSynth/render';
import { compileTest } from './support';
import type { FieldNode, SpriteDoc } from '../../src/visualSynth/types';

const PALETTE = {
  colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
  ramps: [{ id: 0, indices: [0, 1, 2, 3] }],
};

function doc(source: FieldNode, size: [number, number] = [48, 48]): SpriteDoc {
  return {
    schemaVersion: 1,
    size,
    seed: 12,
    palette: PALETTE,
    layers: [{ id: 'a', source, material: 0 }],
  } as SpriteDoc;
}

describe('warp — bozma', () => {
  const BAR: FieldNode = { kind: 'sdf.box', center: [0, 0], half: [0.08, 0.9] };
  const NOISE: FieldNode = { kind: 'noise.value', freq: 4, seed: 3 };

  it('sıfır miktar kimliktir', () => {
    const warped = compileTest({ kind: 'warp', by: NOISE, amount: 0, input: BAR }, 'w');
    const plain = compileTest(BAR, 'w');
    for (const [x, y] of [
      [0.1, 0.3],
      [-0.4, -0.2],
    ]) {
      expect(warped(x, y)).toBeCloseTo(plain(x, y), 10);
    }
  });

  it('miktar arttıkça alan gerçekten KAYAR', () => {
    const warped = compileTest({ kind: 'warp', by: NOISE, amount: 0.15, input: BAR }, 'w');
    const plain = compileTest(BAR, 'w');
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * 2 - 1;
      if (Math.abs(warped(0.05, y) - plain(0.05, y)) > 0.01) moved++;
    }
    expect(moved).toBeGreaterThan(20);
  });

  it('iki eksen BAĞIMSIZ kayar — saf çapraz kayma değil', () => {
    // Aynı örnek iki eksende kullanılsaydı kayma her yerde 45° olurdu;
    // ikinci bileşen döndürülmüş örnekten geldiği için oran sabit değildir.
    const point: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.02 };
    const warped = compileTest({ kind: 'warp', by: NOISE, amount: 0.2, input: point }, 'w');
    const plain = compileTest(point, 'w');

    const ratios: number[] = [];
    for (let i = 0; i < 30; i++) {
      const x = (i / 30) * 1.6 - 0.8;
      const dx = warped(x, 0.2) - plain(x, 0.2);
      const dy = warped(x, -0.2) - plain(x, -0.2);
      if (Math.abs(dy) > 1e-6) ratios.push(dx / dy);
    }
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread).toBeGreaterThan(0.1);
  });

  it('örnekleme kipi sonucu değiştirir', () => {
    const nearest = compileTest(
      { kind: 'warp', by: NOISE, amount: 0.2, sample: 'nearest', input: BAR },
      'w',
    );
    const bilinear = compileTest(
      { kind: 'warp', by: NOISE, amount: 0.2, sample: 'bilinear', input: BAR },
      'w',
    );
    const differing = [0.1, -0.35, 0.62, -0.77].filter(
      (y) => Math.abs(nearest(0.03, y) - bilinear(0.03, y)) > 1e-9,
    );
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe('scatter — serpme (§4.2b)', () => {
  const SEED_SOURCE: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.08 };

  it('tek örnek, sapmasız: tam MERKEZE damgalanır', () => {
    const result = renderSprite(
      doc({ kind: 'scatter', source: SEED_SOURCE, count: 1, jitter: 0, seed: 1 }),
    );
    const center = 24 * 48 + 24;
    expect(result.channels.coverage[center]).toBe(1);
    expect(result.channels.coverage[0]).toBe(0);
  });

  it('sayı arttıkça kaplanan alan büyür', () => {
    const covered = (count: number): number => {
      const result = renderSprite(
        doc({ kind: 'scatter', source: SEED_SOURCE, count, jitter: 0.3, seed: 7 }),
      );
      return Array.from(result.channels.coverage).filter((value) => value > 0).length;
    };
    expect(covered(9)).toBeGreaterThan(covered(1) * 5);
  });

  it('aynı tohum aynı serpmeyi verir, farklı tohum farklı', () => {
    const render = (seed: number): number[] =>
      Array.from(
        renderSprite(doc({ kind: 'scatter', source: SEED_SOURCE, count: 6, jitter: 0.8, seed }))
          .channels.coverage,
      );

    expect(render(5)).toEqual(render(5));
    expect(render(5)).not.toEqual(render(6));
  });

  it('Poisson dağılımı deterministik kalır ve ızgaradan ayrışır', () => {
    const poisson = (seed: number): number[] =>
      Array.from(
        renderSprite(
          doc({
            kind: 'scatter',
            source: SEED_SOURCE,
            count: 12,
            seed,
            distribution: 'poisson',
            minDistance: 0.12,
          }),
        ).channels.coverage,
      );
    const grid = renderSprite(
      doc({ kind: 'scatter', source: SEED_SOURCE, count: 12, seed: 5, distribution: 'grid' }),
    ).channels.coverage;

    expect(poisson(5)).toEqual(poisson(5));
    expect(poisson(5)).not.toEqual(poisson(6));
    expect(poisson(5)).not.toEqual(Array.from(grid));
    expect(poisson(5).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('Poisson teşhisi istenen, kabul edilen ve minimum mesafeyi ayırır', () => {
    const result = renderSprite(
      doc({
        kind: 'scatter',
        source: SEED_SOURCE,
        count: 12,
        seed: 5,
        distribution: 'poisson',
        minDistance: 0.12,
      }),
    );
    const [diagnostic] = result.diagnostics.scatters;

    expect(diagnostic).toMatchObject({
      path: 'a/source',
      distribution: 'poisson',
      requestedCount: 12,
      sourceEmpty: false,
    });
    expect(diagnostic.acceptedCount).toBeGreaterThan(0);
    expect(diagnostic.acceptedCount).toBeLessThanOrEqual(diagnostic.requestedCount);
    expect(diagnostic.observedMinDistancePixels).toBeGreaterThanOrEqual(
      diagnostic.minDistancePixels!,
    );
    expect(diagnostic.attempts).toBeGreaterThanOrEqual(diagnostic.acceptedCount);
  });

  it('Poisson dağılımı döşenebilir belgede sonlu çıktı verir', () => {
    const result = renderSprite({
      ...doc({
        kind: 'scatter',
        source: SEED_SOURCE,
        count: 18,
        distribution: 'poisson',
        minDistance: 0.08,
        seed: 19,
      }),
      tileable: true,
    });
    expect(Array.from(result.channels.coverage).every((value) => Number.isFinite(value))).toBe(
      true,
    );
  });

  it('boş kaynak hiçbir şey damgalamaz', () => {
    const result = renderSprite(
      doc({ kind: 'scatter', source: { kind: 'const', value: 0 }, count: 8 }),
    );
    expect(Array.from(result.channels.coverage).every((value) => value === 0)).toBe(true);
    expect(result.diagnostics.scatters[0]).toMatchObject({
      sourceEmpty: true,
      acceptedCount: 0,
      attempts: 0,
    });
  });

  it('döşenebilir belgede kenardan taşan örnek KARŞI kenardan girer', () => {
    // Kaynak kendi tamponunda SOLDA duruyor; örnekler 2×2 ızgaraya oturunca
    // sol sütundaki iki damga tuvalin dışına taşar. Düz kipte o iki damga
    // tamamen kırpılır, sarmalı kipte sağ kenardan girer.
    const offset: FieldNode = {
      kind: 'scatter',
      source: { kind: 'sdf.circle', center: [-0.7, 0], r: 0.1 },
      count: 4,
      jitter: 0,
      seed: 2,
    };

    const covered = (result: { channels: { coverage: Float32Array } }): number =>
      Array.from(result.channels.coverage).filter((value) => value > 0).length;

    const wrapped = renderSprite({ ...doc(offset), tileable: true });
    const clamped = renderSprite(doc(offset));

    // Sarmalı kipte dört damganın dördü de görünür; düz kipte yalnızca ikisi.
    expect(covered(wrapped)).toBeCloseTo(covered(clamped) * 2, -1);

    const rightEdgeCovered = (result: { channels: { coverage: Float32Array } }): number => {
      let count = 0;
      for (let y = 0; y < 48; y++) {
        for (let x = 40; x < 48; x++) if (result.channels.coverage[y * 48 + x] > 0) count++;
      }
      return count;
    };
    expect(rightEdgeCovered(wrapped)).toBeGreaterThan(0);
    expect(rightEdgeCovered(clamped)).toBe(0);
  });

  it('ölçek sapması sıfır ya da negatife düşen örneği ATLAR', () => {
    // scaleJitter 1 iken bazı örnekler sıfır/negatif ölçek çeker; bunlar
    // sessizce atlanmalı, NaN üretmemeli.
    const result = renderSprite(
      doc({ kind: 'scatter', source: SEED_SOURCE, count: 12, scaleJitter: 0.9, seed: 4 }),
    );
    expect(Array.from(result.channels.coverage).every((value) => Number.isFinite(value))).toBe(
      true,
    );
  });
});

describe('tamponlu düğüm ömrü (D7)', () => {
  it('derleme tampon tutar, releaseCompiled iade eder', () => {
    const space = createUnitSpace(32, 32);
    const pool = new FieldBufferPool();
    const context = createCompileContext(space, pool, 1, false, false);

    compileField(
      { kind: 'blur', radius: 0.05, input: { kind: 'noise.value', freq: 4 } },
      'x',
      context,
    );
    expect(context.acquired.length).toBe(1);

    const held = context.acquired[0];
    releaseCompiled(context);
    expect(context.acquired.length).toBe(0);
    // İade edilen tampon havuzdan geri gelmeli.
    expect(pool.acquire(32, 32)).toBe(held);
  });

  it('zincirlenmiş filtreler tampon SAYISINI sınırlı tutar', () => {
    const space = createUnitSpace(24, 24);
    const pool = new FieldBufferPool();
    const context = createCompileContext(space, pool, 1, false, false);

    compileField(
      {
        kind: 'blur',
        radius: 0.05,
        input: {
          kind: 'dilate',
          radius: 0.05,
          input: { kind: 'erode', radius: 0.05, input: { kind: 'noise.value', freq: 3 } },
        },
      },
      'x',
      context,
    );

    // Üç filtre, üç tampon — ara sonuçlar birikmiyor.
    expect(context.acquired.length).toBe(3);
    releaseCompiled(context);
  });

  it('çok katmanlı belge havuzu ŞİŞİRMEZ', () => {
    const pool = new FieldBufferPool();
    const layered: SpriteDoc = {
      schemaVersion: 1,
      size: [32, 32],
      seed: 3,
      palette: PALETTE,
      layers: [0, 1, 2, 3].map((index) => ({
        id: `k${index}`,
        source: {
          kind: 'blur',
          radius: 0.04,
          input: { kind: 'sdf.circle', center: [0, 0], r: 0.3 + index * 0.1 },
        },
        material: 0,
      })),
    } as SpriteDoc;

    renderSprite(layered, { pool });
    // Tek boyut, ve katmanlar tamponlarını iade ettiği için ikinci render
    // yeni tahsis yapmadan koşabilmeli.
    expect(pool.sizeCount).toBe(1);
    const before = pool.acquire(32, 32);
    pool.release(before);
    renderSprite(layered, { pool });
    expect(pool.sizeCount).toBe(1);
  });

  it('evaluateInto tamponu hedef çözünürlükte doldurur', () => {
    const space = createUnitSpace(8, 4);
    const pool = new FieldBufferPool();
    const buffer = pool.acquire(8, 4);
    evaluateInto(buffer, (x) => x, space);

    expect(buffer.data.length).toBe(32);
    // İlk ve son sütun birim uzayın uçlarına karşılık gelir.
    expect(buffer.data[0]).toBeCloseTo(space.unitX(0), 10);
    expect(buffer.data[7]).toBeCloseTo(space.unitX(7), 10);
  });
});
