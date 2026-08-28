import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSprite, renderSpriteRegion } from '../src/render';
import { RenderCache } from '../src/cache';
import { measureSprite } from '../src/qa';
import { FieldBufferPool } from '../src/field/buffer';
import type { LayerSpec, SpriteDoc } from '../src/types';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf-8')) as unknown;

const PALETTE = {
  colors: ['#000000', '#404040', '#808080', '#c0c0c0', '#ff0000', '#00ff00'],
  ramps: [
    { id: 0, name: 'gri', indices: [0, 1, 2, 3] },
    { id: 1, name: 'renk', indices: [4, 5] },
  ],
};

function doc(layers: LayerSpec[], overrides: Partial<SpriteDoc> = {}): SpriteDoc {
  return {
    schemaVersion: 1,
    size: [32, 32],
    seed: 5,
    palette: PALETTE,
    layers,
    ...overrides,
  } as SpriteDoc;
}

/** Piksel indeksinden kanal okumaları — testleri okunur tutar. */
const at = (width: number, x: number, y: number): number => y * width + x;

describe('renderStack — maske alt-yığını yalnızca coverage tüketir', () => {
  // Regresyon: renderLayer (b) adımı bir maske alt-yığınından yalnızca
  // `nested.coverage`yi okur (bkz. render.ts — `layerCoverage.data[i] *=
  // nested.coverage[i]`). `nested.height`/`nested.material` önceden HER
  // ZAMAN hesaplanıp atılıyordu; artık maske çağrısı `channelsNeeded:
  // 'coverage'` ile yapılıyor ve bu iki kanal atlanıyor. Height/material'i
  // kasten FARKLI iki maske belgesi TAM OLARAK AYNI render'ı üretmeli —
  // aksi hâlde ya optimizasyon yanlış (gerçekten okunan bir şeyi atlıyor)
  // ya da her zaman zaten anlamsızdı.
  it('maske alt-yığınının height/material alanı render çıktısını değiştirmez', () => {
    const maskLayer = (heightValue: number, material: number): LayerSpec => ({
      id: 'mask',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 },
      height: { kind: 'const', value: heightValue },
      material,
    });
    const baseLayer = (mask: LayerSpec): LayerSpec => ({
      id: 'base',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.9 },
      mask: { layers: [mask] },
      material: 0,
    });

    const resultA = renderSprite(doc([baseLayer(maskLayer(0.1, 0))]));
    const resultB = renderSprite(doc([baseLayer(maskLayer(0.9, 1))]));

    expect(Array.from(resultA.rgba)).toEqual(Array.from(resultB.rgba));
    expect(Array.from(resultA.channels.coverage)).toEqual(Array.from(resultB.channels.coverage));
    expect(Array.from(resultA.channels.material)).toEqual(Array.from(resultB.channels.material));
  });

  it('üst düzey (maskesiz) katmanların height/material alanı hâlâ hesaplanır', () => {
    // Optimizasyon YALNIZCA maske alt-yığınlarını hedeflemeli — belgenin
    // kendi üst düzey katmanları hâlâ `channelsNeeded: 'all'` ile render
    // edilir. Farklı height/material burada GERÇEKTEN farklı sonuç vermeli.
    const layer = (heightValue: number, material: number): LayerSpec => ({
      id: 'top',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.9 },
      height: { kind: 'const', value: heightValue },
      material,
    });

    const resultA = renderSprite(doc([layer(0.1, 0)]));
    const resultB = renderSprite(doc([layer(0.9, 1)]));

    expect(Array.from(resultA.channels.height)).not.toEqual(Array.from(resultB.channels.height));
    expect(Array.from(resultA.channels.material)).not.toEqual(
      Array.from(resultB.channels.material),
    );
  });
});

