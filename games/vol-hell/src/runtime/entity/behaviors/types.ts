import type { Random } from '@volstudio/core';

/**
 * Davranış fonksiyonlarına verilen anlık dünya durumu.
 *
 * Davranışlar `Enemy` sınıfına gömülü değildir: yalnızca bu bağlamı ve kendi
 * durum nesnelerini bilirler. Elite, rusher + swarmer davranışlarını aynı
 * bağlamla üst üste çağırarak kompoze eder.
 */
export interface BehaviorContext {
  /** Davranışı çalıştıran düşmanın konumu. */
  readonly x: number;
  readonly y: number;
  /** Hedef (oyuncu) konumu. */
  readonly targetX: number;
  readonly targetY: number;
  /** Frame süresi (ms). */
  readonly deltaMs: number;
  /** Düşmanın o anki hızı (piksel/sn) — `StatBlock.getValue('speed')`. */
  readonly speed: number;
  /** Deterministik rastgelelik kaynağı. */
  readonly random: Random;
}

/**
 * Yazılabilir bağlam — çağıran tarafın her frame alanlarını güncelleyip
 * yeniden kullandığı biçim. Davranışlar bağlamı yalnızca OKUR.
 */
export type MutableBehaviorContext = {
  -readonly [K in keyof BehaviorContext]: BehaviorContext[K];
};

/** Davranışların yazdığı hız vektörü (piksel/sn). Her frame yeniden kullanılır. */
export interface VelocityOutput {
  x: number;
  y: number;
}

/** Hedefe olan mesafe — davranışlar arasında tekrarlanan hesap. */
export function distanceToTarget(context: BehaviorContext): number {
  return Math.hypot(context.targetX - context.x, context.targetY - context.y);
}
