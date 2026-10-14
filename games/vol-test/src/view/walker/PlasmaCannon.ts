import Phaser from 'phaser';
import { assembleRig, type AssembledRig } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { PLASMA_CANNON_RIG, plasmaCannonMetadata } from '@/config/rigAssets';
import { PLASMA_CANNON_PARTS } from '@/config/walkerRig';
import { CANNON_VIEW, WALKER_ART } from '@/config/walkerView';
import { TEXTURE } from '../textures';

const { pivot: PIVOT_ID, barrel: BARREL_ID, lens: LENS_ID, slit: SLIT_ID } = PLASMA_CANNON_PARTS;
/** Isınma ışığı boştayken de yanar: top şarjlı ve canlı görünür. */
const IDLE_GLOW = { alpha: 0.04, pulseAlpha: 0.04, pulseHz: 0.9 };
/** Işık dokusu (`TEXTURE.blast`) 64 px'tir; ölçekler top yerel pikseline göredir. */
const GLOW_TEXTURE_PX = 64;

/** Parçanın merkezi, rig kökünün yerel uzayında (export pikseli). */
function centreOf(partId: string): { x: number; y: number } {
  const part = plasmaCannonMetadata.parts.find((candidate) => candidate.partId === partId);
  const at = part?.positionPx;
  if (!part || !at) throw new Error(`plazma topu metadata'sında "${partId}" konumu yok`);
  return { x: at.x + part.logicalSizePx.width / 2, y: at.y + part.logicalSizePx.height / 2 };
}

/**
 * Bir yuvadaki plazma topu. Rig (`PLASMA_CANNON_RIG`) bir kapsayıcı ağacıdır: gövde sabit, namlu
 * çubuğu atışta geri kayar ve ağız parçaları ona bağlıdır. Dönme ekseni gövdenin merkezidir;
 * çağıran `root`u yuvanın gövde-yerel konumuna koyup yuva açısıyla döndürür.
 *
 * Katı parçalar (`solid`) gölge verir; parlamalar vermez. Ağız parlaması paylaşılan ışık
 * katmanındadır ve dünya uzayında yerleşir (araç ışıklarıyla aynı katman).
 */
