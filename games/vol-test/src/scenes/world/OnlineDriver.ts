import { GAME } from '@/config/game';
import { ONLINE_VIEW } from '@/config/onlineView';
import type { Hud } from '@/hud/Hud';
import { OnlinePanel, teamColor } from '@/hud/OnlinePanel';
import type { NetEvent } from '@/network/events';
import { feedLine, readMatch, type FeedLine } from '@/network/matchView';
import { OnlineWorld } from '@/network/OnlineWorld';
import type { OnlineSession } from '@/network/OnlineSession';
import { idleCommand } from '@/sim/command';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import type { Simulation } from '@/sim/Simulation';
import { NameTags, type TagFrame } from '@/view/NameTags';
import { tankFrame } from './frames';
import type { DriverContext, DriverFrame, DriverMeasurement, WorldDriver } from './WorldDriver';

/** Ölçüm kayıtlarında çevrimiçi dünyanın senaryo adı. */
export const ONLINE_SCENARIO = 'online';

/** Duraklatma menüsü açıkken dünya sunucuda akar: araç yalnız boş girdi yollar. */
const IDLE = idleCommand();

function isSimEvent(event: NetEvent): event is SimEvent {
  return (
    event.kind !== 'joined' &&
    event.kind !== 'left' &&
    event.kind !== 'matchStart' &&
    event.kind !== 'matchEnd'
  );
}

/**
 * Çevrimiçi dünya: sunucu yetkilidir, burada yalnız öngörülen kendi aracımız, ara değerli uzak
 * araçlar ve yerel uçan mermiler vardır. Kare başına `predict.tick` kaç sabit adım borçlu
 * olduğunu söyler; her adımın girdisi hem sunucuya gider hem yerelde öngörülür. Saatin ve
 * olayların sahibi sunucudur, bu yüzden duraklatma dünyayı dondurmaz.
 */
export class OnlineDriver implements WorldDriver {
  readonly world: OnlineWorld;
  private readonly tags: NameTags;
  private readonly batch: NetEvent[] = [];
  private readonly pending: FeedLine[] = [];
  private panel: OnlinePanel | undefined;
  private panelDueMs = 0;
  private leaving = false;

  constructor(
    private readonly context: DriverContext,
    private readonly session: OnlineSession,
  ) {
    const { scope } = context;
    this.world = new OnlineWorld(session, context.world);
    // Sahne kapanırken önce dünya, sonra bağlantı sökülür (dünya oturumun dinleyicisini bırakır).
    scope.addSubscription(() => {
      this.world.dispose();
      session.dispose();
    });
    this.tags = scope.addDestroyable(new NameTags(context.scene));
    scope.addSubscription(
      session.onStatus((status) => {
        if (status === 'closed' && !this.leaving)
          context.restart({ notice: 'voltest:online.lost' });
      }),
    );
  }

  get sim(): Simulation {
    return this.world.sim;
  }

  get player(): Vehicle {
    return this.world.player;
  }

  get measurement(): DriverMeasurement {
    return { scenario: ONLINE_SCENARIO, seed: 0 };
  }

  metrics(): Readonly<Record<string, number>> {
    return {
      'online.pingMs': this.session.pingMs,
      'online.jitterMs': this.session.jitterMs,
      'online.driftEma': this.world.pilot.drift.ema,
      'online.driftPeak': this.world.pilot.drift.peak,
      'online.remotes': this.world.remotes.count,
    };
  }

  advance(timeMs: number, deltaMs: number, paused: boolean): DriverFrame {
    const due = this.session.predict.tick(timeMs);
    for (let index = 0; index < due; index++)
      this.world.step(paused ? IDLE : this.context.controls.step(GAME.simulationStepMs));
    this.world.advance(deltaMs);
    // Çizim pozu zaten `previous`ta ara değerlidir (OnlineWorld sözleşmesi): alfa 0.
    return { alpha: 0 };
  }

  drainEvents(out: SimEvent[]): SimEvent[] {
    this.batch.length = 0;
    const selfId = this.player.id;
    for (const event of this.world.drainEvents(this.batch)) {
      const line = feedLine(event, selfId, (id) => this.world.nameOf(id));
      if (line) this.pending.push(line);
      if (isSimEvent(event)) out.push(event);
    }
    return out;
  }

  attachHud(hud: Hud): void {
    const panel = new OnlinePanel();
    this.panel = panel;
    const unmount = hud.mount(panel.element);
    this.context.scope.addSubscription(() => {
      unmount();
      panel.destroy();
    });
    hud.setPauseActions([
      {
        id: 'leave',
        labelKey: 'voltest:online.leave',
        variant: 'danger',
        run: () => void this.leave(),
      },
    ]);
  }

  present(nowMs: number): void {
    this.tags.update(this.tagFrames());
    const panel = this.panel;
    if (!panel) return;
    for (const line of this.pending) panel.push(line);
    this.pending.length = 0;
    panel.tick(nowMs);
    if (nowMs < this.panelDueMs) return;
    this.panelDueMs = nowMs + ONLINE_VIEW.panelIntervalMs;
    const session = this.session;
    const { drift } = this.world.pilot;
    panel.update(readMatch(session.room.state, this.player.id), {
      status: session.status,
      pingMs: session.pingMs,
      jitterMs: session.jitterMs,
      driftEma: drift.ema,
      driftPeak: drift.peak,
    });
  }

  /** Bilerek ayrılır: sunucu oyuncuyu hemen düşürür, sonra çevrimdışı dünya açılır. */
  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    await this.session.leave();
    this.context.restart();
  }

  private *tagFrames(): Generator<TagFrame> {
    const ownId = this.player.id;
    const teams = this.session.room.state.mode === 'teams';
    for (const vehicle of this.sim.vehicles) {
      const frame = tankFrame(vehicle.tank, 0);
      const vitality = vehicle.vitality;
      const team = vehicle.team === null ? undefined : teamColor(vehicle.team);
      yield {
        id: vehicle.id,
        x: frame.x,
        y: frame.y,
        name: this.world.nameOf(vehicle.id) ?? '',
        color:
          teams && team !== undefined
            ? team
            : vehicle.id === ownId
              ? ONLINE_VIEW.colors.self
              : ONLINE_VIEW.colors.foe,
        health: vitality.health / vitality.maxHealth,
        alive: vitality.alive,
        protected: vitality.protectionRemainingMs > 0,
      };
    }
  }
}
