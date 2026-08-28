import { describe, it, expect } from 'vitest';
import {
  collectFieldIssues,
  collectSpriteDocIssues,
  validateField,
  validateSpriteDoc,
  MAX_FIELD_DEPTH,
  MAX_POINTS,
} from '../src/validate';

/** Geçerli bir taban belge; her test yalnızca ilgilendiği alanı bozar. */
function baseDoc(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    size: [32, 32],
    seed: 1,
    palette: {
      colors: ['#000000', '#ffffff'],
      ramps: [{ id: 0, name: 'taban', indices: [0, 1] }],
    },
    layers: [
      {
        id: 'a',
        source: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
        material: 0,
      },
    ],
  };
}

/** Belirli bir yolla ilgili sorunları süzer — mesaj metnine bağımlılığı azaltır. */
function issuesFor(doc: unknown, prefix: string): string[] {
  return collectSpriteDocIssues(doc).filter((issue) => issue.startsWith(prefix));
}

describe('belge doğrulaması', () => {
  it('geçerli belge sorunsuz geçer', () => {
    expect(collectSpriteDocIssues(baseDoc())).toEqual([]);
    expect(validateSpriteDoc(baseDoc())).toBeTruthy();
  });

  it('TÜM sorunlar tek seferde bildirilir', () => {
    // İlk hatada durmak agent'ı düzelt–çalıştır döngüsüne sokardı.
    const doc = { ...baseDoc(), schemaVersion: 2, size: [4, 4], seed: 1.5 };
    const issues = collectSpriteDocIssues(doc);

    expect(issues.length).toBeGreaterThanOrEqual(4);
    expect(issues.some((i) => i.startsWith('schemaVersion'))).toBe(true);
    expect(issues.some((i) => i.startsWith('size[0]'))).toBe(true);
    expect(issues.some((i) => i.startsWith('seed'))).toBe(true);
  });

  it('nesne olmayan girdi tek sorunla reddedilir', () => {
    expect(collectSpriteDocIssues(null)).toEqual(['belge: bir JSON nesnesi olmalı']);
    expect(collectSpriteDocIssues([1, 2])).toHaveLength(1);
  });

  it('validateSpriteDoc sorunların hepsini hata metnine koyar', () => {
    expect(() => validateSpriteDoc({ ...baseDoc(), seed: NaN })).toThrow(/sonlu/);
    expect(() => validateSpriteDoc({})).toThrow(/sorun/);
  });
});

describe('sonlu sayı sözleşmesi — yapılandırma REDDEDİLİR', () => {
  it('size sonlu olmayan değeri reddeder', () => {
    expect(issuesFor({ ...baseDoc(), size: [NaN, 32] }, 'size[0]')[0]).toMatch(/sonlu/);
    expect(issuesFor({ ...baseDoc(), size: [32, Infinity] }, 'size[1]')[0]).toMatch(/sonlu/);
  });

  it('seed sonlu olmayan değeri reddeder', () => {
    expect(issuesFor({ ...baseDoc(), seed: NaN }, 'seed')[0]).toMatch(/sonlu/);
    expect(issuesFor({ ...baseDoc(), seed: Infinity }, 'seed')[0]).toMatch(/sonlu/);
  });

  it('freq sonlu olmayan değeri reddeder', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].source = { kind: 'noise.value', freq: NaN };
    expect(issuesFor(doc, 'layers[0].source.freq')[0]).toMatch(/sonlu/);
  });

  it('freq sıfır ve negatifi reddeder', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].source = { kind: 'noise.value', freq: 0 };
    expect(issuesFor(doc, 'layers[0].source.freq')[0]).toMatch(/sıfırdan büyük/);
  });

  it('size tam sayı ve sınırlar içinde olmalı', () => {
    expect(issuesFor({ ...baseDoc(), size: [32.5, 32] }, 'size[0]')[0]).toMatch(/tam sayı/);
    expect(issuesFor({ ...baseDoc(), size: [4, 32] }, 'size[0]')[0]).toMatch(/8\.\.2048/);
    expect(issuesFor({ ...baseDoc(), size: [32, 4096] }, 'size[1]')[0]).toMatch(/8\.\.2048/);
    expect(issuesFor({ ...baseDoc(), size: 32 }, 'size')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), size: [32] }, 'size')).toHaveLength(1);
  });
});

