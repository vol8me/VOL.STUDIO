export declare const UI_ASSET_SEED: number;
export declare const GENERATOR_VERSION: number;

/** Yol (varlık köküne göreli) → içerik; `manifest.json` ve `SOURCES.md` dahil. */
export declare function buildUiAssets(input: {
  tokens: Record<string, Record<string, string>>;
  seed?: number;
}): Map<string, string>;
