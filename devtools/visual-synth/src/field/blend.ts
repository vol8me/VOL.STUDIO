/**
 * Harmanlama modları — §2/§3'ün üç kanallı bileşim tarafı.
 *
 * Kapsama ve yükseklik AYRI modlarla harmanlanır ve bu bilinçlidir: iki
 * katman `max` ile birleşirken kapsama birleşmelidir ama yükseklik
 * toplanmalı olabilir (üst üste binen kabartma). Tek mod ikisini de doğru
 * yapamaz.
 *
 * Her iki kanal da 0..1'de yaşar (D3), bu yüzden sonuç kelepçelenir —
 * taşan bir yükseklik normal hesabını (Tur 3) sessizce bozardı.
 */

import { clamp01 } from '@volstudio/core/math/interpolation';
import type { CoverageBlend, HeightBlend } from '../types';

/**
 * Biriktirici (`dst`) ile katman (`src`) kapsamasını harmanlar.
 *
 * `over` alfa bileşimidir: katman kendi opaklığı kadar yer kaplar, kalanı
 * altındakine bırakır. `replace` katmanın olmadığı yeri de siler — silme
 * niyeti taşıyan tek moddur.
 */
export function blendCoverage(mode: CoverageBlend, dst: number, src: number): number {
  switch (mode) {
    case 'over':
      return clamp01(src + dst * (1 - src));
    case 'max':
      return Math.max(dst, src);
    case 'min':
      return Math.min(dst, src);
    case 'add':
      return clamp01(dst + src);
    case 'sub':
      return clamp01(dst - src);
    case 'mul':
      return dst * src;
    case 'screen':
      return clamp01(1 - (1 - dst) * (1 - src));
    case 'replace':
      return clamp01(src);
    default: {
      const unknown: never = mode;
      throw new Error(`Bilinmeyen kapsama harmanlama modu: ${String(unknown)}`);
    }
  }
}

export function blendHeight(mode: HeightBlend, dst: number, src: number): number {
  switch (mode) {
    case 'max':
      return Math.max(dst, src);
    case 'min':
      return Math.min(dst, src);
    case 'add':
      return clamp01(dst + src);
    case 'mul':
      return dst * src;
    case 'replace':
      return clamp01(src);
    default: {
      const unknown: never = mode;
      throw new Error(`Bilinmeyen yükseklik harmanlama modu: ${String(unknown)}`);
    }
  }
}