describe('yapılandırma alanları uygulanmıştır ve DOĞRULANIR', () => {
  it('tileable kabul edilir, tipi denetlenir', () => {
    expect(collectSpriteDocIssues({ ...baseDoc(), tileable: true })).toEqual([]);
    expect(collectSpriteDocIssues({ ...baseDoc(), tileable: false })).toEqual([]);
    expect(issuesFor({ ...baseDoc(), tileable: 'evet' }, 'tileable')).toHaveLength(1);
  });

  it('shade alanları tek tek denetlenir', () => {
    expect(collectSpriteDocIssues({ ...baseDoc(), shade: {} })).toEqual([]);
    expect(
      collectSpriteDocIssues({
        ...baseDoc(),
        shade: { light: [-0.5, -0.7, 0.5], strength: 0.6, ambient: 0.3, rim: 0.1, relief: 1.2 },
      }),
    ).toEqual([]);

    expect(issuesFor({ ...baseDoc(), shade: 5 }, 'shade')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), shade: { light: [0, 0] } }, 'shade.light')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), shade: { ambient: -1 } }, 'shade.ambient')[0]).toMatch(
      /negatif olamaz/,
    );
    expect(issuesFor({ ...baseDoc(), shade: { emission: 1.1 } }, 'shade.emission')[0]).toMatch(
      /0\.\.1/,
    );
    expect(issuesFor({ ...baseDoc(), shade: { parlaklik: 1 } }, 'shade.parlaklik')).toHaveLength(1);
  });

  it('sıfır ışık vektörü reddedilir — yön taşımalı', () => {
    expect(issuesFor({ ...baseDoc(), shade: { light: [0, 0, 0] } }, 'shade.light')[0]).toMatch(
      /sıfır vektör/,
    );
  });

  it('shade.ao yarıçap ve şiddet ister', () => {
    expect(
      collectSpriteDocIssues({ ...baseDoc(), shade: { ao: { radius: 0.04, strength: 0.4 } } }),
    ).toEqual([]);
    expect(
      issuesFor({ ...baseDoc(), shade: { ao: { radius: -1, strength: 0.4 } } }, 'shade.ao.radius'),
    ).toHaveLength(1);
    expect(
      issuesFor(
        { ...baseDoc(), shade: { ao: { radius: 0.04, strength: 0.4, x: 1 } } },
        'shade.ao.x',
      ),
    ).toHaveLength(1);
  });

  it('shade.ao.radius sınırsız bırakılmaz — boxBlur tampon ayırmayı çökertir', () => {
    // radiusPx = ao.radius * space.short / 2; tavan olmadan `radius: 1e9`
    // boxBlur'un ayırdığı geçici diziyi pratikte sonsuz büyütür.
    expect(
      issuesFor(
        { ...baseDoc(), shade: { ao: { radius: 1e9, strength: 0.4 } } },
        'shade.ao.radius',
      )[0],
    ).toMatch(/aşamaz/);
    expect(
      collectSpriteDocIssues({ ...baseDoc(), shade: { ao: { radius: 4, strength: 0.4 } } }),
    ).toEqual([]);
  });

  it('post.outline denetlenir ve palet sınırına bakar', () => {
    expect(
      collectSpriteDocIssues({
        ...baseDoc(),
        post: { outline: { px: 1, mode: 'inside', colorIndex: 1 } },
      }),
    ).toEqual([]);
    expect(
      issuesFor({ ...baseDoc(), post: { outline: { px: 1.5 } } }, 'post.outline.px')[0],
    ).toMatch(/tam sayı/);
    expect(
      issuesFor(
        { ...baseDoc(), post: { outline: { px: 1, mode: 'yok' } } },
        'post.outline.mode',
      )[0],
    ).toMatch(/outside, inside, centered/);
    expect(
      issuesFor(
        { ...baseDoc(), post: { outline: { px: 1, colorIndex: 9 } } },
        'post.outline.colorIndex',
      )[0],
    ).toMatch(/palet sınırları/);
  });

  it('post.outline.px sınırsız bırakılmaz — dilate/erode tampon ayırmayı çökertir', () => {
    // dilate/erode PİKSEL yarıçapı doğrudan geçici dizinin uzunluğuna eklenir
    // (`span + 2 × px`); glow.radius zaten aynı sınıf riske karşı 64'te
    // sınırlı, outline.px de aynı tavanı almalı.
    expect(
      issuesFor({ ...baseDoc(), post: { outline: { px: 1e9 } } }, 'post.outline.px')[0],
    ).toMatch(/aşamaz/);
    expect(collectSpriteDocIssues({ ...baseDoc(), post: { outline: { px: 64 } } })).toEqual([]);
  });

  it('post.dither türü ve miktarı denetlenir', () => {
    expect(
      collectSpriteDocIssues({ ...baseDoc(), post: { dither: { kind: 'bayer4', amount: 0.2 } } }),
    ).toEqual([]);
    expect(
      issuesFor({ ...baseDoc(), post: { dither: { kind: 'yok' } } }, 'post.dither.kind')[0],
    ).toMatch(/bayer2, bayer4, bayer8, blueNoise/);
    expect(
      issuesFor(
        { ...baseDoc(), post: { dither: { kind: 'none', amount: 2 } } },
        'post.dither.amount',
      )[0],
    ).toMatch(/0\.\.1/);
  });

  it('palette-safe glow post işlemi parametrelerini denetler', () => {
    expect(
      collectSpriteDocIssues({
        ...baseDoc(),
        post: { glow: { radius: 3, strength: 0.8, threshold: 0.4, colorIndex: 1 } },
      }),
    ).toEqual([]);
    expect(
      issuesFor(
        { ...baseDoc(), post: { glow: { radius: 1.5, strength: 0.4 } } },
        'post.glow.radius',
      )[0],
    ).toMatch(/tam sayı/);
    expect(
      issuesFor(
        { ...baseDoc(), post: { glow: { radius: 1, strength: 2 } } },
        'post.glow.strength',
      )[0],
    ).toMatch(/0\.\.1/);
    expect(
      issuesFor(
        { ...baseDoc(), post: { glow: { radius: 1, strength: 0.4, colorIndex: 9 } } },
        'post.glow.colorIndex',
      )[0],
    ).toMatch(/palet sınırları/);
  });

  it('post.quantize iki kipi de kabul eder', () => {
    for (const mode of ['ramp', 'nearest']) {
      expect(collectSpriteDocIssues({ ...baseDoc(), post: { quantize: { mode } } })).toEqual([]);
    }
    expect(
      issuesFor({ ...baseDoc(), post: { quantize: { mode: 'x' } } }, 'post.quantize.mode')[0],
    ).toMatch(/ramp, nearest/);
  });

  it('post tanınmayan alanı yutmaz', () => {
    expect(issuesFor({ ...baseDoc(), post: { keskinlik: 1 } }, 'post.keskinlik')).toHaveLength(1);
  });

  it('alt-yığın maske kabul edilir ve İÇİ de doğrulanır', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].mask = {
      layers: [{ id: 'ic', source: { kind: 'sdf.circle', r: 0.3 }, material: 0 }],
    };
    expect(collectSpriteDocIssues(doc)).toEqual([]);

    const broken = baseDoc();
    (broken.layers as Array<Record<string, unknown>>)[0].mask = {
      layers: [{ id: 'ic', source: { kind: 'sdf.circle' }, material: 0 }],
    };
    expect(issuesFor(broken, 'layers[0].mask[0].source.r')).toHaveLength(1);
  });

  it('alt-yığın derinliği SINIRLIdır (D10)', () => {
    const nest = (depth: number): Record<string, unknown> => {
      let mask: unknown = null;
      for (let i = depth; i > 0; i--) {
        mask = {
          layers: [{ id: `n${i}`, source: { kind: 'const', value: 1 }, material: 0, mask }],
        };
      }
      const doc = baseDoc();
      (doc.layers as Array<Record<string, unknown>>)[0].mask = mask;
      return doc;
    };

    expect(collectSpriteDocIssues(nest(3))).toEqual([]);
    expect(collectSpriteDocIssues(nest(6)).some((issue) => issue.includes('seviyeden derin'))).toBe(
      true,
    );
  });

  it('katman kimlikleri BELGE GENELİNDE benzersizdir', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].mask = {
      layers: [{ id: 'a', source: { kind: 'const', value: 1 }, material: 0 }],
    };
    expect(collectSpriteDocIssues(doc).some((issue) => issue.includes('tekrarlanıyor'))).toBe(true);
  });

  it('alt-yığın yalnızca layers taşır', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].mask = {
      layers: [{ id: 'ic', source: { kind: 'const', value: 1 }, material: 0 }],
      opacity: 0.5,
    };
    expect(issuesFor(doc, 'layers[0].mask.opacity')).toHaveLength(1);
  });

  it('materialAlt ve materialMask BİRLİKTE verilir', () => {
    const withBoth = baseDoc();
    const layer = (withBoth.layers as Array<Record<string, unknown>>)[0];
    (withBoth.palette as Record<string, unknown>).ramps = [
      { id: 0, indices: [0, 1] },
      { id: 1, indices: [1] },
    ];
    layer.materialAlt = 1;
    layer.materialMask = { kind: 'noise.value', freq: 8 };
    layer.materialThreshold = 0.6;
    expect(collectSpriteDocIssues(withBoth)).toEqual([]);

    const onlyAlt = baseDoc();
    (onlyAlt.layers as Array<Record<string, unknown>>)[0].materialAlt = 0;
    expect(issuesFor(onlyAlt, 'layers[0].materialAlt')[0]).toMatch(/birlikte verilir/);
  });

  it('materialAlt tanımlı bir rampaya işaret etmeli', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.materialAlt = 7;
    layer.materialMask = { kind: 'const', value: 1 };
    expect(issuesFor(doc, 'layers[0].materialAlt')[0]).toMatch(/böyle bir rampa yok/);
  });

  it('alan düğümü OLMAYAN adlar nereye ait olduklarını söyler', () => {
    // Gölgeleme ve son işlem `shade`/`post` yapılandırmasıdır; `source`
    // içine yazıldığında "bilinmeyen tür" demek yol göstermez.
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].source = { kind: 'lambert' };
    expect(issuesFor(doc, 'layers[0].source')[0]).toMatch(/alan düğümü değil/);
  });
});

