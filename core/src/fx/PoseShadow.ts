import { requireFinite } from '../math/numeric';
import {
  samplePose,
  type PoseSample,
  type PoseSampleScratch,
  type PoseSourceNode,
} from './poseSample';
import { PoseSpriteSet, type PoseSpriteScene } from './PoseSpritePool';

export interface PoseShadowOptions {
  /** Gölgenin kaynaktan kayması (dünya px) — ışık yönünün tersi. */
  offsetX: number;
  offsetY: number;
  alpha: number;
  /** Gölge rengi; varsayılan siyah. */
  tint?: number;
  depth: number;
}

/**
 * Eklemli bir görüntü ağacının kendi şeklinde gölgesi.
 *
 * Gövdenin altına bir elips koymak, üstten bakışta uzuvları olan bir yaratıkta
 * yalan söyler: bacaklar gövdeden uzaklaştıkça gölge onları takip etmez ve
 * yaratık zeminden kopuk görünür. Burada gölge kaynağın POZUNDAN üretilir —
 * bacak nereye uzanırsa gölgesi de oraya uzanır.
 *
 * Her karede yeniden örneklenir; kaynakla aynı ömre sahiptir.
 *
 * **Maliyet PARÇA SAYISIYLA doğrusaldır**, uzuv sayısıyla değil: ağacın her
 * görünür yaprağı için bir dünya dönüşümü çözülür ve bir sprite güncellenir.
 * Ölçülen (72 parçalık bir rig, headless): parça başına ~0,8 µs/kare, yani 72
 * parça ≈ 0,06 ms. 16 ms'lik bir karenin %10'unu vermek istersen üst sınır
 * ~2000 parçadır. Sprite havuzu tahsis üretmez; sınır CPU dönüşüm maliyetidir.
 */
export class PoseShadow {
  private readonly sprites: PoseSpriteSet;
  private readonly options: PoseShadowOptions;
  private readonly samples: PoseSample[] = [];
  private readonly scratch: PoseSampleScratch = {};
  private destroyed = false;

  constructor(scene: PoseSpriteScene, options: PoseShadowOptions) {
    requireFinite(options.offsetX, 'PoseShadowOptions.offsetX');
    requireFinite(options.offsetY, 'PoseShadowOptions.offsetY');
    requireFinite(options.alpha, 'PoseShadowOptions.alpha');
    this.options = options;
    this.sprites = new PoseSpriteSet(scene, {
      depth: options.depth,
      tint: options.tint ?? 0x000000,
    });
  }

  /** Kaynağın o anki pozunu gölgeye yansıtır. */
  update(root: PoseSourceNode): void {
    if (this.destroyed) return;
    samplePose(root, this.samples, this.scratch);
    this.sprites.render(
      this.samples,
      this.options.alpha,
      this.options.offsetX,
      this.options.offsetY,
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprites.destroy();
  }
}
