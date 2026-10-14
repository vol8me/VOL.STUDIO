import type { SimEvent } from '@/sim/events';
import type { WarEvent } from '@/sim/war/events';

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