describe('palet sentezi (§7.1)', () => {
  function generatedDoc(generate: unknown): unknown {
    const doc = baseDoc();
    doc.palette = { generate };
    return doc;
  }

  it('sentez isteği kabul edilir ve rampa 0 kendiliğinden oluşur', () => {
    expect(
      collectSpriteDocIssues(generatedDoc([{ base: '#6b5570', steps: 4, hueShift: -18 }])),
    ).toEqual([]);
  });

  it('sentez ile doğrudan veri BİRLİKTE verilemez', () => {
    const doc = baseDoc();
    doc.palette = { colors: ['#000000'], generate: [{ base: '#6b5570', steps: 3 }] };
    expect(issuesFor(doc, 'palette')[0]).toMatch(/birlikte verilemez/);
  });

  it('istek alanları denetlenir', () => {
    expect(issuesFor(generatedDoc([]), 'palette.generate')).toHaveLength(1);
    expect(
      issuesFor(generatedDoc([{ base: 'kirmizi', steps: 3 }]), 'palette.generate[0].base'),
    ).toHaveLength(1);
    expect(
      issuesFor(generatedDoc([{ base: '#112233', steps: 0 }]), 'palette.generate[0].steps')[0],
    ).toMatch(/1\.\.64/);
    expect(
      issuesFor(
        generatedDoc([{ base: '#112233', steps: 3, satCurve: 'yok' }]),
        'palette.generate[0].satCurve',
      )[0],
    ).toMatch(/flat, arch, rise/);
    expect(
      issuesFor(
        generatedDoc([{ base: '#112233', steps: 3, lightRange: [0, 2] }]),
        'palette.generate[0].lightRange[1]',
      )[0],
    ).toMatch(/0\.\.1/);
    expect(
      issuesFor(
        generatedDoc([{ base: '#112233', steps: 3, tonKaymasi: 1 }]),
        'palette.generate[0].tonKaymasi',
      ),
    ).toHaveLength(1);
  });

  it('sentezlenmiş palette dış çizgi indeksi renk sayısına göre denetlenir', () => {
    const doc = generatedDoc([{ base: '#112233', steps: 3 }]) as Record<string, unknown>;
    doc.post = { outline: { px: 1, colorIndex: 5 } };
    expect(issuesFor(doc, 'post.outline.colorIndex')[0]).toMatch(/0\.\.2/);
  });
});

