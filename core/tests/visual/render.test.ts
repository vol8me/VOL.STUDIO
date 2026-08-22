import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSprite } from '../../src/visual/render';
import { measureSprite } from '../../src/visual/qa';
import { FieldBufferPool } from '../../src/visual/field/buffer';
import type { LayerSpec, SpriteDoc } from '../../src/visual/types';

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
