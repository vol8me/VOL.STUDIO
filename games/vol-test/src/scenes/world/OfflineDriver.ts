import { clampSimulationStep, SimulationClock } from '@volstudio/core';
import { GAME } from '@/config/game';
import { STRIKER, VEHICLES } from '@/config/vehicles';
import { WORLD } from '@/config/world';
import type { Hud } from '@/hud/Hud';
import type { LobbyPanel } from '@/hud/LobbyPanel';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { NameTags, type TagFrame } from '@/view/NameTags';
import { ONLINE_VIEW } from '@/config/onlineView';
import { tankFrame } from './frames';
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
  private readonly tags: NameTags;
  private alpha = 1;

  constructor(private readonly context: DriverContext) {
    const { world, weather, services, seed, scope } = context;
    const overrides = services?.overrides;
    this.sim = new Simulation({
      world,
      vehicle: services ? VEHICLES[services.settings.get().vehicle] : STRIKER,
      weather,
    });
    if (services) this.sim.pace = services.settings.get().chaos;
    this.scenarios = scope.addDestroyable(new ScenarioRunner(this.sim));
    this.scenarios.select(
      overrides?.scenario ?? services?.settings.get().scenario ?? 'empty',
      seed,
    );
    if (services)
      scope.addSubscription(
        services.settings.subscribe((value) => {
          this.sim.pace = value.chaos;
          // Geliştirici ekranından seçilen araç oynanan dünyada da anında geçerlidir.
          if (value.vehicle !== this.sim.player.spec.id)
            this.sim.replacePlayer(VEHICLES[value.vehicle]);
          this.scenarios.select(
            overrides?.scenario ?? value.scenario,
            overrides?.seed ?? value.seed,
          );
        }),
      );
    this.tags = scope.addDestroyable(new NameTags(context.scene));
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
    this.alpha = this.clock.getInterpolationAlpha();
    return { alpha: this.alpha, clock };
  }

  /** Çevrimdışı sandbox'ta oyuncudan başka her araç senaryonun sürdüğü bottur. */
  isBot(vehicleId: number): boolean {
    return vehicleId !== this.sim.player.id;
  }

  /** Botların sağlık çubuğu ve sarı rozeti; adları yoktur. */
  present(): void {
    this.tags.update(this.botFrames());
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

  private *botFrames(): Generator<TagFrame> {
    for (const vehicle of this.sim.vehicles) {
      if (!this.isBot(vehicle.id)) continue;
      const frame = tankFrame(vehicle.chassis, this.alpha);
      const vitality = vehicle.vitality;
      yield {
        id: vehicle.id,
        x: frame.x,
        y: frame.y,
        name: '',
        color: ONLINE_VIEW.colors.foe,
        health: vitality.health / vitality.maxHealth,
        alive: vitality.alive,
        protected: vitality.protectionRemainingMs > 0,
        bot: true,
      };
    }
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
