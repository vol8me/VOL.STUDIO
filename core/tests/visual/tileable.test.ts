import { describe, it, expect } from 'vitest';
import { renderSprite } from '../../src/visual/render';
import { measureSprite } from '../../src/visual/qa';
import { collectSpriteDocIssues } from '../../src/visual/validate';
import { createLattice } from '../../src/visual/field/lattice';
import { createUnitSpace } from '../../src/visual/field/space';
import { compileTest } from './support';
import type { FieldNode, SpriteDoc } from '../../src/visual/types';

const PALETTE = {
  colors: ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'],
  ramps: [{ id: 0, indices: [0, 1, 2, 3, 4] }],
};

function tileableDoc(height: FieldNode, size: [number, number] = [64, 64]): SpriteDoc {
  return {
    schemaVersion: 1,
    size,
    seed: 77,
    tileable: true,
    palette: PALETTE,
    layers: [{ id: 'z', source: { kind: 'const', value: 1 }, height, material: 0 }],
  } as SpriteDoc;
}

const seamMetric = (doc: SpriteDoc) =>
  measureSprite(renderSprite(doc)).metrics.find((metric) => metric.id === 'seamDelta')!;

describe('kafes periyodu (§5.2)', () => {
  it('serbest kipte periyot yoktur', () => {
    const lattice = createLattice(createUnitSpace(64, 64), 6, false);
    expect(lattice.periodX).toBe(0);
    expect(lattice.wrapX(-3)).toBe(-3);
  });

  it('kare çıktıda iki eksende de freq kadar hücre olur', () => {
    const lattice = createLattice(createUnitSpace(64, 64), 6, true);
    expect(lattice.periodX).toBe(6);
    expect(lattice.periodY).toBe(6);
    expect(lattice.wrapX(-1)).toBe(5);
    expect(lattice.wrapY(7)).toBe(1);
  });

  it('dikdörtgen çıktıda periyot en-boy oranını İZLER', () => {
    // Aksi hâlde hücreler uzun eksende esnerdi.
    const lattice = createLattice(createUnitSpace(96, 48), 4, true);
    expect(lattice.periodY).toBe(4);
    expect(lattice.periodX).toBe(8);
  });
});

describe('gürültü döşenebilirliği', () => {
  it.each([
    ['noise.value', { kind: 'noise.value', freq: 4, seed: 3 }],
    ['noise.worley', { kind: 'noise.worley', freq: 4, mode: 'F2-F1', seed: 3 }],
  ] as Array<[string, FieldNode]>)('%s karşı kenarlarda ÖRTÜŞÜR', (_label, node) => {
    const field = compileTest(node, 't', { tileable: true });
    // Birim uzay kare çıktıda [-1, 1]; periyot tam olarak bu aralıktır.
    for (const t of [0, 0.13, 0.47, 0.9, 1.6]) {
      expect(field(-1 + t, 0.3)).toBeCloseTo(field(1 + t, 0.3), 10);
      expect(field(0.2, -1 + t)).toBeCloseTo(field(0.2, 1 + t), 10);
    }
  });

  it('serbest kipte örtüşme YOKTUR — döşemenin gerçekten yapıldığını gösterir', () => {
    const field = compileTest({ kind: 'noise.value', freq: 4, seed: 3 }, 't');
    const differing = [0.13, 0.47, 0.9].filter(
      (t) => Math.abs(field(-1 + t, 0.3) - field(1 + t, 0.3)) > 0.01,
    );
    expect(differing.length).toBeGreaterThan(1);
  });

  it('fbm tam sayı lacunarity ile periyodu KORUR', () => {
    const node: FieldNode = {
      kind: 'noise.fbm',
      base: { kind: 'noise.value', freq: 3, seed: 8 },
      octaves: 3,
      lacunarity: 2,
    };
    const field = compileTest(node, 't', { tileable: true });
    for (const t of [0.2, 0.66, 1.4]) {
      expect(field(-1 + t, -0.4)).toBeCloseTo(field(1 + t, -0.4), 10);
    }
  });
});

