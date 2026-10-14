import { DEBRIS } from '@/config/debris';
import { SPIDER_LOOKS, type SpiderLook } from '@/config/spiders';
import { TANK_ART, treadView } from '@/config/tankView';
import type { VehicleSpec } from '@/config/vehicles';
import {
  SPIDER_ATLAS,
  TEXTURE,
  TEXTURE_SCALE,
  shardTexture,
  spiderFrame,
  tankTexture,
} from './textures';

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
/** tread-end.svg içindeki dairenin çapı (`TreadRig` ile aynı). */
const TREAD_END_PX = 11.2;
const cache = new Map<string, WreckArt>();

/** Bir örümcek parçasının enkaz sanatı: atlas karesi ve dönüş merkezi. */
function spiderPiece(look: SpiderLook, part: 'femur' | 'tibia' | 'tarsus' | 'joint'): ChunkArt {
  const box = look.parts[part];
  return {
    texture: SPIDER_ATLAS,
    frame: spiderFrame(look.id, part),
    originX: box.pivotX / box.width,
    originY: box.pivotY / box.height,
    scale: INV,
    tint: null,
  };
}

const shedCache = new Map<string, readonly ChunkArt[]>();

/**
 * Kopan bir parçanın savrulacak sanatı: tankta palet ucu çarkı ile levha kıymıkları, yürüyücüde bacağın
 * kopan kısmı (tibia ve pençe). Araç başına bir kez kurulur.
 */
export function shedArt(spec: VehicleSpec): readonly ChunkArt[] {
  const cached = shedCache.get(spec.id);
  if (cached) return cached;
  const shards = wreckArt(spec).shards;
  let pieces: readonly ChunkArt[];
  if (spec.kind === 'tank') {
    const wheel = treadView(spec).height / TREAD_END_PX;
    pieces = [
      { texture: TEXTURE.treadEnd, originX: 0.5, originY: 0.5, scale: INV * wheel, tint: null },
      shards[0],
      shards[1 % shards.length],
    ];
  } else {
    const look = SPIDER_LOOKS[spec.id];
    pieces = [spiderPiece(look, 'tibia'), spiderPiece(look, 'tarsus')];
  }
  shedCache.set(spec.id, pieces);
  return pieces;
}

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
    const piece = (part: 'femur' | 'tibia' | 'tarsus' | 'joint'): ChunkArt =>
      spiderPiece(look, part);
    big = [piece('femur'), piece('tibia'), piece('femur'), piece('tibia'), piece('tarsus')];
  }
  const art = { big, shards };
  cache.set(spec.id, art);
  return art;
}
