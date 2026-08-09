import type { FontFaceSpec } from './FontManager';

export type VolFontFamily = 'Jura' | 'Exo 2' | 'Exo 2 Italic';

/**
 * VOL.STUDIO oyunlarında kullanılabilir standart fontlar.
 * Bu dosya download-fonts.js ile senkronize tutulmalıdır.
 */
export const VOL_FONTS: Record<VolFontFamily, FontFaceSpec> = {
  Jura: { family: 'Jura', source: '/assets/fonts/Jura[wght].ttf', weight: '300 700' },
  'Exo 2': { family: 'Exo 2', source: '/assets/fonts/Exo2[wght].ttf', weight: '100 900' },
  'Exo 2 Italic': {
    family: 'Exo 2',
    source: '/assets/fonts/Exo2-Italic[wght].ttf',
    weight: '100 900',
    style: 'italic',
  },
};
