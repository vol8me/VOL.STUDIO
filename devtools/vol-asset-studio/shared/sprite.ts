import type { BlendMode } from './contracts.js';

export interface SpriteCanvas {
  width: number;
  height: number;
}

export interface SpriteLayerMeta {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  alphaLocked: boolean;
}

export interface SpriteCelMeta {
  layerId: string;
  /** `<belge>.volsprite/cels/<file>` altındaki PNG. */
  file: string;
}

export interface SpriteFrameMeta {
  id: string;
  /** Kare süresi, milisaniye. */
  durationMs: number;
  cels: SpriteCelMeta[];
  tags?: string[];
}

export interface SpritePivot {
  x: number;
  y: number;
}

export interface SpriteOutputConfig {
  /** Shipped PNG / sprite sheet hedefi, belgeye göre göreli. */
  path?: string;
  layout?: 'horizontal' | 'vertical' | 'grid';
  columns?: number;
  padding?: number;
}

export interface SpriteSourceReference {
  /** Türetilmiş belgenin üretildiği kaynak varlık. */
  assetId?: string;
  path?: string;
  revision?: string;
}

/**
 * `.volsprite.json` şeması.
 *
 * JSON yalnız METADATA taşır; cel piksel verisi ayrı PNG dosyalarında yaşar.
 * Büyük RGBA dizilerini JSON'a gömmek dosyayı okunamaz yapar, diff'i işe
 * yaramaz hale getirir ve base64 ile %33 şişirir.
 */
export interface VolSpriteDocumentV1 {
  schemaVersion: 1;
  id: string;
  canvas: SpriteCanvas;
  /** `#rrggbb` girdileri. */
  palette: string[];
  layers: SpriteLayerMeta[];
  frames: SpriteFrameMeta[];
  pivot?: SpritePivot;
  source?: SpriteSourceReference;
  output?: SpriteOutputConfig;
  /** Oyun bağımsız serbest metadata. */
  metadata?: Record<string, unknown>;
}

export const SPRITE_DOCUMENT_SUFFIX = '.volsprite.json';
