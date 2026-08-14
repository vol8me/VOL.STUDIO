import type Phaser from 'phaser';
import { telegraphConfig } from '@/config/telegraph';
import { RENDER_DEPTH } from '@/config/layers';

/** Telegraph'ın kapladığı alanın şekli. */
export type TelegraphShape = 'circle' | 'line' | 'cone';

export interface TelegraphOptions {
  /** Uyarı süresi (ms) — saldırının kendisinden ÖNCE geçen süre. */
  durationMs: number;
  shape: TelegraphShape;
  /** Alanın çıkış noktası (dünya koordinatı). */
  x: number;
  y: number;
  /**
   * Etki yarıçapı (piksel).
   * - `circle`: dairenin yarıçapı.
   * - `line`: çizginin uzunluğu.
   * - `cone`: koninin menzili.
   */
  radius: number;
  /** Yön (radyan). `line` ve `cone` için zorunlu; `circle` için yok sayılır. */
  angle?: number;
  /** Çizginin genişliği (piksel) — yalnızca `line`. */
  width?: number;
  /** Koninin toplam açıklığı (radyan) — yalnızca `cone`. */
  spread?: number;
  /** Uyarı rengi (0xRRGGBB). Verilmezse `telegraphConfig.defaultColor`. */
  color?: number;
}

/** Sahnede yaşayan tek bir telegraph. */
interface ActiveTelegraph {
  graphics: Phaser.GameObjects.Graphics;
  options: TelegraphOptions;
  elapsedMs: number;
  /** Uyarı süresi dolduğunda çağrılır — saldırıyı çağıran kod uygular. */
  resolve: () => void;
  /** İptal edildiyse `resolve` çağrılmaz. */
  cancelled: boolean;
}

/**
 * Ortak telegraph katmanı — Elite ve Boss'un TÜM saldırıları buradan geçer.
 *
 * `play()` bir Promise döner ve uyarı süresi dolduğunda resolve olur; çağıran
 * kod saldırıyı o noktada uygular. Böylece "uyarı çiz → bekle → vur" akışı her
 * saldırıda yeniden yazılmaz, ve uyarı süresi ile hasar anı ASLA birbirinden
 * kaymaz.
 *
 * Zamanlama sahne delta'sıyla yürür (`setTimeout`/`scene.time` DEĞİL): oyun
 * duraklatıldığında telegraph da donar, yoksa kart ekranı açıkken geçen süre
 * oyuncuyu görmediği bir saldırıyla karşılardı.
 *
 * Aynı anda birden fazla telegraph yaşayabilir — Elite dash uyarısı verirken
 * Boss ayrı bir alan işaretleyebilir.
 */
export class TelegraphManager {
  private readonly active: ActiveTelegraph[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Bir uyarı alanı çizer ve süresi dolunca resolve olur.
   *
   * Promise YALNIZCA uyarı normal şekilde tamamlanırsa resolve olur; sahne
   * kapanır ya da `cancelAll()` çağrılırsa hiç resolve OLMAZ (reject de etmez).
   * Bu bilinçli: sahne yıkılırken bekleyen saldırıların uygulanması istenmez.
   */
  play(options: TelegraphOptions): Promise<void> {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(RENDER_DEPTH.abilityGround);

    return new Promise<void>((resolve) => {
      const telegraph: ActiveTelegraph = {
        graphics,
        options,
        elapsedMs: 0,
        resolve,
        cancelled: false,
      };
      this.draw(telegraph);
      this.active.push(telegraph);
    });
  }

  /** Yaşayan telegraph sayısı — test ve diagnostic için. */
  getActiveCount(): number {
    return this.active.length;
  }

  update(deltaMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const telegraph = this.active[i];
      telegraph.elapsedMs += deltaMs;

      if (telegraph.elapsedMs < telegraph.options.durationMs) {
        this.draw(telegraph);
        continue;
      }

      // Süre doldu: önce sahneden kaldır, SONRA resolve et. resolve() içinde
      // yeni bir telegraph açılabilir; liste o sırada tutarlı olmalı.
      telegraph.graphics.destroy();
      const last = this.active.pop();
      if (last && i < this.active.length) {
        this.active[i] = last;
      }
      if (!telegraph.cancelled) {
        telegraph.resolve();
      }
    }
  }

  /**
   * Bekleyen tüm uyarıları siler — saldırıları UYGULAMADAN.
   * Dalga temizliğinde ve sahne kapanışında çağrılır.
   */
  cancelAll(): void {
    for (const telegraph of this.active) {
      telegraph.cancelled = true;
      telegraph.graphics.destroy();
    }
    this.active.length = 0;
  }

