import {
  parseAuditionCatalog,
  resolveCatalogEntry,
  type AuditionCatalog,
  type AuditionCatalogCandidate,
} from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';

/** Katalog araştırma çıktısıdır: derlenmez, çalışma anında YOLDAN okunur. */
export const AUDITION_CATALOG_PATH = 'research-out/audition-catalog.json';

export interface AuditionCatalogEnvironment {
  readonly DEV: boolean;
}

export interface AuditionSelection {
  readonly entry: AuditionCatalogCandidate;
  readonly entryIndex: number;
  readonly entryCount: number;
  readonly seed: number;
  readonly seedIndex: number;
  readonly seedCount: number;
  readonly corpusId: string;
}

export interface AuditionCatalogOptions {
  readonly env?: AuditionCatalogEnvironment;
  readonly search?: string;
  readonly readCatalog?: () => Promise<string | null>;
  readonly particleRadiusUnits?: number;
}

/**
 * Development audition kataloğu girişi (F5). `VITE_LIFE_AUDITION_GENOME` tek
 * genom açar; katalog kısa listenin TAMAMINI aynı üç tohumla gezdirir.
 *
 * Katalogun yokluğu hata değildir — dev sunucusu çoğu zaman araştırma çıktısı
 * olmadan açılır. Var olup bozuk olması hatadır ve açılış hata yüzeyine düşer:
 * sessizce varsayılana dönmek, ekranda hangi genomun koştuğunu belirsizleştirir.
 */
export async function loadAuditionSelection(
  options: AuditionCatalogOptions = {},
): Promise<AuditionSelection | null> {
  const env = options.env ?? import.meta.env;
  if (!env.DEV) return null;
  const serialized = await (options.readCatalog ?? fetchCatalog)();
  if (serialized === null) return null;
  const radius = options.particleRadiusUnits ?? particleConfig.radiusUnits;
  const catalog = parseAuditionCatalog(serialized, radius);
  const params = new URLSearchParams(options.search ?? '');
  const entryIndex = readIndex(params, 'audition', catalog.entries.length);
  const seedIndex = readIndex(params, 'seed', catalog.seeds.length);
  return {
    entry: resolveCatalogEntry(catalog.entries[entryIndex], radius),
    entryIndex,
    entryCount: catalog.entries.length,
    seed: catalog.seeds[seedIndex],
    seedIndex,
    seedCount: catalog.seeds.length,
    corpusId: catalog.corpusId,
  };
}

/**
 * Sorgu parametresi 1 TABANLIDIR (ekranda "aday 2/6" yazar). Aralık dışı
 * değer sarmalanmaz ya da kırpılmaz: istenen aday yerine başkasını göstermek,
 * insan ön-elemesinin kaydını yanlışlar.
 */
function readIndex(params: URLSearchParams, key: string, count: number): number {
  const raw = params.get(key);
  if (raw === null) return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > count) {
    throw new RangeError(`audition ${key}: 1–${count} aralığında olmalı, gelen "${raw}".`);
  }
  return value - 1;
}

/**
 * Ağ düzeyindeki hata YOKLUKTUR: katalog çoğu dev oturumunda hiç yazılmaz ve
 * `fetch` ortama göre 404 yerine doğrudan fırlatabilir (file://, Tauri, çevrim
 * dışı). Açılış zincirini bunun için kırmak, araştırma çıktısı olmayan her dev
 * oturumunu kullanılamaz yapardı. Katalog VAR ve BOZUKSA hata yine yüzeye
 * çıkar — o kontrol ayrıştırıcıdadır.
 */
async function fetchCatalog(): Promise<string | null> {
  try {
    const response = await fetch(new URL(AUDITION_CATALOG_PATH, document.baseURI));
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export function describeSelection(selection: AuditionSelection): string {
  const entry = `${selection.entryIndex + 1}/${selection.entryCount}`;
  const seed = `${selection.seedIndex + 1}/${selection.seedCount}`;
  return `${selection.entry.digest} · ${entry} · seed ${seed}`;
}

export type { AuditionCatalog };
