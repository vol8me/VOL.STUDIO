import type Phaser from 'phaser';
import { FX } from '@/config/fx';

/** Hasarın oyuncuya göre yönü: rengi ve büyüklüğü bunu söyler. */
export type DamageKind = 'dealt' | 'taken' | 'other';

interface Slot {
  readonly text: Phaser.GameObjects.Text;
  ageMs: number;
  driftX: number;
  active: boolean;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Hasar sayıları: isabet noktasından yukarı süzülüp sönen küçük yazılar. Çok oyunculuda kimin kime ne
 * kadar vurduğu ancak böyle okunur: verilen hasar (sarı), alınan hasar (kırmızı) ve başkalarının
 * isabeti (soluk, küçük) renk ve boyla ayrılır. Yazılar sabit bir havuzdan gelir; havuz dolunca en eski
 * sayı yeniden kullanılır, yani yoğun ateşte nesne üretilmez.
 */
export class DamageNumbers {
  private readonly slots: Slot[] = [];
  private cursor = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Bir sayı başlatır; `amount` tam sayıya yuvarlanır. Yarım puandan az hasar yazılmaz. */
  spawn(x: number, y: number, amount: number, kind: DamageKind): void {
    const look = FX.damageNumbers;
    if (amount < look.minAmount) return;
    const slot = this.acquire();
    const style = look.kinds[kind];
    slot.text
      .setText(String(Math.max(1, Math.round(amount))))
      .setColor(css(style.color))
      .setFontSize(style.size)
      .setPosition(x, y)
      .setAlpha(1)
      .setVisible(true);
    slot.ageMs = 0;
    // Aynı noktaya üst üste inen sayılar yan yana dağılsın diye hafif, belirli bir yan kayma verilir.
    slot.driftX = ((Math.round(x * 7 + y * 13 + amount) % 5) - 2) * look.driftPerStep;
    slot.active = true;
  }

  update(deltaMs: number): void {
    const look = FX.damageNumbers;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.ageMs += deltaMs;
      const t = slot.ageMs / look.lifeMs;
      if (t >= 1) {
        slot.active = false;
        slot.text.setVisible(false);
        continue;
      }
      // Yükseliş yavaşlayarak ilerler (toplam `risePx`); sönme ömrün son kesrinde başlar.
      const step = deltaMs / look.lifeMs;
      slot.text
        .setY(slot.text.y - look.risePx * 2 * (1 - t) * step)
        .setX(slot.text.x + slot.driftX * step)
        .setAlpha(t < look.fadeStart ? 1 : 1 - (t - look.fadeStart) / (1 - look.fadeStart));
    }
  }

  /** O anda görünen sayı sayısı. */
  get active(): number {
    return this.slots.filter((slot) => slot.active).length;
  }

  destroy(): void {
    for (const slot of this.slots) slot.text.destroy();
    this.slots.length = 0;
  }

  private acquire(): Slot {
    const look = FX.damageNumbers;
    const free = this.slots.find((slot) => !slot.active);
    if (free) return free;
    if (this.slots.length < look.capacity) {
      const text = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'Jura, sans-serif',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#14100c',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setResolution(look.resolution)
        .setDepth(look.depth)
        .setVisible(false);
      const slot: Slot = { text, ageMs: 0, driftX: 0, active: false };
      this.slots.push(slot);
      return slot;
    }
    // Havuz dolu: en eski sayı yeniden kullanılır (halka sırası).
    const slot = this.slots[this.cursor % this.slots.length];
    this.cursor += 1;
    return slot;
  }
}
