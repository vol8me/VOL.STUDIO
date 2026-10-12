// @vitest-environment node
import { spawn } from 'node:child_process';
import { appendFile, mkdtemp, readdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStatefulRandom } from '@volstudio/core/random';
import { KIND } from '../../src/config/forge';
import { COMMAND, type ForgeCommand } from '../../src/sim/commands';
import { buildComb } from '../../src/sim/scenario';
import { ForgeSim } from '../../src/sim/sim';
import {
  encodeBeatRecord,
  encodeCommandRecord,
  JournalWriter,
  readJournal,
  RECORD,
} from '../../server/journal';
import { renameWithRetry, WorldLockedError, WorldStore } from '../../server/store';
import { SMALL } from '../helpers/world';

const dirs: string[] = [];
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vol-forge-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const command: ForgeCommand = { type: COMMAND.place, x: 3, y: 4, kind: KIND.conveyor, rot: 1 };

describe('günlük', () => {
  it('kayıtları yazar, kalıcılaştırır ve aynen okur', async () => {
    const path = join(await scratch(), 'j.log');
    const journal = await JournalWriter.create(path, { baseTick: 77, epoch: 5 });
    journal.append(encodeCommandRecord(80, 'player-one', 1, command));
    journal.append(encodeBeatRecord(90, 0xabcdef));
    await journal.commit();
    await journal.close();
    const read = (await readJournal(path))!;
    expect(read.header).toEqual({ baseTick: 77, epoch: 5 });
    expect(read.torn).toBe(false);
    expect(read.records).toEqual([
      { kind: RECORD.command, tick: 80, key: 'player-one', seq: 1, command },
      { kind: RECORD.beat, tick: 90, hash: 0xabcdef },
    ]);
  });

  it('eşzamanlı onaylar tek yazım çevrimini paylaşır', async () => {
    const path = join(await scratch(), 'j.log');
    const journal = await JournalWriter.create(path, { baseTick: 0, epoch: 1 });
    const waits: Promise<void>[] = [];
    for (let index = 0; index < 200; index++) {
      journal.append(encodeBeatRecord(index, index));
      waits.push(journal.commit());
    }
    await Promise.all(waits);
    expect(journal.stats.appended).toBe(200);
    expect(journal.stats.fsyncs).toBeLessThan(10);
    await journal.close();
    expect((await readJournal(path))!.records).toHaveLength(200);
  });

  it('kesik veya bozuk kuyruk ilk kötü çerçevede durur', async () => {
    const path = join(await scratch(), 'j.log');
    const journal = await JournalWriter.create(path, { baseTick: 0, epoch: 1 });
    for (let tick = 1; tick <= 5; tick++) journal.append(encodeBeatRecord(tick, tick));
    await journal.close();
    const whole = (await readJournal(path))!;
    expect(whole.records).toHaveLength(5);

    await appendFile(path, Uint8Array.of(9, 0, 0, 0, 1));
    const withGarbage = (await readJournal(path))!;
    expect(withGarbage.torn).toBe(true);
    expect(withGarbage.records).toHaveLength(5);
    expect(withGarbage.validBytes).toBe(whole.validBytes);

    await truncate(path, whole.validBytes - 3);
    const cut = (await readJournal(path))!;
    expect(cut.torn).toBe(true);
    expect(cut.records).toHaveLength(4);

    const bytes = new Uint8Array(await readFile(path));
    bytes[16 + 8 + 9 + 8 + 2] ^= 0xff; // ikinci kaydın yükü
    await writeFile(path, bytes);
    const flipped = (await readJournal(path))!;
    expect(flipped.torn).toBe(true);
    expect(flipped.records).toHaveLength(1);
  });

  it('başlığı bozuk veya kısa dosya null verir', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'short.log'), Uint8Array.of(1, 2, 3));
    expect(await readJournal(join(dir, 'short.log'))).toBeNull();
    await writeFile(join(dir, 'wrong.log'), new Uint8Array(40));
    expect(await readJournal(join(dir, 'wrong.log'))).toBeNull();
  });

  it('aşırı büyük kaydı ve kapalı günlüğe yazmayı reddeder', async () => {
    const path = join(await scratch(), 'j.log');
    const journal = await JournalWriter.create(path, { baseTick: 0, epoch: 1 });
    expect(() => journal.append(new Uint8Array(5000))).toThrow(RangeError);
    await journal.close();
    expect(() => journal.append(encodeBeatRecord(1, 1))).toThrow(/kapalı/);
  });
});

