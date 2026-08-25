import { describe, it, expect } from 'vitest';
import { compileTest } from './support';
import type { FieldNode } from '../../src/visualSynth/types';

const at = (node: FieldNode, x: number, y: number): number => compileTest(node)(x, y);

/** Bir alanı ızgarada tarayıp aralık ve değişkenlik ölçer. */
function sampleGrid(node: FieldNode, steps = 24): { min: number; max: number; distinct: number } {
  const field = compileTest(node);
  let min = Infinity;
  let max = -Infinity;
  const seen = new Set<number>();
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const value = field((i / steps) * 2 - 1, (j / steps) * 2 - 1);
      min = Math.min(min, value);
      max = Math.max(max, value);
      seen.add(Math.round(value * 1000));
    }
  }
  return { min, max, distinct: seen.size };
}

describe('gradyanlar', () => {
  it('gradient.angular bir tam turda 0→1 gider', () => {
    const node: FieldNode = { kind: 'gradient.angular', center: [0, 0] };
    expect(at(node, 1, 0)).toBeCloseTo(0, 6);
    // +y aşağı olduğu için pozitif açı saat yönündedir: (0,1) çeyrek turdur.
    expect(at(node, 0, 1)).toBeCloseTo(0.25, 6);
    expect(at(node, -1, 0)).toBeCloseTo(0.5, 6);
    expect(at(node, 0, -1)).toBeCloseTo(0.75, 6);
  });

  it('gradient.angular offset başlangıcı kaydırır', () => {
    const node: FieldNode = { kind: 'gradient.angular', offset: 90 };
    expect(at(node, 0, 1)).toBeCloseTo(0, 6);
  });

  it('gradient.diamond MANHATTAN uzaklığı kullanır', () => {
    const node: FieldNode = { kind: 'gradient.diamond', size: 1 };
    expect(at(node, 0, 0)).toBeCloseTo(1, 6);
    expect(at(node, 1, 0)).toBeCloseTo(0, 6);
    // Öklid olsaydı (0.5, 0.5) hâlâ içeride kalırdı; Manhattan'da tam sınırda.
    expect(at(node, 0.5, 0.5)).toBeCloseTo(0, 6);
    expect(at(node, 0.25, 0.25)).toBeCloseTo(0.5, 6);
  });
});

