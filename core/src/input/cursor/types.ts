/**
 * VOL cursor ailesi veri sözleşmesi.
 *
 * Her cursor vektörel katmanlardan oluşur; tek bir sprite sheet veya
 * bitmap seti yoktur. Hem DOM (SVG data-uri) hem Phaser (Graphics) aynı
 * `CursorAsset` kaynağını tüketir.
 */

/** v1'de tanımlı cursor kimlikleri. */
export type KnownCursorId =
  | 'default'
  | 'pointer'
  | 'text'
  | 'crosshair'
  | 'precision'
  | 'grab'
  | 'grabbing'
  | 'pan'
  | 'move'
  | 'resize-ew'
  | 'resize-ns'
  | 'resize-nesw'
  | 'resize-nwse'
  | 'resize-all'
  | 'zoom-in'
  | 'zoom-out'
  | 'not-allowed'
  | 'wait'
  | 'help'
  | 'target';

/** Tanımlı cursor kimlikleri veya özel genişletme. */
export type CursorId = KnownCursorId | (string & {});

/** Bir katmanın çizim rengi rolü. */
export type CursorLayerRole = 'outline' | 'body' | 'accent' | 'danger' | 'disabled';

/** Cursor'u oluşturan tek vektörel katman. */
export interface CursorLayer {
  /** SVG path `d` özelliği. */
  d: string;
  /** Renk rolü. */
  role: CursorLayerRole;
  /** Dolgu var mı? V1'de stroke tabanlı; false öntanımlı. */
  fill: boolean;
  /** Kontur var mı? */
  stroke: boolean;
  /** Kontur kalınlığı (viewBox biriminde). */
  strokeWidth: number;
}

/** Bir cursor animasyonunun tarifi. */
export interface CursorAnimation {
  /** Animasyon türü. */
  type: 'rotate' | 'pulse' | 'shake';
  /** Döngü süresi (ms). */
  duration: number;
  /** `pulse` için başlangıç/bitiş ölçeği. */
  scale?: { from: number; to: number };
  /** `shake` için maksimum piksel sapma. */
  amount?: number;
}

/** Tek cursor varlığı. */
export interface CursorAsset {
  id: CursorId;
  /** Kare viewBox; `0 0 viewBox viewBox`. */
  viewBox: number;
  /** Sıcak nokta X (viewBox biriminde). */
  hotspotX: number;
  /** Sıcak nokta Y (viewBox biriminde). */
  hotspotY: number;
  /** CSS `cursor` yedek anahtar sözcüğü. */
  fallback: string;
  /** Alttan üste çizilecek katmanlar. */
  layers: CursorLayer[];
  /** İsteğe bağlı Phaser tween animasyonu. */
  animation?: CursorAnimation;
}

/** Cursor temasında kullanılan renk token'leri. */
export interface CursorColorTokens {
  outline: string;
  body: string;
  accent: string;
  danger: string;
  disabled: string;
}

/** Bir cursor teması; id → varlık eşlemesi + renk paleti. */
export interface CursorTheme {
  id: string;
  viewBox: number;
  colors: CursorColorTokens;
  cursors: Record<CursorId, CursorAsset>;
}

/** `CursorRegistry`'nin taşıdığı cursor kaydı. */
export type CursorRegistryMap = Map<CursorId, CursorAsset>;