/** Gerçek sunucunun yaptığını yapan küçük sürücü: komut → günlük, adım, kalp atışı, kontrol noktası. */
class Driver {
  readonly random = createStatefulRandom(99);
  readonly beatHashes = new Map<number, number>();
  seq = 1;
  journal!: JournalWriter;

  constructor(
    readonly sim: ForgeSim,
    readonly store: WorldStore,
  ) {}

  async checkpoint(): Promise<void> {
    await this.store.snapshot(this.sim);
    this.journal = this.store.rotateJournal(this.sim.tick, 1);
  }

  private command(): ForgeCommand {
    const r = this.random;
    return {
      type: COMMAND.place,
      x: Math.floor(r.next() * SMALL.width),
      y: Math.floor(r.next() * SMALL.height),
      kind: r.next() < 0.7 ? KIND.conveyor : KIND.wall,
      rot: Math.floor(r.next() * 4),
    };
  }

  tick(): void {
    const sim = this.sim;
    if (this.random.next() < 0.4) {
      const next = this.command();
      const seq = this.seq++;
      const outcome = sim.apply('player-driver', seq, next);
      if (outcome.fresh)
        this.journal.append(encodeCommandRecord(sim.tick, 'player-driver', seq, next));
    }
    sim.step();
    if (sim.tick % 30 === 0) {
      const hash = sim.stateHash();
      this.beatHashes.set(sim.tick, hash);
      this.journal.append(encodeBeatRecord(sim.tick, hash));
    }
  }
}

function worldFor(seed = 21): ForgeSim {
  const sim = ForgeSim.create({ ...SMALL, seed });
  buildComb(sim, { maxBelts: 300, turrets: 6, fill: 1, smelterEvery: 2 });
  return sim;
}

