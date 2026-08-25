import type { SwarmerParams } from '@/config/enemies/types';
import { applyStandoffBehavior } from './seek';
import type { BehaviorContext, VelocityOutput } from './types';
import { nonNegativeFinite, safeDeltaMs, saturatingAdd } from '@/runtime/utils/numeric';

/** Standoff bandının genişliği (mesafenin oranı) — yaklaş/kaç titremesini keser. */
const STANDOFF_TOLERANCE_RATIO = 0.12;

/** Bir swarmer davranışının durumu. */
export interface SwarmerState {
  /** Son doğurmadan bu yana geçen süre (ms). */
  spawnTimerMs: number;
  /** Hayatta olan minion sayısı — çağıran her frame günceller. */
  aliveMinions: number;
}

/** Davranışın ürettiği doğurma isteği; konumları çağıran uygular. */
export interface MinionSpawnRequest {
  minionId: string;
  count: number;
  /** Ebeveyn etrafında doğum noktalarının açıları (radyan). */
  angles: number[];
  radius: number;
}

export function createSwarmerState(): SwarmerState {
  return { spawnTimerMs: 0, aliveMinions: 0 };
}

/**
 * Swarmer davranışı — mesafesini korur ve dolu değilse minion doğurur.
 *
 * Doğurmayı kendisi YAPMAZ; bir istek döner. Böylece davranış saf kalır,
 * test edilebilir olur ve Elite aynı fonksiyonu kendi doğurma mantığına
 * bağlayabilir.
 *
 * @param request Yeniden kullanılan istek nesnesi — her frame yeni obje yaratmaz.
 * @returns Doğurma yapılacaksa `request`, yoksa null.
 */
export function applySwarmerBehavior(
  state: SwarmerState,
  context: BehaviorContext,
  params: SwarmerParams,
  out: VelocityOutput,
  request: MinionSpawnRequest,
): MinionSpawnRequest | null {
  applyStandoffBehavior(context, params.standoffDistance, STANDOFF_TOLERANCE_RATIO, out);

  state.spawnTimerMs = saturatingAdd(state.spawnTimerMs, safeDeltaMs(context.deltaMs));
  const spawnIntervalMs = nonNegativeFinite(params.spawnIntervalMs, Number.MAX_SAFE_INTEGER);
  if (state.spawnTimerMs < spawnIntervalMs) return null;

  // Sayaç, kapasite dolu olsa bile sıfırlanır: yoksa bir minion öldüğü anda
  // birikmiş sayaçla anında yeni sürü çıkar.
  state.spawnTimerMs = 0;

  const free =
    Math.floor(nonNegativeFinite(params.maxMinions)) -
    Math.floor(nonNegativeFinite(state.aliveMinions));
  if (free <= 0) return null;

  const count = Math.min(Math.floor(nonNegativeFinite(params.spawnCount)), free);
  if (count <= 0) return null;
  request.minionId = params.minionId;
  request.count = count;
  request.radius = params.spawnRadius;
  request.angles.length = 0;
  for (let i = 0; i < count; i++) {
    request.angles.push(context.random.next() * Math.PI * 2);
  }
  return request;
}

/** Boş bir doğurma isteği — düşman başına bir kez yaratılır. */
export function createMinionSpawnRequest(): MinionSpawnRequest {
  return { minionId: '', count: 0, angles: [], radius: 0 };
}