describe('uçtan uca döşeme', () => {
  it('döşenebilir gürültü dikiş metriğini GEÇER', () => {
    const metric = seamMetric(tileableDoc({ kind: 'noise.value', freq: 6 }));
    expect(metric.pass).toBe(true);
    expect(metric.value).toBeLessThan(1);
  });

  it('sarmalı filtre dikişi bozmaz', () => {
    const metric = seamMetric(
      tileableDoc({ kind: 'blur', radius: 0.08, input: { kind: 'noise.value', freq: 6 } }),
    );
    expect(metric.pass).toBe(true);
  });

  it('döşenmeyen bir alan dikiş metriğini KIRAR', () => {
    // Yatay gradyan sol kenarda 0, sağ kenarda 1'dir: döşendiğinde her
    // hücre sınırında tam kontrast bir çizgi oluşur.
    const metric = seamMetric(tileableDoc({ kind: 'gradient.linear', angle: 0, from: -1, to: 1 }));
    expect(metric.pass).toBe(false);
    expect(metric.value).toBeGreaterThan(10);
  });

  it('dikdörtgen çıktı da dikişsiz olabilir', () => {
    const metric = seamMetric(tileableDoc({ kind: 'noise.worley', freq: 4, mode: 'F1' }, [96, 48]));
    expect(metric.pass).toBe(true);
  });

  it('dikiş metriği yalnızca tileable belgelerde ölçülür', () => {
    const plain: SpriteDoc = { ...tileableDoc({ kind: 'noise.value', freq: 6 }), tileable: false };
    const ids = measureSprite(renderSprite(plain)).metrics.map((metric) => metric.id);
    expect(ids).not.toContain('seamDelta');
  });

  it('döşenebilir belge de BİT DÜZEYİNDE deterministiktir', () => {
    const doc = tileableDoc({ kind: 'noise.worley', freq: 5, mode: 'F2-F1' });
    const first = renderSprite(doc);
    const second = renderSprite(doc);
    expect(Array.from(second.rgba)).toEqual(Array.from(first.rgba));
  });
});

describe('döşeme kuralları sınırda uygulanır (§5.2)', () => {
  function docWith(source: FieldNode, tileable: boolean): unknown {
    return {
      schemaVersion: 1,
      size: [32, 32],
      seed: 1,
      tileable,
      palette: PALETTE,
      layers: [{ id: 'a', source, material: 0 }],
    };
  }

  it('simplex döşenebilir belgede REDDEDİLİR, serbest belgede kabul edilir', () => {
    const source: FieldNode = { kind: 'noise.simplex', freq: 4 };
    const issues = collectSpriteDocIssues(docWith(source, true));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/EĞİK/);
    expect(collectSpriteDocIssues(docWith(source, false))).toEqual([]);
  });

  it('kesirli freq döşenebilir belgede reddedilir', () => {
    const source: FieldNode = { kind: 'noise.value', freq: 4.5 };
    expect(collectSpriteDocIssues(docWith(source, true))[0]).toMatch(/tam sayı/);
    expect(collectSpriteDocIssues(docWith(source, false))).toEqual([]);
  });

  it('kesirli lacunarity döşenebilir belgede reddedilir', () => {
    const source: FieldNode = {
      kind: 'noise.fbm',
      base: { kind: 'noise.value', freq: 4 },
      octaves: 2,
      lacunarity: 1.7,
    };
    expect(collectSpriteDocIssues(docWith(source, true))[0]).toMatch(/periyodu bozar/);
    expect(collectSpriteDocIssues(docWith(source, false))).toEqual([]);
  });

  it('kesirli repeat count döşenebilir belgede reddedilir', () => {
    const source: FieldNode = {
      kind: 'repeat',
      count: 2.5,
      input: { kind: 'sdf.circle', r: 0.2 },
    };
    expect(collectSpriteDocIssues(docWith(source, true))[0]).toMatch(/tam sayı/);
  });

  it('kural katmanın domain zincirinde de uygulanır', () => {
    const doc = {
      schemaVersion: 1,
      size: [32, 32],
      seed: 1,
      tileable: true,
      palette: PALETTE,
      layers: [
        {
          id: 'a',
          source: { kind: 'sdf.circle', r: 0.2 },
          domain: [{ kind: 'repeat', count: 3.5 }],
          material: 0,
        },
      ],
    };
    expect(collectSpriteDocIssues(doc)[0]).toMatch(/domain\[0\].count.*tam sayı/);
  });
});