describe('boru hattı — fixture kanıtı', () => {
  it.each(['composite', 'union', 'noise'])('%s belgesi palet uyumlu render olur', (name) => {
    const result = renderSprite(loadFixture(name));
    const report = measureSprite(result);

    expect(report.pass).toBe(true);
    expect(report.metrics.find((m) => m.id === 'paletteCompliance')?.value).toBe(0);
    expect(result.rgba.length).toBe(result.width * result.height * 4);
  });

  it('en-boy oranı değişse de daire ELİPSE dönüşmez', () => {
    // union.json 48x32; iki daire de her iki eksende aynı piksel çapında olmalı.
    const result = renderSprite(loadFixture('union'));
    const { width, height, channels } = result;

    // Sol dairenin merkezi: birim x = −0.55 → sütun ≈ 15.
    const centerColumn = 15;
    let horizontal = 0;
    let vertical = 0;
    for (let x = 0; x < width / 2; x++) {
      if (channels.coverage[at(width, x, height / 2)] > 0) horizontal++;
    }
    for (let y = 0; y < height; y++) {
      if (channels.coverage[at(width, centerColumn, y)] > 0) vertical++;
    }

    // Aynı dairenin yatay ve dikey çapı EŞİT olmalı; esnetilmiş bir eşleme
    // burada 1.5 kat fark verirdi.
    expect(horizontal).toBe(vertical);
    expect(horizontal).toBeGreaterThan(10);
  });
});

describe('determinizm (D5)', () => {
  it('aynı belge + aynı tohum BİT DÜZEYİNDE aynı çıktıyı verir', () => {
    const source = loadFixture('composite');
    const first = renderSprite(source);
    const second = renderSprite(source);

    expect(Array.from(second.rgba)).toEqual(Array.from(first.rgba));
    expect(Array.from(second.channels.coverage)).toEqual(Array.from(first.channels.coverage));
    expect(Array.from(second.channels.height)).toEqual(Array.from(first.channels.height));
    expect(Array.from(second.channels.material)).toEqual(Array.from(first.channels.material));
  });

  it('profil opt-in aşama sürelerini verir ama piksel çıktısını değiştirmez', () => {
    const source = loadFixture('composite');
    const plain = renderSprite(source);
    const profiled = renderSprite(source, { profile: true });

    expect(profiled.profile).not.toBeNull();
    expect(profiled.profile!.pixelCount).toBe(profiled.width * profiled.height);
    for (const value of Object.values(profiled.profile!)) {
      expect(typeof value === 'number' ? Number.isFinite(value) : true).toBe(true);
    }
    expect(Array.from(profiled.rgba)).toEqual(Array.from(plain.rgba));
    expect(renderSprite(source).profile).toBeNull();
  });

  it('tohum ezmesi çıktıyı değiştirir', () => {
    const source = loadFixture('noise');
    const a = renderSprite(source);
    const b = renderSprite(source, { seed: 999 });

    expect(Array.from(b.rgba)).not.toEqual(Array.from(a.rgba));
    expect(b.doc.seed).toBe(999);
  });

  it('KATMAN SIRASI değişince diğer katmanların gürültüsü DEĞİŞMEZ', () => {
    // Tohum yolu katman KİMLİĞİNDEN türetilir, indeksinden değil. İndeks
    // kullanılsaydı listenin başına katman eklemek altındaki her katmanı
    // yeniden üretir ve fark gözden geçirilemez olurdu.
    const doku: LayerSpec = {
      id: 'doku',
      source: { kind: 'sdf.box', center: [0, 0], half: [0.9, 0.9] },
      height: { kind: 'noise.value', freq: 5 },
      material: 0,
    };
    const kose: LayerSpec = {
      id: 'kose',
      source: { kind: 'sdf.circle', center: [-0.8, -0.8], r: 0.15 },
      material: 1,
    };

    const alone = renderSprite(doc([doku]));
    const shifted = renderSprite(doc([kose, doku]));

    // Köşeden uzak bölge yalnızca `doku` katmanına aittir.
    for (let y = 12; y < 32; y++) {
      for (let x = 12; x < 32; x++) {
        const index = at(32, x, y);
        expect(shifted.channels.height[index]).toBe(alone.channels.height[index]);
      }
    }
  });
});

