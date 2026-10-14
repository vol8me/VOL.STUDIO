import { clampSimulationStep, SimulationClock } from '@volstudio/core';
import { GAME } from '@/config/game';
import { STRIKER, VEHICLES } from '@/config/vehicles';
import { WORLD } from '@/config/world';
import type { Hud } from '@/hud/Hud';
import type { LobbyPanel } from '@/hud/LobbyPanel';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { ScenarioRunner } from '@/sim/scenarios/ScenarioRunner';
import { Simulation } from '@/sim/Simulation';
import type { DriverContext, DriverFrame, DriverMeasurement, WorldDriver } from './WorldDriver';

/**
 * Çevrimdışı sandbox: yerel `Simulation` sabit adım saatiyle ilerler, senaryo koşucusu botları
 * sürer ve hava modeli benzetim zamanıyla akar. Duraklatma dünyayı dondurur.
 */
export class OfflineDriver implements WorldDriver {
  readonly sim: Simulation;
  private readonly scenarios: ScenarioRunner;
  private readonly clock: SimulationClock;
  private lobby: LobbyPanel | undefined;

  constructor(private readonly context: DriverContext) {
    const { world, weather, services, seed, scope } = context;
    const overrides = services?.overrides;
    this.sim = new Simulation({
      world,
      vehicle: services ? VEHICLES[services.settings.get().vehicle] : STRIKER,
      weather,
    });
    this.scenarios = scope.addDestroyable(new ScenarioRunner(this.sim));
    this.scenarios.select(
      overrides?.scenario ?? services?.settings.get().scenario ?? 'empty',
      seed,
    );
    if (services)
      scope.addSubscription(
        services.settings.subscribe((value) => {
          this.scenarios.select(
            overrides?.scenario ?? value.scenario,
            overrides?.seed ?? value.seed,
          );
        }),
      );
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });
  }

  get player(): Vehicle {
    return this.sim.player;
  }

  get measurement(): DriverMeasurement {
    return { scenario: this.scenarios.scenario, seed: this.scenarios.currentSeed };
  }

  advance(_timeMs: number, deltaMs: number, paused: boolean): DriverFrame {
    const { controls, services } = this.context;
    const player = this.sim.player;
    const clock = this.clock.advance(
      deltaMs,
      (stepMs) => {
        const command = controls.step(stepMs);
        const { x, y } = player.chassis;
        this.sim.step((vehicle) => this.scenarios.commandFor(vehicle, command), stepMs);
        services?.progress.travel(
          Math.hypot(player.chassis.x - x, player.chassis.y - y) / WORLD.metre,
        );
      },
      { acceptedDeltaMs: clampSimulationStep(deltaMs), paused },
    );
    return { alpha: this.clock.getInterpolationAlpha(), clock };
  }

  drainEvents(out: SimEvent[]): SimEvent[] {
    return this.sim.drainEvents(out);
  }

  attachHud(hud: Hud): void {
    hud.setPauseActions([
      { id: 'online', labelKey: 'voltest:online.title', run: () => void this.openLobby(hud) },
      { id: 'menu', labelKey: 'voltest:pause.menu', run: () => this.context.toMenu() },
    ]);
  }

  /** Çevrimiçi kod ilk kullanımda yüklenir; çevrimdışı oyun onu hiç indirmeyebilir. */
  private async openLobby(hud: Hud): Promise<void> {
    try {
      const online = await import('./online');
      this.lobby ??= online.createLobby(hud, this.context);
      this.lobby.open();
    } catch {
      hud.notify('voltest:online.error.failed', 'danger');
    }
  }
}
