import { describe, it, expect } from 'vitest';
import { compileTest } from './support';
import { applyDomainChain } from '../src/field/evaluate';
import type { DomainOp, FieldNode } from '../src/types';

const DOT: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.1 };
const at = (node: FieldNode, x: number, y: number): number => compileTest(node)(x, y);

describe('skew — ters eşleme matrisin tersidir', () => {
  it('yatay kesme şekli y ile orantılı kaydırır', () => {
    const node: FieldNode = {
      kind: 'skew',
      x: 0.5,
      y: 0,
      input: { kind: 'sdf.circle', center: [0, 0.5], r: 0.05 },
    };
    // Kaynak (0, 0.5)'te; kesme onu x = 0.5·0.5 = 0.25'e taşır.
    expect(at(node, 0.25, 0.5)).toBeCloseTo(-0.05, 10);
    expect(at(node, 0, 0.5)).toBeGreaterThan(0);
  });

  it('dikey kesme x ile orantılı kaydırır', () => {
    const node: FieldNode = {
      kind: 'skew',
      x: 0,
      y: 0.5,
      input: { kind: 'sdf.circle', center: [0.5, 0], r: 0.05 },
    };
    expect(at(node, 0.5, 0.25)).toBeCloseTo(-0.05, 10);
  });

  it('sıfır kesme kimliktir', () => {
    const node: FieldNode = { kind: 'skew', x: 0, y: 0, input: DOT };
    expect(at(node, 0, 0)).toBeCloseTo(-0.1, 10);
  });
});

describe('mirror — simetri katlaması', () => {
  const OFFSET: FieldNode = { kind: 'sdf.circle', center: [0.5, 0], r: 0.1 };

  it('x ekseninde katlama sol-sağ simetri verir', () => {
    const node: FieldNode = { kind: 'mirror', axis: 'x', input: OFFSET };
    expect(at(node, 0.5, 0)).toBeCloseTo(-0.1, 10);
    expect(at(node, -0.5, 0)).toBeCloseTo(-0.1, 10);
  });

  it('y ekseninde katlama üst-alt simetri verir', () => {
    const node: FieldNode = {
      kind: 'mirror',
      axis: 'y',
      input: { kind: 'sdf.circle', center: [0, 0.5], r: 0.1 },
    };
    expect(at(node, 0, -0.5)).toBeCloseTo(-0.1, 10);
  });

  it('quad dört çeyreği birden katlar', () => {
    const node: FieldNode = {
      kind: 'mirror',
      axis: 'quad',
      input: { kind: 'sdf.circle', center: [0.5, 0.5], r: 0.1 },
    };
    for (const [x, y] of [
      [0.5, 0.5],
      [-0.5, 0.5],
      [0.5, -0.5],
      [-0.5, -0.5],
    ]) {
      expect(at(node, x, y)).toBeCloseTo(-0.1, 10);
    }
  });

  it('radial n kollu simetri üretir', () => {
    const node: FieldNode = { kind: 'mirror', axis: 'radial', count: 4, input: OFFSET };
    // Kaynak 0°'de; dört kollu simetri onu 90°, 180°, 270°'de de gösterir.
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      expect(at(node, 0.5 * Math.cos(angle), 0.5 * Math.sin(angle))).toBeCloseTo(-0.1, 6);
    }
    // Kollar ARASI boş kalmalı.
    const between = Math.PI / 4;
    expect(at(node, 0.5 * Math.cos(between), 0.5 * Math.sin(between))).toBeGreaterThan(0);
  });

  it('radial kol sayısı varsayılanı altıdır', () => {
    const node: FieldNode = { kind: 'mirror', axis: 'radial', input: OFFSET };
    const sixth = (Math.PI * 2) / 6;
    expect(at(node, 0.5 * Math.cos(sixth), 0.5 * Math.sin(sixth))).toBeCloseTo(-0.1, 6);
  });
});