describe('gürültü', () => {
  it.each(['noise.value', 'noise.simplex'] as const)('%s birim aralıkta kalır', (kind) => {
    const stats = sampleGrid({ kind, freq: 7, seed: 3 } as FieldNode, 32);
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeLessThanOrEqual(1);
    expect(stats.distinct).toBeGreaterThan(100);
  });

  it('simplex değer gürültüsünden FARKLI bir alan üretir', () => {
    const value = compileTest({ kind: 'noise.value', freq: 6, seed: 11 });
    const simplex = compileTest({ kind: 'noise.simplex', freq: 6, seed: 11 });
    const differing = [0.1, -0.3, 0.55, -0.72, 0.9].filter(
      (x) => Math.abs(value(x, x) - simplex(x, x)) > 0.01,
    );
    expect(differing.length).toBeGreaterThan(3);
  });

  it('worley F1 ≤ F2 ve F2-F1 hücre KENARINDA yükselir', () => {
    const f1 = compileTest({ kind: 'noise.worley', freq: 5, mode: 'F1', seed: 8 });
    const f2 = compileTest({ kind: 'noise.worley', freq: 5, mode: 'F2', seed: 8 });
    const edge = compileTest({ kind: 'noise.worley', freq: 5, mode: 'F2-F1', seed: 8 });

    let maxEdge = 0;
    let minEdge = 1;
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * 2 - 1;
      for (let j = 0; j < 40; j++) {
        const y = (j / 40) * 2 - 1;
        expect(f1(x, y)).toBeLessThanOrEqual(f2(x, y) + 1e-9);
        maxEdge = Math.max(maxEdge, edge(x, y));
        minEdge = Math.min(minEdge, edge(x, y));
      }
    }
    // Hücre içinde sıfıra yakın, kenarda belirgin: aradaki fark gerçek olmalı.
    expect(minEdge).toBeLessThan(0.05);
    expect(maxEdge).toBeGreaterThan(0.4);
  });

  it('worley varsayılan modu F1', () => {
    const explicit = compileTest({ kind: 'noise.worley', freq: 4, mode: 'F1', seed: 2 });
    const implicit = compileTest({ kind: 'noise.worley', freq: 4, seed: 2 });
    expect(implicit(0.3, -0.2)).toBe(explicit(0.3, -0.2));
  });

  it('fbm oktav sayısı arttıkça İNCE DETAY ekler ama aralığı korur', () => {
    // Detayın ölçüsü ne ayrık değer sayısı ne de yerel eğimdir: fbm
    // (gain 0.5, lacunarity 2) her oktavda AYNI eğim katkısını yapar ve
    // normalizasyon bunu geri alır, yani iki ölçü de yanıltır. Ölçek
    // bağımsız doğru ölçü YEREL UÇ SAYISIdır: her oktav kendi ölçeğinde
    // yeni tepe ve çukur ekler ve bunu hiçbir normalizasyon geri almaz.
    const base: FieldNode = { kind: 'noise.value', freq: 3, seed: 5 };
    const extrema = (octaves: number): number => {
      const field = compileTest({ kind: 'noise.fbm', base, octaves });
      const samples = 512;
      let previous = field(-1, 0.13);
      let current = field(-1 + 2 / samples, 0.13);
      let count = 0;
      for (let i = 2; i <= samples; i++) {
        const next = field(-1 + (2 * i) / samples, 0.13);
        if ((current - previous) * (next - current) < 0) count++;
        previous = current;
        current = next;
      }
      return count;
    };

    const one = sampleGrid({ kind: 'noise.fbm', base, octaves: 1 }, 32);
    const four = sampleGrid({ kind: 'noise.fbm', base, octaves: 4 }, 32);
    expect(one.min).toBeGreaterThanOrEqual(0);
    expect(four.min).toBeGreaterThanOrEqual(0);
    expect(four.max).toBeLessThanOrEqual(1);

    expect(extrema(4)).toBeGreaterThan(extrema(1) * 2);
  });

  it('fbm tek oktavda tabanın KENDİSİDİR', () => {
    // Normalizasyon ağırlığı tek oktavda 1'dir; sarmalayıcı değer katmaz.
    const base: FieldNode = { kind: 'noise.value', freq: 4, seed: 9 };
    const direct = compileTest(base);
    const wrapped = compileTest({ kind: 'noise.fbm', base, octaves: 1 });
    for (const [x, y] of [
      [0.2, 0.4],
      [-0.6, 0.1],
    ]) {
      expect(wrapped(x, y)).toBeCloseTo(direct(x, y), 12);
    }
  });

  it('fbm oktavlar arasında DÖNDÜRME uygular (§5.1)', () => {
    // Döndürme kapalı olsaydı (döşenebilir kip) aynı belge farklı çıkardı;
    // ikisinin ayrışması döndürmenin gerçekten uygulandığını gösterir.
    const base: FieldNode = { kind: 'noise.value', freq: 4, seed: 6 };
    const node: FieldNode = { kind: 'noise.fbm', base, octaves: 3 };
    const rotated = compileTest(node);
    const straight = compileTest(node, 'test', { tileable: true });
    expect(Math.abs(rotated(0.31, -0.22) - straight(0.31, -0.22))).toBeGreaterThan(0.001);
  });
});

