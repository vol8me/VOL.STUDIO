import { describe, it, expect } from 'vitest';
import { createUnitSpace } from '../../src/visualSynth/field/space';
import { FieldBufferPool } from '../../src/visualSynth/field/buffer';
import { applyDomainChain, deriveNodeSeed } from '../../src/visualSynth/field/evaluate';
import { compileTest } from './support';
import { blendCoverage, blendHeight } from '../../src/visualSynth/field/blend';
import { quintic } from '../../src/visualSynth/field/fn';
import { resolveFieldDomain } from '../../src/visualSynth/schema';
import type { DomainOp, FieldNode } from '../../src/visualSynth/types';

const evaluate = (node: FieldNode, x: number, y: number): number => compileTest(node, 'test')(x, y);

describe('birim uzay sözleşmesi (D2)', () => {
  it('kökeni merkezde, birimi kısa kenarın yarısıdır', () => {
    const space = createUnitSpace(64, 64);

    // Piksel MERKEZLERİ örneklenir: ilk ve son piksel ±(1 − 1/64).
    expect(space.unitX(0)).toBeCloseTo(-1 + 1 / 64, 10);
    expect(space.unitX(63)).toBeCloseTo(1 - 1 / 64, 10);
    expect(space.unitY(32)).toBeCloseTo(1 / 64, 10);
    expect(space.pixelUnit).toBeCloseTo(2 / 64, 10);
  });

  it('dikdörtgende uzun eksen daha geniş, kısa eksen [-1,1] kalır', () => {
    const space = createUnitSpace(48, 32);

    expect(space.short).toBe(32);
    // Kısa eksen (y) yaklaşık ±1; uzun eksen (x) ±1.5.
    expect(space.unitY(0)).toBeCloseTo(-1 + 1 / 32, 10);
    expect(space.unitY(31)).toBeCloseTo(1 - 1 / 32, 10);
    expect(space.unitX(0)).toBeCloseTo(-1.5 + 1 / 32, 10);
    expect(space.unitX(47)).toBeCloseTo(1.5 - 1 / 32, 10);
  });

  it('daire dikdörtgen çerçevede ELİPSE dönüşmez', () => {
    // Esnetilmiş bir eşleme (birim kareyi dikdörtgene germek) burada
    // yatay/dikey yarıçapları ayrıştırırdı; kısa kenar normalizasyonu korur.
    const space = createUnitSpace(48, 32);
    const circle = compileTest({ kind: 'sdf.circle', center: [0, 0], r: 0.5 }, 'c');

    let width = 0;
    let height = 0;
    for (let px = 0; px < 48; px++) if (circle(space.unitX(px), space.unitY(16)) <= 0) width++;
    for (let py = 0; py < 32; py++) if (circle(space.unitX(24), space.unitY(py)) <= 0) height++;

    expect(width).toBe(height);
  });
});

