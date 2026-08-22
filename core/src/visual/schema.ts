/**
 * Parametre şeması — D11'in veri tarafı.
 *
 * Her primitifin parametreleri KODLA DEĞİL VERİYLE bildirilir. Aynı bildirim
 * iki yerde tüketilir:
 *
 * - **Doğrulama** (`validate.ts`) — agent'ın yazdığı JSON sınırda denetlenir.
 * - **Arayüz üretimi** (Tur 4) — editör kontrollerini buradan türetir;
 *   otuz beş primitifin parametrelerini elle bağlamak sürdürülemez.
 *
 * Şema ayrıca her düğümün ÇIKTI ETKİ ALANINI (`unit` / `signed`) bildirir.
 * Bu, katman kaynağının kapsamaya nasıl çevrileceğini belirleyen tek
 * bilgidir (§5.8) ve statik olarak türetilir — çalışma anında değer
 * yoklanmaz.
 */

import type { FieldDomain, FieldKind, FieldNode } from './types';

/** Editörün üreteceği kontrol türü (D11). */
export type ParamType = 'number' | 'int' | 'bool' | 'vec2' | 'enum' | 'field';

/**
 * Doğrulamanın uyguladığı SERT kısıt.
 *
 * `range`den ayrıdır ve ayrılığı bilinçlidir: `range` editörün kaydırıcı
 * sınırıdır (rahat bir aralık), `constraint` matematiğin gerçekten
 * kırıldığı yerdir. İkisini birleştirmek, kaydırıcı rahatlığı için
 * gevşetilen bir sınırın sessizce doğrulamayı da gevşetmesi demekti.
 */
export type ParamConstraint = 'positive' | 'nonNegative' | 'nonZero' | 'unit';

export interface ParamSchema {
  name: string;
  type: ParamType;
  /** Editör kaydırıcısının sınırları — doğrulama kuralı DEĞİL. */
  range?: readonly [number, number];
  step?: number;
  default?: number | boolean | readonly [number, number];
  constraint?: ParamConstraint;
  optional?: boolean;
  description: string;
}

/**
 * Düğümün çıktı etki alanı nasıl belirlenir.
 *
 * - `fixed`     — türden gelir (üreteçler, eşikler).
 * - `inherit`   — tek girdisinden gelir (alan-uzayı işlemleri koordinatı
 *   değiştirir, değerin anlamını değiştirmez).
 * - `propagate` — girdilerden HERHANGİ BİRİ `signed` ise sonuç `signed`.
 *   `min`/`max` iki SDF'nin birleşimi/kesişimidir; `add` bir SDF'yi
 *   ötelemek (şekli büyütmek) için kullanılır; `mul` mesafeyi ölçekler.
 */
export type OutputRule =
  | { readonly kind: 'fixed'; readonly domain: FieldDomain }
  | { readonly kind: 'inherit'; readonly from: string }
  | { readonly kind: 'propagate'; readonly from: readonly string[] };

export interface NodeSchema {
  kind: FieldKind;
  category: 'generator' | 'domain' | 'combine';
  output: OutputRule;
  params: readonly ParamSchema[];
  description: string;
}

const UNIT: OutputRule = { kind: 'fixed', domain: 'unit' };
const SIGNED: OutputRule = { kind: 'fixed', domain: 'signed' };
const FROM_INPUT: OutputRule = { kind: 'inherit', from: 'input' };
const FROM_AB: OutputRule = { kind: 'propagate', from: ['a', 'b'] };

const INPUT_PARAM: ParamSchema = {
  name: 'input',
  type: 'field',
  description: 'Dönüştürülecek alan.',
};

const CENTER_PARAM: ParamSchema = {
  name: 'center',
  type: 'vec2',
  range: [-2, 2],
  default: [0, 0],
  optional: true,
  description: 'İşlemin sabit noktası; verilmezse birim uzayın kökeni.',
};

/**
 * Tur 1'de uygulanan primitifler. Sıra editörde de bu sırayla görünür:
 * üreteçler, alan-uzayı, birleştiriciler.
 */
