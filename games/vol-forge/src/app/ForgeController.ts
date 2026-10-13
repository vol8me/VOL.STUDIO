import { PACE, VIEW, type ToolId } from '@/config/game';
import { ITEM, SIM, UNIT_POOL } from '@/config/forge';
import { Pacer } from '@/net/pacer';
import type { ForgeSession, SessionStatus } from '@/net/session';
import type { Ack } from '@/net/protocol';
import type { ForgeCommand } from '@/sim/commands';
import type { ForgeSim } from '@/sim/sim';
import { commandFor, nextRotation, resultKey } from './tools';

/** Oturumun denetleyicinin kullandığı kısmı; testte sahte oturum verilir. */
export type ControllerSession = Pick<
  ForgeSession,
  'lockstep' | 'status' | 'rttMs' | 'submit' | 'advance' | 'resync' | 'nextCommandSeq'
>;

export interface Ghost {
  readonly x: number;
  readonly y: number;
  readonly kind: number | null;
  readonly rot: number;
  readonly seq: number;
  readonly until: number;
}

export interface ShotView {
  readonly tile: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly until: number;
}

export interface HudView {
  readonly status: SessionStatus;
  readonly ore: number;
  readonly plate: number;
  readonly coreHp: number;
  readonly wave: number;
  readonly nextWaveSeconds: number;
  readonly units: number;
  readonly players: number;
  readonly tick: number;
  readonly lagTicks: number;
  readonly rttMs: number;
  readonly desynced: boolean;
  readonly resyncs: number;
}

export type Notice =
  | { readonly kind: 'result'; readonly key: string }
  | { readonly kind: 'desync' }
  | { readonly kind: 'resynced' };

/** Desync sonrası yeniden eşitleme isteğine kadar beklenen en az süre (ms). */
const RESYNC_COOLDOWN_MS = 2000;

/** Çizilmeyi bekleyen atış üst sınırı: yoğun taret alanında bellek büyümez. */
const MAX_SHOTS = 256;

/**
 * Oyuncunun niyetini (araç, yön, dokunma) komuta çevirir, kilit adımlı simülasyonu hızlandırır ve çizim
 * için kare durumunu tutar. Phaser ve DOM'a dokunmaz: saat, bildirim ve oturum dışarıdan gelir.
 */
export class ForgeController {
  tool: ToolId | null = null;
  rot = 0;
  desyncs = 0;

  readonly pacer = new Pacer({
    rate: SIM.tickRate,
    targetLag: PACE.targetLagTicks,
    maxSteps: PACE.maxStepsPerFrame,
  });
  /** Birimlerin bir önceki adımdaki konumu: çizim önceki ile şimdiki arasında ara değerler. */
  readonly previousX = new Float32Array(UNIT_POOL);
  readonly previousY = new Float32Array(UNIT_POOL);
  readonly previousGen = new Uint8Array(UNIT_POOL);
  private ghosts: Ghost[] = [];
  private shots: ShotView[] = [];
  private lastSimulated: ForgeSim | null = null;
  private resyncedAt = -Infinity;
  private wasDesynced = false;

