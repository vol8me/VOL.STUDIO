import type Phaser from 'phaser';
import type { EntityVisualQualityProvider } from './entityVisuals';
import type { Random, Vector2 } from '@volstudio/core';
import { economyConfig } from '@/config/economy';
import { playerConfig } from '@/config/player';
import type { Border } from './Border';
import { FluxPickup } from './FluxPickup';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { diagnostics } from '@/app/services';
import { nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

export interface FluxPickupCallbacks {
  /** Bir parça toplandığında — sayaca eklemek için. */
  onCollected?: (amount: number) => void;
}

/**
 * Flux parçalarının yaşam döngüsü — düşme, toplanma, süre dolumu.
 *
 * Bir düşman öldüğünde `drop()` çağrılır; miktar birden fazla parçaya
 * bölünerek ölüm noktasının etrafına saçılır. Toplama, oyuncu parçaya
 * değdiğinde olur.
 */
export class FluxPickupManager {
  private readonly pickups: FluxPickup[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly border: Border,
    private readonly effects: EffectManager,
    private readonly random: Random,
    private readonly callbacks: FluxPickupCallbacks = {},
    /** Kalite kademesi görsel anahtarları; verilmezse tam kalite. */
    private readonly visualsProvider?: EntityVisualQualityProvider,
  ) {}

  /** Ölüm noktasına Flux düşürür; miktarı parçalara böler. */
  drop(x: number, y: number, amount: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Flux ayrık parçalara bölünür; kesirli miktar parça matematiğini bozardı
    // (ileride bir çarpan kartı gelirse burada tamsayıya inmiş olur).
    const total = Math.floor(nonNegativeFinite(amount));
    if (total <= 0) return;

    const { maxDropsPerDeath, scatterRadius, maxActive } = economyConfig.flux;
    const pieceCount = Math.min(total, maxDropsPerDeath);
    const perPiece = Math.floor(total / pieceCount);
    // Bölünemeyen artık ilk parçaya biner; toplam miktar korunur.
    let remainder = total - perPiece * pieceCount;

    for (let i = 0; i < pieceCount; i++) {
      const pieceAmount = perPiece + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;

      // Flux'un ömrü yok; tavan dolduğunda parça yaratmak yerine miktar en
      // eski parçaya eklenir — sahne şişmez, kazanılan Flux da kaybolmaz.
      if (this.pickups.length >= maxActive) {
        this.pickups[0].addAmount(pieceAmount);
        continue;
      }

      const angle = this.random.next() * Math.PI * 2;
      const distance = this.random.next() * scatterRadius;

      this.pickups.push(
        new FluxPickup(
          this.scene,
          x,
          y,
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          this.border,
          pieceAmount,
          this.visualsProvider,
        ),
      );
    }
  }

  update(deltaMs: number, playerPos: Vector2): void {
    const safeDelta = safeDeltaMs(deltaMs);
    if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y)) return;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.update(safeDelta, playerPos.x, playerPos.y);

      if (!pickup.isWithinCollectRange(playerPos.x, playerPos.y, playerConfig.hitboxRadius)) {
        continue;
      }

      const amount = pickup.collect();
      this.effects.play('fluxPickup', pickup.x, pickup.y);
      this.callbacks.onCollected?.(amount);
      diagnostics?.recordEvent('fluxCollected', { amount });
      this.remove(i);
    }
  }

  /** Sahnedeki aktif parça sayısı — diagnostic için. */
  getActiveCount(): number {
    return this.pickups.length;
  }

  /**
   * Toplanmamış tüm Flux'u siler — dalga geçişi temizliği.
   * Miktar sayaca EKLENMEZ: dalga bitmeden toplanmayan Flux kaybolur.
   * Oyuncuyu dalga içinde toplamaya iten şey budur.
   *
   * @returns Silinen parça sayısı.
   */
  clearAll(): number {
    const count = this.pickups.length;
    for (const pickup of this.pickups) {
      pickup.destroy();
    }
    this.pickups.length = 0;
    return count;
  }

  destroy(): void {
    for (const pickup of this.pickups) {
      pickup.destroy();
    }
    this.pickups.length = 0;
  }

  /** Swap-and-pop: O(1) kaldırma, kaydırma yok. */
  private remove(index: number): void {
    const last = this.pickups.pop();
    if (last && index < this.pickups.length) {
      this.pickups[index] = last;
    }
  }
}
