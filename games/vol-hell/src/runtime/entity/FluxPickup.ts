import type Phaser from 'phaser';
import { resolveEntityVisuals, type EntityVisualQualityProvider } from './entityVisuals';
import { economyConfig } from '@/config/economy';
import { RENDER_DEPTH } from '@/config/layers';
import type { Border } from './Border';
import { nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

/**
 * Yerde duran Flux parçası — koşunun para birimi.
 *
 * Flux otomatik sayaca eklenmez: düşman ölünce ölüm noktasından fırlar, bir yay
 * çizerek yere iner ve oyuncunun gidip alması gerekir. Yakınına gelindiğinde
 * mıknatıs gibi çekilir. **Ömrü yoktur**; toplanana kadar yerde durur.
 */
export class FluxPickup {
  private readonly arc: Phaser.GameObjects.Arc;
  /** Yere inişin hedefi — saçılma noktası. */
  private readonly landingX: number;
  private readonly landingY: number;
  /** Fırlama noktası (düşmanın öldüğü yer). */
  private readonly originX: number;
  private readonly originY: number;
  /** Süzülmenin salınım merkezi — mıknatıs parçayı taşıdıkça güncellenir. */
  private bobAnchorY = 0;
  private dropElapsedMs = 0;
  private bobElapsedMs = 0;
  private settled = false;
  private collected = false;
  private amountValue: number;

  constructor(
    scene: Phaser.Scene,
    /** Fırlama noktası — düşmanın öldüğü konum. */
    originX: number,
    originY: number,
    /** İneceği nokta — ölüm noktası etrafında saçılmış konum. */
    landingX: number,
    landingY: number,
    border: Border,
    /** Toplanınca sayaca eklenecek miktar. */
    amount: number,
    /** Kalite kademesi görsel anahtarları; verilmezse tam kalite. */
    visualsProvider?: EntityVisualQualityProvider,
  ) {
    const { radius, color, strokeColor, strokeWidth } = economyConfig.flux;
    this.amountValue = Math.floor(nonNegativeFinite(amount));

    // Sahne dışına düşen parça toplanamaz; iniş noktası sınır içine çekilir.
    this.originX = border.clampX(originX, radius);
    this.originY = border.clampY(originY, radius);
    this.landingX = border.clampX(landingX, radius);
    this.landingY = border.clampY(landingY, radius);

    this.arc = scene.add.circle(this.originX, this.originY, radius, color, 1);
    if (resolveEntityVisuals(visualsProvider).entityStrokes) {
      this.arc.setStrokeStyle(strokeWidth, strokeColor, 1);
    }
    this.arc.setDepth(RENDER_DEPTH.fluxPickup);
    this.arc.setScale(economyConfig.flux.drop.popScale);
  }

  get x(): number {
    return this.arc.x;
  }

  get y(): number {
    return this.arc.y;
  }

  /**
   * Tavan dolduğunda yeni düşen miktar mevcut parçanın üzerine eklenir;
   * böylece sahne şişmeden hiçbir Flux kaybolmaz.
   */
  addAmount(extra: number): void {
    if (!Number.isFinite(extra) || extra <= 0) return;
    this.amountValue = Math.min(Number.MAX_SAFE_INTEGER, this.amountValue + Math.floor(extra));
  }

  /** Parçayı günceller: düşme yayı, yerdeki süzülme ve mıknatıs çekimi. */
  update(deltaMs: number, playerX: number, playerY: number): void {
    if (this.collected) return;
    const safeDelta = safeDeltaMs(deltaMs);

    if (!this.settled) {
      this.updateDrop(safeDelta);
      return;
    }

    if (this.applyMagnet(safeDelta, playerX, playerY)) return;
    this.updateBob(safeDelta);
  }

  /** Oyuncu bu parçayı toplayacak kadar yakın mı? İniş bitmeden toplanmaz. */
  isWithinCollectRange(playerX: number, playerY: number, playerRadius: number): boolean {
    if (!this.settled) return false;
    const reach = playerRadius + economyConfig.flux.radius + economyConfig.flux.collectDistance;
    return Math.hypot(playerX - this.arc.x, playerY - this.arc.y) <= reach;
  }

  /** Parçayı toplanmış işaretleyip sahneden kaldırır. */
  collect(): number {
    if (this.collected) return 0;
    this.collected = true;
    this.arc.destroy();
    return this.amountValue;
  }

  destroy(): void {
    if (this.collected) return;
    this.collected = true;
    this.arc.destroy();
  }

  /**
   * Fırlama yayı: yatayda yumuşayarak (easeOutCubic) iniş noktasına gider,
   * dikeyde bir yay çizer, fırlama anındaki büyüme yere inerken sönümlenir.
   * Tween yerine elle yürütülür — delta tabanlı, deterministik ve test edilebilir.
   */
  private updateDrop(deltaMs: number): void {
    const { durationMs, arcHeight, popScale } = economyConfig.flux.drop;
    this.dropElapsedMs += deltaMs;
    const t = Math.min(1, this.dropElapsedMs / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);

    this.arc.x = this.originX + (this.landingX - this.originX) * eased;
    this.arc.y =
      this.originY + (this.landingY - this.originY) * eased - Math.sin(t * Math.PI) * arcHeight;
    this.arc.setScale(1 + (popScale - 1) * (1 - eased));

    if (t < 1) return;

    this.arc.x = this.landingX;
    this.arc.y = this.landingY;
    this.arc.setScale(1);
    this.bobAnchorY = this.landingY;
    this.settled = true;
  }

  /** Mıknatıs menzilindeyse oyuncuya doğru çeker. Çektiyse true döner. */
  private applyMagnet(deltaMs: number, playerX: number, playerY: number): boolean {
    const { magnetRadius, magnetSpeed } = economyConfig.flux;
    const dx = playerX - this.arc.x;
    const dy = playerY - this.arc.y;
    const distance = Math.hypot(dx, dy);
    // distance NaN veya Infinity olduğunda `> magnetRadius` karşılaştırması
    // `false` döner ve ilerlenir — konum bozulmadan geri dön.
    if (!Number.isFinite(distance) || distance === 0 || distance > magnetRadius) return false;

    const step = (magnetSpeed * deltaMs) / 1000;
    if (!Number.isFinite(step)) return false;

    // Adım mesafeyi aşarsa oyuncunun üstüne otur; sekme/titreme olmasın.
    const travel = Math.min(step, distance);
    this.arc.x += (dx / distance) * travel;
    this.arc.y += (dy / distance) * travel;
    // Süzülme merkezi taşınan konuma çekilir; oyuncu menzilden çıkınca parça
    // eski iniş noktasına ışınlanmaz.
    this.bobAnchorY = this.arc.y;
    this.bobElapsedMs = 0;
    return true;
  }

  /** Yerde beklerken hafif süzülme — config'ten kapatılabilir. */
  private updateBob(deltaMs: number): void {
    const { enabled, amplitudePx, periodMs } = economyConfig.flux.bob;
    if (!enabled || periodMs <= 0) return;

    this.bobElapsedMs = (this.bobElapsedMs + deltaMs) % periodMs;
    const phase = (this.bobElapsedMs / periodMs) * Math.PI * 2;
    this.arc.y = this.bobAnchorY + Math.sin(phase) * amplitudePx;
  }
}
