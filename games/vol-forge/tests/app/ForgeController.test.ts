import { describe, expect, it, vi } from 'vitest';
import {
  ForgeController,
  type ControllerSession,
  type Notice,
} from '../../src/app/ForgeController';
import { KIND } from '../../src/config/forge';
import { VIEW } from '../../src/config/game';
import type { Ack } from '../../src/net/protocol';
import { COMMAND, RESULT } from '../../src/sim/commands';
import type { ForgeSim } from '../../src/sim/sim';
import { smallSim } from '../helpers/world';

interface FakeLockstep {
  sim: ForgeSim | null;
  status: 'waiting' | 'running' | 'desynced';
  lagTicks: number;
  players: number;
}

function harness(options: { lag?: number } = {}) {
  const sim = smallSim({ sustainUnits: 0 });
  const lockstep: FakeLockstep = {
    sim,
    status: 'running',
    lagTicks: options.lag ?? 4,
    players: 2,
  };
  let seq = 1;
  const resolvers: ((ack: Ack) => void)[] = [];
  const submit = vi.fn(
    () => new Promise<Ack>((resolve) => resolvers.push(resolve)),
  ) as unknown as ControllerSession['submit'];
  const advance = vi.fn((steps: number) => {
    for (let step = 0; step < steps; step++) sim.step();
    return steps;
  });
  const session = {
    lockstep,
    status: 'live' as ControllerSession['status'],
    rttMs: 42,
    submit,
    advance,
    resync: vi.fn(() => true),
    get nextCommandSeq() {
      return seq++;
    },
  } as unknown as ControllerSession;
  const notices: Notice[] = [];
  let clock = 0;
  const controller = new ForgeController(
    session,
    (notice) => notices.push(notice),
    () => clock,
  );
  return {
    sim,
    lockstep,
    session: session as ControllerSession & { resync: ReturnType<typeof vi.fn> },
    controller,
    notices,
    resolvers,
    submit: submit as unknown as ReturnType<typeof vi.fn>,
    advance,
    setClock: (value: number) => {
      clock = value;
    },
  };
}

