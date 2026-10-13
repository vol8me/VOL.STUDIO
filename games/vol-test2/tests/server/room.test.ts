// @vitest-environment node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { RECORD, readJournal, type JournalRecord } from '../../server/journal';
import { ROOM_NAME } from '@/net/protocol';
import { ByteWriter } from '../../src/net/bytes';
import {
  SYNC_MODE,
  TO_CLIENT,
  TO_SERVER,
  WIRE_VERSION,
  isSimMismatch,
  readAck,
  readWelcome,
  type Ack,
} from '../../src/net/protocol';
import type { FactorySession } from '../../src/net/session';
import { COMMAND, RESULT, writeCommand, type FactoryCommand } from '../../src/sim/commands';
import { KIND, PLAYER, SIM_VERSION } from '../../src/config/factory';
import {
  startTestFactory,
  tankReady,
  tilesNearTank,
  until,
  type TestFactory,
} from '../helpers/server';

let factory: TestFactory | undefined;
const pumps: ReturnType<typeof setInterval>[] = [];

afterEach(async () => {
  for (const pump of pumps.splice(0)) clearInterval(pump);
  await factory?.close();
  factory = undefined;
});

/** Kilit adımlı istemcinin simülasyonunu gerçek bir oyun döngüsü gibi ilerletir. */
function pump(session: FactorySession): void {
  pumps.push(setInterval(() => session.advance(16), 5));
}

async function live(session: FactorySession): Promise<FactorySession> {
  await until(() => session.status === 'live');
  return session;
}

/** Oyuncunun tankının inşa menzilinde boş, cevhersiz bir tile (tank gelene dek kopya ilerletilir). */
async function emptyTile(session: FactorySession, skip = 0): Promise<{ x: number; y: number }> {
  const slot = await tankReady(session);
  const [tile] = tilesNearTank(session.lockstep.sim!.state, slot, 1, skip);
  if (!tile) throw new Error('Boş tile yok.');
  return tile;
}

async function journalRecords(dataDir: string, worldId = 'test'): Promise<JournalRecord[]> {
  const dir = join(dataDir, worldId);
  const names = (await readdir(dir)).filter((name) => name.startsWith('journal-')).sort();
  const records: JournalRecord[] = [];
  for (const name of names) records.push(...((await readJournal(join(dir, name)))?.records ?? []));
  return records;
}

function commandBytes(seq: number, command: FactoryCommand): Uint8Array {
  const out = new ByteWriter(16);
  out.u32(seq);
  writeCommand(out, command);
  return out.finish();
}

/** Oturum sınıfı olmadan ham istemci: ack ve karşılamayı toplar. */
async function rawClient(test: TestFactory, key: string) {
  const room = await test.raw(key);
  const acks: Ack[] = [];
  let welcome: ReturnType<typeof readWelcome> | null = null;
  room.onMessage(TO_CLIENT.ack, (payload: Uint8Array) => acks.push(readAck(payload)));
  room.onMessage(TO_CLIENT.welcome, (payload: Uint8Array) => {
    welcome = readWelcome(payload);
  });
  room.onMessage(TO_CLIENT.ticks, () => undefined);
  room.onMessage(TO_CLIENT.snapshot, () => undefined);
  room.sendBytes(TO_SERVER.hello, new Uint8Array(0));
  await until(() => welcome !== null);
  return { room, acks, welcome: () => welcome! };
}

