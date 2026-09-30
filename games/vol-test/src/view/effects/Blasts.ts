import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';
import { DecalPool } from './DecalPool';

/** Genişleyerek sönen ışık: parlama ve şok halkası aynı yaşam döngüsünü paylaşır. */
interface Pulse {
  readonly image: Phaser.GameObjects.Image;
  ageMs: number;
  durationMs: number;
  /** Başlangıç ve bitiş ölçeği, başlangıç saydamlığı. */
  from: number;
  to: number;
  alpha: number;
}

/** Aynı anda canlı en çok parlama ve halka; fazlası en eskiyi yeniden kullanır. */
const LIVE_LIMIT = 16;

/**
 * Patlamanın parçacık dışı katmanları: kısa ışık parlaması, genişleyen şok
 * halkası ve zeminde kalan yanık izi. Parlama ve halka havuzlu tek dörtgenlik
 * görüntülerdir (her karede yeniden üçgenlenen Graphics değil); sunum
 * zamanıyla ilerler, duraklatmada durur. Yanık `DecalPool` ile söner.
 */
export class Blasts {
  private readonly flashes: PulsePool;
  private readonly rings: PulsePool;
  private readonly scorches: DecalPool;

  constructor(scene: Phaser.Scene, decalScale = 1) {
    this.flashes = new PulsePool(scene, TEXTURE.blast, PALETTE.blastHalo, 14);
    this.rings = new PulsePool(scene, TEXTURE.ring, PALETTE.blastCore, 12);
    const scorch = FX.blast.scorch;
    this.scorches = new DecalPool(scene, {
      texture: TEXTURE.scorch,
      tint: PALETTE.scorch,
      capacity: Math.max(1, Math.round(scorch.capacity * decalScale)),
      depth: scorch.depth,
      lifeMs: scorch.lifeMs,
      holdShare: scorch.holdShare,
    });
  }

  /** Patlama: parlama, şok halkası ve (yerde ya da duvarda) yanık. */
  explode(x: number, y: number, scorch: boolean, flashScale: number = FX.blast.flash.scale): void {
    const { flash, ring } = FX.blast;
    this.flashes.emit(x, y, flash.durationMs, flashScale * 0.45, flashScale, 1);
    this.rings.emit(x, y, ring.durationMs, 0.1, ring.scale, ring.alpha);
    if (scorch) {
      const size = FX.blast.scorch.size;
      // Dönüş konumdan türer: aynı olay aynı yanığı bırakır (rastgelelik yok).
      const rotation = (x * 12.9898 + y * 78.233) % (Math.PI * 2);
      this.scorches.place(x, y, rotation, size, size, FX.blast.scorch.alpha);
    }
  }

  /** Namlu basıncının kısa halkası. */
  muzzle(x: number, y: number): void {
    const ring = FX.muzzle.ring;
    this.rings.emit(x, y, ring.durationMs, 0.1, ring.scale, ring.alpha);
  }

  update(deltaMs: number): void {
    this.flashes.update(deltaMs);
    this.rings.update(deltaMs);
    this.scorches.fade(deltaMs);
  }

  destroy(): void {
    this.flashes.destroy();
    this.rings.destroy();
    this.scorches.destroy();
  }
}

/** Parlama ve halka havuzu: hızlı açılıp yavaş sönen ölçek, doğrusal sönen saydamlık. */
class PulsePool {
  private readonly pulses: Pulse[] = [];
  private cursor = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly texture: string,
    private readonly tint: number,
    private readonly depth: number,
  ) {}

  emit(x: number, y: number, durationMs: number, from: number, to: number, alpha: number): void {
    let pulse: Pulse;
    if (this.pulses.length < LIVE_LIMIT) {
      pulse = {
        image: this.scene.add.image(x, y, this.texture).setTint(this.tint).setDepth(this.depth),
        ageMs: 0,
        durationMs,
        from,
        to,
        alpha,
      };
      this.pulses.push(pulse);
    } else {
      pulse = this.pulses[this.cursor]!;
      this.cursor = (this.cursor + 1) % LIVE_LIMIT;
    }
    pulse.ageMs = 0;
    pulse.durationMs = durationMs;
    pulse.from = from;
    pulse.to = to;
    pulse.alpha = alpha;
    pulse.image.setPosition(x, y).setScale(from).setAlpha(alpha).setVisible(true);
  }

  update(deltaMs: number): void {
    for (const pulse of this.pulses) {
      if (!pulse.image.visible) continue;
      pulse.ageMs += deltaMs;
      const t = pulse.ageMs / pulse.durationMs;
      if (t >= 1) {
        pulse.image.setVisible(false);
        continue;
      }
      // Hızlı açılır, yavaş söner: ilk karede en parlak.
      const grow = 1 - (1 - t) * (1 - t) * (1 - t);
      pulse.image
        .setScale(pulse.from + (pulse.to - pulse.from) * grow)
        .setAlpha(pulse.alpha * (1 - t));
    }
  }

  destroy(): void {
    for (const pulse of this.pulses) pulse.image.destroy();
  }
}