describe('ForgeController.tap', () => {
  it('seçili araç yoksa ya da oturum canlı değilse komut göndermez', () => {
    const h = harness();
    expect(h.controller.tap(5, 5)).toBeNull();
    h.controller.select('conveyor');
    (h.session as { status: string }).status = 'reconnecting';
    expect(h.controller.tap(5, 5)).toBeNull();
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('dünya dışındaki dokunuşu yok sayar', () => {
    const h = harness();
    h.controller.select('conveyor');
    expect(h.controller.tap(-1, 0)).toBeNull();
    expect(h.controller.tap(0, 64)).toBeNull();
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('araç ve yönle yerleştirme komutu gönderir, hayalet bırakır, ack gelince temizler', async () => {
    const h = harness();
    h.controller.select('conveyor');
    h.controller.rotate();
    const pending = h.controller.tap(10, 12)!;
    expect(h.submit).toHaveBeenCalledWith({
      type: COMMAND.place,
      x: 10,
      y: 12,
      kind: KIND.conveyor,
      rot: 1,
    });
    expect(h.controller.activeGhosts()).toHaveLength(1);
    expect(h.controller.activeGhosts()[0]).toMatchObject({
      x: 10,
      y: 12,
      kind: KIND.conveyor,
      rot: 1,
    });
    h.resolvers[0]({ seq: 1, result: RESULT.ok, tick: 3 });
    await pending;
    expect(h.controller.activeGhosts()).toHaveLength(0);
    expect(h.notices).toEqual([]);
  });

  it('reddedilen komut için bildirim yollar', async () => {
    const h = harness();
    h.controller.select('drill');
    const pending = h.controller.tap(3, 3)!;
    h.resolvers[0]({ seq: 1, result: RESULT.needsOre, tick: 3 });
    await pending;
    expect(h.notices).toEqual([{ kind: 'result', key: 'result.needsOre' }]);
  });

  it('ikincil dokunuş seçili araca bakmadan siler', () => {
    const h = harness();
    h.controller.tap(4, 4, true);
    expect(h.submit).toHaveBeenCalledWith({ type: COMMAND.remove, x: 4, y: 4 });
  });

  it('cevaplanmayan komutun hayaleti süre dolunca düşer', () => {
    const h = harness();
    h.controller.select('wall');
    void h.controller.tap(1, 1);
    expect(h.controller.activeGhosts()).toHaveLength(1);
    h.setClock(VIEW.ghostMs + 1);
    expect(h.controller.activeGhosts()).toHaveLength(0);
  });
});

describe('ForgeController.frame', () => {
  it('pacer izin verdiği kadar adım koşturur', () => {
    const h = harness({ lag: 4 });
    h.controller.frame(1000 / 30);
    h.controller.frame(1000 / 30);
    expect(h.advance).toHaveBeenCalledWith(1);
    expect(h.sim.state.tick).toBeGreaterThanOrEqual(1);
  });

  it('simülasyon yokken hiçbir şey yapmaz', () => {
    const h = harness();
    h.lockstep.sim = null;
    h.controller.frame(100);
    expect(h.advance).not.toHaveBeenCalled();
    expect(h.controller.hud()).toBeNull();
  });

  it('sapmada bir kez bildirir, bekleme süresiyle yeniden eşitleme ister', () => {
    const h = harness();
    h.lockstep.status = 'desynced';
    h.controller.frame(16);
    expect(h.notices).toEqual([{ kind: 'desync' }]);
    expect(h.session.resync).toHaveBeenCalledTimes(1);
    h.setClock(500);
    h.controller.frame(16);
    expect(h.session.resync).toHaveBeenCalledTimes(1);
    expect(h.notices).toHaveLength(1);
    h.setClock(2100);
    h.controller.frame(16);
    expect(h.session.resync).toHaveBeenCalledTimes(2);
    expect(h.controller.desyncs).toBe(1);
    expect(h.advance).not.toHaveBeenCalled();
  });

  it('sapma giderilince eşitlendi bildirimi gelir', () => {
    const h = harness();
    h.lockstep.status = 'desynced';
    h.controller.frame(16);
    h.lockstep.status = 'running';
    h.controller.frame(16);
    expect(h.notices.map((notice) => notice.kind)).toEqual(['desync', 'resynced']);
  });

  it('yeni simülasyon nesnesi gelince ara değerleme kayıtları sıfırlanır', () => {
    const h = harness();
    h.controller.frame(16);
    h.controller.previousGen.fill(7);
    h.lockstep.sim = smallSim({ sustainUnits: 0 });
    h.controller.frame(16);
    expect(h.controller.previousGen.every((value) => value === 0)).toBe(true);
  });

  it('atışları adım sonunda toplar ve süre dolunca düşürür', () => {
    const h = harness();
    h.advance.mockImplementation((steps: number) => {
      h.sim.shots.length = 0;
      h.sim.shots.push({ tile: 9, targetX: 3, targetY: 4 });
      return steps;
    });
    h.controller.frame(100);
    expect(h.controller.activeShots().length).toBeGreaterThan(0);
    expect(h.controller.activeShots()[0]).toMatchObject({ tile: 9, targetX: 3, targetY: 4 });
    h.setClock(VIEW.shotMs + 1);
    expect(h.controller.activeShots()).toHaveLength(0);
  });
});

describe('ForgeController.hud', () => {
  it('envanter, dalga ve ağ durumunu özetler', () => {
    const h = harness();
    const hud = h.controller.hud()!;
    expect(hud).toMatchObject({
      status: 'live',
      players: 2,
      rttMs: 42,
      desynced: false,
      resyncs: 0,
    });
    expect(hud.coreHp).toBeGreaterThan(0);
    expect(hud.nextWaveSeconds).toBeGreaterThanOrEqual(0);
  });
});