describe('dünya yaşam döngüsü', () => {
  it('oyuncu yokken de adım atar', { timeout: 30_000 }, async () => {
    factory = await startTestFactory({ tickHz: 120 });
    const room = factory.factory.rooms.get('test')!;
    const start = room.simulation.tick;
    await until(() => room.simulation.tick > start + 60);
    const metrics = room.metrics();
    expect(metrics.players).toBe(0);
    expect(metrics.achievedHz).toBeGreaterThan(60);
  });

  it('istemci oda yaratamaz; yanlış protokol, tel sürümü ve anahtar reddedilir', async () => {
    factory = await startTestFactory();
    const valid = {
      worldId: 'test',
      protocol: PROTOCOL_VERSION,
      wire: WIRE_VERSION,
      sim: SIM_VERSION,
      key: 'player-ok1',
    };
    const endpoint = factory.factory.endpoint;
    await expect(
      new Client(endpoint).joinOrCreate(ROOM_NAME, { ...valid, worldId: 'evil' }),
    ).rejects.toThrow();
    await expect(
      new Client(endpoint).join(ROOM_NAME, { ...valid, protocol: 99 }),
    ).rejects.toThrow();
    await expect(new Client(endpoint).join(ROOM_NAME, { ...valid, wire: 99 })).rejects.toThrow();
    // Simülasyon sürümü uyuşmazlığı ayrı ve tanınır bir hatayla reddedilir (eksik değer de uyuşmazdır).
    for (const sim of [SIM_VERSION + 1, undefined]) {
      const error: unknown = await new Client(endpoint).join(ROOM_NAME, { ...valid, sim }).then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(isSimMismatch(error)).toBe(true);
    }
    await expect(new Client(endpoint).join(ROOM_NAME, { ...valid, key: 'kısa' })).rejects.toThrow();
    await expect(
      new Client(endpoint).join(ROOM_NAME, { ...valid, key: 'a/b/c/d/e/f' }),
    ).rejects.toThrow();
    expect(factory.factory.rooms.get('test')!.metrics().players).toBe(0);
  });

  it('dolu odaya katılım reddedilir', async () => {
    factory = await startTestFactory({ maxPlayers: 3 });
    for (let index = 0; index < 3; index++) await factory.connect(`player-full${index}`);
    await expect(factory.connect('player-full9')).rejects.toThrow();
    expect(factory.factory.rooms.get('test')!.metrics().players).toBe(3);
  });

  it('aynı anahtarla yeni bağlantı eskisini yerinden eder', { timeout: 20_000 }, async () => {
    factory = await startTestFactory();
    const first = await live(await factory.connect('player-twin'));
    const second = await live(await factory.connect('player-twin'));
    await until(() => first.status === 'closed');
    expect(second.status).toBe('live');
    const room = factory.factory.rooms.get('test')!;
    expect(room.metrics().players).toBe(1);
    // Yerinden etme tankı kaldırmaz: oyuncu cihaz değiştirmiştir, yuvası ve tankı yerinde kalır.
    expect(room.simulation.state.players.count).toBe(1);
    expect(room.simulation.state.players.slotOf('player-twin')).toBe(0);
  });
});

