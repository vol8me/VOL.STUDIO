import Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

const deg = Phaser.Math.RadToDeg;

const EMITTERS = {
  /** Kum tozu: patlamanın ve namlu basıncının yerden kaldırdığı ağır bulut. */
  dust: {
    depth: 10,
    config: {
      speed: { min: 30, max: 110 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: 1, end: 2.1 },
      alpha: { start: 0.42, end: 0 },
      tint: PALETTE.dust,
    },
  },
  /** Mermi duman izi: havada kısa kalan ince kabarcık. */
  trail: {
    depth: 11,
    config: {
      speed: { min: 0, max: 10 },
      lifespan: { min: 220, max: 400 },
      scale: { start: 0.3, end: 0.8 },
      alpha: { start: 0.26, end: 0 },
      tint: PALETTE.smoke,
    },
  },
  smoke: {
    depth: 11,
    config: {
      speed: { min: 20, max: 90 },
      lifespan: { min: 420, max: 900 },
      scale: { start: 0.7, end: 2.4 },
      alpha: { start: 0.34, end: 0 },
      tint: PALETTE.smoke,
    },
  },
  /** Namlu freninin iki yana püskürttüğü gaz. */
  jets: {
    depth: 11,
    config: {
      speed: { min: 90, max: 210 },
      lifespan: { min: 150, max: 280 },
      scale: { start: 0.45, end: 1.1 },
      alpha: { start: 0.5, end: 0 },
      tint: PALETTE.smoke,
    },
  },
  /** Havaya savrulan kum ve taş parçaları. */
  debris: {
    depth: 12,
    config: {
      speed: { min: 120, max: 340 },
      lifespan: { min: 240, max: 520 },
      scale: { start: 0.32, end: 0.12 },
      alpha: { start: 1, end: 0.2 },
      tint: PALETTE.debris,
    },
  },
  /** Ateş topu ve sıcak parçacık: normal karışım, açık zeminde beyaza yıkanmaz. */
  fire: {
    depth: 13,
    config: {
      speed: { min: 90, max: 260 },
      lifespan: { min: 90, max: 190 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [PALETTE.blastHalo, PALETTE.blastCore],
    },
  },
  sparks: {
    depth: 13,
    config: {
      speed: { min: 60, max: 240 },
      lifespan: { min: 160, max: 380 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [...PALETTE.spark],
      blendMode: Phaser.BlendModes.ADD,
    },
  },
} satisfies Record<string, { depth: number; config: EmitterConfig }>;

type EmitterName = keyof typeof EMITTERS;

/**
 * Paylaşılan parçacık efektleri: namlu patlaması, patlama, isabet, araç
 * çarpması ve mermi duman izi. Renkler oyun paletinden; sayılar efekt kalite
 * çarpanıyla ölçeklenir. Araca bağlı egzoz ve toz `VehicleTrail`dadır.
 */
export class ParticleFx {
  private readonly emitters: Record<EmitterName, Emitter>;
  private scale = 1;

  constructor(scene: Phaser.Scene) {
    const make = (definition: { depth: number; config: EmitterConfig }): Emitter =>
      scene.add
        .particles(0, 0, TEXTURE.spark, { ...definition.config, emitting: false })
        .setDepth(definition.depth);
    this.emitters = {
      dust: make(EMITTERS.dust),
      trail: make(EMITTERS.trail),
      smoke: make(EMITTERS.smoke),
      jets: make(EMITTERS.jets),
      debris: make(EMITTERS.debris),
      fire: make(EMITTERS.fire),
      sparks: make(EMITTERS.sparks),
    };
  }

  /** Efekt kalite çarpanı (0–1): her patlamadaki parçacık sayısını ölçekler. */
  setScale(scale: number): void {
    this.scale = scale;
  }

  /**
   * Namlu patlaması: ileri ateş topu ve kıvılcım, namlu freninin iki yana
   * gaz jetleri, ileri duman ve namlu altında yerden kalkan toz halkası.
   */
  muzzle(x: number, y: number, angle: number): void {
    const forward = deg(angle);
    const muzzle = FX.muzzle;
    this.burst('fire', muzzle.forwardSparks, x, y, forward - 14, forward + 14);
    this.burst('jets', muzzle.sideJets, x, y, forward + 70, forward + 110);
    this.burst('jets', muzzle.sideJets, x, y, forward - 110, forward - 70);
    this.burst('smoke', 3, x, y, forward - 26, forward + 26);
    this.burst('dust', muzzle.groundDust, x, y, 0, 360);
  }

  /**
   * Patlama. `away` verilirse (duvar) parçalar ve kıvılcım o yöne açılır;
   * yerde patlamada her yöne saçılır.
   */
  blast(x: number, y: number, away: number | null): void {
    const blast = FX.blast;
    const [min, max] = away === null ? [0, 360] : [deg(away) - 75, deg(away) + 75];
    this.burst('fire', 8, x, y, 0, 360);
    this.burst('debris', blast.debris, x, y, min, max);
    this.burst('sparks', blast.sparks, x, y, min, max);
    this.burst('dust', blast.dust, x, y, 0, 360);
    this.burst('smoke', blast.smoke, x, y, 0, 360);
  }

  /** Mermi bir araca isabet etti: geliş yönünün tersine kıvılcım ve duman. */
  hit(x: number, y: number, angle: number): void {
    const back = deg(angle + Math.PI);
    this.burst('sparks', FX.hit.sparks, x, y, back - 70, back + 70);
    this.burst('smoke', FX.hit.smoke, x, y, back - 90, back + 90);
  }

  /** Tank duvara ya da araca çarptı: çarpma şiddetiyle (0..1) ölçeklenen kıvılcım ve toz. */
  wallHit(x: number, y: number, normalX: number, normalY: number, strength: number): void {
    const outward = deg(Math.atan2(normalY, normalX));
    this.burst('sparks', 4 + strength * 14, x, y, outward - 70, outward + 70);
    this.burst('dust', 3 + strength * 6, x, y, outward - 80, outward + 80);
  }

  /** Uçan merminin arkasında tek duman kabarcığı. */
  trail(x: number, y: number): void {
    this.burst('trail', 1, x, y, 0, 360);
  }

  destroy(): void {
    for (const emitter of Object.values(this.emitters)) emitter.destroy();
  }

  private burst(
    name: EmitterName,
    count: number,
    x: number,
    y: number,
    minAngle: number,
    maxAngle: number,
  ): void {
    const emitter = this.emitters[name];
    emitter.setEmitterAngle({ min: minAngle, max: maxAngle });
    emitter.explode(Math.max(1, Math.round(count * this.scale)), x, y);
  }
}
