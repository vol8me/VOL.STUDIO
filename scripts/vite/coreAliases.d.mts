/**
 * `coreAliases.mjs` için tip bildirimi.
 *
 * Betik bilinçli olarak düz `.mjs`: `vite.config.ts` ve `vitest.config.ts`
 * dosyaları onu build adımı olmadan, çıplak Node ile import edebilmelidir
 * (bkz. `scripts/quality/config.d.mts` aynı gerekçe).
 */

export interface CoreAlias {
  find: string;
  replacement: string;
}

/**
 * `core/package.json` `exports` haritasından türetilmiş Vite alias dizisi.
 * Uzun alt yollar önce gelir; rollup ilk eşleşmeyi aldığı için sıra anlamlıdır.
 */
export declare function coreAliases(): CoreAlias[];
