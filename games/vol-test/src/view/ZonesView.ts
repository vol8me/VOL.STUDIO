import type Phaser from 'phaser';
import { FRONT_VIEW } from '@/config/frontView';
import { ONLINE_VIEW } from '@/config/onlineView';
import type { FrontFrame } from './front';

const ZONE = FRONT_VIEW.zone;
const BASE = FRONT_VIEW.base;
const TAU = Math.PI * 2;
/** Yay saat 12'den başlar. */
const TOP = -Math.PI / 2;

/** Görünen dünya dikdörtgeni (kamera). */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function factionColor(faction: number): number {
  return ONLINE_VIEW.colors.teams[faction] ?? FRONT_VIEW.colors.neutral;
}

/**
 * Cephe hattının dünyadaki çizimi: bölge çemberleri (sahibin renginde halka, ilerleme yayı,
 * tartışmalıda nabız) ve iki üs. Tek `Graphics` katmanıdır; yalnız kameraya yakın öğeler çizilir.
 * Durum ve geometri `FrontFrame`den gelir, görünüm kural bilmez.
 */
export class ZonesView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(FRONT_VIEW.depth);
  }

  update(front: FrontFrame, view: ViewRect, timeMs: number): void {
    const graphics = this.graphics;
    graphics.clear();
    for (const base of front.bases) {
      if (!this.near(base.x, base.y, base.radius, view)) continue;
      const color = factionColor(base.faction);
      graphics.fillStyle(color, BASE.fillAlpha);
      graphics.fillCircle(base.x, base.y, base.radius);
      graphics.lineStyle(BASE.ringWidth, color, BASE.ringAlpha);
      graphics.strokeCircle(base.x, base.y, base.radius);
      graphics.fillStyle(color, BASE.ringAlpha);
      graphics.fillRect(
        base.x - BASE.markHalf,
        base.y - BASE.markHalf,
        BASE.markHalf * 2,
        BASE.markHalf * 2,
      );
    }
    const pulse = 0.5 + 0.5 * Math.sin((timeMs / 1000) * TAU * ZONE.contestedPulseHz);
    for (const zone of front.zones) {
      if (!this.near(zone.x, zone.y, zone.radius, view)) continue;
      const color = zone.owner < 0 ? FRONT_VIEW.colors.neutral : factionColor(zone.owner);
      graphics.fillStyle(color, ZONE.fillAlpha);
      graphics.fillCircle(zone.x, zone.y, zone.radius);
      const ringAlpha = zone.contested ? ZONE.ringAlpha * (0.45 + 0.55 * pulse) : ZONE.ringAlpha;
      graphics.lineStyle(ZONE.ringWidth, color, ringAlpha);
      graphics.strokeCircle(zone.x, zone.y, zone.radius);
      const sweep = Math.min(1, Math.abs(zone.progress)) * TAU;
      if (sweep < 1e-3) continue;
      graphics.lineStyle(
        ZONE.progressWidth,
        factionColor(zone.progress > 0 ? 0 : 1),
        ZONE.progressAlpha,
      );
      graphics.beginPath();
      graphics.arc(zone.x, zone.y, zone.radius * ZONE.progressInset, TOP, TOP + sweep, false);
      graphics.strokePath();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private near(x: number, y: number, radius: number, view: ViewRect): boolean {
    const reach = radius + FRONT_VIEW.cullMargin;
    return (
      x + reach >= view.x &&
      x - reach <= view.x + view.width &&
      y + reach >= view.y &&
      y - reach <= view.y + view.height
    );
  }
}