describe('gerçek bölge render sözleşmesi', () => {
  function expectCrop(
    full: ReturnType<typeof renderSprite>,
    region: ReturnType<typeof renderSpriteRegion>,
    x: number,
    y: number,
  ): void {
    for (let row = 0; row < region.height; row++) {
      for (let column = 0; column < region.width; column++) {
        const source = (y + row) * full.width + x + column;
        const target = row * region.width + column;
        expect(region.rgba.slice(target * 4, target * 4 + 4)).toEqual(
          full.rgba.slice(source * 4, source * 4 + 4),
        );
        expect(region.channels.coverage[target]).toBe(full.channels.coverage[source]);
        expect(region.channels.height[target]).toBe(full.channels.height[source]);
        expect(region.channels.material[target]).toBe(full.channels.material[source]);
      }
    }
  }

  it('halo gerektirmeyen graphı global koordinatlarla tam crop ile bit düzeyinde eşler', () => {
    const source = doc(
      [
        {
          id: 'zemin',
          source: { kind: 'sdf.circle', center: [-0.18, 0.12], r: 0.62 },
          height: { kind: 'noise.value', freq: 7 },
          material: 0,
        },
      ],
      { size: [48, 32], tileable: true },
    );
    const full = renderSprite(source);
    const region = renderSpriteRegion(source, { x: 11, y: 7, width: 19, height: 13 });

    expectCrop(full, region, 11, 7);
    expect(region.profile).toBeNull();
  });

  it('komşuluk isteyen graphları tahminî halo ile çalıştırmaz', () => {
    const buffered = doc([
      {
        id: 'bulanık',
        source: { kind: 'blur', radius: 0.04, input: { kind: 'sdf.circle', r: 0.4 } },
        material: 0,
      },
    ]);

    expect(() => renderSpriteRegion(buffered, { x: 0, y: 0, width: 8, height: 8 })).toThrow(
      /buffered:blur/,
    );
    expect(() =>
      renderSpriteRegion(
        doc([{ id: 'ışık', source: { kind: 'const', value: 1 } }], { shade: {} }),
        {
          x: 0,
          y: 0,
          width: 8,
          height: 8,
        },
      ),
    ).toThrow(/shade/);
  });

  it('bölge belge sınırını aşınca reddeder', () => {
    const source = doc([{ id: 'a', source: { kind: 'const', value: 1 }, material: 0 }]);
    expect(() => renderSpriteRegion(source, { x: 28, y: 0, width: 8, height: 8 })).toThrow(
      /sınırlarını aşıyor/,
    );
  });
});

describe('bounded render cache', () => {
  it('hit sonucunu çağıran mutasyonundan izole eder', () => {
    const source = doc([{ id: 'a', source: { kind: 'sdf.circle', r: 0.55 }, material: 0 }]);
    const cache = new RenderCache({ maxEntries: 2, maxBytes: 1_000_000 });

    const first = renderSprite(source, { cache });
    const expected = Array.from(first.rgba);
    first.rgba[0] = first.rgba[0] === 0 ? 255 : 0;
    first.channels.coverage[0] = 0.123;

    const second = renderSprite(source, { cache });
    expect(Array.from(second.rgba)).toEqual(expected);
    expect(second.channels.coverage[0]).not.toBe(0.123);
    expect(cache.stats).toMatchObject({
      hits: 1,
      misses: 1,
      entries: 1,
      evictions: 0,
      copyOperations: 2,
    });
    expect(cache.stats.copyBytes).toBeGreaterThan(0);
  });

  it('profil açıkken cache kullanmaz ve gerçek süreyi ölçer', () => {
    const source = doc([{ id: 'a', source: { kind: 'sdf.circle', r: 0.55 }, material: 0 }]);
    const cache = new RenderCache({ maxBytes: 1_000_000 });
    const profiled = renderSprite(source, { cache, profile: true });

    expect(profiled.profile).not.toBeNull();
    expect(cache.stats).toMatchObject({ hits: 0, misses: 0, entries: 0 });
  });

  it('giriş ve byte bütçesi dolunca en eski sonucu atar', () => {
    const cache = new RenderCache({ maxEntries: 1, maxBytes: 1_000_000 });
    const first = doc([{ id: 'a', source: { kind: 'sdf.circle', r: 0.35 }, material: 0 }]);
    const second = doc([{ id: 'b', source: { kind: 'sdf.circle', r: 0.65 }, material: 0 }]);

    renderSprite(first, { cache });
    renderSprite(second, { cache });
    expect(cache.stats.entries).toBe(1);
    expect(cache.stats.evictions).toBe(1);
    renderSprite(first, { cache });
    expect(cache.stats.misses).toBe(3);
  });
});

