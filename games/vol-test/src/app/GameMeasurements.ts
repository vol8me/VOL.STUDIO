import { FrameWindow, summarizeMetricSamples, type FrameWindowSummary } from '@volstudio/core/time';
import type { GpuTimerSample, GpuTimerSampleStatus } from '@volstudio/core';
import type { CpuRenderSample } from './RenderMeasurements';
import { MEASUREMENTS } from '../config/measurements';

export interface MeasurementContext {
  readonly scenario?: string;
  readonly seed?: number;
  readonly weather?: string;
  readonly season?: string;
}

export class GameMeasurements {
  readonly runId = crypto.randomUUID();
  private readonly frames: FrameWindow;
  private pending = Promise.resolve();
  private window = 0;
  private started = 0;
  private previous = 0;
  private readonly costs: Record<string, number> = {};
  private lostReports = 0;
  private failure: { error: unknown } | undefined;
  private readonly cpuRenderSamples: number[] = [];
  private readonly gpuSamples: number[] = [];
  private gpuStatus: GpuTimerSampleStatus = 'unavailable';
  private renderBoundaryFrameId = -1;
  private renderFrameStart: number | null = null;
  private renderFrameEnd: number | null = null;
  private renderSlowestFrame: CpuRenderSample | null = null;
  private discardedGpuSamples = 0;

  renderCpu(sample: CpuRenderSample): void {
    if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) return;
    this.renderFrameStart ??= sample.frameId;
    this.renderFrameEnd = sample.frameId;
    if (this.cpuRenderSamples.length < MEASUREMENTS.maxRenderSamples)
      this.cpuRenderSamples.push(sample.durationMs);
    if (!this.renderSlowestFrame || sample.durationMs > this.renderSlowestFrame.durationMs)
      this.renderSlowestFrame = { ...sample };
  }

  renderGpu(sample: GpuTimerSample): void {
    this.gpuStatus = sample.status;
    if (sample.status !== 'ready' || sample.durationMs === null) return;
    if (
      sample.frameId === null ||
      sample.frameId <= this.renderBoundaryFrameId ||
      this.gpuSamples.length >= MEASUREMENTS.maxRenderSamples
    ) {
      this.discardedGpuSamples++;
      return;
    }
    if (Number.isFinite(sample.durationMs) && sample.durationMs >= 0)
      this.gpuSamples.push(sample.durationMs);
  }

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
    metrics: Readonly<Record<string, number>> = {},
  ): void {
    const context = JSON.stringify({ phase: paused ? 'pause' : 'gameplay', quality, ...details });
    this.write(
      this.frames.push(now, context, {
        bullets,
        ...this.costs,
        ...metrics,
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
    const failure = this.failure;
    this.failure = undefined;
    if (failure) throw new AggregateError([failure.error], 'Measurement report failed');
  }

  private write(summary: FrameWindowSummary | null): void {
    if (!summary) return;
    const context = JSON.parse(summary.context) as MeasurementContext & {
      phase: string;
      quality: string;
    };
    const record = {
      ...summary,
      ...context,
      type: 'perf',
      runId: this.runId,
      window: ++this.window,
      renderFrameStart: this.renderFrameStart,
      renderFrameEnd: this.renderFrameEnd,
      renderSlowestFrame: this.renderSlowestFrame,
      discardedGpuSamples: this.discardedGpuSamples,
      gpuStatus: this.gpuStatus,
      gpuTimeMs: summarizeMetricSamples(this.gpuSamples)?.avg ?? null,
      presentTimeMs: null,
      metrics: {
        ...summary.metrics,
        ...(this.cpuRenderSamples.length
          ? { renderSubmitMs: summarizeMetricSamples(this.cpuRenderSamples) }
          : {}),
        ...(this.gpuSamples.length ? { gpuTimeMs: summarizeMetricSamples(this.gpuSamples) } : {}),
      },
    };
    this.renderBoundaryFrameId = this.renderFrameEnd ?? this.renderBoundaryFrameId;
    this.renderFrameStart = this.renderFrameEnd = null;
    this.renderSlowestFrame = null;
    this.discardedGpuSamples = 0;
    this.cpuRenderSamples.length = this.gpuSamples.length = 0;
    this.pending = this.pending
      .then(() => this.report({ ...record, lostReports: this.lostReports }))
      .catch((error: unknown) => {
        this.lostReports++;
        this.failure ??= { error };
      });
  }
}