export class PlasmaCannon {
  readonly root: Phaser.GameObjects.Container;
  /** Gölge veren katı parçalar: ışık kaynakları dahil değil. */
  readonly solid: Phaser.GameObjects.Container;
  private readonly assembled: AssembledRig;
  private readonly barrel: Phaser.GameObjects.Container;
  private readonly barrelRestX: number;
  private readonly pivotRestX: number;
  private readonly lensGlow: Phaser.GameObjects.Image;
  private readonly slitGlow: Phaser.GameObjects.Image;
  private readonly slitRestX: number;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly recoil = new Spring1D();
  private readonly housing = new Spring1D();
  private flashMs = 0;
  private heatMs = 0;
  private elapsedMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly lighting: Phaser.GameObjects.Container,
  ) {
    this.assembled = assembleRig(scene, PLASMA_CANNON_RIG);

    // Rig kökü kök boyutunun merkezindedir; dönme ekseni gövdenin merkezine alınır.
    const rootSize = plasmaCannonMetadata.source.rootSizePx;
    if (!rootSize) throw new Error("plazma topu metadata'sı rootSizePx taşımıyor");
    const pivot = centreOf(PIVOT_ID);
    this.pivotRestX = rootSize.width / 2 - pivot.x;
    this.assembled.container.setPosition(this.pivotRestX, rootSize.height / 2 - pivot.y);

    const barrel = this.assembled.parts.get(BARREL_ID);
    if (!barrel) throw new Error(`plazma topu rig'inde "${BARREL_ID}" yok`);
    this.barrel = barrel;
    this.barrelRestX = barrel.x;

    // Işıklar katıdan ayrıdır: gölge ve kesişimler yalnız `solid` ağacını örnekler.
    const lens = centreOf(LENS_ID);
    const slit = centreOf(SLIT_ID);
    this.slitRestX = slit.x - pivot.x;
    const glow = (x: number, y: number, size: number): Phaser.GameObjects.Image =>
      scene.add
        .image(x, y, TEXTURE.blast)
        .setScale(size / GLOW_TEXTURE_PX)
        .setTint(CANNON_VIEW.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
    this.lensGlow = glow(lens.x - pivot.x, lens.y - pivot.y, CANNON_VIEW.lensGlowPx);
    this.slitGlow = glow(this.slitRestX, slit.y - pivot.y, CANNON_VIEW.slitGlowPx);

    this.root = scene.add.container(0, 0, [this.assembled.container, this.lensGlow, this.slitGlow]);
    this.root.setScale(WALKER_ART.cannonScale);
    this.solid = this.assembled.container;

    this.flash = scene.add
      .image(0, 0, TEXTURE.blast)
      .setTint(CANNON_VIEW.glow)
      .setOrigin(0.25, 0.5)
      .setVisible(false);
    this.lighting.add(this.flash);
  }

  /** Atış anında namluyu geri iter, gövdeyi sarsar ve ağız parlamasını ile ısınmayı başlatır. */
  fire(): void {
    this.recoil.velocity += CANNON_VIEW.recoil.kick;
    this.housing.velocity += CANNON_VIEW.housingKick.kick;
    this.flashMs = CANNON_VIEW.flashMs;
    this.heatMs = CANNON_VIEW.heatMs;
    this.flash.setVisible(true);
  }

  /** Namluyu geri kayış kadar kısaltılmış yuva erişimi (dünya birimi): parlama bu uçta açılır. */
  get recoilWorld(): number {
    return this.recoil.value * WALKER_ART.cannonScale;
  }

  /** Yayları ve ısınma ışığını ilerletir. */
  advance(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    const recoil = CANNON_VIEW.recoil;
    this.recoil.update(0, deltaMs, recoil);
    this.recoil.value = Phaser.Math.Clamp(this.recoil.value, -recoil.max, 0);
    const kick = CANNON_VIEW.housingKick;
    this.housing.update(0, deltaMs, kick);
    this.housing.value = Phaser.Math.Clamp(this.housing.value, -kick.max, 0);

    this.barrel.x = this.barrelRestX + this.recoil.value;
    this.assembled.container.x = this.pivotRestX + this.housing.value;

    this.heatMs = Math.max(0, this.heatMs - deltaMs);
    const heat = this.heatMs / CANNON_VIEW.heatMs;
    const breath =
      IDLE_GLOW.alpha +
      IDLE_GLOW.pulseAlpha * Math.sin((this.elapsedMs / 1000) * IDLE_GLOW.pulseHz * Math.PI * 2);
    this.lensGlow.setAlpha(Math.min(1, breath + heat * 0.7));
    this.slitGlow.setX(this.slitRestX + this.recoil.value);
    this.slitGlow.setAlpha(Math.min(1, breath * 0.6 + heat));
  }

  /** Ağız parlamasını geri teperken kısalan namlunun ucuna (dünya uzayı) koyar ve söndürür. */
  flashAt(deltaMs: number, x: number, y: number, angle: number): void {
    if (this.flashMs <= 0) return;
    this.flashMs = Math.max(0, this.flashMs - deltaMs);
    const phase = this.flashMs / CANNON_VIEW.flashMs;
    this.flash
      .setPosition(x, y)
      .setRotation(angle)
      .setScale(
        CANNON_VIEW.flashLengthScale * CANNON_VIEW.flashScale * (0.6 + 0.4 * phase),
        CANNON_VIEW.flashWidthScale * CANNON_VIEW.flashScale * phase,
      )
      .setAlpha(phase)
      .setVisible(phase > 0);
  }

  destroy(): void {
    this.flash.destroy();
    this.root.destroy();
  }
}