export const NODE_SCHEMAS: Readonly<Record<FieldKind, NodeSchema>> = {
  const: {
    kind: 'const',
    category: 'generator',
    output: UNIT,
    description: 'Sabit alan; maske ve karışım için taban.',
    params: [
      {
        name: 'value',
        type: 'number',
        range: [0, 1],
        step: 0.01,
        default: 1,
        description: 'Her noktada dönen değer.',
      },
    ],
  },
  'noise.value': {
    kind: 'noise.value',
    category: 'generator',
    output: UNIT,
    description: 'Kafes tabanlı değer gürültüsü; en ucuz gürültü, blok karakterli.',
    params: [
      {
        name: 'freq',
        type: 'number',
        range: [1, 64],
        step: 1,
        default: 8,
        constraint: 'positive',
        description: 'Kısa kenar boyunca hücre sayısı.',
      },
      {
        name: 'seed',
        type: 'int',
        optional: true,
        description: 'Verilmezse düğüm yolundan türetilir (D5).',
      },
    ],
  },
  'gradient.linear': {
    kind: 'gradient.linear',
    category: 'generator',
    output: UNIT,
    description: 'Bir eksen boyunca 0→1 rampası.',
    params: [
      {
        name: 'angle',
        type: 'number',
        range: [-180, 180],
        step: 1,
        default: 0,
        description: 'Rampanın yönü, DERECE.',
      },
      {
        name: 'from',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: -1,
        description: 'Rampanın 0 olduğu birim-uzay konumu.',
      },
      {
        name: 'to',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 1,
        description: 'Rampanın 1 olduğu birim-uzay konumu.',
      },
    ],
  },
  'gradient.radial': {
    kind: 'gradient.radial',
    category: 'generator',
    output: UNIT,
    description: 'Merkezde 1, yarıçapta 0 olan dairesel rampa; hacim tabanı.',
    params: [
      CENTER_PARAM,
      {
        name: 'radius',
        type: 'number',
        range: [0.01, 2],
        step: 0.01,
        default: 1,
        constraint: 'positive',
        description: 'Rampanın sıfıra indiği uzaklık.',
      },
    ],
  },
  'sdf.circle': {
    kind: 'sdf.circle',
    category: 'generator',
    output: SIGNED,
    description: 'Daire işaretli mesafesi; negatif içeridedir.',
    params: [
      CENTER_PARAM,
      {
        name: 'r',
        type: 'number',
        range: [0.01, 2],
        step: 0.01,
        default: 0.5,
        constraint: 'positive',
        description: 'Yarıçap.',
      },
    ],
  },
  'sdf.box': {
    kind: 'sdf.box',
    category: 'generator',
    output: SIGNED,
    description: 'Kutu işaretli mesafesi; negatif içeridedir.',
    params: [
      CENTER_PARAM,
      {
        name: 'half',
        type: 'vec2',
        range: [0, 2],
        step: 0.01,
        default: [0.5, 0.5],
        constraint: 'nonNegative',
        description: 'Yarım kenar uzunlukları.',
      },
    ],
  },
  translate: {
    kind: 'translate',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Alanı öteler.',
    params: [
      {
        name: 'x',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: 'Yatay öteleme.',
      },
      {
        name: 'y',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: 'Dikey öteleme.',
      },
      INPUT_PARAM,
    ],
  },
  rotate: {
    kind: 'rotate',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Alanı döndürür; +y aşağı olduğu için pozitif açı saat yönündedir.',
    params: [
      {
        name: 'angle',
        type: 'number',
        range: [-180, 180],
        step: 1,
        default: 0,
        description: 'Dönme açısı, DERECE.',
      },
      CENTER_PARAM,
      INPUT_PARAM,
    ],
  },
  scale: {
    kind: 'scale',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Alanı ölçekler; bileşenler ayrı olduğu için anizotropiktir.',
    params: [
      {
        name: 'x',
        type: 'number',
        range: [0.05, 8],
        step: 0.01,
        default: 1,
        constraint: 'nonZero',
        description: 'Yatay ölçek.',
      },
      {
        name: 'y',
        type: 'number',
        range: [0.05, 8],
        step: 0.01,
        default: 1,
        constraint: 'nonZero',
        description: 'Dikey ölçek.',
      },
      CENTER_PARAM,
      INPUT_PARAM,
    ],
  },
  add: {
    kind: 'add',
    category: 'combine',
    output: FROM_AB,
    description: 'Toplama. SDF üzerinde şekli büyütmek/küçültmek için kullanılır.',
    params: [
      { name: 'a', type: 'field', description: 'Birinci alan.' },
      { name: 'b', type: 'field', description: 'İkinci alan.' },
    ],
  },
  mul: {
    kind: 'mul',
    category: 'combine',
    output: FROM_AB,
    description: 'Çarpma. Maskeleme ve mesafe ölçekleme.',
    params: [
      { name: 'a', type: 'field', description: 'Birinci alan.' },
      { name: 'b', type: 'field', description: 'İkinci alan.' },
    ],
  },
  min: {
    kind: 'min',
    category: 'combine',
    output: FROM_AB,
    description: 'Küçük olan. SDF üzerinde BİRLEŞİM demektir.',
    params: [
      { name: 'a', type: 'field', description: 'Birinci alan.' },
      { name: 'b', type: 'field', description: 'İkinci alan.' },
    ],
  },
  max: {
    kind: 'max',
    category: 'combine',
    output: FROM_AB,
    description: 'Büyük olan. SDF üzerinde KESİŞİM demektir.',
    params: [
      { name: 'a', type: 'field', description: 'Birinci alan.' },
      { name: 'b', type: 'field', description: 'İkinci alan.' },
    ],
  },
  mix: {
    kind: 'mix',
    category: 'combine',
    output: FROM_AB,
    description: 'İki alan arasında doğrusal karışım.',
    params: [
      { name: 'a', type: 'field', description: 'Birinci alan.' },
      { name: 'b', type: 'field', description: 'İkinci alan.' },
      {
        name: 't',
        type: 'number',
        range: [0, 1],
        step: 0.01,
        default: 0.5,
        constraint: 'unit',
        description: 'Karışım oranı; 0 = a, 1 = b.',
      },
    ],
  },
  step: {
    kind: 'step',
    category: 'combine',
    output: UNIT,
    description: 'Sert eşik: girdi eşiğe eşit ya da büyükse 1.',
    params: [
      {
        name: 'edge',
        type: 'number',
        range: [-1, 1],
        step: 0.01,
        default: 0,
        description: 'Eşik değeri.',
      },
      INPUT_PARAM,
    ],
  },
  smoothstep: {
    kind: 'smoothstep',
    category: 'combine',
    output: UNIT,
    description: 'Yumuşak eşik; e0 > e1 verilerek azalan rampa elde edilir.',
    params: [
      {
        name: 'e0',
        type: 'number',
        range: [-1, 1],
        step: 0.01,
        default: 0,
        description: 'Sonucun 0 olduğu girdi değeri.',
      },
      {
        name: 'e1',
        type: 'number',
        range: [-1, 1],
        step: 0.01,
        default: 1,
        description: 'Sonucun 1 olduğu girdi değeri.',
      },
      INPUT_PARAM,
    ],
  },
};

/** Uygulanmış düğüm türleri — hata mesajlarında ve editör listesinde kullanılır. */
export const FIELD_KINDS: readonly FieldKind[] = Object.keys(NODE_SCHEMAS) as FieldKind[];

/**
 * Bir alan ağacının çıktı etki alanını STATİK olarak çözer.
 *
 * Doğrulama bu fonksiyonu çağırmadan önce ağacın yapısını denetler; buraya
 * yalnızca geçerli bir ağaç gelir.
 */
export function resolveFieldDomain(node: FieldNode): FieldDomain {
  const rule = NODE_SCHEMAS[node.kind].output;
  if (rule.kind === 'fixed') return rule.domain;

  const record = node as unknown as Record<string, FieldNode>;
  if (rule.kind === 'inherit') return resolveFieldDomain(record[rule.from]);

  for (const name of rule.from) {
    if (resolveFieldDomain(record[name]) === 'signed') return 'signed';
  }
  return 'unit';
}