describe('üreteçler (§4.1)', () => {
  it('const her noktada aynı değeri verir', () => {
    const node: FieldNode = { kind: 'const', value: 0.375 };
    expect(evaluate(node, 0, 0)).toBe(0.375);
    expect(evaluate(node, -0.9, 0.4)).toBe(0.375);
  });

  it('sdf.circle içeride negatif, kenarda sıfır, dışarıda pozitiftir', () => {
    const node: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
    expect(evaluate(node, 0, 0)).toBeCloseTo(-0.5, 10);
    expect(evaluate(node, 0.5, 0)).toBeCloseTo(0, 10);
    expect(evaluate(node, 1, 0)).toBeCloseTo(0.5, 10);
  });

  it('sdf.box dışarıda köşeye GERÇEK Öklid uzaklığını verir', () => {
    // Yalnızca max(qx, qy) kullanan naif biçim burada Chebyshev verirdi
    // (0.3) ve dış çizgi köşelerde kalınlaşırdı.
    const node: FieldNode = { kind: 'sdf.box', center: [0, 0], half: [0.5, 0.5] };
    expect(evaluate(node, 0.8, 0.8)).toBeCloseTo(Math.hypot(0.3, 0.3), 10);
    expect(evaluate(node, 0, 0)).toBeCloseTo(-0.5, 10);
    expect(evaluate(node, 0.5, 0)).toBeCloseTo(0, 10);
  });

  it('gradient.linear from→to arasında 0→1 rampası çizer ve dışını kelepçeler', () => {
    const node: FieldNode = { kind: 'gradient.linear', angle: 0, from: -0.5, to: 0.5 };
    expect(evaluate(node, -0.5, 0)).toBeCloseTo(0, 10);
    expect(evaluate(node, 0, 0)).toBeCloseTo(0.5, 10);
    expect(evaluate(node, 0.5, 0)).toBeCloseTo(1, 10);
    expect(evaluate(node, 5, 0)).toBe(1);
    expect(evaluate(node, -5, 0)).toBe(0);
  });

  it('gradient.linear açıyı DERECE alır', () => {
    const node: FieldNode = { kind: 'gradient.linear', angle: 90, from: -1, to: 1 };
    // 90° yönü y eksenidir: x değişimi rampayı etkilemez.
    expect(evaluate(node, 0.7, 0)).toBeCloseTo(0.5, 10);
    expect(evaluate(node, 0, 1)).toBeCloseTo(1, 10);
  });

  it('gradient.radial merkezde 1, yarıçapta 0 verir', () => {
    const node: FieldNode = { kind: 'gradient.radial', center: [0, 0], radius: 0.8 };
    expect(evaluate(node, 0, 0)).toBeCloseTo(1, 10);
    expect(evaluate(node, 0.4, 0)).toBeCloseTo(0.5, 10);
    expect(evaluate(node, 0.8, 0)).toBeCloseTo(0, 10);
    expect(evaluate(node, 2, 0)).toBe(0);
  });

  it('noise.value 0..1 arasında kalır ve KONUMUN fonksiyonudur', () => {
    const node: FieldNode = { kind: 'noise.value', freq: 8, seed: 99 };
    const fn = compileTest(node, 'n');

    for (let i = 0; i < 200; i++) {
      const value = fn((i % 20) / 10 - 1, Math.floor(i / 20) / 10 - 1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // Aynı nokta iki kez okununca aynı değer: sıralı bir üreteç olsaydı
    // ikinci okuma farklı çıkar ve tekrar örnekleyen işlemler bozulurdu.
    expect(fn(0.3, -0.2)).toBe(fn(0.3, -0.2));
  });

  it('noise.value farklı tohumda farklı alan üretir', () => {
    const a = compileTest({ kind: 'noise.value', freq: 6, seed: 1 }, 'n');
    const b = compileTest({ kind: 'noise.value', freq: 6, seed: 2 }, 'n');
    const differing = [0.1, 0.3, -0.4, 0.7, -0.8].filter((x) => a(x, 0) !== b(x, 0));
    expect(differing.length).toBeGreaterThan(0);
  });

  it('quintic uçlarda düz, ortada 0.5', () => {
    expect(quintic(0)).toBe(0);
    expect(quintic(1)).toBe(1);
    expect(quintic(0.5)).toBeCloseTo(0.5, 10);
  });
});

describe('alan-uzayı işlemleri — ters eşleme (D4, §5.7)', () => {
  it('translate şekli İSTENEN yöne taşır', () => {
    // Ters eşleme yanlış işaretle yazılırsa şekil ters yöne kayar; bu test
    // işaretin doğruluğunu sabitler.
    const node: FieldNode = {
      kind: 'translate',
      x: 0.3,
      y: 0,
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.2 },
    };
    expect(evaluate(node, 0.3, 0)).toBeCloseTo(-0.2, 10);
    expect(evaluate(node, 0, 0)).toBeCloseTo(0.1, 10);
  });

  it('rotate döndürülmüş şekilde BOŞLUK bırakmaz', () => {
    // İleri eşleme (girdiden çıktıya) burada delikli bir kare üretirdi.
    const space = createUnitSpace(64, 64);
    const box: FieldNode = { kind: 'sdf.box', center: [0, 0], half: [0.5, 0.5] };
    const straight = compileTest(box, 'a');
    const rotated = compileTest({ kind: 'rotate', angle: 37, input: box }, 'b');

    let straightArea = 0;
    let rotatedArea = 0;
    for (let py = 0; py < 64; py++) {
      for (let px = 0; px < 64; px++) {
        const x = space.unitX(px);
        const y = space.unitY(py);
        if (straight(x, y) <= 0) straightArea++;
        if (rotated(x, y) <= 0) rotatedArea++;
      }
    }
    // Alan korunur (±%2 nicemleme payı) ve hiçbir iç piksel kaybolmaz.
    expect(rotatedArea).toBeGreaterThan(straightArea * 0.98);
    expect(rotatedArea).toBeLessThan(straightArea * 1.02);
  });

  it('rotate +y aşağı olduğu için pozitif açıda SAAT YÖNÜNDE döner', () => {
    const node: FieldNode = {
      kind: 'rotate',
      angle: 90,
      input: { kind: 'sdf.circle', center: [1, 0], r: 0.1 },
    };
    // Kaynak merkezi (1,0); 90° saat yönünde döndürülmüş hâli (0,1)'dedir.
    expect(evaluate(node, 0, 1)).toBeCloseTo(-0.1, 6);
  });

  it('scale bileşen bazında ölçekler (anizotropik)', () => {
    const node: FieldNode = {
      kind: 'scale',
      x: 2,
      y: 1,
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    };
    // x ekseninde iki kat genişler, y ekseninde değişmez.
    expect(evaluate(node, 1, 0)).toBeCloseTo(0, 10);
    expect(evaluate(node, 0, 0.5)).toBeCloseTo(0, 10);
  });

  it('scale merkez parametresini kullanır ve GEOMETRİYİ büyütür', () => {
    const node: FieldNode = {
      kind: 'scale',
      x: 2,
      y: 2,
      center: [0.5, 0],
      input: { kind: 'sdf.circle', center: [0.5, 0], r: 0.25 },
    };
    // Sınır 0.75'ten 1'e taşınır: şekil iki katına çıkar.
    expect(evaluate(node, 1, 0)).toBeCloseTo(0, 10);
    // Ama dönen DEĞER hâlâ kaynağın mesafesidir — ölçekli SDF artık gerçek
    // bir mesafe alanı değil, bir sınırdır (bkz. domain.ts notu).
    expect(evaluate(node, 0.5, 0)).toBeCloseTo(-0.25, 10);
  });

  it('domain zinciri [A, B] ≡ B(A(kaynak))', () => {
    const source: FieldNode = { kind: 'sdf.circle', center: [0.4, 0], r: 0.1 };
    const chain: DomainOp[] = [
      { kind: 'translate', x: 0.2, y: 0 },
      { kind: 'rotate', angle: 90 },
    ];

    const viaChain = applyDomainChain(compileTest(source, 's'), chain);
    const viaNesting = compileTest(
      {
        kind: 'rotate',
        angle: 90,
        input: { kind: 'translate', x: 0.2, y: 0, input: source },
      },
      's',
    );

    for (const [x, y] of [
      [0, 0.6],
      [0.6, 0],
      [-0.3, 0.2],
    ]) {
      expect(viaChain(x, y)).toBeCloseTo(viaNesting(x, y), 10);
    }
  });

  it('boş domain zinciri kaynağı değiştirmez', () => {
    const source = compileTest({ kind: 'const', value: 0.5 }, 's');
    expect(applyDomainChain(source, undefined)(0, 0)).toBe(0.5);
    expect(applyDomainChain(source, [])(0, 0)).toBe(0.5);
  });
});

describe('birleştiriciler (§4.3)', () => {
  const a: FieldNode = { kind: 'const', value: 0.8 };
  const b: FieldNode = { kind: 'const', value: 0.2 };

  it('aritmetik doğru sonucu verir', () => {
    expect(evaluate({ kind: 'add', a, b }, 0, 0)).toBeCloseTo(1, 10);
    expect(evaluate({ kind: 'mul', a, b }, 0, 0)).toBeCloseTo(0.16, 10);
    expect(evaluate({ kind: 'min', a, b }, 0, 0)).toBeCloseTo(0.2, 10);
    expect(evaluate({ kind: 'max', a, b }, 0, 0)).toBeCloseTo(0.8, 10);
    expect(evaluate({ kind: 'mix', a, b, t: 0.25 }, 0, 0)).toBeCloseTo(0.65, 10);
  });

  it('min/max işaretli mesafede BİRLEŞİM/KESİŞİM demektir', () => {
    const left: FieldNode = { kind: 'sdf.circle', center: [-0.3, 0], r: 0.4 };
    const right: FieldNode = { kind: 'sdf.circle', center: [0.3, 0], r: 0.4 };

    // Birleşim: yalnızca sol dairenin içindeki nokta da içeridedir.
    expect(evaluate({ kind: 'min', a: left, b: right }, -0.6, 0)).toBeLessThan(0);
    // Kesişim: aynı nokta dışarıdadır, ortak bölge içeridedir.
    expect(evaluate({ kind: 'max', a: left, b: right }, -0.6, 0)).toBeGreaterThan(0);
    expect(evaluate({ kind: 'max', a: left, b: right }, 0, 0)).toBeLessThan(0);
  });

  it('smooth SDF booleanları k=0 iken sert operatöre iner', () => {
    const left: FieldNode = { kind: 'sdf.circle', center: [-0.3, 0], r: 0.4 };
    const right: FieldNode = { kind: 'sdf.circle', center: [0.3, 0], r: 0.4 };

    for (const [x, y] of [
      [-0.7, 0],
      [-0.1, 0.2],
      [0.4, 0],
    ] as const) {
      expect(evaluate({ kind: 'sdf.smoothUnion', a: left, b: right, k: 0 }, x, y)).toBeCloseTo(
        evaluate({ kind: 'min', a: left, b: right }, x, y),
        10,
      );
      expect(
        evaluate({ kind: 'sdf.smoothIntersection', a: left, b: right, k: 0 }, x, y),
      ).toBeCloseTo(evaluate({ kind: 'max', a: left, b: right }, x, y), 10);
    }
  });

  it('smooth union organik geçişte köprü kurar', () => {
    const left: FieldNode = { kind: 'sdf.circle', center: [-0.35, 0], r: 0.25 };
    const right: FieldNode = { kind: 'sdf.circle', center: [0.35, 0], r: 0.25 };
    const hard: FieldNode = { kind: 'min', a: left, b: right };
    const smooth: FieldNode = { kind: 'sdf.smoothUnion', a: left, b: right, k: 0.3 };

    expect(evaluate(hard, 0, 0)).toBeGreaterThan(0);
    expect(evaluate(smooth, 0, 0)).toBeLessThan(evaluate(hard, 0, 0));
    expect(
      Number.isFinite(evaluate({ kind: 'sdf.smoothSub', a: left, b: right, k: 0.2 }, 0, 0)),
    ).toBe(true);
  });

  it('step sert eşik uygular', () => {
    const input: FieldNode = { kind: 'gradient.linear', angle: 0, from: -1, to: 1 };
    expect(evaluate({ kind: 'step', edge: 0.5, input }, -0.5, 0)).toBe(0);
    expect(evaluate({ kind: 'step', edge: 0.5, input }, 0.5, 0)).toBe(1);
  });

  it('smoothstep e0 > e1 ile AZALAN rampa verir', () => {
    // Ayrı bir "ters eşik" primitifi eklemek yerine mevcut parametre kullanılır (D9).
    const input: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
    const node: FieldNode = { kind: 'smoothstep', e0: 0, e1: -0.5, input };
    expect(evaluate(node, 0, 0)).toBeCloseTo(1, 10);
    expect(evaluate(node, 0.5, 0)).toBeCloseTo(0, 10);
    expect(evaluate(node, 0.25, 0)).toBeGreaterThan(0);
    expect(evaluate(node, 0.25, 0)).toBeLessThan(1);
  });

  it('smoothstep e0 === e1 iken sıfıra bölmez, sert eşiğe düşer', () => {
    const input: FieldNode = { kind: 'gradient.linear', angle: 0, from: -1, to: 1 };
    const node: FieldNode = { kind: 'smoothstep', e0: 0.5, e1: 0.5, input };
    expect(Number.isFinite(evaluate(node, 0, 0))).toBe(true);
    expect(evaluate(node, 0, 0)).toBe(1);
    expect(evaluate(node, -0.5, 0)).toBe(0);
  });
});

describe('çıktı etki alanı statik çözülür', () => {
  const sdf: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
  const unit: FieldNode = { kind: 'const', value: 1 };

  it('üreteç türünden gelir', () => {
    expect(resolveFieldDomain(sdf)).toBe('signed');
    expect(resolveFieldDomain(unit)).toBe('unit');
    expect(resolveFieldDomain({ kind: 'noise.value', freq: 4 })).toBe('unit');
  });

  it('alan-uzayı işlemi girdisinden devralır', () => {
    expect(resolveFieldDomain({ kind: 'rotate', angle: 10, input: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'translate', x: 0, y: 0, input: unit })).toBe('unit');
    expect(resolveFieldDomain({ kind: 'scale', x: 2, y: 2, input: sdf })).toBe('signed');
  });

  it('birleştiricide HERHANGİ BİR girdi işaretliyse sonuç işaretlidir', () => {
    expect(resolveFieldDomain({ kind: 'min', a: sdf, b: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'add', a: sdf, b: unit })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'mix', a: unit, b: unit, t: 0.5 })).toBe('unit');
  });

  it('eşikler her zaman kapsama üretir', () => {
    expect(resolveFieldDomain({ kind: 'step', edge: 0, input: sdf })).toBe('unit');
    expect(resolveFieldDomain({ kind: 'smoothstep', e0: 0, e1: 1, input: sdf })).toBe('unit');
  });
});

