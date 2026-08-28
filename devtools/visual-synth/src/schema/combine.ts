/**
 * Birleştirici şemaları — §4.3.
 *
 * `min`/`max` işaretli mesafede BİRLEŞİM/KESİŞİM demektir; ayrı bir boolean
 * primitifi gerekmez (D9). `abs` bir SDF'yi kontura çevirir: `sub(abs(d), w)`
 * ile kalınlığı `w` olan bir çerçeve elde edilir — ayrı bir çerçeve primitifi
 * de gerekmez.
 */

import type { NodeSchema, ParamSchema } from './types';
import { FROM_AB, FROM_INPUT, INPUT_PARAM, UNIT } from './types';

const A_PARAM: ParamSchema = { name: 'a', type: 'field', description: 'Birinci alan.' };
const B_PARAM: ParamSchema = { name: 'b', type: 'field', description: 'İkinci alan.' };

function binary(kind: NodeSchema['kind'], description: string, unitOnly = false): NodeSchema {
  return {
    kind,
    category: 'combine',
    output: unitOnly ? UNIT : FROM_AB,
    description,
    params: [A_PARAM, B_PARAM],
  };
}

export const COMBINE_SCHEMAS: readonly NodeSchema[] = [
  binary('add', 'Toplama. SDF üzerinde şekli büyütmek/küçültmek için kullanılır.'),
  binary('sub', 'Çıkarma. SDF üzerinde kontur bandı kurmanın yolu.'),
  binary('mul', 'Çarpma. Maskeleme ve mesafe ölçekleme.'),
  binary('min', 'Küçük olan. SDF üzerinde BİRLEŞİM demektir.'),
  binary('max', 'Büyük olan. SDF üzerinde KESİŞİM demektir.'),
  {
    kind: 'sdf.smoothUnion',
    category: 'combine',
    output: FROM_AB,
    description: 'İki signed-distance alanını yumuşak birleşimle bağlar.',
    params: [
      A_PARAM,
      B_PARAM,
      {
        name: 'k',
        type: 'number',
        range: [0, 1],
        step: 0.01,
        default: 0.15,
        constraint: 'nonNegative',
        description: 'Geçiş yarıçapı; 0 sert birleşimdir.',
      },
    ],
  },
  {
    kind: 'sdf.smoothSub',
    category: 'combine',
    output: FROM_AB,
    description: 'İkinci signed-distance alanını birinciden yumuşak biçimde çıkarır.',
    params: [
      A_PARAM,
      B_PARAM,
      {
        name: 'k',
        type: 'number',
        range: [0, 1],
        step: 0.01,
        default: 0.15,
        constraint: 'nonNegative',
        description: 'Geçiş yarıçapı; 0 sert çıkarmadır.',
      },
    ],
  },
  {
    kind: 'sdf.smoothIntersection',
    category: 'combine',
    output: FROM_AB,
    description: 'İki signed-distance alanını yumuşak kesişimle bağlar.',
    params: [
      A_PARAM,
      B_PARAM,
      {
        name: 'k',
        type: 'number',
        range: [0, 1],
        step: 0.01,
        default: 0.15,
        constraint: 'nonNegative',
        description: 'Geçiş yarıçapı; 0 sert kesişimdir.',
      },
    ],
  },
  binary('screen', 'Aydınlatır: 1 − (1−a)(1−b). Birim alanlar içindir.', true),
  binary('overlay', 'Kontrastı artırır: koyuda çarpma, açıkta screen.', true),
  {
    kind: 'mix',
    category: 'combine',
    output: FROM_AB,
    description: 'İki alan arasında doğrusal karışım.',
    params: [
      A_PARAM,
      B_PARAM,
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
  {
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
  {
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
  {
    kind: 'remap',
    category: 'combine',
    output: FROM_INPUT,
    description: 'Bir aralığı başka bir aralığa taşır; kelepçelemez.',
    params: [
      {
        name: 'inMin',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: 'Girdi alt sınırı.',
      },
      {
        name: 'inMax',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 1,
        description: 'Girdi üst sınırı.',
      },
      {
        name: 'outMin',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: 'Çıktı alt sınırı.',
      },
      {
        name: 'outMax',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 1,
        description: 'Çıktı üst sınırı.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'curve',
    category: 'combine',
    output: UNIT,
    description: 'Parçalı doğrusal aktarım eğrisi; aralık dışı girdi uç değerde kelepçelenir.',
    params: [
      {
        name: 'points',
        type: 'points',
        default: [
          [0, 0],
          [1, 1],
        ],
        description: 'En az iki `[girdi, çıktı]` noktası. Varsayılan kimlik eğrisidir.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'clamp',
    category: 'combine',
    output: FROM_INPUT,
    description: 'Değeri bir aralığa kelepçeler.',
    params: [
      {
        name: 'min',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: 'Alt sınır.',
      },
      {
        name: 'max',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 1,
        description: 'Üst sınır.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'abs',
    category: 'combine',
    output: FROM_INPUT,
    description: 'Mutlak değer; bir SDF ile birlikte kontur kurmanın yolu.',
    params: [INPUT_PARAM],
  },
  {
    kind: 'invert',
    category: 'combine',
    output: UNIT,
    description: '1 − x; kapsama alanlarını tersine çevirir.',
    params: [INPUT_PARAM],
  },
];
