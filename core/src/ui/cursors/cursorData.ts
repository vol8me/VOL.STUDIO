import { RETICLES, RTS_CURSORS, UI_CURSORS, type CursorId, type ReticleId } from './cursorNames';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return Number.isFinite(value) && (value as number) > 0;
}

function isPaths(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((path) => typeof path === 'string' && path.length > 0);
}

function hasEntries(
  value: unknown,
  ids: readonly string[],
  matches: (entry: Record<string, unknown>) => boolean,
): boolean {
  return isRecord(value) && ids.every((id) => isRecord(value[id]) && matches(value[id]));
}

function isCursor(
  entry: Record<string, unknown>,
  set: CursorEntry['set'],
  gridSize: number,
): boolean {
  return (
    entry.set === set &&
    isPaths(entry.outline) &&
    isPaths(entry.body) &&
    Array.isArray(entry.hotspot) &&
    entry.hotspot.length === 2 &&
    entry.hotspot.every(
      (coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= gridSize,
    )
  );
}

function validate(value: unknown): CursorData {
  const data = value as CursorData;
  if (
    !isRecord(value) ||
    !isPositiveFinite(data.cursorSize) ||
    !isPositiveFinite(data.reticleSize) ||
    !hasEntries(data.cursors, UI_CURSORS, (entry) => isCursor(entry, 'ui', data.cursorSize)) ||
    !hasEntries(data.cursors, RTS_CURSORS, (entry) => isCursor(entry, 'rts', data.cursorSize)) ||
    !hasEntries(data.reticles, RETICLES, (entry) => isPaths(entry.paths))
  )
    throw new Error('İmleç kaydı geçersiz');
  return data;
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
