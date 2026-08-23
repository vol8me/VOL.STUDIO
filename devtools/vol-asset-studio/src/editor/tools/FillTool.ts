import type { HistoryCommand } from '@volstudio/core/ui';
import type { Rgba } from '../RasterSurface';
import { StrokeRecorder } from '../StrokeRecorder';
import type { PixelTool, ToolContext, ToolGesture, ToolInput } from './types';

function sameColor(a: Rgba, b: Rgba, tolerance: number): boolean {
  if (tolerance === 0) return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= tolerance
  );
}

export interface FillToolOptions {
  label: string;
  tolerance?: number;
}

/**
 * Bitişik alan doldurma (bucket fill).
 *
 * Tarama yığın tabanlıdır, özyineleme DEĞİL: 2048² tek renkli bir belgede
 * özyinelemeli flood fill çağrı yığınını taşırır. Seçim varsa dışına taşmaz;
 * `isEditable` hem seçim hem belge sınırını temsil eder.
 */
export class FillTool implements PixelTool {
  readonly id = 'fill' as const;
  readonly #label: string;
  readonly #tolerance: number;

  public constructor(options: FillToolOptions) {
    this.#label = options.label;
    this.#tolerance = Math.max(0, options.tolerance ?? 0);
  }

  public begin(context: ToolContext, input: ToolInput): ToolGesture | null {
    if (input.button !== 0 && input.button !== 2) return null;
    if (!context.isEditable(input.x, input.y)) return null;

    const target = context.surface.getPixel(input.x, input.y);
    const color = input.button === 2 ? context.secondaryColor : context.primaryColor;
    if (sameColor(target, color, 0)) return null;

    const recorder = new StrokeRecorder(context.surface);
    const { width, height } = context.surface;
    const visited = new Uint8Array(width * height);
    const stack: number[] = [input.y * width + input.x];

    while (stack.length > 0) {
      const index = stack.pop() as number;
      if (visited[index] === 1) continue;
      visited[index] = 1;
      const x = index % width;
      const y = (index - x) / width;
      if (!context.isEditable(x, y)) continue;
      if (!sameColor(context.surface.getPixel(x, y), target, this.#tolerance)) continue;
      recorder.setPixel(x, y, color);
      if (x > 0) stack.push(index - 1);
      if (x + 1 < width) stack.push(index + 1);
      if (y > 0) stack.push(index - width);
      if (y + 1 < height) stack.push(index + width);
    }

    let cancelled = false;
    return {
      // Fill tek atıştır; sürükleme onu genişletmez.
      update: () => undefined,
      commit: (): HistoryCommand | null =>
        cancelled ? null : recorder.toCommand({ label: this.#label }),
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        recorder.toCommand({ label: this.#label })?.revert();
      },
    };
  }
}
