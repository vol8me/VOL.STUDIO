import Phaser from 'phaser';
import { TEXTURE, TEXTURE_SCALE, VEHICLE_ATLAS } from './textures';

const INV = 1 / TEXTURE_SCALE;
/** Çekirdek ölçeği nabzın ortalamasıdır; Striker'ın 0.75'i referans alınır. */
export const CORE_REFERENCE = 0.75;

/** Nabız sönük ve parlak uçlarının oranı (referans ölçeğe göre): 0.68 + vuruş * 0.14, atılımda +0.1. */
const BEAT = { base: 0.68, swing: 0.14, boost: 0.1 } as const;
const ALPHA = { base: 0.55, swing: 0.35 } as const;
/** Nabız hızı (Hz): boşta ve tam çabada. Çaba hıza ve atılıma göre yükselir. */
const RATE = { idleHz: 1.4, effortHz: 3.2 } as const;

/**
 * Aracın enerji çekirdeği: yavaş atan, hızla ve atılımla sıklaşıp parlayan yumuşak ışık. Striker'ın
 * çekirdeğiyle aynı hesap olduğundan bütün araç aileleri aynı "canlı" duyguyu verir; görüntü sahibine
 * verilen kapsayıcıya konur ve konumu çağıran yönetir.
 */
export class CorePulse {
  readonly image: Phaser.GameObjects.Image;
  private readonly gain: number;
  private phase = 0;

  /**
   * @param scale araç çekirdeğinin ölçeği (Striker 0.75); nabız bunu `CORE_REFERENCE`a göre büyütür.
   * @param tint çekirdek rengi.
   * @param fill doku turkuazdır: çarpan ton sıcak renkleri yeşile boğar; `fill` rengi dokunun
   *   saydamlığına olduğu gibi boyar (mech'in sarı, pembe ve turuncu çekirdekleri bunu ister).
   */
  constructor(scene: Phaser.Scene, scale: number, tint: number, fill = false) {
    this.gain = scale / CORE_REFERENCE;
    const image = scene.add.image(0, 0, VEHICLE_ATLAS, TEXTURE.core).setScale(INV * this.gain);
    this.image = image.setTint(tint);
    if (fill) this.image.setTintMode(Phaser.TintModes.FILL);
  }

  /**
   * Nabzı ilerletir; `effort` 0..1 (hız oranı), `boosting` atılımdır. `size` çekirdeği taşıyan parçanın
   * görünür büyüklüğüdür (perspektifle yükselen göğüs çekirdeği de büyütür); varsayılan 1.
   */
  update(effort: number, boosting: boolean, deltaMs: number, size = 1): void {
    const drive = effort + (boosting ? 0.8 : 0);
    this.phase += (deltaMs / 1000) * (RATE.idleHz + drive * RATE.effortHz) * Math.PI * 2;
    const beat = 0.5 + 0.5 * Math.sin(this.phase);
    this.image.setScale(
      INV * this.gain * size * (BEAT.base + beat * BEAT.swing + (boosting ? BEAT.boost : 0)),
    );
    this.image.setAlpha(ALPHA.base + beat * ALPHA.swing);
  }

  /** Çekirdeği kapsayıcıya göre bu noktaya koyar. */
  place(x: number, y: number): void {
    this.image.setPosition(x, y);
  }

  destroy(): void {
    this.image.destroy();
  }
}
