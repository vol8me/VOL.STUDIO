import type { HistoryCommand } from '@volstudio/core/ui';
import type { Rgba } from '../RasterSurface';
import { StrokeRecorder } from '../StrokeRecorder';
import { brushOffsets, linePoints } from './geometry';
import type { PixelTool, ToolContext, ToolGesture, ToolInput, ToolPoint } from './types';

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

export interface PencilToolOptions {
  id: 'pencil' | 'eraser';
  label: string;
  /** Silgi saydam yazar; kalem aktif rengi. */
  erase?: boolean;
}

/**
 * Pixel-perfect kalem ve silgi.
 *
 * Sağ tuş ikincil rengi kullanır (silgide fark etmez). Bütün darbe tek
 * `StrokeRecorder` üzerinden geçer, böylece gesture tek undo üretir.
 */
export class PencilTool implements PixelTool {
  readonly id: 'pencil' | 'eraser';
  readonly #label: string;
  readonly #erase: boolean;

  public constructor(options: PencilToolOptions) {
    this.id = options.id;
    this.#label = options.label;
    this.#erase = options.erase ?? false;
  }

  public begin(context: ToolContext, input: ToolInput): ToolGesture | null {
    if (input.button !== 0 && input.button !== 2) return null;
    const color = this.#erase
      ? TRANSPARENT
      : input.button === 2
      ? context.secondaryColor
      : context.primaryColor;
    const recorder = new StrokeRecorder(context.surface);
    const offsets = brushOffsets(context.brushSize);
    let last: ToolPoint = { x: input.x, y: input.y };
    let cancelled = false;

    const paint = (point: ToolPoint): void => {
      for (const offset of offsets) {
        const x = point.x + offset.x;
        const y = point.y + offset.y;
        if (!context.isEditable(x, y)) continue;
        recorder.setPixel(x, y, color);
      }
    };
    paint(last);

    return {
      update: (next) => {
        if (cancelled) return;
        // İlk nokta zaten boyandı; tekrar boyamak zararsızdır ama gereksiz.
        for (const point of linePoints(last, next).slice(1)) paint(point);
        last = { x: next.x, y: next.y };
      },
      commit: (): HistoryCommand | null =>
        cancelled ? null : recorder.toCommand({ label: this.#label }),
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        // Pointer cancel belgeyi gesture ÖNCESİNE döndürür: yarım kalmış bir
        // darbe kullanıcının onaylamadığı bir değişikliktir.
        const command = recorder.toCommand({ label: this.#label });
        command?.revert();
      },
    };
  }
}