describe('palet doğrulaması', () => {
  it('renk biçimi #rrggbb olmalı', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).colors = ['#fff', 'kirmizi', 123];
    expect(issuesFor(doc, 'palette.colors[')).toHaveLength(3);
  });

  it('palet boş olamaz ve 256 rengi aşamaz', () => {
    const empty = baseDoc();
    (empty.palette as Record<string, unknown>).colors = [];
    expect(issuesFor(empty, 'palette.colors')).toHaveLength(1);

    const tooMany = baseDoc();
    (tooMany.palette as Record<string, unknown>).colors = new Array(257).fill('#000000');
    expect(issuesFor(tooMany, 'palette.colors')[0]).toMatch(/256/);
  });

  it('rampa kimliği tekrarlanamaz', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [
      { id: 0, indices: [0] },
      { id: 0, indices: [1] },
    ];
    expect(issuesFor(doc, 'palette.ramps[1].id')[0]).toMatch(/tekrarlanıyor/);
  });

  it('rampa 0 ZORUNLUDUR — malzeme biriktiricisi onunla başlar', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [{ id: 3, indices: [0, 1] }];
    (doc.layers as Array<Record<string, unknown>>)[0].material = 3;
    expect(issuesFor(doc, 'palette.ramps')[0]).toMatch(/kimliği 0/);
  });

  it('rampa indeksi palet sınırları içinde olmalı', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [{ id: 0, indices: [0, 9] }];
    expect(issuesFor(doc, 'palette.ramps[0].indices[1]')[0]).toMatch(/sınırları dışında/);
  });

  it('rampa biçimi denetlenir', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [5, { id: 0, indices: [] }];
    const issues = collectSpriteDocIssues(doc);
    expect(issues.some((i) => i.startsWith('palette.ramps[0]:'))).toBe(true);
    expect(issues.some((i) => i.startsWith('palette.ramps[1].indices'))).toBe(true);
  });

  it('rampa adı metin olmalı ve kimlik aralığı sınırlıdır', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [
      { id: 0, name: 5, indices: [0] },
      { id: 900, indices: [0] },
    ];
    expect(issuesFor(doc, 'palette.ramps[0].name')).toHaveLength(1);
    expect(issuesFor(doc, 'palette.ramps[1].id')[0]).toMatch(/0\.\.255/);
  });

  it('palet ve rampa dizisi yoksa bildirilir', () => {
    expect(issuesFor({ ...baseDoc(), palette: 5 }, 'palette')).toHaveLength(1);
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).ramps = [];
    expect(issuesFor(doc, 'palette.ramps')).toHaveLength(1);
  });
});

