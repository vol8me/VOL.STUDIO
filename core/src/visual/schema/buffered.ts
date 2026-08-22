/**
 * Tamponlu düğüm şemaları — §4.2b ve §4.4, D4'ün Aşama 2'si.
 *
 * Bunlar komşu piksel okur ya da bir çıktı noktasına birden çok aday üretir;
 * girdilerini hedef çözünürlükte bir tampona yazarlar. Ağacın düğümü
 * olmaları, `source` dışında `mask` ve `height` içinde de kullanılabilmelerini
 * sağlar.
 *
 * **Yarıçaplar BİRİM uzaydadır**, piksel değil: §3'e göre bu adım parametre
 * sınırının birim tarafındadır ve piksel yarıçapı aynı belgeyi 64² ile
 * 512²'de bambaşka gösterirdi.
 */

import type { NodeSchema } from './types';
import { FROM_INPUT, INPUT_PARAM, SEED_PARAM, SIGNED, UNIT, unitRadiusParam } from './types';

export const BUFFERED_SCHEMAS: readonly NodeSchema[] = [
  {
    kind: 'warp',
    category: 'buffered',
    output: FROM_INPUT,
    description: 'Bozma: mermer, duman, damar, akıntı. Kayma başka bir alandan gelir.',
    params: [
      { name: 'by', type: 'field', description: 'Kaymayı belirleyen alan.' },
      {
        name: 'amount',
        type: 'number',
        range: [0, 0.5],
        step: 0.005,
        default: 0.05,
        constraint: 'nonNegative',
        description: 'Azami kayma, BİRİM uzayda.',
      },
      {
        name: 'sample',
        type: 'enum',
        options: ['nearest', 'bilinear'],
        default: 'bilinear',
        optional: true,
        description: 'Kayma alanının örnekleme kipi; piksel sanatında `nearest`.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'scatter',
    category: 'buffered',
    output: UNIT,
    description: 'Kaynağı sapmalı bir ızgaraya çoğaltır; birleştirme `max`.',
    params: [
      {
        name: 'source',
        type: 'field',
        description: 'Çoğaltılacak alan; kökende ortalanmış olmalı.',
      },
      {
        name: 'count',
        type: 'int',
        range: [1, 512],
        step: 1,
        default: 24,
        constraint: 'positive',
        description: 'Örnek sayısı.',
      },
      SEED_PARAM,
      {
        name: 'jitter',
        type: 'number',
        range: [0, 1],
        step: 0.05,
        default: 0.5,
        optional: true,
        constraint: 'unit',
        description: 'Izgaradan sapma oranı; 0 tam ızgara, 1 neredeyse rastgele.',
      },
      {
        name: 'rotJitter',
        type: 'number',
        range: [0, 180],
        step: 1,
        default: 0,
        optional: true,
        constraint: 'nonNegative',
        description: 'Azami dönme sapması, DERECE.',
      },
      {
        name: 'scaleJitter',
        type: 'number',
        range: [0, 0.9],
        step: 0.05,
        default: 0,
        optional: true,
        constraint: 'unit',
        description: 'Azami ölçek sapması oranı.',
      },
    ],
  },
  {
    kind: 'blur',
    category: 'buffered',
    output: FROM_INPUT,
    description: 'Bulanıklaştırma; ayrılabilir + koşan toplam, piksel başına O(1).',
    params: [
      unitRadiusParam(0.03, 'Bulanıklık yarıçapı, BİRİM uzayda.'),
      {
        name: 'mode',
        type: 'enum',
        options: ['box', 'gauss'],
        default: 'box',
        optional: true,
        description: '`gauss` üç kutu geçişiyle yaklaşıklanır.',
      },
      INPUT_PARAM,
    ],
  },
  {
    kind: 'sharpen',
    category: 'buffered',
    output: FROM_INPUT,
    description: 'Keskinleştirme: orijinal + (orijinal − bulanık) × amount.',
    params: [
      {
        name: 'amount',
        type: 'number',
        range: [0, 4],
        step: 0.1,
        default: 1,
        constraint: 'nonNegative',
        description: 'Vurgu miktarı.',
      },
      unitRadiusParam(0.02, 'Hangi ölçekteki detayın vurgulanacağı, BİRİM uzayda.'),
      INPUT_PARAM,
    ],
  },
  {
    kind: 'dilate',
    category: 'buffered',
    output: FROM_INPUT,
    description: 'Morfolojik genişletme; ayrılabilir maksimum.',
    params: [unitRadiusParam(0.02, 'Genişletme yarıçapı, BİRİM uzayda.'), INPUT_PARAM],
  },
  {
    kind: 'erode',
    category: 'buffered',
    output: FROM_INPUT,
    description: 'Morfolojik aşındırma; ayrılabilir minimum.',
    params: [unitRadiusParam(0.02, 'Aşındırma yarıçapı, BİRİM uzayda.'), INPUT_PARAM],
  },
  {
    kind: 'edge',
    category: 'buffered',
    output: UNIT,
    description: 'Sobel gradyan büyüklüğü.',
    params: [INPUT_PARAM],
  },
  {
    kind: 'distance',
    category: 'buffered',
    output: SIGNED,
    description: 'Tam Öklid mesafe dönüşümü; rasterı İŞARETLİ mesafe alanına çevirir.',
    params: [
      {
        name: 'threshold',
        type: 'number',
        range: [0, 1],
        step: 0.05,
        default: 0.5,
        optional: true,
        constraint: 'unit',
        description: 'Bu değerin üstü "içeri" sayılır.',
      },
      INPUT_PARAM,
    ],
  },
];
