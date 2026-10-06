export declare const TOKENS_BEGIN: string;
export declare const TOKENS_END: string;
export declare const THEMES_BEGIN: string;
export declare const THEMES_END: string;

export interface ThemeToken {
  key: string;
  cssVar: string;
  value: string;
}

export declare const MOTION_BEGIN: string;
export declare const MOTION_END: string;

export interface MotionSource {
  durations: Record<string, number>;
  easings: Record<string, string>;
  presets: Record<string, { ms: number; easing: string; offsetPx?: number }>;
  interaction: Record<string, number>;
  loadingMinVisibleMs: number;
}

export interface ThemeSource {
  colors: Record<string, string>;
  semantic: Record<string, string>;
  themes: Record<string, Record<string, string>>;
  motion?: MotionSource;
}

export declare function validateMotion(motion: MotionSource): string[];
export declare function renderMotion(motion: MotionSource): string;

export declare function kebab(name: string): string;
export declare function defaultTokens(
  colors: Record<string, string>,
  semantic: Record<string, string>,
): ThemeToken[];
export declare function validateThemeSource(source: ThemeSource): string[];
export declare function renderTokens(
  colors: Record<string, string>,
  semantic: Record<string, string>,
): string;
export declare function renderThemes(
  colors: Record<string, string>,
  semantic: Record<string, string>,
  themes: Record<string, Record<string, string>>,
): string;
export declare function applyGenerated(css: string, source: ThemeSource): string;
export declare function extractRegion(css: string, begin: string, end: string): string | null;