describe('oyuncu tankı (gerçek WebSocket)', () => {
  it(
    'katılım JOIN, ayrılış LEAVE olarak günlüğe yazılır ve tank dünyadan kalkar',
    { timeout: 30_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const room = factory.factory.rooms.get('test')!;
      const session = await live(await factory.connect('player-tank01'));
      pump(session);
      const slot = await tankReady(session);
      expect(room.simulation.state.players.slotOf('player-tank01')).toBe(slot);
      expect(room.simulation.state.players.status[slot]).toBe(1);

      let records = await journalRecords(factory.dataDir);
      expect(
        records.some(
          (record) =>
            record.kind === RECORD.system &&
            record.slot === slot &&
            record.command.type === COMMAND.join &&
            record.command.key === 'player-tank01',
        ),
      ).toBe(true);

      await session.leave();
      await until(() => room.simulation.state.players.slotOf('player-tank01') === -1);
      // Kayıt adımda eklenir, diske arka planda yazılır: kısa süre yoklanır.
      const left = (record: JournalRecord): boolean =>
        record.kind === RECORD.system &&
        record.slot === slot &&
        record.command.type === COMMAND.leave;
      for (let attempt = 0; attempt < 50 && !records.some(left); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        records = await journalRecords(factory.dataDir);
      }
      expect(records.some(left)).toBe(true);
    },
  );

  it(
    'iki oyuncu aynı dünyada sürer; hareket komutu iki kopyada da sunucuyla aynı sonucu verir',
    { timeout: 40_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const a = await live(await factory.connect('player-aaaa2'));
      const b = await live(await factory.connect('player-bbbb2'));
      pump(a);
      pump(b);
      const slotA = await tankReady(a);
      const slotB = await tankReady(b);
      expect(slotA).not.toBe(slotB);
      const room = factory.factory.rooms.get('test')!;
      const tanks = room.simulation.state.players;
      const startX = tanks.x[slotA];

      expect((await a.steer(1)).result).toBe(RESULT.ok);
      expect((await b.steer(9)).result).toBe(RESULT.ok);
      await until(() => Math.abs(tanks.x[slotA] - startX) > 0.5);
      // A doğuya, B batıya: yön komutu her tankı kendi yuvasında sürer.
      expect(tanks.x[slotA]).toBeGreaterThan(startX);

      await until(
        () => a.lockstep.metrics.hashChecks >= 3 && b.lockstep.metrics.hashChecks >= 3,
        20000,
      );
      expect(a.lockstep.status).toBe('running');
      expect(b.lockstep.status).toBe('running');
      // İki kopyada da iki tank aynı yuvadadır (anahtar-yuva eşlemesi sim durumudur).
      for (const session of [a, b]) {
        const state = session.lockstep.sim!.state.players;
        expect(state.slotOf('player-aaaa2')).toBe(slotA);
        expect(state.slotOf('player-bbbb2')).toBe(slotB);
      }
    },
  );

  it(
    'menzil dışına inşa tooFar ile reddedilir ve ack olarak iletilir',
    { timeout: 20_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const session = await live(await factory.connect('player-reach'));
      pump(session);
      const slot = await tankReady(session);
      const s = session.lockstep.sim!.state;
      const farX = s.players.x[slot] < s.width / 2 ? s.width - 3 : 2;
      const ack = await session.place(farX, 2, KIND.wall, 0);
      expect(ack.result).toBe(RESULT.tooFar);
      expect(factory.factory.rooms.get('test')!.metrics().commands.rejected).toBe(1);
      const reach = Math.hypot(farX - s.players.x[slot], 2 - s.players.y[slot]);
      expect(reach).toBeGreaterThan(PLAYER.buildRange);
    },
  );

  it('istemci JOIN ya da LEAVE gönderemez: bozuk mesaj sayılır', async () => {
    factory = await startTestFactory();
    const client = await rawClient(factory, 'player-sneak');
    const room = factory.factory.rooms.get('test')!;
    client.room.sendBytes(
      TO_SERVER.command,
      commandBytes(1, { type: COMMAND.join, key: 'player-hijack1' }),
    );
    client.room.sendBytes(TO_SERVER.command, commandBytes(2, { type: COMMAND.leave }));
    await until(() => room.metrics().commands.malformed >= 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(room.simulation.state.players.slotOf('player-hijack1')).toBe(-1);
    expect(room.simulation.state.players.slotOf('player-sneak')).toBeGreaterThanOrEqual(0);
  });
});

describe('kilit adımlı eşitleme (gerçek WebSocket)', () => {
  it(
    'katılan istemci anlık görüntüyle kurulur ve sunucu karmasıyla uyumlu kalır',
    { timeout: 30_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const session = await live(await factory.connect('player-sync1'));
      pump(session);
      expect(session.welcome).toMatchObject({ mode: SYNC_MODE.lockstep, lastSeq: 0 });
      await tankReady(session);
      await until(() => session.lockstep.metrics.hashChecks >= 3, 12000);
      expect(session.lockstep.status).toBe('running');
      expect(session.received.snapshots).toBeGreaterThan(0);
      expect(session.received.ticks).toBeGreaterThan(0);
    },
  );

  it(
    'komut günlükte kalıcı olduktan sonra onaylanır; diğer oyuncuda da görünür',
    { timeout: 30_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const a = await live(await factory.connect('player-aaaa1'));
      const b = await live(await factory.connect('player-bbbb1'));
      pump(a);
      pump(b);
      const { x, y } = await emptyTile(a);

      const ack = await a.place(x, y, KIND.conveyor, 0);
      expect(ack.result).toBe(RESULT.ok);
      // Ack geldiğinde komut diske yazılmış olmalı: sunucu çökse bile kaybolmaz.
      const records = await journalRecords(factory.dataDir);
      expect(
        records.some(
          (record) =>
            record.kind === RECORD.command &&
            record.key === 'player-aaaa1' &&
            record.seq === ack.seq &&
            record.command.type === COMMAND.place,
        ),
      ).toBe(true);

      const tile = y * a.lockstep.sim!.state.width + x;
      await until(() => b.lockstep.sim!.state.kind[tile] === KIND.conveyor);
      await until(() => a.lockstep.sim!.state.kind[tile] === KIND.conveyor);
      const room = factory.factory.rooms.get('test')!;
      expect(room.simulation.state.kind[tile]).toBe(KIND.conveyor);
      expect(room.metrics().commands.accepted).toBe(1);
    },
  );

  it('reddedilen komutun sonucu iletilir ve durum değişmez', async () => {
    factory = await startTestFactory();
    const a = await live(await factory.connect('player-rej01'));
    const { x, y } = await emptyTile(a);
    const first = await a.place(x, y, KIND.wall, 0);
    const second = await a.place(x, y, KIND.wall, 0);
    expect(first.result).toBe(RESULT.ok);
    expect(second.result).toBe(RESULT.occupied);
    expect(factory.factory.rooms.get('test')!.metrics().commands.rejected).toBe(1);
  });

  it(
    'koparak yeniden bağlanan istemci aynı oturum anahtarıyla yeniden eşitlenir',
    { timeout: 30_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const session = await live(await factory.connect('player-recon'));
      pump(session);
      const { x, y } = await emptyTile(session);
      expect((await session.place(x, y, KIND.wall, 0)).result).toBe(RESULT.ok);
      const epoch = session.welcome!.epoch;
      session.simulateDrop();
      await until(() => session.resyncs === 1, 15000);
      await until(() => session.status === 'live', 15000);
      expect(session.welcome!.epoch).toBe(epoch);
      expect(session.welcome!.lastSeq).toBe(1);
      const tile = y * session.lockstep.sim!.state.width + x;
      expect(session.lockstep.sim!.state.kind[tile]).toBe(KIND.wall);
      await until(() => session.lockstep.metrics.hashChecks >= 2, 12000);
      expect(session.lockstep.status).toBe('running');
      // Yeniden bağlanan oyuncu yeni sıra numarasıyla devam eder.
      const next = await emptyTile(session, 5);
      expect((await session.place(next.x, next.y, KIND.wall, 0)).result).toBe(RESULT.ok);
    },
  );
  it(
    'istemci sapma saptayınca yeniden el sıkışma ile kendini onarır',
    { timeout: 40_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 });
      const session = await live(await factory.connect('player-desync'));
      pump(session);
      expect(session.resync()).toBe(false);
      const { x, y } = await emptyTile(session);
      const state = session.lockstep.sim!.state;
      const tile = y * state.width + x;
      // Yerel bozulma: sunucunun hiç görmediği bir yapı. Sonraki karma denetiminde sapma saptanır.
      state.kind[tile] = KIND.wall;
      await until(() => session.lockstep.status === 'desynced', 20_000);
      const broken = session.lockstep;
      // Oturum, son el sıkışmadan sonra sunucunun ihlal saymayacağı süre dolana dek istek göndermez.
      await until(() => session.resync(), 20_000);
      await until(() => session.status === 'live' && session.lockstep !== broken, 20_000);
      expect(session.lockstep.sim!.state.kind[tile]).toBe(KIND.empty);
      await until(() => session.lockstep.metrics.hashChecks >= 2, 20_000);
      expect(session.lockstep.status).toBe('running');
      expect(session.resyncs).toBe(1);
    },
  );

  it('çok sık yeniden el sıkışma anlık görüntü getirmez ve düşürülür', async () => {
    factory = await startTestFactory();
    const bad = await rawClient(factory, 'player-hellos');
    const welcomes: number[] = [];
    bad.room.onMessage(TO_CLIENT.welcome, () => welcomes.push(Date.now()));
    let closed = false;
    bad.room.onLeave(() => {
      closed = true;
    });
    for (let index = 0; index < 100; index++)
      bad.room.sendBytes(TO_SERVER.hello, new Uint8Array(0));
    await until(() => closed);
    expect(welcomes).toHaveLength(0);
  });
});

