/**
 * Dünya olayları ile sunum olayları AYRI KANALLARDIR (DESIGN.md §6).
 *
 * Sunum kanalı her kare boşaltılır ve efekt ömrüne bağlıdır; dünya kanalı
 * tarihe aittir ve enjekte edilen bir `WorldEventSink`e yazılır. Aynı olay iki
 * kanala da gidebilir, ama biri boşaltılınca öteki tükenmez: `LifeWorld` olay
 * için tampon TUTMAZ, yalnız sunum tamponunu taşır.
 */
export interface VoidDeathEvent {
  readonly kind: 'void-death';
  /** Parçacığın düştüğü adımın sonundaki dünya tick'i. */
  readonly tick: number;
  readonly stableId: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly type: number;
  readonly normalX: number;
  readonly normalY: number;
}

/** Bugün tek dünya olayı Void ölümüdür; olay günlüğü (Adım 8) burada kurulmaz. */
export type WorldEvent = VoidDeathEvent;

/** Sunuma teslim edilen geçici olay; renderer store slotuna geri bakamaz. */
export type TransientPresentationEvent = VoidDeathEvent;

export interface WorldEventSink {
  emit(event: WorldEvent): void;
}

/** Üretim yolu: dünya tarihi tüketilmediği sürece hiçbir şey biriktirilmez. */
export const noopWorldEventSink: WorldEventSink = {
  emit() {},
};