describe('palette-safe P2 glow', () => {
  it('halo rengini paletten seçer, alfa ve kanal sınırlarını korur', () => {
    const source = doc([{ id: 'ışık', source: { kind: 'sdf.circle', r: 0.32 }, material: 0 }], {
      post: { glow: { radius: 3, strength: 0.8, colorIndex: 4 } },
    });
    const result = renderSprite(source, { profile: true });
    const report = measureSprite(result);

    expect(result.glow).not.toBeNull();
    expect(result.profile?.glowMs).toBeGreaterThanOrEqual(0);
    expect(
      Array.from(result.rgba).some(
        (_, index) => index % 4 === 3 && result.rgba[index] > 0 && result.rgba[index] < 255,
      ),
    ).toBe(true);
    expect(report.metrics.find((metric) => metric.id === 'finiteValues')?.pass).toBe(true);
    expect(report.metrics.find((metric) => metric.id === 'channelBounds')?.pass).toBe(true);
    expect(report.metrics.find((metric) => metric.id === 'paletteCompliance')?.value).toBe(0);
  });

  it('glow da halo isteyen diğer post işlemleri gibi bölge renderını kilitler', () => {
    const source = doc([{ id: 'ışık', source: { kind: 'sdf.circle', r: 0.32 }, material: 0 }], {
      post: { glow: { radius: 2, strength: 0.5 } },
    });
    expect(() => renderSpriteRegion(source, { x: 0, y: 0, width: 8, height: 8 })).toThrow(
      /post:glow/,
    );
  });
});