describe('komut güvenliği', () => {
  it('aynı sıra numarası ikinci kez uygulanmaz; eski sıra yinelenmiş sayılır', async () => {
    factory = await startTestFactory();
    const client = await rawClient(factory, 'player-dupe1');
    const command: FactoryCommand = { type: COMMAND.place, x: 5, y: 5, kind: KIND.wall, rot: 0 };
    client.room.sendBytes(TO_SERVER.command, commandBytes(5, command));
    client.room.sendBytes(TO_SERVER.command, commandBytes(5, command));
    client.room.sendBytes(TO_SERVER.command, commandBytes(3, command));
    await until(() => client.acks.length === 3);
    expect(client.acks.map((ack) => ack.result)).toEqual([
      client.acks[0].result,
      client.acks[0].result,
      RESULT.duplicate,
    ]);
    const metrics = factory.factory.rooms.get('test')!.metrics();
    expect(metrics.commands.duplicates).toBe(2);
    expect(metrics.commands.accepted + metrics.commands.rejected).toBe(1);
  });

  it('saniyedeki komut sınırı aşılınca fazlası rateLimited döner', async () => {
    factory = await startTestFactory();
    const client = await rawClient(factory, 'player-rate1');
    const command: FactoryCommand = { type: COMMAND.remove, x: 1, y: 1 };
    for (let seq = 1; seq <= 60; seq++)
      client.room.sendBytes(TO_SERVER.command, commandBytes(seq, command));
    await until(() => client.acks.length >= 40);
    const limited = client.acks.filter((ack) => ack.result === RESULT.rateLimited).length;
    expect(limited).toBeGreaterThan(20);
    expect(factory.factory.rooms.get('test')!.metrics().commands.rateLimited).toBe(limited);
  });

  it('bozuk mesaj yağdıran istemci düşürülür, dünya etkilenmez', async () => {
    factory = await startTestFactory();
    const bad = await rawClient(factory, 'player-flood');
    const good = await live(await factory.connect('player-good1'));
    let closed = false;
    bad.room.onLeave(() => {
      closed = true;
    });
    for (let index = 0; index < 100; index++)
      bad.room.sendBytes(TO_SERVER.command, Uint8Array.of(1, 2, 3));
    await until(() => closed);
    await until(() => factory!.factory.rooms.get('test')!.metrics().players === 1);
    expect(good.status).toBe('live');
    expect(factory.factory.rooms.get('test')!.metrics().commands.malformed).toBeGreaterThanOrEqual(
      64,
    );
  });

  it('el sıkışmadan gelen komut yok sayılır', async () => {
    factory = await startTestFactory();
    const room = await factory.raw('player-early');
    const acks: Ack[] = [];
    room.onMessage(TO_CLIENT.ack, (payload: Uint8Array) => acks.push(readAck(payload)));
    room.sendBytes(
      TO_SERVER.command,
      commandBytes(1, { type: COMMAND.place, x: 5, y: 5, kind: KIND.wall, rot: 0 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(acks).toHaveLength(0);
    expect(factory.factory.rooms.get('test')!.metrics().commands.accepted).toBe(0);
    await room.leave();
  });
});

describe('kalıcılık (yeniden başlatma)', () => {
  it(
    'sunucu yeniden başlayınca dünya, komutlar ve oyuncunun son sırası korunur',
    { timeout: 30_000 },
    async () => {
      factory = await startTestFactory({ tickHz: 120 }, { keepData: false });
      const first = await live(await factory.connect('player-keep1'));
      const { x, y } = await emptyTile(first);
      expect((await first.place(x, y, KIND.wall, 0)).result).toBe(RESULT.ok);
      const room = factory.factory.rooms.get('test')!;
      await until(() => room.simulation.tick > 90);
      const epochBefore = first.welcome!.epoch;
      const tickBefore = room.simulation.tick;

      await factory.restart();
      const restored = factory.factory.rooms.get('test')!;
      expect(restored.metrics().persistence.load).toMatchObject({ source: 'snapshot' });
      // Sahipsiz tank kalmaz: önceki süreçten gelen yuvalar açılışta boşaltılır.
      expect(restored.simulation.state.players.count).toBe(0);
      expect(restored.simulation.tick).toBeGreaterThanOrEqual(tickBefore);
      const tile = y * restored.simulation.state.width + x;
      expect(restored.simulation.state.kind[tile]).toBe(KIND.wall);

      const again = await live(await factory.connect('player-keep1'));
      await tankReady(again);
      expect(restored.simulation.state.players.slotOf('player-keep1')).toBeGreaterThanOrEqual(0);
      expect(again.welcome!.epoch).not.toBe(epochBefore);
      expect(again.welcome!.lastSeq).toBe(1);
      const next = await emptyTile(again, 3);
      const ack = await again.place(next.x, next.y, KIND.wall, 0);
      expect(ack.result).toBe(RESULT.ok);
      expect(ack.seq).toBe(2);
    },
  );
});

describe('ilgi alanı biçimi (gerçek WebSocket)', () => {
  it('çerçeveler kopyayı kurar ve komut sonucu kopyada görünür', { timeout: 30_000 }, async () => {
    factory = await startTestFactory({ tickHz: 120, mode: SYNC_MODE.aoi });
    const session = await live(await factory.connect('player-aoi01'));
    expect(session.welcome!.mode).toBe(SYNC_MODE.aoi);
    await until(() => session.replica.hud !== null);
    const room = factory.factory.rooms.get('test')!;
    const s = room.simulation.state;
    await until(() => s.players.slotOf('player-aoi01') >= 0);
    const [{ x, y }] = tilesNearTank(s, s.players.slotOf('player-aoi01'), 1);
    const target = y * s.width + x;
    expect((await session.place(x, y, KIND.wall, 0)).result).toBe(RESULT.ok);
    await until(() => session.replica.kind[target] === KIND.wall);
    expect(session.received.frames).toBeGreaterThan(0);
    expect(room.metrics().egress.aoiFrames).toBeGreaterThan(0);
  });
});
