import type Phaser from 'phaser';
import { telegraphConfig } from '@/config/telegraph';
import { RENDER_DEPTH } from '@/config/layers';
import { finiteOr, nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

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

/** Uyarı tamamlandı mı, iptal mi edildi? */
export interface TelegraphResult {
  completed: boolean;
}

/** `play()` çağrısından dönen, telegraph'ı bekleyen/iptal eden tutacak. */
export interface TelegraphHandle {
  /** Uyarı sonucu. Süre dolarsa `{ completed: true }`, iptal edilirse `{ completed: false }`. */
  readonly promise: Promise<TelegraphResult>;
  /** Uyarıyı hemen iptal eder. */
  cancel(): void;
}

/** Sahnede yaşayan tek bir telegraph. */
interface ActiveTelegraph {
  id: number;
  graphics: Phaser.GameObjects.Graphics;
  options: TelegraphOptions;
  elapsedMs: number;
  /** Uyarı tamamlandığında veya iptal edildiğinde çağrılır. */
  resolve: (result: TelegraphResult) => void;
  /** İptal edildiyse `resolve` içinde `completed: false` gönderilir. */
  cancelled: boolean;
}

/**
 * Ortak telegraph katmanı — Elite ve Boss'un TÜM saldırıları buradan geçer.
 *
 * `play()` bir `TelegraphHandle` döner. Uyarı süresi dolduğunda
 * `handle.promise` `{ completed: true }` ile çözülür; çağıran kod saldırıyı o
 * noktada uygular. Böylece "uyarı çiz → bekle → vur" akışı her saldırıda
 * yeniden yazılmaz ve uyarı süresi ile hasar anı ASLA birbirinden kaymaz.
 *
 * Zamanlama sahne delta'sıyla yürür (`setTimeout`/`scene.time` DEĞİL): oyun
 * duraklatıldığında telegraph da donar, yoksa kart ekranı açıkken geçen süre
 * oyuncuyu görmediği bir saldırıyla karşılardı.
 *
 * Aynı anda birden fazla telegraph yaşayabilir — Elite dash uyarısı verirken
 * Boss ayrı bir alan işaretleyebilir. Tek tek veya toplu `cancel()` ile
 * bekleyen telegraph'lar güvenli şekilde sonlandırılabilir; promise
 * `{ completed: false }` ile çözülür, böylece çağıran "iptal edildi" durumunu
 * ayırt edebilir.
 */
export class TelegraphManager {
  private readonly active: ActiveTelegraph[] = [];
  private nextId = 1;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Bir uyarı alanı çizer ve süresi dolunca çözülen bir promise döner.
   *
   * Promise, uyarı normal şekilde tamamlanırsa `{ completed: true }`,
   * `cancel()` / `cancelAll()` / `destroy()` ile iptal edilirse
   * `{ completed: false }` olarak çözülür.
   */
  play(options: TelegraphOptions): TelegraphHandle {
    if (this.destroyed) return cancelledTelegraphHandle();

    const safeOptions: TelegraphOptions = {
      ...options,
      durationMs: nonNegativeFinite(options.durationMs),
      x: finiteOr(options.x, 0),
      y: finiteOr(options.y, 0),
      radius: nonNegativeFinite(options.radius),
      angle: options.angle === undefined ? undefined : finiteOr(options.angle, 0),
      width: options.width === undefined ? undefined : nonNegativeFinite(options.width),
      spread: options.spread === undefined ? undefined : nonNegativeFinite(options.spread),
    };
    const graphics = this.scene.add.graphics();
    graphics.setDepth(RENDER_DEPTH.abilityGround);

    const id = this.nextId++;
    let resolve: (result: TelegraphResult) => void;
    const promise = new Promise<TelegraphResult>((res) => {
      resolve = res;
    });

    const telegraph: ActiveTelegraph = {
      id,
      graphics,
      options: safeOptions,
      elapsedMs: 0,
      resolve: resolve!,
      cancelled: false,
    };

    this.draw(telegraph);
    this.active.push(telegraph);

    return {
      promise,
      cancel: () => this.cancelById(id),
    };
  }

  /** Yaşayan telegraph sayısı — test ve diagnostic için. */
  getActiveCount(): number {
    return this.active.length;
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    const safeDelta = safeDeltaMs(deltaMs);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const telegraph = this.active[i];
      telegraph.elapsedMs += safeDelta;

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
      telegraph.resolve({ completed: true });
    }
  }

  /**
   * Tek bir uyarıyı iptal eder — saldırıyı UYGULAMAZ.
   */
  private cancelById(id: number): void {
    const i = this.active.findIndex((t) => t.id === id);
    if (i < 0) return;

    const telegraph = this.active[i];
    telegraph.cancelled = true;
    telegraph.graphics.destroy();

    const last = this.active.pop();
    if (last && i < this.active.length) {
      this.active[i] = last;
    }
    telegraph.resolve({ completed: false });
  }

  /**
   * Bekleyen tüm uyarıları iptal eder — saldırıları UYGULAMAZ.
   * Dalga temizliğinde ve sahne kapanışında çağrılır.
   */
  cancelAll(): void {
    while (this.active.length > 0) {
      this.cancelById(this.active[0].id);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelAll();
  }

  /** Uyarıyı o anki ilerlemesine göre yeniden çizer. */
  private draw(telegraph: ActiveTelegraph): void {
    const { graphics, options } = telegraph;
    const progress =
      options.durationMs > 0 ? Math.min(1, telegraph.elapsedMs / options.durationMs) : 1;
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

/** Yok edilmiş yöneticide açılan saldırı, oyuncuya sonradan hasar veremez. */
function cancelledTelegraphHandle(): TelegraphHandle {
  return {
    promise: Promise.resolve({ completed: false }),
    cancel: () => {},
  };
}