describe('kapsama, opaklık ve maske ayrımı (§3)', () => {
  it('OPAKLIK kapsamayı yok etmez — saydam katman hâlâ malzeme yazar', () => {
    // Cam senaryosu: `opacity: 0.3` veren bir katmanın kapsaması eşiğin
    // altına düşerse hiçbir yere malzeme yazmaz ve panel RENKSİZ çıkardı.
    const cam: LayerSpec = {
      id: 'cam',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
      opacity: 0.3,
      material: 1,
    };

    const alone = renderSprite(doc([cam]));
    const center = at(32, 16, 16);

    expect(alone.channels.material[center]).toBe(1);
    // Tek başına: opaklık ALFAYA gider.
    expect(alone.rgba[center * 4 + 3]).toBeCloseTo(Math.round(0.3 * 255), -1);
    expect(alone.rgba[center * 4 + 3]).toBeLessThan(255);

    // Opak bir zemin üstünde sprite'ın kendisi opaktır — alfa 255 doğrudur;
    // ölçülen kazanç, o bölgenin CAMIN rampasına düşmesidir.
    const layered = renderSprite(
      doc([
        { id: 'taban', source: { kind: 'sdf.box', center: [0, 0], half: [0.9, 0.9] }, material: 0 },
        cam,
      ]),
    );
    expect(layered.channels.material[center]).toBe(1);
    expect(layered.rgba[center * 4 + 3]).toBe(255);
  });

  it('MASKE şekildir — maskelenen bölgeye malzeme YAZILMAZ', () => {
    // Maske opaklık gibi ele alınırsa, gizlenen bölge altındaki katmanın
    // rengini bu katmanın rampasıyla ezer: görünmeyen bir katmanın görünür
    // yan etkisi.
    const result = renderSprite(
      doc([
        { id: 'taban', source: { kind: 'sdf.box', center: [0, 0], half: [0.9, 0.9] }, material: 0 },
        {
          id: 'ust',
          source: { kind: 'sdf.box', center: [0, 0], half: [0.9, 0.9] },
          // Yalnızca sağ yarıyı geçirir: gradyan solda 0, sağda 1'e kelepçelenir.
          mask: { kind: 'gradient.linear', angle: 0, from: -0.001, to: 0.001 },
          material: 1,
        },
      ]),
    );

    expect(result.channels.material[at(32, 24, 16)]).toBe(1);
    expect(result.channels.material[at(32, 8, 16)]).toBe(0);
  });

  it('malzeme eşiği kapsamayı sınar', () => {
    const low = renderSprite(
      doc([
        {
          id: 'a',
          source: { kind: 'const', value: 0.4 },
          material: 1,
          materialThresholdCoverage: 0.5,
        },
      ]),
    );
    const high = renderSprite(
      doc([
        {
          id: 'a',
          source: { kind: 'const', value: 0.4 },
          material: 1,
          materialThresholdCoverage: 0.2,
        },
      ]),
    );

    expect(low.channels.material[0]).toBe(0);
    expect(high.channels.material[0]).toBe(1);
  });
});

describe('üç kanallı bileşim (D3)', () => {
  it('height verilmezse kaynak kapsaması kullanılır', () => {
    const result = renderSprite(
      doc([{ id: 'a', source: { kind: 'const', value: 0.75 }, material: 0 }]),
    );
    expect(result.channels.coverage[0]).toBeCloseTo(0.75, 5);
    expect(result.channels.height[0]).toBeCloseTo(0.75 * 0.75, 5);
  });

  it('AYRI height alanı düz siluet + dokulu yüzeyi mümkün kılar', () => {
    const result = renderSprite(
      doc([
        {
          id: 'a',
          source: { kind: 'sdf.box', center: [0, 0], half: [0.9, 0.9] },
          height: { kind: 'gradient.linear', angle: 0, from: -0.9, to: 0.9 },
          material: 0,
        },
      ]),
    );

    // Siluet her yerde dolu…
    expect(result.channels.coverage[at(32, 4, 16)]).toBe(1);
    expect(result.channels.coverage[at(32, 28, 16)]).toBe(1);
    // …ama yüzey soldan sağa yükseliyor.
    expect(result.channels.height[at(32, 4, 16)]).toBeLessThan(
      result.channels.height[at(32, 28, 16)],
    );
  });

  it('kapsama ve yükseklik AYRI modlarla harmanlanır', () => {
    const result = renderSprite(
      doc([
        { id: 'a', source: { kind: 'const', value: 0.5 }, material: 0 },
        {
          id: 'b',
          source: { kind: 'const', value: 0.5 },
          blend: 'max',
          heightBlend: 'add',
          material: 0,
        },
      ]),
    );

    expect(result.channels.coverage[0]).toBeCloseTo(0.5, 5);
    // Yükseklik toplanır: iki katman 0.25 + 0.25.
    expect(result.channels.height[0]).toBeCloseTo(0.5, 5);
  });

  it('replace modu katmanın OLMADIĞI yeri de sıfırlar', () => {
    const result = renderSprite(
      doc([
        { id: 'a', source: { kind: 'const', value: 1 }, material: 0 },
        {
          id: 'b',
          source: { kind: 'sdf.circle', center: [0, 0], r: 0.2 },
          blend: 'replace',
          material: 0,
        },
      ]),
    );

    expect(result.channels.coverage[at(32, 16, 16)]).toBe(1);
    expect(result.channels.coverage[at(32, 1, 1)]).toBe(0);
  });
});

