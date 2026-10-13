import { describe, expect, it, vi } from 'vitest';
import {
  FactoryController,
  type ControllerSession,
  type Notice,
} from '../../src/app/FactoryController';
import { KIND, PLAYER, SIM } from '../../src/config/factory';
import { STEER, VIEW } from '../../src/config/game';
import type { Ack } from '../../src/net/protocol';
import { COMMAND, RESULT } from '../../src/sim/commands';
import type { FactorySim } from '../../src/sim/sim';
import { smallSim } from '../helpers/world';

interface FakeLockstep {
  sim: FactorySim | null;
  status: 'waiting' | 'running' | 'desynced';
  lagTicks: number;
  players: number;
  metrics: { hashChecks: number };
}

function harness(options: { lag?: number } = {}) {
  const sim = smallSim({ sustainUnits: 0 });
  const lockstep: FakeLockstep = {
    sim,
    status: 'running',
    lagTicks: options.lag ?? 4,
    players: 2,
    metrics: { hashChecks: 7 },
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
    key: 'player-ctl-01',
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
  const controller = new FactoryController(
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

describe('FactoryController.tap', () => {
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

describe('FactoryController.frame', () => {
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
      h.sim.shots.push({ tile: 9, fromX: 1.5, fromY: 2.5, targetX: 3, targetY: 4, source: 0 });
      return steps;
    });
    h.controller.frame(100);
    expect(h.controller.activeShots().length).toBeGreaterThan(0);
    expect(h.controller.activeShots()[0]).toMatchObject({
      fromX: 1.5,
      fromY: 2.5,
      targetX: 3,
      targetY: 4,
    });
    h.setClock(VIEW.shotMs + 1);
    expect(h.controller.activeShots()).toHaveLength(0);
  });
});

describe('FactoryController.hud', () => {
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
    expect(hud.hashChecks).toBe(7);
  });

  it('kare hızını ve adım süresini kayan pencerede ölçer', () => {
    const h = harness();
    let clock = 0;
    h.setClock(clock);
    h.advance.mockImplementation((steps: number) => {
      for (let step = 0; step < steps; step++) h.sim.step();
      clock += 2;
      h.setClock(clock);
      return steps;
    });
    for (let index = 0; index < 10; index++) h.controller.frame(1000 / 30);
    const hud = h.controller.hud()!;
    expect(hud.fps).toBeCloseTo(30, 5);
    expect(hud.frameMsP99).toBeCloseTo(1000 / 30, 5);
    expect(h.controller.stepMs.count).toBeGreaterThan(0);
    expect(hud.stepMsP50).toBe(2);
    expect(hud.stepMsP99).toBe(2);
  });

  it('süresiz kareyi ve hiç koşmamış pencereyi sıfır sayar', () => {
    const h = harness();
    h.controller.frame(0);
    const hud = h.controller.hud()!;
    expect(h.controller.frameMs.count).toBe(0);
    expect(hud.fps).toBe(0);
    expect(hud.stepMsP99).toBe(0);
  });
});

describe('FactoryController.steer', () => {
  const moves = (h: ReturnType<typeof harness>) =>
    h.submit.mock.calls
      .map((call) => call[0] as { type: number; dir?: number })
      .filter((command) => command.type === COMMAND.move)
      .map((command) => command.dir);

  it('yön değişince hemen, sürerken yenileme aralığında, bırakınca bir kez durdurma gönderir', () => {
    const h = harness();
    h.setClock(1000);
    h.controller.steer(3);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3]);

    h.setClock(1000 + STEER.refreshMs - 1);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3]);
    h.setClock(1000 + STEER.refreshMs);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3, 3]);

    // Yön değişimi komut hızını aşmaz: en az minIntervalMs sonra gider.
    const sentAt = 1000 + STEER.refreshMs;
    h.controller.steer(5);
    h.setClock(sentAt + STEER.minIntervalMs - 1);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3, 3]);
    h.setClock(sentAt + STEER.minIntervalMs);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3, 3, 5]);

    h.controller.steer(0);
    h.setClock(sentAt + STEER.minIntervalMs * 2);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3, 3, 5, 0]);
    // Duran tank için yenileme gönderilmez.
    h.setClock(sentAt + STEER.refreshMs * 5);
    h.controller.frame(16);
    expect(moves(h)).toEqual([3, 3, 5, 0]);
  });

  it('niyet gönderimi komut hız sınırının altında kalır ve süre sonundan önce yenilenir', () => {
    // En kötü durumda yön her aralıkta değişir: kalan hız payı inşa dokunuşlarına yeter.
    const steerPerSecond = 1000 / STEER.minIntervalMs;
    expect(steerPerSecond).toBeLessThan(PLAYER.commandsPerSecond / 1.5);
    const ttlMs = (PLAYER.moveTtlTicks * 1000) / SIM.tickRate;
    expect(STEER.refreshMs).toBeLessThan(ttlMs / 2);
  });

  it('hareket komutu bildirim üretmez ve inşa hayaleti bırakmaz', () => {
    const h = harness();
    h.setClock(500);
    h.controller.steer(7);
    h.controller.frame(16);
    expect(h.controller.activeGhosts()).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
  });

  it('oturum canlı değilken göndermez; canlanınca bekleyen yönü gönderir', () => {
    const h = harness();
    (h.session as { status: string }).status = 'reconnecting';
    h.setClock(1000);
    h.controller.steer(2);
    h.controller.frame(16);
    expect(moves(h)).toEqual([]);
    (h.session as { status: string }).status = 'live';
    h.setClock(1100);
    h.controller.frame(16);
    expect(moves(h)).toEqual([2]);
  });

  it('yeni anlık görüntüde (yeniden eşitleme) aynı yön yeniden gönderilir', () => {
    const h = harness();
    h.setClock(1000);
    h.controller.steer(4);
    h.controller.frame(16);
    expect(moves(h)).toEqual([4]);
    h.lockstep.sim = smallSim({ sustainUnits: 0 });
    h.setClock(1010);
    h.controller.frame(16);
    expect(moves(h)).toEqual([4, 4]);
  });

  it('oyuncunun tank yuvasını anahtarından bulur; tank yoksa -1', () => {
    const h = harness();
    expect(h.controller.playerSlot).toBe(-1);
    h.sim.applyRaw({ type: COMMAND.join, key: 'player-other1' }, -1);
    h.sim.applyRaw({ type: COMMAND.join, key: 'player-ctl-01' }, -1);
    expect(h.controller.playerSlot).toBe(1);
    h.lockstep.sim = null;
    expect(h.controller.playerSlot).toBe(-1);
  });
});
