import type { ClimateSnapshot, SurfaceSnapshot } from '@/sim/weather/types';
import { SEASONS } from '@/config/seasons';

/** Sunucunun odaya yayınladığı iklim anlık görüntüsünün ileti adı. */
export const CLIMATE_MESSAGE = 'climate';

/**
 * İstemcinin iklim anlık görüntüsü istemesi. Katılımda sunucunun kendiliğinden göndermesi
 * güvenilmezdir (ileti, istemci dinleyicisini kurmadan gelebilir); istemci dinleyicisini kurar ve
 * sonra ister. Sunucu istemci başına en çok `CLIMATE_NET.requestGapMs`de bir yanıtlar.
 */
export const CLIMATE_REQUEST = 'climate?';

const FIELDS = ['wetness', 'puddle', 'snow', 'compaction', 'growth'] as const;

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/**
 * Telden gelen değerin iklim anlık görüntüsü olup olmadığını doğrular. Ağdan gelen veri güvenilmez
 * sayılır: sayılar sonlu, bayt alanları hücre sayısı kadar olmalıdır; aksi hâlde yok sayılır ve
 * istemci kendi (belirli) hava saatiyle sürer.
 */
export function isClimateSnapshot(value: unknown): value is ClimateSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1) return false;
  for (const key of [
    'seed',
    'elapsedMs',
    'surfaceMs',
    'windMs',
    'windTravelX',
    'windTravelY',
    'windX',
    'windY',
  ])
    if (typeof snapshot[key] !== 'number' || !Number.isFinite(snapshot[key])) return false;
  if (!(SEASONS.order as readonly unknown[]).includes(snapshot.season)) return false;
  if (
    !Number.isSafeInteger(snapshot.seed) ||
    (snapshot.seed as number) < 0 ||
    (snapshot.seed as number) > 0xffffffff
  )
    return false;
  for (const key of ['elapsedMs', 'surfaceMs', 'windMs'])
    if ((snapshot[key] as number) < 0 || (snapshot[key] as number) > Number.MAX_SAFE_INTEGER)
      return false;
  if (
    (snapshot.surfaceMs as number) > (snapshot.windMs as number) ||
    (snapshot.windMs as number) > (snapshot.elapsedMs as number)
  )
    return false;
  const surface = snapshot.surface as Record<string, unknown> | null | undefined;
  if (typeof surface !== 'object' || surface === null) return false;
  const columns = surface.columns;
  const rows = surface.rows;
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    (columns as number) < 1 ||
    (rows as number) < 1
  )
    return false;
  const count = (columns as number) * (rows as number);
  if (!(count > 0) || count > 1 << 20) return false;
  return FIELDS.every((field) => {
    const bytes = (surface as unknown as SurfaceSnapshot)[field];
    return isBytes(bytes) && bytes.length === count;
  });
}
