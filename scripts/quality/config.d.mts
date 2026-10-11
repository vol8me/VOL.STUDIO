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

export type DocumentationRole =
  | 'rootReadme'
  | 'packageReadme'
  | 'hub'
  | 'rootAgent'
  | 'pencilAgent'
  | 'toolAgent'
  | 'reference'
  | 'legal'
  | 'generated';

export interface DocumentationConfig {
  budgets: Record<string, { lines: number; words: number }>;
  paths: { path: string; role: DocumentationRole }[];
  exceptions: {
    path: string;
    role: DocumentationRole;
    lines: number;
    words: number;
    reason: string;
  }[];
}

export interface QualityConfig {
  documentation?: DocumentationConfig;
  floor: Record<string, number>;
  packages: Record<string, Record<string, number>>;
  exempt?: Record<string, string>;
  bundles?: Record<string, { app: number; vendor: number; css: number }>;
  scaling?: Record<string, Record<string, unknown>>;
  coverageRuns?: Record<string, { only?: string[]; exclude?: string[] }>;
  coverageShape?: {
    minLines?: number;
    floorPct?: number;
    acknowledged?: Record<string, string>;
  };
  /** Aşama → sayım anahtarı → izin verilen en çok atlama (`counts.mjs`). */
  skipBudget?: Record<string, Record<string, number>>;
  /** Test dosyası → izin verilen en çok `waitForTimeout` (`fixedWaits.mjs`). */
  fixedWaitBudget?: Record<string, number>;
  /** Kapı kodunun kendi kapsamı (`scriptCoverage.mjs`). */
  scriptCoverage?: {
    lines?: number;
    branches?: number;
    functions?: number;
    floorPct?: number;
    minLines?: number;
    acknowledged?: Record<string, string>;
  };
  ratchetExceptions?: { key: string; to: number | null; reason: string }[];
}

/**
 * Ayrıştırılmış içeriği doğrular.
 * @returns Sorun listesi; boşsa yapı geçerlidir.
 */
export declare function validateQualityConfig(raw: unknown): string[];

/** Workspace paket adları ile eşik/muafiyet kayıtlarının iki yönlü paritesini doğrular. */
export declare function validateQualityWorkspaceParity(
  raw: unknown,
  workspacePackageNames: readonly string[],
): string[];

/** Aktif oyunların gönderim ve ölçekleme bütçelerinin varlığını doğrular. */
export declare function validateActiveGameBudgets(
  raw: unknown,
  activeGamePaths: readonly string[],
): string[];

/**
 * `quality.json`u okur, doğrular ve döner. Geçersizse TÜM sorunları listeleyen
 * tek bir hata fırlatır.
 */
export declare function loadQualityConfig(path: string | URL): QualityConfig;