describe('katman doğrulaması', () => {
  it('en az bir katman gerekir', () => {
    expect(issuesFor({ ...baseDoc(), layers: [] }, 'layers')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), layers: 'yok' }, 'layers')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), layers: [3] }, 'layers[0]')).toHaveLength(1);
  });

  it('katman kimliği zorunlu ve BENZERSİZDİR — tohum türetimi buna dayanır', () => {
    const missing = baseDoc();
    delete (missing.layers as Array<Record<string, unknown>>)[0].id;
    expect(issuesFor(missing, 'layers[0].id')).toHaveLength(1);

    const duplicate = baseDoc();
    const layer = (duplicate.layers as Array<Record<string, unknown>>)[0];
    duplicate.layers = [layer, { ...layer }];
    expect(issuesFor(duplicate, 'layers[1].id')[0]).toMatch(/tekrarlanıyor/);
  });

  it('harmanlama modları listeden seçilir', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.blend = 'yok';
    layer.heightBlend = 'over';
    expect(issuesFor(doc, 'layers[0].blend')).toHaveLength(1);
    // `over` kapsama modudur ama yükseklik tarafında tanımlı değildir.
    expect(issuesFor(doc, 'layers[0].heightBlend')).toHaveLength(1);
  });

  it('opacity ve malzeme eşiği 0..1 arasında olmalı', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.opacity = 1.5;
    layer.materialThresholdCoverage = -0.2;
    expect(issuesFor(doc, 'layers[0].opacity')[0]).toMatch(/0\.\.1/);
    expect(issuesFor(doc, 'layers[0].materialThresholdCoverage')[0]).toMatch(/0\.\.1/);
  });

  it('material tanımlı bir rampaya işaret etmeli', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].material = 7;
    expect(issuesFor(doc, 'layers[0].material')[0]).toMatch(/böyle bir rampa yok/);
  });

  it('domain dizisi yalnızca alan-uzayı işlemi kabul eder', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.domain = [
      { kind: 'const', value: 1 },
      { kind: 'rotate' },
      { kind: 'translate', x: 0, y: 0, input: { kind: 'const', value: 1 } },
      5,
    ];
    const issues = collectSpriteDocIssues(doc);

    expect(issues.some((i) => i.includes('bir alan-uzayı işlemi değil'))).toBe(true);
    // `rotate` açısı eksik.
    expect(issues.some((i) => i.startsWith('layers[0].domain[1].angle'))).toBe(true);
    // Zincirde `input` YOKTUR; yazılırsa yoksayılmaz, bildirilir.
    expect(issues.some((i) => i.startsWith('layers[0].domain[2].input'))).toBe(true);
    expect(issues.some((i) => i.startsWith('layers[0].domain[3]:'))).toBe(true);
  });

  it('domain dizi olmalı', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].domain = { kind: 'rotate', angle: 0 };
    expect(issuesFor(doc, 'layers[0].domain')).toHaveLength(1);
  });

  it('maske ve yükseklik alanları da doğrulanır', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.mask = { kind: 'noise.value' };
    layer.height = { kind: 'gradient.radial', radius: -1 };
    expect(issuesFor(doc, 'layers[0].mask.freq')).toHaveLength(1);
    expect(issuesFor(doc, 'layers[0].height.radius')[0]).toMatch(/sıfırdan büyük/);
  });

  it('null maske/yükseklik geçerlidir', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.mask = null;
    layer.height = null;
    layer.domain = null;
    expect(collectSpriteDocIssues(doc)).toEqual([]);
  });
});

