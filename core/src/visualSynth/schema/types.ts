/**
 * Parametre şeması tipleri — D11'in veri tarafı.
 *
 * Her primitifin parametreleri KODLA DEĞİL VERİYLE bildirilir. Aynı bildirim
 * iki yerde tüketilir:
 *
 * - **Doğrulama** (`validate.ts`) — agent'ın yazdığı JSON sınırda denetlenir.
 * - **Arayüz üretimi** (Tur 4) — editör kontrollerini buradan türetir; kırk
 *   küsur primitifin parametrelerini elle bağlamak sürdürülemez.
 */

import type { FieldDomain, FieldKind } from '../types';

/** Editörün üreteceği kontrol türü (D11). */
export type ParamType = 'number' | 'int' | 'bool' | 'vec2' | 'enum' | 'field' | 'points';

/**
 * Doğrulamanın uyguladığı SERT kısıt.
 *
 * `range`den ayrıdır ve ayrılığı bilinçlidir: `range` editörün kaydırıcı
 * sınırıdır (rahat bir aralık), `constraint` matematiğin gerçekten
 * kırıldığı yerdir. İkisini birleştirmek, kaydırıcı rahatlığı için
 * gevşetilen bir sınırın sessizce doğrulamayı da gevşetmesi demekti.
 */
export type ParamConstraint = 'positive' | 'nonNegative' | 'nonZero' | 'unit' | 'atLeastThree';

export interface ParamSchema {
  name: string;
  type: ParamType;
  /** Editör kaydırıcısının sınırları — doğrulama kuralı DEĞİL. */
  range?: readonly [number, number];
  step?: number;
  default?:
    | number
    | boolean
    | string
    | readonly [number, number]
    | readonly (readonly [number, number])[];
  options?: readonly string[];
  constraint?: ParamConstraint;
  optional?: boolean;
  description: string;
}

/**
 * Düğümün çıktı etki alanı nasıl belirlenir.
 *
 * - `fixed`     — türden gelir (üreteçler, eşikler).
 * - `inherit`   — tek girdisinden gelir; alan-uzayı işlemleri ve filtreler
 *   koordinatı ya da komşuluğu değiştirir, değerin ANLAMINI değiştirmez.
 * - `propagate` — girdilerden HERHANGİ BİRİ `signed` ise sonuç `signed`.
 *   `min`/`max` iki SDF'nin birleşimi/kesişimi, `add`/`sub` bir SDF'yi
 *   ötelemek, `mul` mesafeyi ölçeklemektir.
 */
export type OutputRule =
  | { readonly kind: 'fixed'; readonly domain: FieldDomain }
  | { readonly kind: 'inherit'; readonly from: string }
  | { readonly kind: 'propagate'; readonly from: readonly string[] };

export interface NodeSchema {
  kind: FieldKind;
  category: 'generator' | 'domain' | 'buffered' | 'combine';
  output: OutputRule;
  params: readonly ParamSchema[];
  description: string;
}

export const UNIT: OutputRule = { kind: 'fixed', domain: 'unit' };
export const SIGNED: OutputRule = { kind: 'fixed', domain: 'signed' };
export const FROM_INPUT: OutputRule = { kind: 'inherit', from: 'input' };
export const FROM_AB: OutputRule = { kind: 'propagate', from: ['a', 'b'] };

export const INPUT_PARAM: ParamSchema = {
  name: 'input',
  type: 'field',
  description: 'Dönüştürülecek alan.',
};

export const CENTER_PARAM: ParamSchema = {
  name: 'center',
  type: 'vec2',
  range: [-2, 2],
  default: [0, 0],
  optional: true,
  description: 'İşlemin sabit noktası; verilmezse birim uzayın kökeni.',
};

/** Gürültü ve desenlerin ortak frekans parametresi. */
export function freqParam(defaultValue: number): ParamSchema {
  return {
    name: 'freq',
    type: 'number',
    range: [1, 64],
    step: 1,
    default: defaultValue,
    constraint: 'positive',
    description: 'Kısa kenar boyunca hücre sayısı.',
  };
}

export const SEED_PARAM: ParamSchema = {
  name: 'seed',
  type: 'int',
  optional: true,
  description: 'Verilmezse düğüm yolundan türetilir (D5).',
};

/** Filtre yarıçapı — BİRİM uzayda, piksel değil (§3 parametre sınırı). */
export function unitRadiusParam(defaultValue: number, description: string): ParamSchema {
  return {
    name: 'radius',
    type: 'number',
    range: [0, 0.5],
    step: 0.005,
    default: defaultValue,
    constraint: 'nonNegative',
    description,
  };
}
