import { describe, expect, it } from 'vitest';
import { COMMAND } from '../../src/sim/commands';
import { KIND, NET, SIM } from '../../src/config/factory';
import { readTickPacket } from '../../src/net/lockstep';
import { RESULT } from '../../src/sim/sim';
import { LocalSession } from '../../src/lab/localSession';
import { smallSim } from '../helpers/world';

/** Sabit 16 ms'lik sahte kareler: yetkili dünyayı ilerletir, istemci de elinden geleni koşar. */
function run(session: LocalSession, fromMs: number, toMs: number): number {
  let now = fromMs;
  for (; now <= toMs; now += 16) {
    session.pump(now);
    session.advance(8);
  }
  return now;
}

function placeConveyor(session: LocalSession, dx = 4) {
  const s = session.authority.state;
  return session.submit({
    type: COMMAND.place,
    x: Math.floor(s.coreCenter.x) + dx,
    y: Math.floor(s.coreCenter.y),
    kind: KIND.conveyor,
    rot: 0,
  });
}

describe('LocalSession', () => {
  it('yetkili dünyayı duvar saatine göre ilerletir ve istemci yetkiliyle aynı durumda kalır', () => {
    const session = new LocalSession(smallSim());
    run(session, 0, 3000);
    const authority = session.authority;
    // Son sahte kare 2992 ms'dedir (16 ms adımlar).
    expect(authority.tick).toBe(Math.floor(2992 / SIM.stepMs));
    expect(session.lockstep.status).toBe('running');
    const client = session.lockstep.sim!;
    expect(client.tick).toBeGreaterThan(0);
    expect(client.tick).toBeLessThanOrEqual(authority.tick);
    expect(session.lockstep.lagTicks).toBeLessThanOrEqual(NET.syncEvery);
  });

  it('karma denetimi yetkili ve istemci durumunu karşılaştırır, tutarlıysa desync yok', () => {
    const session = new LocalSession(smallSim());
    run(session, 0, (NET.hashEvery + 20) * SIM.stepMs);
    expect(session.lockstep.metrics.hashChecks).toBeGreaterThanOrEqual(1);
    expect(session.lockstep.status).toBe('running');
  });

  it('komutu yetkili dünya uygular, ack döner, istemci aynı durumu kurar', async () => {
    const session = new LocalSession(smallSim());
    const ack = placeConveyor(session);
    run(session, 0, 400);
    await expect(ack).resolves.toMatchObject({ seq: 1, result: RESULT.ok });
    const s = session.authority.state;
    const tile = s.index(Math.floor(s.coreCenter.x) + 4, Math.floor(s.coreCenter.y));
    expect(s.kind[tile]).toBe(KIND.conveyor);
    const client = session.lockstep.sim!;
    run(session, 416, 800);
    expect(client.state.kind[tile]).toBe(KIND.conveyor);
    expect(session.lockstep.metrics.commandsApplied).toBe(1);
    expect(session.nextCommandSeq).toBe(2);
  });

  it("reddedilen komut ack'te sonucunu taşır ve istemciye iletilmez", async () => {
    const session = new LocalSession(smallSim());
    const s = session.authority.state;
    const rejected = session.submit({
      type: COMMAND.place,
      x: -1,
      y: -1,
      kind: KIND.conveyor,
      rot: 0,
    });
    run(session, 0, 200);
    const ack = await rejected;
    expect(ack.result).not.toBe(RESULT.ok);
    expect(session.lockstep.metrics.commandsApplied).toBe(0);
    expect(s.tick).toBeGreaterThan(0);
  });

  it('ack gidiş-dönüş süresini rttMs olarak yazar', async () => {
    let clock = 0;
    const session = new LocalSession(smallSim(), { now: () => clock });
    session.pump(0);
    clock = 10;
    const pending = placeConveyor(session);
    clock = 70;
    session.pump(70);
    await pending;
    expect(session.rttMs).toBe(60);
  });

  it('her tik paketini baytlarıyla bildirir; baytlar gerçek ayrıştırıcıdan geçer', () => {
    const seen: { from: number; to: number }[] = [];
    const session = new LocalSession(smallSim(), {
      onPacket: (bytes) => {
        const packet = readTickPacket(bytes);
        seen.push({ from: packet.from, to: packet.to });
      },
    });
    run(session, 0, 500);
    expect(seen.length).toBeGreaterThan(5);
    for (let index = 1; index < seen.length; index++)
      expect(seen[index].from).toBe(seen[index - 1].to);
  });

  it('bozulan istemciyi karma yakalar; yeniden eşitleme düzeltir', () => {
    const session = new LocalSession(smallSim());
    run(session, 0, 500);
    expect(session.corruptClient()).toBe(true);
    // Karma denetimi en çok NET.hashEvery adım sonra gelir.
    let now = 500;
    const limit = now + (NET.hashEvery + NET.syncEvery + 2) * SIM.stepMs * 2;
    while (session.lockstep.status !== 'desynced' && now < limit) {
      now += 16;
      session.pump(now);
      session.advance(8);
    }
    expect(session.lockstep.status).toBe('desynced');
    expect(session.resync()).toBe(true);
    expect(session.resyncs).toBe(1);
    expect(session.lockstep.status).toBe('running');
    run(session, now + 16, now + (NET.hashEvery + 20) * SIM.stepMs * 2);
    expect(session.lockstep.status).toBe('running');
  });

  it('istemci kurulmadan bozulamaz', () => {
    const session = new LocalSession(smallSim());
    (session.lockstep as { sim: unknown }).sim = null;
    expect(session.corruptClient()).toBe(false);
  });

  it('büyük zaman sıçramasında yetişme sınırlıdır ve birikim atılır', () => {
    const session = new LocalSession(smallSim());
    session.pump(0);
    expect(session.pump(60_000)).toBe(8);
    expect(session.authority.tick).toBe(8);
    // Birikim atıldığı için sonraki kare gerçek zamanı izler, geçmişi koşturmaya devam etmez.
    expect(session.pump(60_000 + SIM.stepMs * 2)).toBeLessThanOrEqual(2);
  });
});
