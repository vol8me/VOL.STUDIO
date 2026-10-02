import { FrameWindow, type FrameWindowSummary } from '@volstudio/core/time';
import { MEASUREMENTS } from '../config/measurements';

export interface MeasurementContext {
  readonly scenario?: string;
  readonly seed?: number;
  readonly weather?: string;
  readonly season?: string;
}

export class GameMeasurements {
  private readonly frames: FrameWindow;
  private pending = Promise.resolve();
  private window = 0;
  private started = 0;
  private previous = 0;
  private readonly costs: Record<string, number> = {};

  constructor(
    private readonly report: (record: Record<string, unknown>) => Promise<void>,
    durationMs: number = MEASUREMENTS.windowMs,
  ) {
    this.frames = new FrameWindow(durationMs);
  }

  beginFrame(now = performance.now()): void {
    this.started = this.previous = now;
    for (const name of Object.keys(this.costs)) delete this.costs[name];
  }

  mark(stage: string, now = performance.now()): void {
    this.costs[`cpuMs.${stage}`] = Math.max(0, now - this.previous);
    this.previous = now;
  }

  frame(
    now: number,
    paused: boolean,
    quality: string,
    bullets: number,
    details: MeasurementContext = {},
  ): void {
    const context = JSON.stringify({ phase: paused ? 'pause' : 'gameplay', quality, ...details });
    this.write(
      this.frames.push(now, context, {
        bullets,
        ...this.costs,
        ...(Object.keys(this.costs).length ? { updateMs: Math.max(0, now - this.started) } : {}),
      }),
    );
  }

  reset(): void {
    this.write(this.frames.flush());
  }

  async flush(): Promise<void> {
    this.reset();
    await this.pending;
  }

  private write(summary: FrameWindowSummary | null): void {
    if (!summary) return;
    const context = JSON.parse(summary.context) as MeasurementContext & {
      phase: string;
      quality: string;
    };
    const record = { ...summary, ...context, type: 'perf', window: ++this.window };
    this.pending = this.pending.then(() => this.report(record)).catch(() => undefined);
  }
}
