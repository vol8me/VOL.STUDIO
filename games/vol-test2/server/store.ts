import { randomInt } from 'node:crypto';
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { join } from 'node:path';
import { ForgeSim, type ForgeSimOptions } from '@/sim/sim';
import { SnapshotError } from '@/sim/snapshot';
import {
  emptyJournalStats,
  JournalWriter,
  readJournal,
  RECORD,
  type JournalRecord,
} from './journal';

const SNAPSHOT_PATTERN = /^snapshot-(\d{10})\.bin$/;
const JOURNAL_PATTERN = /^journal-(\d{10})\.log$/;
const KEEP_SNAPSHOTS = 2;
/** Geri yükleme sırasında günlükteki iki kayıt arasında kabul edilen en büyük adım boşluğu. */
const MAX_GAP_TICKS = 10_000_000;

const padded = (tick: number): string => String(tick).padStart(10, '0');

export class WorldLockedError extends Error {
  constructor(readonly owner: number) {
    super(`Dünya başka bir süreç tarafından kilitli (pid ${owner}).`);
    this.name = 'WorldLockedError';
  }
}

export interface LoadReport {
  readonly source: 'fresh' | 'snapshot';
  readonly snapshotTick: number;
  readonly replayedCommands: number;
  readonly replayedTicks: number;
  readonly tornTail: boolean;
  readonly hashMismatches: number;
  readonly skippedSnapshots: number;
  readonly ms: number;
}

export interface SnapshotReport {
  readonly tick: number;
  readonly bytes: number;
  readonly serializeMs: number;
  readonly writeMs: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Windows'ta antivirüs veya dizinleyici yeniden adlandırmayı anlık engelleyebilir. */
export async function renameWithRetry(from: string, to: string, attempts = 6): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt));
    }
  }
}

/**
 * Bir dünyanın disk düzeni: anlık görüntüler, günlükler ve tek yazar kilidi.
 *
 *   world.lock                 yazar süreç (pid)
 *   snapshot-<tick>.bin        kanonik durum + sağlama
 *   journal-<tick>.log         o anlık görüntüden sonraki komutlar
 *
 * Yazma sırası: geçici dosyaya yaz → fsync → yeniden adlandır → (Linux'ta) dizini fsync et.
 */
export class WorldStore {
  private lockHandle: FileHandle | null = null;
  private journal: JournalWriter | null = null;

  /** Günlük sayaçları bu deponun ömrü boyunca birikir: günlük her kontrol noktasında değişir. */
  readonly journalStats = emptyJournalStats();

  constructor(readonly dir: string) {}

  get lockPath(): string {
    return join(this.dir, 'world.lock');
  }

