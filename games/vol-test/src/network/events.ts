import type { SimEvent } from '@/sim/events';
import type { WarEvent } from '@/sim/war/events';
import { NETWORK } from '@/config/network';

/** Sunucunun odaya yayınladığı olay iletisinin adı. */
export const EVENT_MESSAGE = 'events';

/** Simülasyon ve savaş olaylarına oda yaşamını (insan katılma, çıkma) ekleyen tel olayı. */
export type NetEvent =
  | SimEvent
  | WarEvent
  | { readonly kind: 'joined'; readonly vehicleId: number; readonly name: string }
  | { readonly kind: 'left'; readonly vehicleId: number; readonly name: string };

/** Bir sabit adımın olayları; `t`, adımın sonundaki sunucu saatidir (`WorldState.timeMs`). */
export interface EventBatch {
  readonly t: number;
  readonly events: readonly NetEvent[];
}

const NUMBERS: Record<NetEvent['kind'], readonly string[]> = {
  damaged: ['target', 'amount', 'health'],
  healed: ['target', 'amount', 'health'],
  died: ['target'],
  broke: ['target', 'part', 'x', 'y'],
  respawned: ['target', 'x', 'y'],
  fired: ['source', 'mount', 'x', 'y', 'angle', 'vx', 'vy'],
  impact: ['owner', 'x', 'y', 'angle'],
  hit: ['owner', 'target', 'x', 'y', 'angle'],
  wallHit: ['source', 'x', 'y', 'normalX', 'normalY', 'speed'],
  collision: ['a', 'b', 'x', 'y', 'normalX', 'normalY', 'speed'],
  zone: ['zone', 'owner'],
  warWon: ['faction', 'wins'],
  joined: ['vehicleId'],
  left: ['vehicleId'],
};

function isNetEvent(value: unknown): value is NetEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.kind !== 'string' || !Object.hasOwn(NUMBERS, event.kind)) return false;
  if (
    !NUMBERS[event.kind as NetEvent['kind']].every(
      (key) => typeof event[key] === 'number' && Number.isFinite(event[key]),
    )
  )
    return false;
  if (
    event.source !== undefined &&
    (typeof event.source !== 'number' || !Number.isFinite(event.source))
  )
    return false;
  if (event.kind === 'joined' || event.kind === 'left') return typeof event.name === 'string';
  if (event.kind === 'damaged' || event.kind === 'died')
    return ['projectile', 'wall', 'collision', 'direct', 'drown'].includes(event.cause as string);
  if (event.kind === 'impact') return event.surface === 'wall' || event.surface === 'ground';
  return true;
}

/** Bozuk olay paketi çizim döngüsüne veya sınırlı zaman kuyruğuna giremez. */
export function isEventBatch(value: unknown): value is EventBatch {
  if (!value || typeof value !== 'object') return false;
  const batch = value as Record<string, unknown>;
  return (
    typeof batch.t === 'number' &&
    Number.isFinite(batch.t) &&
    batch.t >= 0 &&
    Array.isArray(batch.events) &&
    batch.events.length <= NETWORK.maxEventBatch &&
    batch.events.every(isNetEvent)
  );
}
