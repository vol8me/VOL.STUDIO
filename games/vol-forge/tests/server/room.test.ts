// @vitest-environment node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { RECORD, readJournal, type JournalRecord } from '../../server/journal';
import { ROOM_NAME } from '../../server/ForgeRoom';
import { ByteWriter } from '../../src/net/bytes';
import {
  SYNC_MODE,
  TO_CLIENT,
  TO_SERVER,
  WIRE_VERSION,
  readAck,
  readWelcome,
  type Ack,
} from '../../src/net/protocol';
import type { ForgeSession } from '../../src/net/session';
import { COMMAND, RESULT, writeCommand, type ForgeCommand } from '../../src/sim/commands';
import { KIND } from '../../src/config/forge';
import { startTestForge, until, type TestForge } from '../helpers/server';

let forge: TestForge | undefined;
const pumps: ReturnType<typeof setInterval>[] = [];

afterEach(async () => {
  for (const pump of pumps.splice(0)) clearInterval(pump);
  await forge?.close();
  forge = undefined;
});

/** Kilit adımlı istemcinin simülasyonunu gerçek bir oyun döngüsü gibi ilerletir. */
function pump(session: ForgeSession): void {
  pumps.push(setInterval(() => session.advance(16), 5));
}

async function live(session: ForgeSession): Promise<ForgeSession> {
  await until(() => session.status === 'live');
  return session;
}

/** Çekirdekten uzak, boş ve cevhersiz bir tile. */
function emptyTile(session: ForgeSession, skip = 0): { x: number; y: number } {
  const s = session.lockstep.sim!.state;
  let found = 0;
  for (let y = 4; y < s.height - 4; y++)
    for (let x = 4; x < s.width - 4; x++) {
      const tile = y * s.width + x;
      if (s.kind[tile] === KIND.empty && s.ore[tile] === 0 && found++ >= skip) return { x, y };
    }
  throw new Error('Boş tile yok.');
}

async function journalRecords(dataDir: string, worldId = 'test'): Promise<JournalRecord[]> {
  const dir = join(dataDir, worldId);
  const names = (await readdir(dir)).filter((name) => name.startsWith('journal-')).sort();
  const records: JournalRecord[] = [];
  for (const name of names) records.push(...((await readJournal(join(dir, name)))?.records ?? []));
  return records;
}

function commandBytes(seq: number, command: ForgeCommand): Uint8Array {
  const out = new ByteWriter(16);
  out.u32(seq);
  writeCommand(out, command);
  return out.finish();
}

/** Oturum sınıfı olmadan ham istemci: ack ve karşılamayı toplar. */
async function rawClient(test: TestForge, key: string) {
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
    forge = await startTestForge({ tickHz: 120 });
    const room = forge.forge.rooms.get('test')!;
    const start = room.simulation.tick;
    await until(() => room.simulation.tick > start + 60);
    const metrics = room.metrics();
    expect(metrics.players).toBe(0);
    expect(metrics.achievedHz).toBeGreaterThan(60);
  });

  it('istemci oda yaratamaz; yanlış protokol, tel sürümü ve anahtar reddedilir', async () => {
    forge = await startTestForge();
    const valid = {
      worldId: 'test',
      protocol: PROTOCOL_VERSION,
      wire: WIRE_VERSION,
      key: 'player-ok1',
    };
    const endpoint = forge.forge.endpoint;
    await expect(
      new Client(endpoint).joinOrCreate(ROOM_NAME, { ...valid, worldId: 'evil' }),
    ).rejects.toThrow();
    await expect(
      new Client(endpoint).join(ROOM_NAME, { ...valid, protocol: 99 }),
    ).rejects.toThrow();
    await expect(new Client(endpoint).join(ROOM_NAME, { ...valid, wire: 99 })).rejects.toThrow();
    await expect(new Client(endpoint).join(ROOM_NAME, { ...valid, key: 'kısa' })).rejects.toThrow();
    await expect(
      new Client(endpoint).join(ROOM_NAME, { ...valid, key: 'a/b/c/d/e/f' }),
    ).rejects.toThrow();
    expect(forge.forge.rooms.get('test')!.metrics().players).toBe(0);
  });

  it('dolu odaya katılım reddedilir', async () => {
    forge = await startTestForge({ maxPlayers: 3 });
    for (let index = 0; index < 3; index++) await forge.connect(`player-full${index}`);
    await expect(forge.connect('player-full9')).rejects.toThrow();
    expect(forge.forge.rooms.get('test')!.metrics().players).toBe(3);
  });

  it('aynı anahtarla yeni bağlantı eskisini yerinden eder', { timeout: 20_000 }, async () => {
    forge = await startTestForge();
    const first = await live(await forge.connect('player-twin'));
    const second = await live(await forge.connect('player-twin'));
    await until(() => first.status === 'closed');
    expect(second.status).toBe('live');
    expect(forge.forge.rooms.get('test')!.metrics().players).toBe(1);
  });
});

