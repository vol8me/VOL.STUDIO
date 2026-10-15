import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isClimateSnapshot } from '../src/network/climate';
import type { ClimateSnapshot } from '../src/sim/weather/types';

/**
 * Dünya iklimini (hava saati, zemin, yeşillik) kalıcı tutan depo. Sunucu sürekli açıktır ama
 * yeniden başlayabilir: yağmurla büyüyen yeşillik ve birikmiş kar yeniden başlangıçla sıfırlanmaz.
 * Depo bir bağdır (`WorldRoomOptions.climateStore`); verilmezse iklim yalnız bellektedir.
 */
export interface ClimateStore {
  /** Kaydedilmiş anlık görüntü; yoksa ya da okunamıyorsa `undefined` (bozuk kayıt dünyayı düşürmez). */
  load(): ClimateSnapshot | undefined;
  /** Anlık görüntüyü yazar; hata fırlatmaz, başarıyı döndürür. */
  save(snapshot: ClimateSnapshot): boolean;
}

const FIELDS = ['wetness', 'puddle', 'snow', 'compaction', 'growth'] as const;

/** Anlık görüntüyü diske yazılacak metne çevirir (bayt alanları base64). */
export function encodeClimate(snapshot: ClimateSnapshot): string {
  const { surface, ...rest } = snapshot;
  const encoded: Record<string, unknown> = { columns: surface.columns, rows: surface.rows };
  for (const field of FIELDS) encoded[field] = Buffer.from(surface[field]).toString('base64');
  return JSON.stringify({ ...rest, surface: encoded });
}

/** Metni anlık görüntüye çevirir; biçimsiz ya da tutarsız kayıt `undefined` verir. */
export function decodeClimate(text: string): ClimateSnapshot | undefined {
  try {
    const stored = JSON.parse(text) as { surface?: Record<string, unknown> };
    const source = stored.surface;
    if (typeof source !== 'object' || source === null) return undefined;
    const surface: Record<string, unknown> = { columns: source.columns, rows: source.rows };
    for (const field of FIELDS) {
      const value = source[field];
      surface[field] =
        typeof value === 'string'
          ? new Uint8Array(Buffer.from(value, 'base64'))
          : new Uint8Array(0);
    }
    const snapshot = { ...stored, surface };
    return isClimateSnapshot(snapshot) ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dosya deposu: anlık görüntü tek bir JSON dosyasıdır. Yazım önce yanına, sonra yerine taşınır
 * (yarım yazılmış dosya eski kaydı bozmaz).
 */
export class FileClimateStore implements ClimateStore {
  constructor(private readonly path: string) {}

  load(): ClimateSnapshot | undefined {
    try {
      return decodeClimate(readFileSync(this.path, 'utf8'));
    } catch {
      return undefined;
    }
  }

  save(snapshot: ClimateSnapshot): boolean {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temp = `${this.path}.tmp`;
      writeFileSync(temp, encodeClimate(snapshot), 'utf8');
      renameSync(temp, this.path);
      return true;
    } catch {
      return false;
    }
  }
}
