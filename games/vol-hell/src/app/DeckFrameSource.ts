import { DisposableScope } from '@volstudio/core/lifecycle';
import type { DeckMeasureState } from './deckMeasure';

interface FrameEvents {
  on(event: string, handler: () => void): unknown;
  off(event: string, handler: () => void): unknown;
}

export interface DeckFrameSourceOptions {
  events: FrameEvents;
  canvas: HTMLCanvasElement;
  readScene: () => DeckMeasureState;
  readAudio: () => AudioContextState;
  now?: () => number;
  onShortcut?: (event: {
    shortcut: 'undo' | 'print' | 'printscreen';
    target: 'editable' | 'canvas' | 'other';
    phase: string;
    trusted: boolean;
    repeat: boolean;
  }) => void;
}

export class DeckFrameSource {
  private readonly scope = new DisposableScope();
  private readonly now: () => number;
  private readonly costs: Record<string, number> = {};
  private stages: Readonly<Record<string, number>> = {};
  private stagesAt = -Infinity;
  private inputAt: number | null = null;

  constructor(private readonly options: DeckFrameSourceOptions) {
    this.now = options.now ?? (() => performance.now());
    const measure = (before: string, after: string, name: string) => {
      let start = 0;
      const begin = () => {
        start = this.now();
      };
      const end = () => {
        this.costs[name] = this.now() - start;
      };
      options.events.on(before, begin);
      options.events.on(after, end);
      this.scope.add({
        dispose: () => {
          options.events.off(before, begin);
          options.events.off(after, end);
        },
      });
    };
    measure('prestep', 'poststep', 'updateMs');
    measure('prerender', 'postrender', 'renderCpuMs');
    const input = () => {
      this.inputAt ??= this.now();
    };
    this.scope.addListener(document, 'pointerdown', input);
    this.scope.addListener(document, 'keydown', input);
    if (options.onShortcut) {
      const shortcut = (event: KeyboardEvent): void => {
        const kind =
          event.key === 'PrintScreen'
            ? 'printscreen'
            : event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'z'
            ? 'undo'
            : event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'p'
            ? 'print'
            : null;
        if (!kind) return;
        const target =
          event.target instanceof Element &&
          event.target.closest('input,textarea,[contenteditable="true"]')
            ? 'editable'
            : event.target === options.canvas
            ? 'canvas'
            : 'other';
        options.onShortcut?.({
          shortcut: kind,
          target,
          phase: options.readScene().phase,
          trusted: event.isTrusted,
          repeat: event.repeat,
        });
      };
      this.scope.addListener(document, 'keydown', shortcut);
    }
    const nextFrame = () => {
      if (this.inputAt === null) {
        delete this.costs.inputDelayMs;
        return;
      }
      this.costs.inputDelayMs = this.now() - this.inputAt;
      this.inputAt = null;
    };
    options.events.on('poststep', nextFrame);
    this.scope.add({
      dispose: () => {
        options.events.off('poststep', nextFrame);
      },
    });
  }

  captureStages(stages: Readonly<Record<string, number>>): void {
    this.stages = stages;
    this.stagesAt = this.now();
  }

  read(): DeckMeasureState {
    const scene = this.options.readScene();
    const { canvas } = this.options;
    const metrics: Record<string, number> = {
      ...scene.metrics,
      ...this.costs,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasClientWidth: canvas.clientWidth,
      canvasClientHeight: canvas.clientHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      audioState: { suspended: 0, running: 1, closed: 2, interrupted: 3 }[this.options.readAudio()],
    };
    if (scene.phase === 'gameplay' && this.now() - this.stagesAt < 100) {
      for (const [name, value] of Object.entries(this.stages)) metrics[`${name}Ms`] = value;
    }
    return { phase: document.hidden ? 'background' : scene.phase, metrics };
  }

  destroy(): void {
    this.scope.dispose();
  }
}