describe('düğüm tohumu (D5)', () => {
  it('aynı kök + aynı yol aynı tohumu verir', () => {
    expect(deriveNodeSeed(7, 'govde/source')).toBe(deriveNodeSeed(7, 'govde/source'));
  });

  it('farklı yol farklı tohum verir', () => {
    expect(deriveNodeSeed(7, 'govde/source')).not.toBe(deriveNodeSeed(7, 'kabuk/source'));
  });

  it('farklı kök tohum farklı sonuç verir', () => {
    expect(deriveNodeSeed(7, 'x')).not.toBe(deriveNodeSeed(8, 'x'));
  });
});

describe('harmanlama modları', () => {
  it('kapsama modları tanımlandığı gibi çalışır ve 0..1 dışına taşmaz', () => {
    expect(blendCoverage('over', 0.5, 0.5)).toBeCloseTo(0.75, 10);
    expect(blendCoverage('max', 0.2, 0.7)).toBe(0.7);
    expect(blendCoverage('min', 0.2, 0.7)).toBe(0.2);
    expect(blendCoverage('add', 0.8, 0.5)).toBe(1);
    expect(blendCoverage('sub', 0.3, 0.5)).toBe(0);
    expect(blendCoverage('mul', 0.5, 0.5)).toBeCloseTo(0.25, 10);
    expect(blendCoverage('screen', 0.5, 0.5)).toBeCloseTo(0.75, 10);
    expect(blendCoverage('replace', 0.9, 0.1)).toBeCloseTo(0.1, 10);
  });

  it('yükseklik modları ayrıdır ve kelepçelenir', () => {
    expect(blendHeight('max', 0.2, 0.7)).toBe(0.7);
    expect(blendHeight('min', 0.2, 0.7)).toBe(0.2);
    expect(blendHeight('add', 0.9, 0.5)).toBe(1);
    expect(blendHeight('mul', 0.5, 0.4)).toBeCloseTo(0.2, 10);
    expect(blendHeight('replace', 0.9, 0.25)).toBeCloseTo(0.25, 10);
  });

  it('bilinmeyen mod sessizce geçmez', () => {
    // @ts-expect-error — bilinmeyen mod yalnızca çalışma anında gelebilir.
    expect(() => blendCoverage('yok', 0, 0)).toThrow(/harmanlama/);
    // @ts-expect-error — aynısı yükseklik tarafı için.
    expect(() => blendHeight('yok', 0, 0)).toThrow(/harmanlama/);
  });
});

