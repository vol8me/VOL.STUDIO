import type { VolColorToken } from '../colors';
import type { VOL_SEMANTIC_COLORS } from './semanticColors';

/** Anlamsal rol tokenlarının anahtarı (`semanticColors.ts`). */
export type VolSemanticToken = keyof typeof VOL_SEMANTIC_COLORS;

/** Bir temanın değiştirebildiği her renk tokenı: genel 60 + anlamsal roller. */
export type VolThemeToken = VolColorToken | VolSemanticToken;

/** Tema geçersiz kılmaları: bilinen token → `#rrggbb` ya da `#rrggbbaa`. */
export type VolThemeOverrides = Readonly<Partial<Record<VolThemeToken, string>>>;
