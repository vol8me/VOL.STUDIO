/** `stepIndex` kare içinde sıfırdan, `tickId` koşu içinde birden başlar. */
export type SimulationStep = (stepMs: number, stepIndex: number, tickId: number) => void;

/** `defer` sabit tick, `simulate` ilk tam tick oluşmadığında kısmi adım üretir. */
export type PartialStepPolicy = 'simulate' | 'defer';

export interface SimulationClockConfig {
  readonly fixedStepMs: number;
  readonly maxStepsPerFrame: number;
  readonly partialStep?: PartialStepPolicy;
}

export interface SimulationClockAdvanceOptions {
  /** Dış kelepçenin kabul ettiği süre; ham süre ayrıca muhasebede kalır. */
  readonly acceptedDeltaMs?: number;
  readonly paused?: boolean;
}

export interface SimulationClockFrame {
  readonly fixedSteps: number;
  readonly partialStepMs: number;
  /** Sonlu, negatif olmayan ham süre; geçersiz delta sıfırdır. */
  readonly rawDeltaMs: number;
  readonly acceptedDeltaMs: number;
  readonly simulatedMs: number;
  readonly accumulatorBeforeMs: number;
  readonly accumulatorMs: number;
  /** Dış kelepçe, duraklatma ve catch-up sınırının toplamı. */
  readonly droppedMs: number;
  readonly tickStart: number;
  readonly tickEnd: number;
}

export class SimulationClock {
  private accumulatorMs = 0;
  private simulationTimeMs = 0;
  private tickId = 0;
  private advancing = false;
  private readonly config: SimulationClockConfig;
  private readonly partialStepPolicy: PartialStepPolicy;

  constructor(config: SimulationClockConfig) {
    if (!Number.isFinite(config.fixedStepMs) || config.fixedStepMs <= 0)
      throw new RangeError('SimulationClock: fixedStepMs pozitif ve sonlu olmalı');
    if (!Number.isSafeInteger(config.maxStepsPerFrame) || config.maxStepsPerFrame <= 0)
      throw new RangeError('SimulationClock: maxStepsPerFrame pozitif tam sayı olmalı');
    this.config = { ...config };
    this.partialStepPolicy = config.partialStep ?? 'simulate';
  }

  getPartialStepPolicy(): PartialStepPolicy {
    return this.partialStepPolicy;
  }

  getInterpolationAlpha(): number {
    return Math.min(0.999999, Math.max(0, this.accumulatorMs / this.config.fixedStepMs));
  }

  getSimulationTimeMs(): number {
    return this.simulationTimeMs;
  }

  getAccumulatorMs(): number {
    return this.accumulatorMs;
  }

  reset(): void {
    this.assertNotAdvancing();
    this.accumulatorMs = 0;
    this.simulationTimeMs = 0;
    this.tickId = 0;
  }

  advance(
    realDeltaMs: number,
    step: SimulationStep,
    options: SimulationClockAdvanceOptions = {},
  ): SimulationClockFrame {
    this.assertNotAdvancing();
    this.advancing = true;
    try {
      return this.advanceFrame(realDeltaMs, step, options);
    } finally {
      this.advancing = false;
    }
  }

  private advanceFrame(
    realDeltaMs: number,
    step: SimulationStep,
    options: SimulationClockAdvanceOptions,
  ): SimulationClockFrame {
    const rawDeltaMs = this.cleanDelta(realDeltaMs);
    const acceptedDeltaMs = options.paused
      ? 0
      : Math.min(rawDeltaMs, this.cleanDelta(options.acceptedDeltaMs ?? rawDeltaMs));
    const accumulatorBeforeMs = this.accumulatorMs;
    const tickStart = this.tickId;
    const fixedStep = this.config.fixedStepMs;
    const accumulatorMs = this.accumulatorMs + acceptedDeltaMs;
    const plannedSteps = options.paused
      ? 0
      : Math.min(Math.floor(accumulatorMs / fixedStep), this.config.maxStepsPerFrame);
    const plannedMs =
      !options.paused && this.partialStepPolicy === 'simulate' && plannedSteps === 0
        ? accumulatorMs
        : plannedSteps * fixedStep;
    const plannedTicks = plannedSteps + (plannedMs > 0 && plannedSteps === 0 ? 1 : 0);
    const plannedDrop =
      rawDeltaMs -
      acceptedDeltaMs +
      (plannedSteps === this.config.maxStepsPerFrame ? accumulatorMs - plannedMs : 0);
    if (
      !Number.isFinite(accumulatorMs) ||
      !Number.isFinite(this.simulationTimeMs + plannedMs) ||
      !Number.isFinite(plannedDrop) ||
      !Number.isSafeInteger(this.tickId + plannedTicks)
    ) {
      throw new RangeError('SimulationClock: süre veya tick hesabı taşamaz');
    }
    this.accumulatorMs = accumulatorMs;
    let fixedSteps = 0;
    let partialStepMs = 0;
    let droppedMs = rawDeltaMs - acceptedDeltaMs;
    if (!options.paused) {
      while (this.accumulatorMs >= fixedStep && fixedSteps < this.config.maxStepsPerFrame) {
        this.runStep(fixedStep, fixedSteps, step);
        fixedSteps++;
      }
      if (this.partialStepPolicy === 'simulate' && fixedSteps === 0 && this.accumulatorMs > 0) {
        partialStepMs = this.accumulatorMs;
        this.runStep(partialStepMs, 0, step);
      }
      if (fixedSteps >= this.config.maxStepsPerFrame && this.accumulatorMs >= fixedStep) {
        const remainder = this.accumulatorMs % fixedStep;
        droppedMs += this.accumulatorMs - remainder;
        this.accumulatorMs = remainder;
      }
    }
    return {
      fixedSteps,
      partialStepMs,
      rawDeltaMs,
      acceptedDeltaMs,
      simulatedMs: fixedSteps * fixedStep + partialStepMs,
      accumulatorBeforeMs,
      accumulatorMs: this.accumulatorMs,
      droppedMs,
      tickStart,
      tickEnd: this.tickId,
    };
  }

  private runStep(stepMs: number, stepIndex: number, step: SimulationStep): void {
    const timeMs = this.simulationTimeMs + stepMs;
    const tickId = this.tickId + 1;
    if (!Number.isFinite(timeMs) || !Number.isSafeInteger(tickId))
      throw new RangeError('SimulationClock: süre veya tick hesabı taşamaz');
    // Callback hatası dış dünyayı geri alamaz; saat yalnız başarılı adımı teslim eder.
    step(stepMs, stepIndex, tickId);
    this.simulationTimeMs = timeMs;
    this.accumulatorMs -= stepMs;
    this.tickId = tickId;
  }

  private cleanDelta(deltaMs: number): number {
    return Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  }

  private assertNotAdvancing(): void {
    if (this.advancing)
      throw new Error('SimulationClock: advance sırasında yeniden giriş yapılamaz');
  }
}