describe('kenar yumuşatma (§5.8)', () => {
  it('kapalıyken kapsama YALNIZCA 0 ya da 1 olur', () => {
    const result = renderSprite(
      doc([{ id: 'a', source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 }, material: 0 }], {
        antialias: false,
      }),
    );
    for (const value of result.channels.coverage) expect(value === 0 || value === 1).toBe(true);
  });

  it('açıkken kenarda ara değerler oluşur', () => {
    const result = renderSprite(
      doc([{ id: 'a', source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 }, material: 0 }], {
        antialias: true,
      }),
    );
    const partial = Array.from(result.channels.coverage).filter((v) => v > 0 && v < 1);
    expect(partial.length).toBeGreaterThan(0);
  });

  it('yumuşatma genişliği ÇÖZÜNÜRLÜKLE ölçeklenir', () => {
    // Birim uzayda sabit bir genişlik 32²'de şeklin tamamını yutardı; oranın
    // sabit kalması genişliğin piksel biriminden türetildiğini gösterir.
    const layer: LayerSpec = {
      id: 'a',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 },
      material: 0,
    };
    const countPartial = (size: number): number => {
      const result = renderSprite(doc([layer], { size: [size, size], antialias: true }));
      return Array.from(result.channels.coverage).filter((v) => v > 0 && v < 1).length;
    };

    const small = countPartial(32);
    const large = countPartial(128);
    // Kenar uzunluğu 4 katına çıkar; ara piksel sayısı da yaklaşık 4 katıdır.
    expect(large / small).toBeGreaterThan(3);
    expect(large / small).toBeLessThan(5);
  });
});

describe('ezmeler ve giriş noktası', () => {
  it('size ezmesi şekli bozmadan çözünürlüğü değiştirir (D2)', () => {
    const source = loadFixture('composite');
    const small = renderSprite(source, { size: [32, 32] });
    const large = renderSprite(source, { size: [128, 128] });

    expect(small.width).toBe(32);
    expect(large.width).toBe(128);

    // Kaplanan alanın ORANI çözünürlükten bağımsız olmalı.
    const ratio = (r: typeof small): number =>
      Array.from(r.channels.coverage).filter((v) => v > 0).length / (r.width * r.height);
    expect(ratio(large)).toBeCloseTo(ratio(small), 2);
  });

  it('geçersiz belge render edilmez — doğrulama giriş noktasındadır', () => {
    expect(() => renderSprite({ schemaVersion: 1 })).toThrow(/geçersiz/);
    expect(() => renderSprite(doc([]), {})).toThrow(/layers/);
  });

  it('ezme geçersizse de sınırda reddedilir', () => {
    expect(() => renderSprite(loadFixture('noise'), { size: [4, 4] })).toThrow(/8\.\.2048/);
    expect(() => renderSprite(loadFixture('noise'), { seed: NaN })).toThrow(/sonlu/);
  });

  it('nesne olmayan girdi ezmelere rağmen reddedilir', () => {
    expect(() => renderSprite('belge değil', { seed: 1 })).toThrow(/JSON nesnesi/);
  });
});

describe('tampon havuzu paylaşımı (D7)', () => {
  it('aynı havuz birden çok render arasında yeniden kullanılır', () => {
    const pool = new FieldBufferPool();
    const source = loadFixture('composite');

    const first = renderSprite(source, { pool });
    const second = renderSprite(source, { pool });

    // Katman/maske/yükseklik tamponları iade edildiği için havuz tek boyut tutar.
    expect(pool.sizeCount).toBe(1);
    expect(Array.from(second.rgba)).toEqual(Array.from(first.rgba));
  });
});
