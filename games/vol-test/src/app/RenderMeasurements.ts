import type Phaser from 'phaser';
import { DisposableScope, GpuTimer, type GpuTimerSample } from '@volstudio/core';

export interface CpuRenderSample {
  readonly frameId: number;
  readonly durationMs: number;
}

export interface RenderMeasurementOptions {
  readonly onCpuSample: (sample: CpuRenderSample) => void;
  readonly onGpuSample: (sample: GpuTimerSample) => void;
}

export class RenderMeasurements {
  private readonly scope = new DisposableScope();
  private readonly gpu: GpuTimer;
  private frame: { readonly frameId: number; readonly started: number } | null = null;

  constructor(
    private readonly game: Phaser.Game,
    private readonly options: RenderMeasurementOptions,
  ) {
    const renderer = game.renderer;
    const gl = renderer && 'gl' in renderer ? renderer.gl : null;
    this.gpu = this.scope.addDestroyable(new GpuTimer(gl, { onSample: options.onGpuSample }));
    this.subscribe('prerender', () => this.begin());
    this.subscribe('postrender', () => this.end());
    this.subscribe('destroy', () => this.destroy());
  }

  destroy(): void {
    this.frame = null;
    this.scope.dispose();
  }

  private subscribe(event: string, listener: () => void): void {
    this.game.events.on(event, listener);
    this.scope.addSubscription(() => this.game.events.off(event, listener));
  }

  private begin(): void {
    this.gpu.poll();
    const frameId = this.game.loop.frame;
    this.gpu.begin(frameId);
    this.frame = { frameId, started: performance.now() };
  }

  private end(): void {
    if (!this.frame) return;
    const sample = {
      frameId: this.frame.frameId,
      durationMs: Math.max(0, performance.now() - this.frame.started),
    };
    this.frame = null;
    this.gpu.end();
    this.options.onCpuSample(sample);
  }
}