  /** Tek yazar kuralı: canlı bir süreç kilidi tutuyorsa başlamaz, ölü sürecin kilidini devralır. */
  async acquire(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.lockHandle = await open(this.lockPath, 'wx');
        await this.lockHandle.writeFile(String(process.pid));
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const owner = Number(await readFile(this.lockPath, 'utf8').catch(() => '0'));
        if (owner > 0 && owner !== process.pid && isProcessAlive(owner))
          throw new WorldLockedError(owner);
        await unlink(this.lockPath).catch(() => undefined);
      }
    }
    throw new Error('Dünya kilidi alınamadı.');
  }

  async release(): Promise<void> {
    await this.journal?.close().catch(() => undefined);
    this.journal = null;
    if (this.lockHandle) {
      await this.lockHandle.close().catch(() => undefined);
      this.lockHandle = null;
      await unlink(this.lockPath).catch(() => undefined);
    }
  }

  private async list(pattern: RegExp): Promise<{ tick: number; name: string }[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names
      .flatMap((name) => {
        const match = pattern.exec(name);
        return match ? [{ tick: Number(match[1]), name }] : [];
      })
      .sort((a, b) => a.tick - b.tick);
  }

  /**
   * Dünyayı diskten kurar: en yeni geçerli anlık görüntü, ardından sonrasındaki günlüklerin tekrarı.
   * Hiç anlık görüntü yoksa `fresh()` ile yeni dünya kurulur. Günlükteki kalp atışı karmaları tekrar
   * sırasında denetlenir; uyuşmazlık `hashMismatches` olarak raporlanır.
   */
  async load(
    options: ForgeSimOptions,
    fresh: () => ForgeSim,
    now: () => number = () => performance.now(),
  ): Promise<{ sim: ForgeSim; report: LoadReport }> {
    const started = now();
    const snapshots = (await this.list(SNAPSHOT_PATTERN)).reverse();
    let sim: ForgeSim | null = null;
    let snapshotTick = 0;
    let skipped = 0;
    for (const entry of snapshots) {
      try {
        const bytes = new Uint8Array(await readFile(join(this.dir, entry.name)));
        sim = ForgeSim.restore(bytes, options);
        snapshotTick = sim.tick;
        break;
      } catch (error) {
        if (!(error instanceof SnapshotError) && !(error instanceof RangeError)) throw error;
        skipped++;
      }
    }
    if (sim === null) {
      return {
        sim: fresh(),
        report: {
          source: 'fresh',
          snapshotTick: 0,
          replayedCommands: 0,
          replayedTicks: 0,
          tornTail: false,
          hashMismatches: 0,
          skippedSnapshots: skipped,
          ms: now() - started,
        },
      };
    }

    let commands = 0;
    let mismatches = 0;
    let torn = false;
    const startTick = sim.tick;
    const journals = (await this.list(JOURNAL_PATTERN)).filter(
      (entry) => entry.tick >= snapshotTick,
    );
    for (const entry of journals) {
      const read = await readJournal(join(this.dir, entry.name));
      if (read === null) {
        torn = true;
        break;
      }
      torn ||= read.torn;
      const outcome = this.replay(sim, read.records);
      commands += outcome.commands;
      mismatches += outcome.mismatches;
      if (read.torn) break;
    }
    return {
      sim,
      report: {
        source: 'snapshot',
        snapshotTick,
        replayedCommands: commands,
        replayedTicks: sim.tick - startTick,
        tornTail: torn,
        hashMismatches: mismatches,
        skippedSnapshots: skipped,
        ms: now() - started,
      },
    };
  }

  private replay(
    sim: ForgeSim,
    records: readonly JournalRecord[],
  ): { commands: number; mismatches: number } {
    let commands = 0;
    let mismatches = 0;
    for (const record of records) {
      if (record.tick < sim.tick) continue;
      if (record.tick - sim.tick > MAX_GAP_TICKS)
        throw new RangeError('Günlükte adım boşluğu aşırı.');
      while (sim.tick < record.tick) sim.step();
      if (record.kind === RECORD.command) {
        sim.apply(record.key, record.seq, record.command);
        commands++;
      } else if (sim.stateHash() !== record.hash) {
        mismatches++;
      }
    }
    return { commands, mismatches };
  }

  /**
   * Yeni anlık görüntü yazar ve günlüğü döndürür. Serileştirme eşzamanlıdır (durum tutarlı olsun
   * diye), disk yazımı beklenir. Başarısızlıkta eski anlık görüntü ve günlük yerinde kalır.
   */
  async snapshot(
    sim: ForgeSim,
    now: () => number = () => performance.now(),
  ): Promise<SnapshotReport> {
    const started = now();
    const bytes = sim.snapshot();
    const tick = sim.tick;
    const serialized = now();
    const finalPath = join(this.dir, `snapshot-${padded(tick)}.bin`);
    const temp = `${finalPath}.tmp`;
    const handle = await open(temp, 'w');
    try {
      await handle.write(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temp, finalPath);
    await this.syncDirectory();
    return {
      tick,
      bytes: bytes.length,
      serializeMs: serialized - started,
      writeMs: now() - serialized,
    };
  }

  /** Windows'ta dizin açılamaz; Linux'ta yeniden adlandırmanın kalıcılığı için gereklidir. */
  private async syncDirectory(): Promise<void> {
    if (process.platform === 'win32') return;
    const handle = await open(this.dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /**
   * Yeni günlüğü eşzamanlı başlatır ve eskisini arka planda kapatır. Eşzamanlı olması önemlidir:
   * anlık görüntü alındığı adımda günlük değişir, arada hiçbir komut eski günlükte kalmaz.
   */
  rotateJournal(baseTick: number, epoch: number): JournalWriter {
    const previous = this.journal;
    const next = JournalWriter.begin(
      join(this.dir, `journal-${padded(baseTick)}.log`),
      { baseTick, epoch },
      undefined,
      this.journalStats,
    );
    this.journal = next;
    void previous?.close().catch(() => undefined);
    return next;
  }

  /** En yeni `KEEP_SNAPSHOTS` anlık görüntü ve onlardan eski olmayan günlükler kalır. */
  async prune(): Promise<{ snapshots: number; journals: number }> {
    const snapshots = await this.list(SNAPSHOT_PATTERN);
    const keep = snapshots.slice(-KEEP_SNAPSHOTS);
    const oldestKept = keep.length > 0 ? keep[0].tick : 0;
    let removedSnapshots = 0;
    let removedJournals = 0;
    for (const entry of snapshots.slice(0, Math.max(0, snapshots.length - KEEP_SNAPSHOTS))) {
      await rm(join(this.dir, entry.name), { force: true });
      removedSnapshots++;
    }
    for (const entry of await this.list(JOURNAL_PATTERN)) {
      if (entry.tick >= oldestKept) continue;
      await rm(join(this.dir, entry.name), { force: true });
      removedJournals++;
    }
    return { snapshots: removedSnapshots, journals: removedJournals };
  }

  /** Dünya örneği kimliği: sunucu her başlatmada yenisini üretir. */
  static newEpoch(): number {
    return randomInt(1, 0xffffffff);
  }
}
