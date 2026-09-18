import type Phaser from 'phaser';
import { particlePalette } from '@/config/particles';
import type { TransientPresentationEvent } from '@/runtime/sim/WorldEvents';

export interface VoidDeathStyle {
  readonly durationMs: number;
  readonly maxGhosts: number;
  readonly stretchMax: number;
  readonly radiusUnits: number;
  readonly drainColor: number;
}

interface Ghost {
  readonly x: number;
  readonly y: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly color: number;
  readonly bornMs: number;
}

const STRETCH_END = 0.3;
const DRAIN_END = 0.6;

/**
 * Void ölümünün salt sunum hayaleti (DESIGN.md §6): stretch → color drain →
 * shrink/smear → fade. Hayalet hash'e, kuvvete veya snapshot'a dönemez; bu
 * sınıf simülasyon nesnesi tutmaz, yalnız olayın kopyasını taşır.
 * `prefers-reduced-motion` altında uzama ve kayma yerine düz sönüm kullanılır.
 */
export class VoidDeathRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private ghosts: Ghost[] = [];
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly style: VoidDeathStyle,
    private readonly reducedMotion: () => boolean = detectReducedMotion,
  ) {
    if (!(style.durationMs > 0) || !Number.isInteger(style.maxGhosts) || style.maxGhosts < 1) {
      throw new RangeError('Void ölüm süresi pozitif, hayalet tavanı pozitif tam sayı olmalı.');
    }
    this.graphics = scene.add.graphics().setDepth(-890);
  }

  get ghostCount(): number {
    return this.ghosts.length;
  }

  /** Yeni geçişleri alır; tavan aşılırsa EN ESKİ hayaletler düşer (LOD). */
  push(crossings: readonly TransientPresentationEvent[], nowMs: number): void {
    if (this.destroyed || crossings.length === 0) return;
    for (const crossing of crossings) {
      if (crossing.kind !== 'void-death') continue;
      this.ghosts.push({
        x: crossing.x,
        y: crossing.y,
        normalX: crossing.normalX,
        normalY: crossing.normalY,
        color: particlePalette[crossing.type] ?? this.style.drainColor,
        bornMs: nowMs,
      });
    }
    const overflow = this.ghosts.length - this.style.maxGhosts;
    if (overflow > 0) this.ghosts.splice(0, overflow);
  }

  render(nowMs: number): void {
    if (this.destroyed) return;
    this.graphics.clear();
    if (this.ghosts.length === 0) return;
    const { durationMs, radiusUnits: radius } = this.style;
    const reduced = this.reducedMotion();
    const survivors: Ghost[] = [];
    for (const ghost of this.ghosts) {
      const progress = (nowMs - ghost.bornMs) / durationMs;
      if (progress >= 1) continue;
      survivors.push(ghost);
      if (progress < 0) continue;
      if (reduced) {
        this.graphics.fillStyle(ghost.color, 1 - progress);
        this.graphics.fillCircle(ghost.x, ghost.y, radius);
        continue;
      }
      const stretchPhase = Math.min(1, progress / STRETCH_END);
      const drainPhase = clamp01((progress - STRETCH_END) / (DRAIN_END - STRETCH_END));
      const shrinkPhase = clamp01((progress - DRAIN_END) / (1 - DRAIN_END));
      const stretch = 1 + (this.style.stretchMax - 1) * stretchPhase;
      const scale = 1 - shrinkPhase;
      const drift = radius * 2 * progress;
      const color = mixColor(ghost.color, this.style.drainColor, drainPhase);
      this.graphics.fillStyle(color, 1 - shrinkPhase);
      this.graphics.save();
      this.graphics.translateCanvas(
        ghost.x + ghost.normalX * drift,
        ghost.y + ghost.normalY * drift,
      );
      this.graphics.rotateCanvas(Math.atan2(ghost.normalY, ghost.normalX));
      this.graphics.fillEllipse(
        0,
        0,
        radius * 2 * stretch * scale,
        ((radius * 2) / Math.sqrt(stretch)) * scale,
      );
      this.graphics.restore();
    }
    this.ghosts = survivors;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ghosts = [];
    this.graphics.destroy();
  }
}

function detectReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mixColor(from: number, to: number, amount: number): number {
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * amount) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
