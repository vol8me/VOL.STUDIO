import type { HistoryCommand } from '@volstudio/core/ui';
import type { Rgba } from '../RasterSurface';
import type { RasterSurface } from '../RasterSurface';

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'eyedropper';

export interface ToolPoint {
  /** Belge uzayında TAM SAYI piksel koordinatı. */
  x: number;
  y: number;
}

export interface ToolInput extends ToolPoint {
  /** 0 = birincil (sol), 2 = ikincil (sağ). */
  button: number;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ToolContext {
  surface: RasterSurface;
  primaryColor: Rgba;
  secondaryColor: Rgba;
  brushSize: number;
  /** Damlalık gibi araçların rengi geri yazması için. */
  setPrimaryColor(color: Rgba): void;
  /** Seçim varsa yalnız içi düzenlenebilir; yoksa bütün yüzey. */
  isEditable(x: number, y: number): boolean;
}

/**
 * Tek bir pointer hareketinin ömrü.
 *
 * `commit()` en fazla BİR komut döndürür — araç sözleşmesinin temel kuralı.
 * Hiçbir piksel değişmediyse `null` döner; boş komut geçmişe girerse kullanıcı
 * undo'ya bastığında hiçbir şey olmaz ve geçmiş yalan söyler.
 */
export interface ToolGesture {
  update(input: ToolInput): void;
  commit(): HistoryCommand | null;
  cancel(): void;
}

export interface PixelTool {
  readonly id: ToolId;
  /** Aracın bu girdiyle işi yoksa `null` döner ve gesture başlamaz. */
  begin(context: ToolContext, input: ToolInput): ToolGesture | null;
}
