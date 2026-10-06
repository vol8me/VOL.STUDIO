import type { CursorId, ReticleId } from './cursorNames';

/** `assets/cursors/cursors.json` kaydı (üretilmiştir; bkz. `core/scripts/cursors/curate.mjs`). */
export interface CursorEntry {
  readonly set: 'ui' | 'rts';
  /** Etkin nokta, `cursorSize` ızgarasında. */
  readonly hotspot: readonly [number, number];
  /** Siyah dış çizgi katmanı yolları. */
  readonly outline: readonly string[];
  /** Gövde katmanı yolları (rengi çalışma zamanında verilir). */
  readonly body: readonly string[];
}

export interface ReticleEntry {
  readonly paths: readonly string[];
}

export interface CursorData {
  readonly cursorSize: number;
  readonly reticleSize: number;
  readonly cursors: Readonly<Record<CursorId, CursorEntry>>;
  readonly reticles: Readonly<Record<ReticleId, ReticleEntry>>;
}

let cursorRoot = 'assets/cursors';
let cached: Promise<CursorData | null> | null = null;

/** Kayıt kökü (sona `/` almaz); değişim yalnız henüz yüklenmemiş kaydı etkiler. */
export function configureCursorAssets(options: { baseUrl?: string }): void {
  if (options.baseUrl !== undefined) cursorRoot = options.baseUrl.replace(/\/+$/, '');
}

function validate(value: unknown): CursorData {
  const data = value as Partial<CursorData> | null;
  if (
    !data ||
    typeof data.cursorSize !== 'number' ||
    typeof data.reticleSize !== 'number' ||
    typeof data.cursors !== 'object' ||
    typeof data.reticles !== 'object'
  ) {
    throw new Error('İmleç kaydı geçersiz');
  }
  return data as CursorData;
}

/**
 * İmleç kaydını getirir (tek istek, önbellekli). Başarısızlık uyarıyla bildirilir ve `null`
 * döner: imleç yoksa sistem imleci kalır, arayüz çalışmaya devam eder; sonraki çağrıda yeniden denenir.
 */
export function loadCursorData(): Promise<CursorData | null> {
  if (cached) return cached;
  if (typeof fetch !== 'function') return Promise.resolve(null);
  const task = fetch(`${cursorRoot}/cursors.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then(validate)
    .catch((error: unknown) => {
      console.warn('[VOL.UI] İmleç kaydı yüklenemedi:', error);
      cached = null;
      return null;
    });
  cached = task;
  return task;
}

/** Testler ve sunucusuz ortamlar için: kaydı doğrudan verir. */
export function provideCursorData(data: CursorData): void {
  cached = Promise.resolve(validate(data));
}

/** Testler için: önbelleği boşaltır. */
export function resetCursorData(): void {
  cached = null;
}
