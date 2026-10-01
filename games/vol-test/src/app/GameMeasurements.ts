import { FrameWindow, type FrameWindowSummary } from '@volstudio/core/time';
import { MEASUREMENTS } from '../config/measurements';

export class GameMeasurements {
  private readonly frames: FrameWindow;
  private pending = Promise.resolve();
  private window = 0;

  constructor(
    private readonly report: (record: Record<string, unknown>) => Promise<void>,
    durationMs: number = MEASUREMENTS.windowMs,
  ) {
    this.frames = new FrameWindow(durationMs);
  }

  frame(now: number, paused: boolean, quality: string, bullets: number): void {
    this.write(this.frames.push(now, `${paused ? 'pause' : 'gameplay'}:${quality}`, { bullets }));
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
    const [phase, quality] = summary.context.split(':');
    const record = { ...summary, type: 'perf', phase, quality, window: ++this.window };
    this.pending = this.pending.then(() => this.report(record)).catch(() => undefined);
  }
}