  constructor(
    readonly session: ControllerSession,
    private readonly notify: (notice: Notice) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get sim(): ForgeSim | null {
    return this.session.lockstep.sim;
  }

  select(tool: ToolId | null): void {
    this.tool = tool;
  }

  rotate(): void {
    this.rot = nextRotation(this.rot);
  }

  /**
   * Bir tile'a dokunuldu. Araç seçili değilse hiçbir şey olmaz; `secondary` (sağ tık ya da uzun basış)
   * seçili araca bakmadan siler. Dönen söz ack gelince çözülür.
   */
  tap(x: number, y: number, secondary = false): Promise<Ack> | null {
    const sim = this.sim;
    if (!sim || this.session.status !== 'live') return null;
    if (x < 0 || y < 0 || x >= sim.state.width || y >= sim.state.height) return null;
    const tool = secondary ? 'remove' : this.tool;
    if (tool === null) return null;
    const command = commandFor(tool, x, y, this.rot);
    return this.submit(command);
  }

  private submit(command: ForgeCommand): Promise<Ack> {
    const seq = this.session.nextCommandSeq;
    const pending = this.session.submit(command);
    const kind = command.type === 1 ? command.kind : null;
    const rot = command.type === 1 ? command.rot : 0;
    const until = this.now() + VIEW.ghostMs;
    this.ghosts.push({ x: command.x, y: command.y, kind, rot, seq, until });
    return pending.then((ack) => {
      this.ghosts = this.ghosts.filter((ghost) => ghost.seq !== seq);
      const key = resultKey(ack.result);
      if (key !== null) this.notify({ kind: 'result', key });
      return ack;
    });
  }

  /** Süresi dolmamış hayaletler (komut gönderildi, sunucu sonucu henüz görünmedi). */
  activeGhosts(): readonly Ghost[] {
    const now = this.now();
    if (this.ghosts.some((ghost) => ghost.until < now))
      this.ghosts = this.ghosts.filter((ghost) => ghost.until >= now);
    return this.ghosts;
  }

  /**
   * Bir çizim karesi: simülasyonu pacer'ın izin verdiği kadar ilerletir ve sapmayı izler. Sapmada istemci
   * durumunu kendisi atıp sunucudan yeni anlık görüntü ister.
   */
  frame(deltaMs: number): void {
    const lockstep = this.session.lockstep;
    const sim = lockstep.sim;
    if (sim !== this.lastSimulated) {
      // Yeni anlık görüntü (ilk kurulum ya da yeniden eşitleme): ara değerleme kayıtları geçersiz.
      this.lastSimulated = sim;
      this.previousGen.fill(0);
      this.pacer.reset();
    }
    if (sim === null) return;
    if (lockstep.status === 'desynced') {
      if (!this.wasDesynced) {
        this.wasDesynced = true;
        this.desyncs++;
        this.notify({ kind: 'desync' });
      }
      const now = this.now();
      // Oturum çok yakın el sıkışmada false döner; bekleme süresi yalnız gerçekten istenince başlar.
      if (now - this.resyncedAt >= RESYNC_COOLDOWN_MS && this.session.resync())
        this.resyncedAt = now;
      return;
    }
    if (this.wasDesynced) {
      this.wasDesynced = false;
      this.notify({ kind: 'resynced' });
    }
    const steps = this.pacer.next(deltaMs, lockstep.lagTicks);
    for (let step = 0; step < steps; step++) {
      this.capture(sim);
      this.session.advance(1);
      this.collectShots(sim);
    }
  }

  /** Her adımın atışları sonraki adımda silinir; kare birden çok adım koşturabildiği için burada toplanır. */
  private collectShots(sim: ForgeSim): void {
    if (sim.shots.length === 0) return;
    const until = this.now() + VIEW.shotMs;
    for (const shot of sim.shots) {
      if (this.shots.length >= MAX_SHOTS) this.shots.shift();
      this.shots.push({ tile: shot.tile, targetX: shot.targetX, targetY: shot.targetY, until });
    }
  }

  /** Süresi dolmamış atışlar. */
  activeShots(): readonly ShotView[] {
    const now = this.now();
    if (this.shots.some((shot) => shot.until < now))
      this.shots = this.shots.filter((shot) => shot.until >= now);
    return this.shots;
  }

  private capture(sim: ForgeSim): void {
    const s = sim.state;
    for (const unit of s.units) {
      if (!unit.alive) continue;
      this.previousX[unit.slot] = unit.x;
      this.previousY[unit.slot] = unit.y;
      this.previousGen[unit.slot] = s.unitGen[unit.slot] + 1;
    }
  }

  hud(): HudView | null {
    const sim = this.sim;
    if (!sim) return null;
    const s = sim.state;
    const lockstep = this.session.lockstep;
    return {
      status: this.session.status,
      ore: s.inventory[ITEM.ore],
      plate: s.inventory[ITEM.plate],
      coreHp: s.coreHp,
      wave: s.wave,
      nextWaveSeconds: Math.max(0, Math.ceil((s.nextWaveTick - s.tick) / SIM.tickRate)),
      units: s.aliveUnits,
      players: lockstep.players,
      tick: s.tick,
      lagTicks: lockstep.lagTicks,
      rttMs: this.session.rttMs,
      desynced: lockstep.status === 'desynced',
      resyncs: this.desyncs,
    };
  }
}
