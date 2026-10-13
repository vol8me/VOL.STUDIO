import type { Room } from '@colyseus/core';

/**
 * Sabit adımlı duvar saati biriktiricisi. Colyseus `setFixedTimestep` aralığı adım süresine eşitler ve Node
 * `setInterval` kesirli milisaniyeyi kırptığı için 30 Hz'de 33 ms'lik tetikleme 33,33 ms'lik adımı yaklaşık
 * her yüz tetiklemede bir kaçırır: adımlar arası p99 iki adıma (~66 ms) çıkar. Bu sınıf adım süresinden
 * kısa aralıkla çağrılıp geçen süreyi biriktirir; sapma bir tetikleme aralığıyla sınırlı kalır.
 */
export class StepClock {
  private lastAt: number;
  private pending = 0;

  constructor(
    private readonly stepMs: number,
    startAt: number,
    /** Uzun duraklamadan sonra arka arkaya en çok bu kadar adım koşulur; kalanı atılır (sarmal yok). */
    private readonly maxCatchUp = 5,
  ) {
    if (!Number.isFinite(stepMs) || stepMs <= 0)
      throw new RangeError('Adım süresi pozitif olmalı.');
    if (!Number.isSafeInteger(maxCatchUp) || maxCatchUp < 1)
      throw new RangeError('Yakalama sınırı pozitif tam sayı olmalı.');
    this.lastAt = startAt;
  }

  /** `nowMs` anında koşulması gereken adım sayısı. */
  due(nowMs: number): number {
    if (nowMs > this.lastAt) {
      this.pending += nowMs - this.lastAt;
      this.lastAt = nowMs;
    }
    let steps = 0;
    while (this.pending >= this.stepMs && steps < this.maxCatchUp) {
      this.pending -= this.stepMs;
      steps++;
    }
    if (this.pending >= this.stepMs) this.pending = 0;
    return steps;
  }
}

/**
 * Biriktiricinin tetikleme aralığı: adımın üçte biri, 4-10 ms arasında. Daha seyrek tetikleme adımı
 * geciktirir, daha sık tetikleme boşuna olay döngüsü uyandırır.
 */
export function pumpIntervalMs(stepMs: number): number {
  return Math.min(10, Math.max(4, stepMs / 3));
}

export interface RoomLoopOptions {
  /** Test için saat kaynağı; varsayılan `performance.now`. */
  readonly now?: () => number;
  readonly maxCatchUp?: number;
}

/**
 * Odanın simülasyon döngüsünü `hz` hızında kurar. Tetikleyici Colyseus `setTimestep`tir
 * (`setSimulationInterval` kullanımdan kalkmış ve ona yönlendirir); Colyseus oda kapanınca aralığı
 * kendisi temizler. Colyseus sürümü yükseltilirken API değişirse bu işlev tek değişim noktasıdır.
 */
export function runRoomLoop(
  room: Pick<Room, 'setTimestep'>,
  hz: number,
  step: () => void,
  options: RoomLoopOptions = {},
): StepClock {
  if (!Number.isFinite(hz) || hz <= 0) throw new RangeError('Adım hızı pozitif olmalı.');
  const now = options.now ?? (() => performance.now());
  const stepMs = 1000 / hz;
  const clock = new StepClock(stepMs, now(), options.maxCatchUp);
  room.setTimestep(() => {
    for (let due = clock.due(now()); due > 0; due--) step();
  }, pumpIntervalMs(stepMs));
  return clock;
}