describe('dünya deposu', () => {
  it('boş dizinde yeni dünya kurar', async () => {
    const store = new WorldStore(await scratch());
    await store.acquire();
    const { sim, report } = await store.load({}, () => worldFor());
    expect(report.source).toBe('fresh');
    expect(sim.tick).toBe(0);
    await store.release();
  });

  it('çökmeden sonra anlık görüntü + günlükten son kalp atışındaki durumu kurar', async () => {
    const dir = await scratch();
    const store = new WorldStore(dir);
    await store.acquire();
    const driver = new Driver(worldFor(), store);
    await driver.checkpoint();
    for (let tick = 0; tick < 1500; tick++) {
      driver.tick();
      if (tick === 600) await driver.checkpoint();
    }
    while (driver.sim.tick % 30 !== 0) driver.tick();
    await driver.journal.commit();
    const lastBeat = driver.sim.tick;
    const expected = driver.beatHashes.get(lastBeat)!;
    // Çökme: dosyalar kapatılmadan bırakılır; kilit yeni süreçte "ölü" sayılır.
    const { sim, report } = await new WorldStore(dir).load({}, () => worldFor());
    expect(report.source).toBe('snapshot');
    expect(report.snapshotTick).toBeGreaterThan(0);
    expect(report.replayedCommands).toBeGreaterThan(20);
    expect(report.hashMismatches).toBe(0);
    expect(sim.tick).toBe(lastBeat);
    expect(sim.stateHash()).toBe(expected);
    await driver.journal.close();
    await store.release();
  });

  it('günlüğün kesik kuyruğu atılır; durum son tam kayıttaki kalp atışına döner', async () => {
    const dir = await scratch();
    const store = new WorldStore(dir);
    await store.acquire();
    const driver = new Driver(worldFor(), store);
    await driver.checkpoint();
    for (let tick = 0; tick < 700; tick++) driver.tick();
    while (driver.sim.tick % 30 !== 0) driver.tick();
    await driver.journal.close();
    const file = (await readdir(dir)).find((name) => name.startsWith('journal-'))!;
    const path = join(dir, file);
    const full = (await readJournal(path))!;
    const beats = full.records.filter((record) => record.kind === RECORD.beat);
    const penultimate = beats[beats.length - 2];
    // Son kalp atışı kaydını ve ondan önceki komutları yarım yazılmış gibi kes.
    await truncate(path, full.validBytes - 4);
    const { sim, report } = await new WorldStore(dir).load({}, () => worldFor());
    expect(report.tornTail).toBe(true);
    expect(sim.tick).toBeGreaterThanOrEqual(penultimate.tick);
    expect(sim.tick).toBeLessThan(full.records[full.records.length - 1].tick + 1);
    if (sim.tick === penultimate.tick)
      expect(sim.stateHash()).toBe(driver.beatHashes.get(penultimate.tick));
    expect(report.hashMismatches).toBe(0);
    await store.release();
  });

  it('en yeni anlık görüntü bozuksa öncekine ve günlük zincirine döner', async () => {
    const dir = await scratch();
    const store = new WorldStore(dir);
    await store.acquire();
    const driver = new Driver(worldFor(), store);
    await driver.checkpoint();
    for (let tick = 0; tick < 500; tick++) driver.tick();
    await driver.checkpoint();
    for (let tick = 0; tick < 400; tick++) driver.tick();
    while (driver.sim.tick % 30 !== 0) driver.tick();
    await driver.journal.commit();
    const lastBeat = driver.sim.tick;
    const snapshots = (await readdir(dir)).filter((name) => name.startsWith('snapshot-')).sort();
    expect(snapshots).toHaveLength(2);
    const newest = join(dir, snapshots[1]);
    const bytes = new Uint8Array(await readFile(newest));
    bytes[bytes.length >> 1] ^= 0x55;
    await writeFile(newest, bytes);
    const { sim, report } = await new WorldStore(dir).load({}, () => worldFor());
    expect(report.skippedSnapshots).toBe(1);
    expect(report.snapshotTick).toBe(0);
    expect(sim.tick).toBe(lastBeat);
    expect(sim.stateHash()).toBe(driver.beatHashes.get(lastBeat));
    await driver.journal.close();
    await store.release();
  });

  it('eski anlık görüntü ve günlükleri budar, yeni ikisini korur', async () => {
    const dir = await scratch();
    const store = new WorldStore(dir);
    await store.acquire();
    const driver = new Driver(worldFor(), store);
    for (let round = 0; round < 4; round++) {
      await driver.checkpoint();
      for (let tick = 0; tick < 100; tick++) driver.tick();
    }
    const removed = await store.prune();
    expect(removed.snapshots).toBe(2);
    expect(removed.journals).toBeGreaterThan(0);
    const names = await readdir(dir);
    expect(names.filter((name) => name.startsWith('snapshot-'))).toHaveLength(2);
    expect(names.filter((name) => name.startsWith('journal-')).length).toBeGreaterThanOrEqual(2);
    await driver.journal.close();
    await store.release();
  });

  it('hiçbir geçerli anlık görüntü yoksa yeni dünya kurar ve bozuk olanları saydırır', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'snapshot-0000000010.bin'), new Uint8Array(100));
    const { report } = await new WorldStore(dir).load({}, () => worldFor());
    expect(report.source).toBe('fresh');
    expect(report.skippedSnapshots).toBe(1);
  });
});

describe('tek yazar kilidi', () => {
  it('canlı bir süreç tutuyorsa başlamaz, ölü sürecin kilidini devralır', async () => {
    const dir = await scratch();
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], {
      stdio: 'ignore',
    });
    try {
      await writeFile(join(dir, 'world.lock'), String(child.pid));
      const blocked = new WorldStore(dir);
      await expect(blocked.acquire()).rejects.toBeInstanceOf(WorldLockedError);
    } finally {
      child.kill();
    }
    await new Promise((resolve) => child.once('exit', resolve));
    const store = new WorldStore(dir);
    await store.acquire();
    expect(Number(await readFile(join(dir, 'world.lock'), 'utf8'))).toBe(process.pid);
    await store.release();
    expect((await readdir(dir)).includes('world.lock')).toBe(false);
  });

  it('geçersiz kilit içeriği devralınır', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'world.lock'), 'bozuk');
    const store = new WorldStore(dir);
    await store.acquire();
    await store.release();
  });
});

describe('yeniden adlandırma', () => {
  it('geçici olmayan hatayı hemen iletir', async () => {
    const dir = await scratch();
    await expect(renameWithRetry(join(dir, 'yok'), join(dir, 'hedef'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('hedef varsa üzerine yazar', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'a'), 'yeni');
    await writeFile(join(dir, 'b'), 'eski');
    await renameWithRetry(join(dir, 'a'), join(dir, 'b'));
    expect(await readFile(join(dir, 'b'), 'utf8')).toBe('yeni');
  });

  it('dünya örneği kimliği sıfırdan farklıdır', () => {
    expect(WorldStore.newEpoch()).toBeGreaterThan(0);
  });
});