describe('izotropik olmayan scale + signed-distance (SDF) semantiği', () => {
  // Regresyon: `scaleInverse` yalnızca koordinatı uzatır, dönen SDF DEĞERİ
  // kaynağın mesafesi kalır (field/domain.ts). Bu, toCoverageFn'in izotropik
  // `space.pixelUnit` kenar-yumuşatma genişliğini ve sdf.smoothUnion/
  // smoothSub/smoothIntersection harman yarıçapını YANLIŞ hale getirir.
  // `resolveFieldDomain`in kendi ön koşulu (yalnızca yapısal olarak geçerli
  // bir ağaçta güvenli) bu denetimin YAPISAL sorunlar sıfırlandıktan SONRA
  // koştuğunu da dolaylı doğruluyor: aşağıdaki her belge YAPISAL olarak
  // tamamen geçerli, yalnızca bu semantik kural ihlal ediliyor.

  it('anizotropik scale (x≠y) bir SDF alt-ağacını sarmalıyorsa reddedilir', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = {
      kind: 'scale',
      x: 2,
      y: 1,
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    };
    const issues = issuesFor(doc, 'layers[0].source');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/izotropik olmayan `scale`/);
    expect(issues[0]).toMatch(/signed-distance/);
  });

  it("izotropik scale (x=y) bir SDF'yi sarmalıyorsa REDDEDİLMEZ — Lipschitz sabiti bozulmaz", () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = {
      kind: 'scale',
      x: 1.5,
      y: 1.5,
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    };
    expect(collectSpriteDocIssues(doc)).toEqual([]);
  });

  it('anizotropik scale signed OLMAYAN bir alanı sarmalıyorsa REDDEDİLMEZ', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = {
      kind: 'scale',
      x: 2,
      y: 1,
      input: { kind: 'noise.value', freq: 4 },
    };
    expect(collectSpriteDocIssues(doc)).toEqual([]);
  });

  it('katman düzeyindeki `domain` zincirindeki scale REDDEDİLMEZ — coverage SONRASINA uygulanır', () => {
    // renderLayer domain zincirini compileCoverage'dan SONRA uygular (bkz.
    // render.ts renderLayer): SDF değeri o noktada zaten kapsamaya
    // dönüşmüştür, coordinat yeniden örneklemesi zararsızdır.
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
    layer.domain = [{ kind: 'scale', x: 2, y: 1 }];
    expect(collectSpriteDocIssues(doc)).toEqual([]);
  });

  it("propagate: iki SDF'yi min/max ile birleştiren düğüm de signed sayılır", () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = {
      kind: 'scale',
      x: 2,
      y: 1,
      input: {
        kind: 'min',
        a: { kind: 'sdf.circle', center: [0, 0], r: 0.3 },
        b: { kind: 'sdf.circle', center: [0.2, 0], r: 0.3 },
      },
    };
    const issues = issuesFor(doc, 'layers[0].source');
    expect(issues).toHaveLength(1);
  });

  it('sdf.smoothUnion operandı anizotropik ölçekliyse reddedilir', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.source = {
      kind: 'sdf.smoothUnion',
      k: 0.1,
      a: {
        kind: 'scale',
        x: 2,
        y: 1,
        input: { kind: 'sdf.circle', center: [0, 0], r: 0.3 },
      },
      b: { kind: 'sdf.circle', center: [0.3, 0], r: 0.3 },
    };
    const issues = issuesFor(doc, 'layers[0].source.a');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/izotropik olmayan `scale`/);
  });

  it('maske ve yükseklik alt-ağaçları da denetlenir', () => {
    const dangerous = () => ({
      kind: 'scale',
      x: 2,
      y: 1,
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    });
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.mask = dangerous();
    layer.height = dangerous();

    const issues = collectSpriteDocIssues(doc);
    expect(issues.some((i) => i.startsWith('layers[0].mask:'))).toBe(true);
    expect(issues.some((i) => i.startsWith('layers[0].height:'))).toBe(true);
  });
});

