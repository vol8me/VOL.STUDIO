import type { SimEvent } from '@/sim/events';

/** Sunucunun odaya yayınladığı olay iletisinin adı. */
export const EVENT_MESSAGE = 'events';

/** Simülasyon olaylarına oda yaşamını (katılma, çıkma, maç) ekleyen tel olayı. */
export type NetEvent =
  | SimEvent
  | { readonly kind: 'joined'; readonly vehicleId: number; readonly name: string }
  | { readonly kind: 'left'; readonly vehicleId: number; readonly name: string }
  | { readonly kind: 'matchEnd'; readonly winner: string }
  | { readonly kind: 'matchStart' };

/** Bir sabit adımın olayları; `t`, adımın sonundaki sunucu saatidir (`MatchState.timeMs`). */
export interface EventBatch {
  readonly t: number;
  readonly events: readonly NetEvent[];
}
