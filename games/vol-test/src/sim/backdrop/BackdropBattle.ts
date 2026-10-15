import { clampSimulationStep, SimulationClock } from '@volstudio/core';
import { GAME } from '@/config/game';
import { idleCommand } from '../command';
import type { Vehicle } from '../entities/Vehicle';
import type { SimEvent } from '../events';
import { Simulation } from '../Simulation';
import type { WeatherSystem } from '../weather/WeatherSystem';
import type { World } from '../world/World';
import { War, type WarStepEvent } from '../war/War';

export interface BackdropBattleOptions {
  readonly world: World;
  /** Savaşla birlikte akan hava; görünüm aynı modeli okur. */
  readonly weather: WeatherSystem;
  readonly seed: number;
  readonly perFaction: number;
}

const IDLE = Object.freeze(idleCommand());

/** Savaş olaylarından fizik olaylarını ayırır (görünüm yalnız bunları dinler). */
function isSimEvent(event: WarStepEvent): event is SimEvent {
  return event.kind !== 'zone' && event.kind !== 'warWon';
}

/**
 * Menülerin arkasında oynayan savaş: insansız, yalnız botların sürdüğü kalıcı savaşın yerel kopyası.
 * Sunucudaki aynı `War` sürülür (saf benzetim), bu yüzden araç davranışı oyundakiyle aynıdır; ağa ve
 * oyuncuya dokunmaz. Zaman sabit adımla ilerler, görünüm ara değerle çizilir.
 */
export class BackdropBattle {
  readonly sim: Simulation;
  readonly war: War;
  private readonly clock: SimulationClock;
  private readonly pending: WarStepEvent[] = [];
  private readonly scratch: WarStepEvent[] = [];

  constructor(options: BackdropBattleOptions) {
    this.sim = new Simulation({
      world: options.world,
      spawnPlayer: false,
      weather: options.weather,
    });
    this.war = new War(this.sim, { seed: options.seed, perFaction: options.perFaction });
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });
  }

  get vehicles(): readonly Vehicle[] {
    return this.sim.vehicles;
  }

  /** Görünümün adımlar arası ara değeri [0, 1]. */
  get alpha(): number {
    return this.clock.getInterpolationAlpha();
  }

  /** Savaşı gerçek kare süresi kadar ilerletir; üretilen olaylar `drainEvents`le alınır. */
  advance(deltaMs: number): void {
    this.clock.advance(deltaMs, (stepMs) => this.war.step(stepMs, () => IDLE, this.pending), {
      acceptedDeltaMs: clampSimulationStep(deltaMs),
      paused: false,
    });
  }

  /**
   * Savaşı olay üretmeden ileri sarar: açılışta botlar üslerinden çıkıp karşılaşsın diye. Tüketilmemiş
   * olaylar atılır (sarılan süre ekranda görünmez).
   */
  fastForward(durationMs: number): void {
    const step = GAME.simulationStepMs;
    for (let elapsed = 0; elapsed < durationMs; elapsed += step) {
      this.scratch.length = 0;
      this.war.step(step, () => IDLE, this.scratch);
    }
    this.pending.length = 0;
  }

  /** Biriken fizik olaylarını `out`a taşır ve kuyruğu boşaltır. */
  drainEvents(out: SimEvent[]): SimEvent[] {
    for (const event of this.pending) if (isSimEvent(event)) out.push(event);
    this.pending.length = 0;
    return out;
  }
}
