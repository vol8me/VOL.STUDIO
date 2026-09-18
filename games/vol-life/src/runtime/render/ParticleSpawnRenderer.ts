import type Phaser from 'phaser';
import { particlePalette } from '@/config/particles';
import type { TransientPresentationEvent } from '@/runtime/sim/WorldEvents';

export interface ParticleSpawnStyle {
  readonly durationMs: number;
  readonly maxSpawns: number;
  readonly radiusUnits: number;
  readonly ringExpansionRatio: number;
}

export const DEFAULT_PARTICLE_SPAWN_STYLE: ParticleSpawnStyle = {
  durationMs: 450,
  maxSpawns: 128,
  radiusUnits: 3.2,
  ringExpansionRatio: 3.2,
};

interface SpawnAnimation {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly bornMs: number;
}

function detectReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Parçacık yeniden ekildiğinde (reseed / spawn) çalışan salt sunum efekti:
 * Aniden "pıt" diye belirmeyi önler; parçacığın doğduğu noktada genişleyen
 * zarif bir doğum halkası (ripple) ve merkez parıltısı üretir.
 *
 * Simülasyon durumuna geri bakmaz; `VoidDeathRenderer` ile tam simetriktir.
 */
export class ParticleSpawnRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private spawns: SpawnAnimation[] = [];
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly style: ParticleSpawnStyle = DEFAULT_PARTICLE_SPAWN_STYLE,
    private readonly reducedMotion: () => boolean = detectReducedMotion,
  ) {
    if (!(style.durationMs > 0) || !Number.isInteger(style.maxSpawns) || style.maxSpawns < 1) {
      throw new RangeError('Spawn süresi pozitif, parçacık tavanı pozitif tam sayı olmalı.');
    }
    // Parçacıkların hemen altında veya üstünde zarifçe ışır (-885: VoidDeath -890 ile Particle -880 arası)
    this.graphics = scene.add.graphics().setDepth(-885);
  }

  get activeSpawnCount(): number {
    return this.spawns.length;
  }

  /** Yeni doğuş olaylarını kabul eder; tavan aşılırsa en eski animasyonlar düşer (LOD). */
  push(events: readonly TransientPresentationEvent[], nowMs: number): void {
    if (this.destroyed || events.length === 0) return;
    for (const event of events) {
      if (event.kind !== 'particle-spawn') continue;
      this.spawns.push({
        x: event.x,
        y: event.y,
        color: particlePalette[event.type] ?? 0xffffff,
        bornMs: nowMs,
      });
    }
    const overflow = this.spawns.length - this.style.maxSpawns;
    if (overflow > 0) this.spawns.splice(0, overflow);
  }

  render(nowMs: number): void {
    if (this.destroyed) return;
    this.graphics.clear();
    if (this.spawns.length === 0) return;

    const { durationMs, radiusUnits: baseRadius, ringExpansionRatio } = this.style;
    const reduced = this.reducedMotion();
    const survivors: SpawnAnimation[] = [];

    for (const spawn of this.spawns) {
      const progress = (nowMs - spawn.bornMs) / durationMs;
      if (progress >= 1) continue;
      survivors.push(spawn);
      if (progress < 0) continue;

      const alpha = 1 - progress;

      if (reduced) {
        // Hareket hassasiyetinde yerinde sönümlenen yumuşak parıltı
        this.graphics.fillStyle(spawn.color, alpha * 0.7);
        this.graphics.fillCircle(spawn.x, spawn.y, baseRadius * 1.5);
        continue;
      }

      // 1. Genişleyen ve sönümlenen dış doğum halkası (ripple)
      const ringRadius = baseRadius * (0.6 + (ringExpansionRatio - 0.6) * Math.sqrt(progress));
      this.graphics.lineStyle(1.5, spawn.color, alpha * 0.85);
      this.graphics.strokeCircle(spawn.x, spawn.y, ringRadius);

      // 2. Merkez doğum ışıması (küçülen parlak çekirdek)
      const coreRadius = baseRadius * (1 - progress * 0.4);
      this.graphics.fillStyle(0xffffff, alpha * 0.75);
      this.graphics.fillCircle(spawn.x, spawn.y, coreRadius * 0.6);

      this.graphics.fillStyle(spawn.color, alpha * 0.5);
      this.graphics.fillCircle(spawn.x, spawn.y, coreRadius);
    }

    this.spawns = survivors;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.spawns = [];
    this.graphics.destroy();
  }
}