describe('parametre şeması doğrulaması', () => {
  it('zorunlu parametre eksikse bildirilir', () => {
    expect(collectFieldIssues({ kind: 'sdf.circle' })[0]).toMatch(/zorunlu alan eksik/);
  });

  it('opsiyonel parametre atlanabilir', () => {
    expect(collectFieldIssues({ kind: 'sdf.circle', r: 0.5 })).toEqual([]);
    expect(collectFieldIssues({ kind: 'noise.value', freq: 4 })).toEqual([]);
  });

  it('vec2 iki elemanlı sonlu dizi olmalı', () => {
    expect(collectFieldIssues({ kind: 'sdf.circle', center: [0], r: 1 })[0]).toMatch(
      /iki elemanlı/,
    );
    expect(collectFieldIssues({ kind: 'sdf.circle', center: 'x', r: 1 })[0]).toMatch(
      /iki elemanlı/,
    );
    expect(collectFieldIssues({ kind: 'sdf.circle', center: [0, NaN], r: 1 })[0]).toMatch(/sonlu/);
  });

  it('vec2 kısıtı bileşen bazında uygulanır', () => {
    expect(collectFieldIssues({ kind: 'sdf.box', half: [0.5, -1] })[0]).toMatch(/negatif olamaz/);
  });

  it('int parametre kesirli değeri reddeder', () => {
    expect(collectFieldIssues({ kind: 'noise.value', freq: 4, seed: 1.5 })[0]).toMatch(/tam sayı/);
  });

  it('nonZero kısıtı sıfırı reddeder', () => {
    const node = { kind: 'scale', x: 0, y: 1, input: { kind: 'const', value: 1 } };
    expect(collectFieldIssues(node)[0]).toMatch(/sıfır olamaz/);
  });

  it('unit kısıtı aralık dışını reddeder', () => {
    const node = {
      kind: 'mix',
      a: { kind: 'const', value: 0 },
      b: { kind: 'const', value: 1 },
      t: 2,
    };
    expect(collectFieldIssues(node)[0]).toMatch(/0\.\.1/);
  });

  it('tanınmayan parametre sessizce yutulmaz', () => {
    expect(collectFieldIssues({ kind: 'const', value: 1, renk: '#fff' })[0]).toMatch(
      /böyle bir parametre tanımıyor/,
    );
  });

  it('alan olmayan bir değer alan yerine geçemez', () => {
    expect(collectFieldIssues({ kind: 'step', edge: 0, input: 5 })[0]).toMatch(/alan düğümü/);
    expect(collectFieldIssues('metin')[0]).toMatch(/alan düğümü/);
    expect(collectFieldIssues({ value: 1 })[0]).toMatch(/`kind` alanı zorunlu/);
  });

  it('bool parametre tipi denetlenir', () => {
    // Tur 1'de bool parametreli düğüm yok; şema tipinin kendisi doğrudan sınanır.
    const doc = { ...baseDoc(), antialias: 'evet' };
    expect(issuesFor(doc, 'antialias')).toHaveLength(1);
    expect(collectSpriteDocIssues({ ...baseDoc(), antialias: true })).toEqual([]);
  });

  it('çok derin ağaç yığın taşırmaz, REDDEDİLİR', () => {
    let node: Record<string, unknown> = { kind: 'const', value: 1 };
    for (let i = 0; i <= MAX_FIELD_DEPTH + 1; i++) {
      node = { kind: 'step', edge: 0, input: node };
    }
    const issues = collectFieldIssues(node);
    expect(issues.some((i) => i.includes('seviyeden derin olamaz'))).toBe(true);
  });

  it('validateField geçerli ağacı döndürür, geçersizde fırlatır', () => {
    expect(validateField({ kind: 'const', value: 0.5 })).toEqual({ kind: 'const', value: 0.5 });
    expect(() => validateField({ kind: 'const' })).toThrow(/Alan geçersiz/);
  });
});