describe('işaretli mesafe alanları', () => {
  it('sdf.roundBox köşeyi yuvarlar, kenarı korur', () => {
    const node: FieldNode = { kind: 'sdf.roundBox', half: [0.5, 0.5], r: 0.1 };
    // Kenar ortasında sınır hâlâ 0.5'te.
    expect(at(node, 0.5, 0)).toBeCloseTo(0, 10);
    // Keskin köşe DIŞARIDA kalır: yuvarlama içeri çeker.
    expect(at(node, 0.5, 0.5)).toBeGreaterThan(0);
    expect(at(node, 0, 0)).toBeCloseTo(-0.5, 10);
  });

  it('sdf.polygon apotem kadar içerir, çevrel yarıçapta köşe verir', () => {
    const node: FieldNode = { kind: 'sdf.polygon', n: 6, r: 1 };
    const apothem = Math.cos(Math.PI / 6);
    expect(at(node, 0, 0)).toBeCloseTo(-apothem, 10);
    // Köşe yönünde (0°) sınır çevrel yarıçaptadır.
    expect(at(node, 1, 0)).toBeCloseTo(0, 10);
    // Kenar ortası yönünde (30°) sınır apotemdedir.
    const mid = Math.PI / 6;
    expect(at(node, apothem * Math.cos(mid), apothem * Math.sin(mid))).toBeCloseTo(0, 10);
  });

  it('sdf.polygon rotation köşeleri döndürür', () => {
    const node: FieldNode = { kind: 'sdf.polygon', n: 4, r: 1, rotation: 45 };
    const corner = Math.SQRT1_2;
    expect(at(node, corner, corner)).toBeCloseTo(0, 6);
  });

  it('sdf.star dış köşede sınırda, iç köşede sınırda, arada içeride', () => {
    const node: FieldNode = { kind: 'sdf.star', n: 5, rOuter: 1, rInner: 0.4 };
    expect(at(node, 1, 0)).toBeCloseTo(0, 10);
    expect(at(node, 0, 0)).toBeLessThan(0);
    // İki uç arasındaki oyuk: dış yarıçapta ama uç yönünde değil → dışarıda.
    const between = (Math.PI * 2) / 5 / 2;
    expect(at(node, Math.cos(between), Math.sin(between))).toBeGreaterThan(0);
  });

  it('sdf.line uçları DÜZ, sdf.capsule uçları YUVARLAKtır', () => {
    const line: FieldNode = { kind: 'sdf.line', a: [-0.5, 0], b: [0.5, 0], thickness: 0.2 };
    const capsule: FieldNode = { kind: 'sdf.capsule', a: [-0.5, 0], b: [0.5, 0], r: 0.1 };

    // Aynı kalınlık: yanal sınır ikisinde de aynı.
    expect(at(line, 0, 0.1)).toBeCloseTo(0, 10);
    expect(at(capsule, 0, 0.1)).toBeCloseTo(0, 10);
    // Uçta ayrışırlar: çizgi 0.5'te biter, kapsül 0.6'ya uzanır.
    expect(at(line, 0.5, 0)).toBeCloseTo(0, 10);
    expect(at(capsule, 0.6, 0)).toBeCloseTo(0, 10);
    expect(at(line, 0.55, 0)).toBeGreaterThan(0);
    expect(at(capsule, 0.55, 0)).toBeLessThan(0);
  });

  it('sdf.arc yalnızca dilim İÇİNDE halka verir', () => {
    const node: FieldNode = { kind: 'sdf.arc', r: 0.5, thickness: 0.1, from: 0, to: 180 };
    // Dilim içi (+y aşağı olduğu için 90° aşağıdır).
    expect(at(node, 0, 0.5)).toBeCloseTo(-0.05, 10);
    // Dilim dışı: en yakın uç kapağına uzaklık.
    expect(at(node, 0, -0.5)).toBeGreaterThan(0);
    // Halka içi boşluk.
    expect(at(node, 0, 0.2)).toBeGreaterThan(0);
  });

  it('sdf.path ardışık noktaları yuvarlak capsule ile bağlar', () => {
    const node: FieldNode = {
      kind: 'sdf.path',
      points: [
        [-0.5, 0],
        [0, 0.35],
        [0.5, 0],
      ],
      r: 0.1,
    };

    expect(at(node, 0, 0.35)).toBeCloseTo(-0.1, 10);
    expect(at(node, 0, 0.52)).toBeGreaterThan(0);
    // İlk segment ile ikinci segmentin birleşiminde boşluk bırakmaz.
    expect(at(node, -0.02, 0.33)).toBeLessThan(0);
  });

  it('sdf.path closed son noktayı ilk noktaya bağlar', () => {
    const open: FieldNode = {
      kind: 'sdf.path',
      points: [
        [-0.4, -0.4],
        [0.4, -0.4],
        [0.4, 0.4],
      ],
      r: 0.05,
    };
    const closed: FieldNode = { ...open, closed: true };

    expect(at(open, 0, 0)).toBeGreaterThan(0);
    expect(at(closed, 0, 0)).toBeCloseTo(-0.05, 10);
  });

  it('dejenere doğru/kapsül NaN üretmez', () => {
    const line: FieldNode = { kind: 'sdf.line', a: [0, 0], b: [0, 0], thickness: 0.2 };
    const capsule: FieldNode = { kind: 'sdf.capsule', a: [0, 0], b: [0, 0], r: 0.2 };
    expect(Number.isFinite(at(line, 0.3, 0.3))).toBe(true);
    expect(at(capsule, 0, 0)).toBeCloseTo(-0.2, 10);
  });
});

