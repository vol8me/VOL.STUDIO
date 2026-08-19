/**
 * `config.mjs` için tip bildirimi.
 *
 * Betik bilinçli olarak düz `.mjs`: `vitest.config.ts` dosyaları, kök
 * `workspace-contract.mjs` ve `report.mjs` onu build adımı olmadan, çıplak
 * Node ile import edebilmelidir. TypeScript tarafındaki tüketiciler (config'ler
 * ve governance testi) için tipler burada duruyor.
 */

/** Her paketin taşımak zorunda olduğu kapsam metrikleri. */
export declare const COVERAGE_KEYS: readonly ['lines', 'statements', 'branches', 'functions'];

export interface QualityConfig {
  floor: Record<string, number>;
  packages: Record<string, Record<string, number>>;
  exempt?: Record<string, string>;
}

/**
 * Ayrıştırılmış içeriği doğrular.
 * @returns Sorun listesi; boşsa yapı geçerlidir.
 */
export declare function validateQualityConfig(raw: unknown): string[];

/**
 * `quality.json`u okur, doğrular ve döner. Geçersizse TÜM sorunları listeleyen
 * tek bir hata fırlatır.
 */
export declare function loadQualityConfig(path: string | URL): QualityConfig;
