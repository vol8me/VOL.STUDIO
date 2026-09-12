interface TempoTask {
  readonly intervalTicks: number;
  readonly run: (tick: number) => void;
}

export class SimulationTempo {
  private readonly tasks: TempoTask[] = [];
  private currentTick = 0;

  constructor(private readonly baseHz: number) {
    if (!(baseHz > 0) || !Number.isInteger(baseHz)) {
      throw new RangeError(`Taban tempo pozitif tam sayı olmalı: ${baseHz}`);
    }
  }

  every(hz: number, run: (tick: number) => void): void {
    if (!(hz > 0) || !Number.isInteger(hz) || this.baseHz % hz !== 0) {
      throw new RangeError(`${hz} Hz, ${this.baseHz} Hz tabanını tam bölmeli`);
    }
    this.tasks.push({ intervalTicks: this.baseHz / hz, run });
  }

  advance(): number {
    this.currentTick++;
    for (const task of this.tasks) {
      if (this.currentTick % task.intervalTicks === 0) task.run(this.currentTick);
    }
    return this.currentTick;
  }

  getTick(): number {
    return this.currentTick;
  }

  setTick(tick: number): void {
    if (tick < 0 || !Number.isInteger(tick)) {
      throw new RangeError(`Tick negatif olmayan tam sayı olmalı: ${tick}`);
    }
    this.currentTick = tick;
  }
}