describe('desenler', () => {
  it('pattern.checker komşu kareleri ters çevirir', () => {
    const node: FieldNode = { kind: 'pattern.checker', size: 0.25 };
    expect(at(node, 0.1, 0.1)).toBe(1);
    expect(at(node, 0.3, 0.1)).toBe(0);
    expect(at(node, 0.3, 0.3)).toBe(1);
  });

  it('pattern.stripes duty oranını uygular', () => {
    const thin: FieldNode = { kind: 'pattern.stripes', freq: 4, duty: 0.25 };
    const wide: FieldNode = { kind: 'pattern.stripes', freq: 4, duty: 0.75 };
    const field = compileTest(thin);
    const wideField = compileTest(wide);

    let thinOn = 0;
    let wideOn = 0;
    for (let i = 0; i < 400; i++) {
      const x = (i / 400) * 2 - 1;
      thinOn += field(x, 0);
      wideOn += wideField(x, 0);
    }
    expect(thinOn / 400).toBeCloseTo(0.25, 1);
    expect(wideOn / 400).toBeCloseTo(0.75, 1);
  });

  it('pattern.stripes açıyı derece alır', () => {
    const horizontal: FieldNode = { kind: 'pattern.stripes', freq: 4, angle: 90 };
    const field = compileTest(horizontal);
    // 90°: çizgiler y ekseninde değişir, x boyunca sabit kalır.
    expect(field(0.3, 0.1)).toBe(field(-0.7, 0.1));
  });

  it('pattern.dots hücre merkezinde dolu, köşesinde boştur', () => {
    const node: FieldNode = { kind: 'pattern.dots', freq: 4, r: 0.5 };
    expect(at(node, 0.25, 0.25)).toBe(1);
    expect(at(node, 0, 0)).toBe(0);
  });

  it('pattern.grid hücre SINIRINDA çizgi çeker', () => {
    const node: FieldNode = { kind: 'pattern.grid', freq: 4, thickness: 0.2 };
    expect(at(node, 0, 0)).toBe(1);
    expect(at(node, 0.25, 0.25)).toBe(0);
  });

  it('pattern.hex merkezde 1, kenara doğru azalır', () => {
    const node: FieldNode = { kind: 'pattern.hex', freq: 4 };
    const field = compileTest(node);
    expect(field(0, 0)).toBeCloseTo(1, 6);
    expect(field(0.2, 0)).toBeLessThan(1);
    expect(field(0.2, 0)).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['pattern.checker', { kind: 'pattern.checker', size: 0.2 }],
    ['pattern.stripes', { kind: 'pattern.stripes', freq: 5 }],
    ['pattern.dots', { kind: 'pattern.dots', freq: 5, r: 0.4 }],
    ['pattern.grid', { kind: 'pattern.grid', freq: 5, thickness: 0.15 }],
    ['pattern.hex', { kind: 'pattern.hex', freq: 5 }],
  ] as Array<[string, FieldNode]>)('%s birim aralıkta kalır', (_label, node) => {
    const stats = sampleGrid(node, 30);
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeLessThanOrEqual(1);
  });
});