describe('tampon havuzu (D7)', () => {
  it('boyut başına ayrı havuz tutar', () => {
    const pool = new FieldBufferPool();
    const small = pool.acquire(8, 8);
    const large = pool.acquire(16, 16);

    expect(small.data.length).toBe(64);
    expect(large.data.length).toBe(256);
    expect(pool.sizeCount).toBe(2);

    pool.release(small);
    pool.release(large);
  });

  it('iade edilen tampon SIFIRLANIR — kalıntı bir sonraki katmana sızmaz', () => {
    const pool = new FieldBufferPool();
    const first = pool.acquire(4, 4);
    first.data.fill(0.9);
    pool.release(first);

    const second = pool.acquire(4, 4);
    expect(second).toBe(first);
    expect(Array.from(second.data)).toEqual(new Array(16).fill(0));
  });

  it('clear boştaki tamponları bırakır', () => {
    const pool = new FieldBufferPool();
    const buffer = pool.acquire(4, 4);
    pool.release(buffer);
    pool.clear();

    expect(pool.acquire(4, 4)).not.toBe(buffer);
  });
});

describe('Tur 2 birleştiricileri', () => {
  const A: FieldNode = { kind: 'const', value: 0.8 };
  const B: FieldNode = { kind: 'const', value: 0.25 };

  it('sub, screen ve overlay tanımlandığı gibi çalışır', () => {
    expect(evaluate({ kind: 'sub', a: A, b: B }, 0, 0)).toBeCloseTo(0.55, 10);
    expect(evaluate({ kind: 'screen', a: A, b: B }, 0, 0)).toBeCloseTo(0.85, 10);
    // overlay: taban 0.8 > 0.5 olduğu için screen dalı.
    expect(evaluate({ kind: 'overlay', a: A, b: B }, 0, 0)).toBeCloseTo(0.7, 10);
    // taban 0.25 < 0.5 olduğu için çarpma dalı.
    expect(evaluate({ kind: 'overlay', a: B, b: A }, 0, 0)).toBeCloseTo(0.4, 10);
  });

  it('remap aralığı taşır ve KELEPÇELEMEZ', () => {
    const node: FieldNode = {
      kind: 'remap',
      inMin: 0,
      inMax: 1,
      outMin: -1,
      outMax: 1,
      input: { kind: 'const', value: 0.25 },
    };
    expect(evaluate(node, 0, 0)).toBeCloseTo(-0.5, 10);

    const beyond: FieldNode = { ...node, input: { kind: 'const', value: 2 } };
    expect(evaluate(beyond, 0, 0)).toBeCloseTo(3, 10);
  });

  it('clamp değeri aralığa çeker', () => {
    const node = (value: number): FieldNode => ({
      kind: 'clamp',
      min: 0.2,
      max: 0.6,
      input: { kind: 'const', value },
    });
    expect(evaluate(node(0), 0, 0)).toBeCloseTo(0.2, 10);
    expect(evaluate(node(0.4), 0, 0)).toBeCloseTo(0.4, 10);
    expect(evaluate(node(1), 0, 0)).toBeCloseTo(0.6, 10);
  });

  it('abs + sub bir SDF üzerinde KONTUR üretir — ayrı primitif gerekmez (D9)', () => {
    const ring: FieldNode = {
      kind: 'sub',
      a: { kind: 'abs', input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 } },
      b: { kind: 'const', value: 0.05 },
    };
    // Halka üzerinde içeride, merkezde ve dışarıda dışarıda.
    expect(evaluate(ring, 0.5, 0)).toBeLessThan(0);
    expect(evaluate(ring, 0, 0)).toBeGreaterThan(0);
    expect(evaluate(ring, 1, 0)).toBeGreaterThan(0);
  });

  it('invert kapsamayı ters çevirir', () => {
    expect(evaluate({ kind: 'invert', input: A }, 0, 0)).toBeCloseTo(0.2, 10);
  });

  it('curve parçalı doğrusal eşleme yapar ve uçlarda KELEPÇELER', () => {
    const curve = (value: number): FieldNode => ({
      kind: 'curve',
      points: [
        [0, 0],
        [0.5, 0.9],
        [1, 1],
      ],
      input: { kind: 'const', value },
    });
    expect(evaluate(curve(0), 0, 0)).toBeCloseTo(0, 10);
    expect(evaluate(curve(0.25), 0, 0)).toBeCloseTo(0.45, 10);
    expect(evaluate(curve(0.5), 0, 0)).toBeCloseTo(0.9, 10);
    expect(evaluate(curve(0.75), 0, 0)).toBeCloseTo(0.95, 10);
    // Eğrinin dışına EKSTRAPOLASYON yapılmaz: kullanıcının çizmediği davranış
    // uydurulmaz.
    expect(evaluate(curve(-1), 0, 0)).toBeCloseTo(0, 10);
    expect(evaluate(curve(3), 0, 0)).toBeCloseTo(1, 10);
  });

  it('curve noktaları SIRASIZ verilebilir', () => {
    const node: FieldNode = {
      kind: 'curve',
      points: [
        [1, 1],
        [0, 0],
        [0.5, 0.9],
      ],
      input: { kind: 'const', value: 0.25 },
    };
    expect(evaluate(node, 0, 0)).toBeCloseTo(0.45, 10);
  });

  it('curve eşit x taşıyan noktalarda sıfıra bölmez', () => {
    const node: FieldNode = {
      kind: 'curve',
      points: [
        [0.5, 0.2],
        [0.5, 0.8],
      ],
      input: { kind: 'const', value: 0.5 },
    };
    expect(Number.isFinite(evaluate(node, 0, 0))).toBe(true);
  });
});