describe('repeat — döşeme', () => {
  it('tile modu hücreleri aynen tekrarlar', () => {
    const node: FieldNode = { kind: 'repeat', count: 4, input: DOT };
    // Hücre boyu 2/4 = 0.5; kaynak her hücre merkezinde görünür.
    expect(at(node, 0, 0)).toBeCloseTo(-0.1, 10);
    expect(at(node, 0.5, 0)).toBeCloseTo(-0.1, 10);
    expect(at(node, -1, 0.5)).toBeCloseTo(-0.1, 10);
  });

  it('mirror modu komşu hücreyi YANSITIR', () => {
    const gradient: FieldNode = { kind: 'gradient.linear', angle: 0, from: -0.25, to: 0.25 };
    const tile = compileTest({ kind: 'repeat', count: 4, mode: 'tile', input: gradient });
    const mirrored = compileTest({ kind: 'repeat', count: 4, mode: 'mirror', input: gradient });

    // Sıfırıncı hücrede ikisi aynı…
    expect(mirrored(0.1, 0)).toBeCloseTo(tile(0.1, 0), 10);
    // …birinci hücrede yansıma ayrışır.
    expect(Math.abs(mirrored(0.6, 0) - tile(0.6, 0))).toBeGreaterThan(0.3);
  });

  it('mirror modu hücre sınırında SÜREKLİdir — dikişi gizlemesinin sebebi', () => {
    const gradient: FieldNode = { kind: 'gradient.linear', angle: 0, from: -0.25, to: 0.25 };
    const mirrored = compileTest({ kind: 'repeat', count: 4, mode: 'mirror', input: gradient });
    const epsilon = 1e-6;
    expect(mirrored(0.25 - epsilon, 0)).toBeCloseTo(mirrored(0.25 + epsilon, 0), 4);
  });
});

describe('polar — halka ve ışın', () => {
  it('ileri yönde x AÇIYA, y YARIÇAPA karşılık gelir', () => {
    const node: FieldNode = {
      kind: 'polar',
      input: { kind: 'gradient.linear', angle: 90, from: 0, to: 1 },
    };
    // Yarıçap 0.5'te değer 0.5; açı ne olursa olsun aynı → HALKA.
    expect(at(node, 0.5, 0)).toBeCloseTo(0.5, 6);
    expect(at(node, 0, 0.5)).toBeCloseTo(0.5, 6);
    expect(at(node, -0.5, 0)).toBeCloseTo(0.5, 6);
    expect(at(node, 1, 0)).toBeCloseTo(1, 6);
  });

  it('ters yön ileri yönü GERİ ALIR', () => {
    const source: FieldNode = { kind: 'sdf.circle', center: [0.4, 0.2], r: 0.15 };
    const round = compileTest({
      kind: 'polar',
      input: { kind: 'polar', inverse: true, input: source },
    });
    const direct = compileTest(source);
    for (const [x, y] of [
      [0.4, 0.2],
      [-0.3, 0.6],
      [0.7, -0.1],
    ]) {
      expect(round(x, y)).toBeCloseTo(direct(x, y), 6);
    }
  });
});

describe('domain zinciri yeni işlemleri de taşır', () => {
  it('zincir ve iç içe yazım aynı sonucu verir', () => {
    const source: FieldNode = { kind: 'sdf.circle', center: [0.5, 0], r: 0.1 };
    const chain: DomainOp[] = [
      { kind: 'mirror', axis: 'x' },
      { kind: 'repeat', count: 2 },
      { kind: 'skew', x: 0.2, y: 0 },
    ];

    const viaChain = applyDomainChain(compileTest(source, 's'), chain);
    const viaNesting = compileTest(
      {
        kind: 'skew',
        x: 0.2,
        y: 0,
        input: {
          kind: 'repeat',
          count: 2,
          input: { kind: 'mirror', axis: 'x', input: source },
        },
      },
      's',
    );

    for (const [x, y] of [
      [0.3, 0.1],
      [-0.7, 0.4],
      [0.9, -0.6],
    ]) {
      expect(viaChain(x, y)).toBeCloseTo(viaNesting(x, y), 10);
    }
  });
});