describe('Tur 2 parametre tipleri', () => {
  it('enum yalnızca listedeki değeri kabul eder', () => {
    expect(collectFieldIssues({ kind: 'noise.worley', freq: 4, mode: 'F3' })[0]).toMatch(
      /F1, F2, F2-F1/,
    );
    expect(collectFieldIssues({ kind: 'noise.worley', freq: 4, mode: 'F2' })).toEqual([]);
    expect(collectFieldIssues({ kind: 'noise.worley', freq: 4 })).toEqual([]);
  });

  it('points en az iki geçerli çift ister', () => {
    const withPoints = (points: unknown): unknown => ({
      kind: 'curve',
      points,
      input: { kind: 'const', value: 0.5 },
    });

    expect(collectFieldIssues(withPoints([[0, 0]]))[0]).toMatch(/en az iki nokta/);
    expect(collectFieldIssues(withPoints('eğri'))[0]).toMatch(/en az iki nokta/);
    expect(collectFieldIssues(withPoints([[0, 0], [1]]))[0]).toMatch(/girdi, çıktı/);
    expect(
      collectFieldIssues(
        withPoints([
          [0, 0],
          [1, NaN],
        ]),
      )[0],
    ).toMatch(/sonlu/);
    expect(
      collectFieldIssues(
        withPoints([
          [0, 0],
          [1, 1],
        ]),
      ),
    ).toEqual([]);
  });

  it('atLeastThree kısıtı düşük kenar sayısını reddeder', () => {
    expect(collectFieldIssues({ kind: 'sdf.polygon', n: 2, r: 0.5 })[0]).toMatch(/en az 3/);
    expect(collectFieldIssues({ kind: 'sdf.star', n: 2, rOuter: 0.5, rInner: 0.2 })[0]).toMatch(
      /en az 3/,
    );
  });

  it('points dizisi MAX_POINTS sınırından uzun olamaz — piksel başına doğrusal tarama var', () => {
    const tooLong = Array.from({ length: MAX_POINTS + 1 }, (_, i) => [i, i] as [number, number]);
    const node = {
      kind: 'curve',
      points: tooLong,
      input: { kind: 'const', value: 0.5 },
    };
    expect(collectFieldIssues(node)[0]).toMatch(new RegExp(`en fazla ${MAX_POINTS} nokta`));

    const atLimit = Array.from({ length: MAX_POINTS }, (_, i) => [i, i] as [number, number]);
    expect(
      collectFieldIssues({ kind: 'curve', points: atLimit, input: { kind: 'const', value: 0.5 } }),
    ).toEqual([]);
  });

  it('unitRadiusParam tabanlı düğümler (blur/sharpen/dilate/erode) hardMax değerini aşamaz', () => {
    // boxBlur/gaussBlur geçici diziyi `span + 2 × piksel yarıçapı` uzunluğunda
    // ayırır; tavan olmadan `radius: 1e9` bunu çökertir.
    for (const kind of ['blur', 'dilate', 'erode'] as const) {
      expect(
        collectFieldIssues({ kind, radius: 1e9, input: { kind: 'const', value: 1 } })[0],
      ).toMatch(/aşamaz/);
    }
    expect(
      collectFieldIssues({
        kind: 'sharpen',
        amount: 1,
        radius: 1e9,
        input: { kind: 'const', value: 1 },
      })[0],
    ).toMatch(/aşamaz/);
    expect(
      collectFieldIssues({ kind: 'blur', radius: 0.3, input: { kind: 'const', value: 1 } }),
    ).toEqual([]);
  });

  it('noise.fbm octaves hardMax değerini aşamaz — her oktav piksel başına ek örnekleme', () => {
    const node = {
      kind: 'noise.fbm',
      base: { kind: 'noise.value', freq: 4 },
      octaves: 1e6,
    };
    expect(collectFieldIssues(node)[0]).toMatch(/aşamaz/);
    expect(
      collectFieldIssues({
        kind: 'noise.fbm',
        base: { kind: 'noise.value', freq: 4 },
        octaves: 8,
      }),
    ).toEqual([]);
  });

  it('scatter count hardMax değerini aşamaz — her örnek kendi damga döngüsünü çalıştırır', () => {
    const node = {
      kind: 'scatter',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.1 },
      count: 1e6,
    };
    expect(collectFieldIssues(node).some((issue) => issue.match(/count.*aşamaz/))).toBe(true);
    expect(
      collectFieldIssues({
        kind: 'scatter',
        source: { kind: 'sdf.circle', center: [0, 0], r: 0.1 },
        count: 512,
      }),
    ).toEqual([]);
  });
});

describe('türe özel anlamsal kurallar', () => {
  it('tekil kesme reddedilir — düzlem bir doğruya çöker', () => {
    const singular = { kind: 'skew', x: 2, y: 0.5, input: { kind: 'const', value: 1 } };
    expect(collectFieldIssues(singular)[0]).toMatch(/tekildir/);

    const fine = { kind: 'skew', x: 0.5, y: 0.5, input: { kind: 'const', value: 1 } };
    expect(collectFieldIssues(fine)).toEqual([]);
  });

  it('radial aynalama kol sayısı ister', () => {
    const missing = { kind: 'mirror', axis: 'radial', input: { kind: 'const', value: 1 } };
    expect(collectFieldIssues(missing)[0]).toMatch(/kol sayısı/);

    const given = { ...missing, count: 5 };
    expect(collectFieldIssues(given)).toEqual([]);
    // Diğer eksenler sayı istemez.
    expect(collectFieldIssues({ ...missing, axis: 'quad' })).toEqual([]);
  });

  it('tamponlu düğümler de şemadan doğrulanır', () => {
    expect(
      collectFieldIssues({ kind: 'blur', radius: -1, input: { kind: 'const', value: 1 } })[0],
    ).toMatch(/negatif olamaz/);
    expect(
      collectFieldIssues({ kind: 'scatter', source: { kind: 'const', value: 1 }, count: 0 })[0],
    ).toMatch(/sıfırdan büyük/);
    expect(
      collectFieldIssues({
        kind: 'warp',
        by: { kind: 'const', value: 1 },
        amount: 0.1,
        sample: 'kübik',
        input: { kind: 'const', value: 1 },
      })[0],
    ).toMatch(/nearest, bilinear/);
  });

  it('döşeme kuralları tek başına doğrulanan alanda da uygulanabilir', () => {
    const simplex = { kind: 'noise.simplex', freq: 4 };
    expect(collectFieldIssues(simplex, 'field', true)[0]).toMatch(/EĞİK/);
    expect(collectFieldIssues(simplex, 'field', false)).toEqual([]);
  });
});