describe('Tur 2 etki alanı kuralları', () => {
  const sdf: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
  const unit: FieldNode = { kind: 'const', value: 1 };

  it('filtreler etki alanını girdiden DEVRALIR', () => {
    expect(resolveFieldDomain({ kind: 'blur', radius: 0.05, input: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'dilate', radius: 0.05, input: unit })).toBe('unit');
  });

  it('distance her zaman İŞARETLİ, scatter ve edge her zaman kapsama üretir', () => {
    expect(resolveFieldDomain({ kind: 'distance', input: unit })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'scatter', source: sdf, count: 4 })).toBe('unit');
    expect(resolveFieldDomain({ kind: 'edge', input: sdf })).toBe('unit');
  });

  it('warp girdisinden devralır, `by` alanı etkilemez', () => {
    expect(resolveFieldDomain({ kind: 'warp', by: unit, amount: 0.1, input: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'warp', by: sdf, amount: 0.1, input: unit })).toBe('unit');
  });

  it('abs ve clamp devralır, invert ve curve kapsama üretir', () => {
    expect(resolveFieldDomain({ kind: 'abs', input: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'clamp', min: 0, max: 1, input: sdf })).toBe('signed');
    expect(resolveFieldDomain({ kind: 'invert', input: sdf })).toBe('unit');
    expect(
      resolveFieldDomain({
        kind: 'curve',
        points: [
          [0, 0],
          [1, 1],
        ],
        input: sdf,
      }),
    ).toBe('unit');
  });

  it('screen ve overlay kapsama üretir — birim alanlar içindir', () => {
    expect(resolveFieldDomain({ kind: 'screen', a: sdf, b: unit })).toBe('unit');
    expect(resolveFieldDomain({ kind: 'overlay', a: sdf, b: unit })).toBe('unit');
  });
});
