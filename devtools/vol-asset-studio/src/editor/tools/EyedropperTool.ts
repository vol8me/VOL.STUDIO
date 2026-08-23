import type { PixelTool, ToolContext, ToolGesture, ToolInput } from './types';

/**
 * Damlalık.
 *
 * Belgeyi DEĞİŞTİRMEZ, bu yüzden hiçbir zaman undo komutu üretmez. Sürükleme
 * boyunca rengi canlı günceller; kullanıcı doğru pikseli bırakana kadar
 * gezinebilir.
 */
export class EyedropperTool implements PixelTool {
  readonly id = 'eyedropper' as const;

  public begin(context: ToolContext, input: ToolInput): ToolGesture | null {
    if (input.button !== 0) return null;
    const pick = (x: number, y: number): void => {
      if (!context.surface.contains(x, y)) return;
      context.setPrimaryColor(context.surface.getPixel(x, y));
    };
    pick(input.x, input.y);
    return {
      update: (next) => pick(next.x, next.y),
      commit: () => null,
      cancel: () => undefined,
    };
  }
}
