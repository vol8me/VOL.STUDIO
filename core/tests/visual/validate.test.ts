import { describe, it, expect } from 'vitest';
import {
  collectFieldIssues,
  collectSpriteDocIssues,
  validateField,
  validateSpriteDoc,
  MAX_FIELD_DEPTH,
} from '../../src/visual/validate';

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

describe('henüz uygulanmamış alanlar sessizce YOKSAYILMAZ', () => {
  it('tileable artık kabul edilir, tipi denetlenir', () => {
    expect(collectSpriteDocIssues({ ...baseDoc(), tileable: true })).toEqual([]);
    expect(collectSpriteDocIssues({ ...baseDoc(), tileable: false })).toEqual([]);
    expect(issuesFor({ ...baseDoc(), tileable: 'evet' }, 'tileable')).toHaveLength(1);
  });

  it('shade ve post alanları geldikleri turu söyler', () => {
    expect(issuesFor({ ...baseDoc(), shade: {} }, 'shade')[0]).toMatch(/Tur 3/);
    expect(issuesFor({ ...baseDoc(), post: { outline: {} } }, 'post.outline')[0]).toMatch(/Tur 3/);
    expect(issuesFor({ ...baseDoc(), post: { dither: {} } }, 'post.dither')[0]).toMatch(/Tur 3/);
    expect(
      issuesFor({ ...baseDoc(), post: { quantize: { mode: 'nearest' } } }, 'post.quantize.mode')[0],
    ).toMatch(/Tur 3/);
  });

  it('post biçimi denetlenir', () => {
    expect(issuesFor({ ...baseDoc(), post: 5 }, 'post')).toHaveLength(1);
    expect(issuesFor({ ...baseDoc(), post: { quantize: 5 } }, 'post.quantize')).toHaveLength(1);
    expect(
      issuesFor({ ...baseDoc(), post: { quantize: { mode: 'x' } } }, 'post.quantize.mode'),
    ).toHaveLength(1);
    expect(collectSpriteDocIssues({ ...baseDoc(), post: { quantize: { mode: 'ramp' } } })).toEqual(
      [],
    );
  });

  it('alan düğümü OLMAYAN adlar nereye ait olduklarını söyler', () => {
    // Gölgeleme ve son işlem `shade`/`post` yapılandırmasıdır; `source`
    // içine yazıldığında "bilinmeyen tür" demek yol göstermez.
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].source = { kind: 'lambert' };
    expect(issuesFor(doc, 'layers[0].source')[0]).toMatch(/Tur 3.*alan düğümü değil/);
  });

  it('bilinmeyen düğüm uygulanabilir türleri listeler', () => {
    const doc = baseDoc();
    (doc.layers as Array<Record<string, unknown>>)[0].source = { kind: 'sdf.hicbirsey' };
    expect(issuesFor(doc, 'layers[0].source')[0]).toMatch(/Uygulananlar:.*sdf\.circle/);
  });

  it('alt-yığın maske ve ikinci malzeme alanları turlarını söyler', () => {
    const doc = baseDoc();
    const layer = (doc.layers as Array<Record<string, unknown>>)[0];
    layer.mask = { layers: [] };
    layer.materialAlt = 1;
    layer.materialMask = { kind: 'const', value: 1 };
    layer.materialThreshold = 0.5;

    const issues = collectSpriteDocIssues(doc);
    expect(issues.filter((i) => i.includes('Tur 3')).length).toBe(4);
  });

  it('palette.generate turunu söyler', () => {
    const doc = baseDoc();
    (doc.palette as Record<string, unknown>).generate = { base: '#000000' };
    expect(issuesFor(doc, 'palette.generate')[0]).toMatch(/Tur 3/);
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
