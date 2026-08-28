/**
 * Alan-uzayı işlemi şemaları — §4.2. Genelliğin kaynağı bunlardır.
 *
 * Hepsi etki alanını GİRDİSİNDEN devralır: koordinatı değiştirirler, değerin
 * anlamını değiştirmezler. Döndürülmüş bir SDF hâlâ bir SDF'dir.
 */

import type { NodeSchema } from './types';
import { CENTER_PARAM, FROM_INPUT, INPUT_PARAM } from './types';

export const DOMAIN_SCHEMAS: readonly NodeSchema[] = [
  {
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
  {
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
  {
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
  {
    kind: 'skew',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Kesme (shear); eğik gövde ve perspektif hissi için.',
    params: [
      {
        name: 'x',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: "y'ye bağlı yatay kayma.",
      },
      {
        name: 'y',
        type: 'number',
        range: [-2, 2],
        step: 0.01,
        default: 0,
        description: "x'e bağlı dikey kayma.",
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'mirror',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Simetri katlaması; kökene göre çalışır.',
    params: [
      {
        name: 'axis',
        type: 'enum',
        options: ['x', 'y', 'quad', 'radial'],
        default: 'x',
        description: 'Hangi eksende katlanacağı; `radial` n kollu simetri verir.',
      },
      {
        name: 'count',
        type: 'int',
        range: [2, 24],
        step: 1,
        default: 6,
        optional: true,
        constraint: 'positive',
        description: 'Yalnızca `radial` için: kol sayısı.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'repeat',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Döşeme; `mirror` modu komşu hücreleri yansıtarak dikişi gizler.',
    params: [
      {
        name: 'count',
        type: 'number',
        range: [1, 32],
        step: 1,
        default: 4,
        constraint: 'positive',
        description: 'Kısa kenar boyunca hücre sayısı.',
      },
      {
        name: 'mode',
        type: 'enum',
        options: ['tile', 'mirror'],
        default: 'tile',
        optional: true,
        description: 'Düz döşeme ya da yansıtmalı döşeme.',
      },
      CENTER_PARAM,
      INPUT_PARAM,
    ],
  },
  {
    kind: 'polar',
    category: 'domain',
    output: FROM_INPUT,
    description: 'Kutupsal dönüşüm: yatay çizgiler halkaya, dikey çizgiler ışınlara döner.',
    params: [
      CENTER_PARAM,
      {
        name: 'inverse',
        type: 'bool',
        default: false,
        optional: true,
        description: 'Ters yön: halkayı şeride açar.',
      },
      INPUT_PARAM,
    ],
  },
];