describe('kilit adımlı eşitleme (gerçek WebSocket)', () => {
  it(
    'katılan istemci anlık görüntüyle kurulur ve sunucu karmasıyla uyumlu kalır',
    { timeout: 30_000 },
    async () => {
      forge = await startTestForge({ tickHz: 120 });
      const session = await live(await forge.connect('player-sync1'));
      pump(session);
      expect(session.welcome).toMatchObject({ mode: SYNC_MODE.lockstep, lastSeq: 0, slot: 0 });
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
      forge = await startTestForge({ tickHz: 120 });
      const a = await live(await forge.connect('player-aaaa1'));
      const b = await live(await forge.connect('player-bbbb1'));
      pump(a);
      pump(b);
      const { x, y } = emptyTile(a);

      const ack = await a.place(x, y, KIND.conveyor, 0);
      expect(ack.result).toBe(RESULT.ok);
      // Ack geldiğinde komut diske yazılmış olmalı: sunucu çökse bile kaybolmaz.
      const records = await journalRecords(forge.dataDir);
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
      const room = forge.forge.rooms.get('test')!;
      expect(room.simulation.state.kind[tile]).toBe(KIND.conveyor);
      expect(room.metrics().commands.accepted).toBe(1);
    },
  );

  it('reddedilen komutun sonucu iletilir ve durum değişmez', async () => {
    forge = await startTestForge();
    const a = await live(await forge.connect('player-rej01'));
    const { x, y } = emptyTile(a);
    const first = await a.place(x, y, KIND.wall, 0);
    const second = await a.place(x, y, KIND.wall, 0);
    expect(first.result).toBe(RESULT.ok);
    expect(second.result).toBe(RESULT.occupied);
    expect(forge.forge.rooms.get('test')!.metrics().commands.rejected).toBe(1);
  });

  it(
    'koparak yeniden bağlanan istemci aynı oturum anahtarıyla yeniden eşitlenir',
    { timeout: 30_000 },
    async () => {
      forge = await startTestForge({ tickHz: 120 });
      const session = await live(await forge.connect('player-recon'));
      pump(session);
      const { x, y } = emptyTile(session);
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
      const next = emptyTile(session, 5);
      expect((await session.place(next.x, next.y, KIND.wall, 0)).result).toBe(RESULT.ok);
    },
  );
  it(
    'istemci sapma saptayınca yeniden el sıkışma ile kendini onarır',
    { timeout: 40_000 },
    async () => {
      forge = await startTestForge({ tickHz: 120 });
      const session = await live(await forge.connect('player-desync'));
      pump(session);
      expect(session.resync()).toBe(false);
      const { x, y } = emptyTile(session);
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
    forge = await startTestForge();
    const bad = await rawClient(forge, 'player-hellos');
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
    forge = await startTestForge();
    const client = await rawClient(forge, 'player-dupe1');
    const command: ForgeCommand = { type: COMMAND.place, x: 5, y: 5, kind: KIND.wall, rot: 0 };
    client.room.sendBytes(TO_SERVER.command, commandBytes(5, command));
    client.room.sendBytes(TO_SERVER.command, commandBytes(5, command));
    client.room.sendBytes(TO_SERVER.command, commandBytes(3, command));
    await until(() => client.acks.length === 3);
    expect(client.acks.map((ack) => ack.result)).toEqual([
      client.acks[0].result,
      client.acks[0].result,
      RESULT.duplicate,
    ]);
    const metrics = forge.forge.rooms.get('test')!.metrics();
    expect(metrics.commands.duplicates).toBe(2);
    expect(metrics.commands.accepted + metrics.commands.rejected).toBe(1);
  });

  it('saniyedeki komut sınırı aşılınca fazlası rateLimited döner', async () => {
    forge = await startTestForge();
    const client = await rawClient(forge, 'player-rate1');
    const command: ForgeCommand = { type: COMMAND.remove, x: 1, y: 1 };
    for (let seq = 1; seq <= 60; seq++)
      client.room.sendBytes(TO_SERVER.command, commandBytes(seq, command));
    await until(() => client.acks.length >= 40);
    const limited = client.acks.filter((ack) => ack.result === RESULT.rateLimited).length;
    expect(limited).toBeGreaterThan(20);
    expect(forge.forge.rooms.get('test')!.metrics().commands.rateLimited).toBe(limited);
  });

  it('bozuk mesaj yağdıran istemci düşürülür, dünya etkilenmez', async () => {
    forge = await startTestForge();
    const bad = await rawClient(forge, 'player-flood');
    const good = await live(await forge.connect('player-good1'));
    let closed = false;
    bad.room.onLeave(() => {
      closed = true;
    });
    for (let index = 0; index < 100; index++)
      bad.room.sendBytes(TO_SERVER.command, Uint8Array.of(1, 2, 3));
    await until(() => closed);
    await until(() => forge!.forge.rooms.get('test')!.metrics().players === 1);
    expect(good.status).toBe('live');
    expect(forge.forge.rooms.get('test')!.metrics().commands.malformed).toBeGreaterThanOrEqual(64);
  });

  it('el sıkışmadan gelen komut yok sayılır', async () => {
    forge = await startTestForge();
    const room = await forge.raw('player-early');
    const acks: Ack[] = [];
    room.onMessage(TO_CLIENT.ack, (payload: Uint8Array) => acks.push(readAck(payload)));
    room.sendBytes(
      TO_SERVER.command,
      commandBytes(1, { type: COMMAND.place, x: 5, y: 5, kind: KIND.wall, rot: 0 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(acks).toHaveLength(0);
    expect(forge.forge.rooms.get('test')!.metrics().commands.accepted).toBe(0);
    await room.leave();
  });
});

describe('kalıcılık (yeniden başlatma)', () => {
  it(
    'sunucu yeniden başlayınca dünya, komutlar ve oyuncunun son sırası korunur',
    { timeout: 30_000 },
    async () => {
      forge = await startTestForge({ tickHz: 120 }, { keepData: false });
      const first = await live(await forge.connect('player-keep1'));
      const { x, y } = emptyTile(first);
      expect((await first.place(x, y, KIND.wall, 0)).result).toBe(RESULT.ok);
      const room = forge.forge.rooms.get('test')!;
      await until(() => room.simulation.tick > 90);
      const epochBefore = first.welcome!.epoch;
      const tickBefore = room.simulation.tick;

      await forge.restart();
      const restored = forge.forge.rooms.get('test')!;
      expect(restored.metrics().persistence.load).toMatchObject({ source: 'snapshot' });
      expect(restored.simulation.tick).toBeGreaterThanOrEqual(tickBefore);
      const tile = y * restored.simulation.state.width + x;
      expect(restored.simulation.state.kind[tile]).toBe(KIND.wall);

      const again = await live(await forge.connect('player-keep1'));
      expect(again.welcome!.epoch).not.toBe(epochBefore);
      expect(again.welcome!.lastSeq).toBe(1);
      const next = emptyTile(again, 3);
      const ack = await again.place(next.x, next.y, KIND.wall, 0);
      expect(ack.result).toBe(RESULT.ok);
      expect(ack.seq).toBe(2);
    },
  );
});

describe('ilgi alanı biçimi (gerçek WebSocket)', () => {
  it('çerçeveler kopyayı kurar ve komut sonucu kopyada görünür', { timeout: 30_000 }, async () => {
    forge = await startTestForge({ tickHz: 120, mode: SYNC_MODE.aoi });
    const session = await live(await forge.connect('player-aoi01'));
    expect(session.welcome!.mode).toBe(SYNC_MODE.aoi);
    await until(() => session.replica.hud !== null);
    const room = forge.forge.rooms.get('test')!;
    const s = room.simulation.state;
    let target = -1;
    for (let tile = 0; tile < s.count && target < 0; tile++)
      if (s.kind[tile] === KIND.empty && s.ore[tile] === 0 && tile > s.width * 6) target = tile;
    const x = target % s.width;
    const y = Math.floor(target / s.width);
    expect((await session.place(x, y, KIND.wall, 0)).result).toBe(RESULT.ok);
    await until(() => session.replica.kind[target] === KIND.wall);
    expect(session.received.frames).toBeGreaterThan(0);
    expect(room.metrics().egress.aoiFrames).toBeGreaterThan(0);
  });
});