  destroy(): void {
    this.cancelAll();
  }

  /** Uyarıyı o anki ilerlemesine göre yeniden çizer. */
  private draw(telegraph: ActiveTelegraph): void {
    const { graphics, options } = telegraph;
    const progress = Math.min(1, telegraph.elapsedMs / options.durationMs);
    const color = options.color ?? telegraphConfig.defaultColor;

    const intensity = this.getIntensity(telegraph, progress);
    const fillAlpha = lerp(
      telegraphConfig.fillAlphaStart,
      telegraphConfig.fillAlphaEnd,
      progress * intensity,
    );
    const strokeAlpha = lerp(
      telegraphConfig.strokeAlphaStart,
      telegraphConfig.strokeAlphaEnd,
      progress * intensity,
    );

    graphics.clear();
    graphics.fillStyle(color, fillAlpha);
    graphics.lineStyle(telegraphConfig.strokeWidthPx, color, strokeAlpha);

    switch (options.shape) {
      case 'circle':
        this.drawCircle(graphics, options);
        break;
      case 'line':
        this.drawLine(graphics, options);
        break;
      case 'cone':
        this.drawCone(graphics, options);
        break;
    }
  }

  /**
   * Son pencerede titreme çarpanı — "şimdi kaç" sinyali.
   * Titremeyen sabit bir dolgu artışı yeterince acil hissettirmiyordu.
   */
  private getIntensity(telegraph: ActiveTelegraph, progress: number): number {
    if (progress < telegraphConfig.flashStartRatio) return 1;
    const phase = (telegraph.elapsedMs / telegraphConfig.flashPeriodMs) * Math.PI * 2;
    const wave = (Math.sin(phase) + 1) / 2;
    return 1 - telegraphConfig.flashDepthRatio * (1 - wave);
  }

  private drawCircle(graphics: Phaser.GameObjects.Graphics, options: TelegraphOptions): void {
    graphics.fillCircle(options.x, options.y, options.radius);
    graphics.strokeCircle(options.x, options.y, options.radius);
  }

  /** Yönlü çizgi — dikdörtgen bir koridor olarak çizilir. */
  private drawLine(graphics: Phaser.GameObjects.Graphics, options: TelegraphOptions): void {
    const angle = options.angle ?? 0;
    const halfWidth = (options.width ?? 0) / 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    // Dik vektör — koridorun kalınlığını verir.
    const perpX = -dirY * halfWidth;
    const perpY = dirX * halfWidth;
    const endX = options.x + dirX * options.radius;
    const endY = options.y + dirY * options.radius;

    drawPolygon(graphics, [
      options.x + perpX,
      options.y + perpY,
      endX + perpX,
      endY + perpY,
      endX - perpX,
      endY - perpY,
      options.x - perpX,
      options.y - perpY,
    ]);
  }

  /** Koni — merkezden açılan bir dilim. */
  private drawCone(graphics: Phaser.GameObjects.Graphics, options: TelegraphOptions): void {
    const angle = options.angle ?? 0;
    const spread = options.spread ?? 0;
    const start = angle - spread / 2;
    const step = spread / telegraphConfig.coneSegments;

    const flat: number[] = [options.x, options.y];
    for (let i = 0; i <= telegraphConfig.coneSegments; i++) {
      const a = start + step * i;
      flat.push(options.x + Math.cos(a) * options.radius, options.y + Math.sin(a) * options.radius);
    }
    drawPolygon(graphics, flat);
  }
}

/**
 * Kapalı çokgen çizer — dolgu + kenar.
 *
 * `fillPoints` Phaser tarafında gerçek `Vector2` örneği bekliyor; düz sayı
 * dizisiyle yol kurmak hem tip uyumsuzluğunu hem çizim başına onlarca geçici
 * Vector2 üretimini ortadan kaldırır (telegraph her frame yeniden çizilir).
 *
 * @param flat [x0, y0, x1, y1, …] sırasında köşe koordinatları.
 */
function drawPolygon(graphics: Phaser.GameObjects.Graphics, flat: readonly number[]): void {
  if (flat.length < 6) return;

  graphics.beginPath();
  graphics.moveTo(flat[0], flat[1]);
  for (let i = 2; i < flat.length; i += 2) {
    graphics.lineTo(flat[i], flat[i + 1]);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}
