import { DEBRIS } from '@/config/debris';
import { SPIDER_LOOKS } from '@/config/spiders';
import { TANK_ART } from '@/config/tankView';
import type { VehicleSpec } from '@/config/vehicles';
import { SPIDER_ATLAS, TEXTURE_SCALE, shardTexture, spiderFrame, tankTexture } from './textures';

/** Bir enkaz parçasının dokusu ve dönüş merkezi; `scale` doku pikselinden dünya birimine çarpandır. */
export interface ChunkArt {
  readonly texture: string;
  readonly frame?: string;
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  /** Boş değilse parça bu renge boyanır (levha kıymığı); aracın gerçek parçaları kendi rengindedir. */
  readonly tint: number | null;
}

/** Bir aracın savrulabilecek parçaları: büyükler aracın gerçek çizimidir, kıymıklar levhadır. */
export interface WreckArt {
  readonly big: readonly ChunkArt[];
  readonly shards: readonly ChunkArt[];
}

const INV = 1 / TEXTURE_SCALE;
const cache = new Map<string, WreckArt>();

/** Aracın enkaz sanatı; araç başına bir kez kurulur. */
export function wreckArt(spec: VehicleSpec): WreckArt {
  const cached = cache.get(spec.id);
  if (cached) return cached;
  const tint = DEBRIS.shardTint[spec.kind];
  const shards: ChunkArt[] = Array.from({ length: DEBRIS.shardVariants }, (_, variant) => ({
    texture: shardTexture(variant),
    originX: 0.5,
    originY: 0.5,
    scale: 0.5,
    tint,
  }));
  let big: ChunkArt[];
  if (spec.kind === 'tank') {
    const art = TANK_ART[spec.id];
    big = [
      {
        texture: tankTexture(spec.id, 'turret'),
        originX: art.turret.pivotX / art.turret.width,
        originY: 0.5,
        scale: INV,
        tint: null,
      },
      {
        texture: tankTexture(spec.id, 'feeler'),
        originX: 1 / art.feeler.width,
        originY: 0.5,
        scale: INV,
        tint: null,
      },
    ];
  } else {
    const look = SPIDER_LOOKS[spec.id];
    const piece = (part: 'femur' | 'tibia' | 'tarsus' | 'joint'): ChunkArt => {
      const box = look.parts[part];
      return {
        texture: SPIDER_ATLAS,
        frame: spiderFrame(spec.id, part),
        originX: box.pivotX / box.width,
        originY: box.pivotY / box.height,
        scale: INV,
        tint: null,
      };
    };
    big = [piece('femur'), piece('tibia'), piece('femur'), piece('tibia'), piece('tarsus')];
  }
  const art = { big, shards };
  cache.set(spec.id, art);
  return art;
}
