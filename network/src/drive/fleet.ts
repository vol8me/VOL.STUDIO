import { JoinError, createLobby, type Room, type RoomOptions } from '../client';
import { Histogram, summarizeHistogram, type DistributionSummary } from './histogram';
import type { JsonlReport } from './report';

/** `act` geri çağrısına verilen bağlı bot. */
export interface BotHandle<S = unknown> {
  readonly index: number;
  readonly room: Room<S>;
}

export interface FleetOptions<S = unknown> {
  readonly endpoint: string;
  readonly roomName: string;
  readonly clients: number;
  readonly durationMs: number;
  /** Katılımlar bu pencereye yayılır (bir anda bağlanma yığılmasını önler); varsayılan istemci başına 50 ms. */
  readonly rampMs?: number;
  /** Örnek ve ping aralığı; varsayılan 1000 ms. */
  readonly sampleMs?: number;
  /** `act` aralığı; varsayılan 50 ms. Oyun girdi hızına göre ayarlar (60 Hz için 16). */
  readonly actMs?: number;
  readonly joinOptions?: (index: number) => RoomOptions;
  readonly schema?: new () => S;
  /** Her `actMs`te bağlı her bot için çağrılır: girdi yollamak oyunun işidir. Fırlatırsa sayılır. */
  readonly act?: (bot: BotHandle<S>) => void;
  /** Kopan botu SDK'nın yeniden bağlanmasına bırakır; varsayılan kapalı (kopma ölçülür). */
  readonly reconnect?: boolean;
  /** İstemci başına örnek satırı; varsayılan en çok 64 istemcide açık. */
  readonly perBotSamples?: boolean;
  readonly report?: JsonlReport;
  readonly signal?: AbortSignal;
}

export interface FleetSummary {
  readonly clients: number;
  readonly joined: number;
  readonly joinFailures: Readonly<Record<string, number>>;
  /** Koşu bitmeden kopan bot sayısı. */
  readonly dropped: number;
  readonly closeCodes: Readonly<Record<string, number>>;
  readonly errors: number;
  readonly actErrors: number;
  readonly durationMs: number;
  /** Katılım süresi (ms). */
  readonly joinMs: DistributionSummary;
  /** Ardışık durum yamaları arası süre (ms), tüm botlar birlikte. */
  readonly patchGapMs: DistributionSummary;
  /** Ping gidiş-dönüş süresi (ms). */
  readonly pingMs: DistributionSummary;
  /** Bağlı bot başına saniyede ortalama durum yaması. */
  readonly patchesPerSecond: number;
  /** Bot başına saniyede ortalama sunucu iletisi. */
  readonly messagesPerSecond: number;
}

interface Bot<S> {
  readonly index: number;
  room: Room<S> | null;
  connectedAt: number;
  endedAt: number;
  patches: number;
  messages: number;
  lastPatchAt: number;
  windowPatches: number;
  windowMessages: number;
  readonly windowGaps: Histogram;
  closeCode: number | null;
}

const MAX_PER_BOT_SAMPLES = 64;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });

const bump = (record: Record<string, number>, key: string): void => {
  record[key] = (record[key] ?? 0) + 1;
};

/**
 * Çok istemcili başsız yük sürücüsü: `clients` kadar gerçek SDK istemcisi `roomName` odasına katılır,
 * `act` ile girdi yollar ve `durationMs` boyunca ölçülür. Katılım süresi, yama aralığı, ping, kopma
 * ve hatalar `report`a JSONL olarak yazılır ve özet döner. İstemciler tarayıcı değil Node'dadır;
 * görüntüleme, öngörü ve uzlaştırma ölçülmez, yalnız ağ ve sunucu yükü ölçülür.
 */
export async function runFleet<S = unknown>(options: FleetOptions<S>): Promise<FleetSummary> {
  const {
    endpoint,
    roomName,
    clients,
    durationMs,
    report,
    signal,
    schema,
    act,
    joinOptions = () => ({}),
    reconnect = false,
    sampleMs = 1000,
    actMs = 50,
    rampMs = clients * 50,
    perBotSamples = clients <= MAX_PER_BOT_SAMPLES,
  } = options;
  if (!Number.isSafeInteger(clients) || clients < 1)
    throw new RangeError('İstemci sayısı pozitif tam sayı olmalı.');
  if (!(durationMs > 0) || !(sampleMs > 0) || !(actMs > 0) || !(rampMs >= 0))
    throw new RangeError('Süreler pozitif olmalı.');

  const lobby = createLobby(endpoint);
  const startedAt = performance.now();
  const bots: Array<Bot<S>> = Array.from({ length: clients }, (_, index) => ({
    index,
    room: null,
    connectedAt: 0,
    endedAt: 0,
    patches: 0,
    messages: 0,
    lastPatchAt: 0,
    windowPatches: 0,
    windowMessages: 0,
    windowGaps: new Histogram(1, 2000),
    closeCode: null,
  }));
  const joinMs = new Histogram(5, 6000);
  const patchGap = new Histogram(1, 2000);
  const pingMs = new Histogram(1, 2000);
  const joinFailures: Record<string, number> = {};
  const closeCodes: Record<string, number> = {};
  let joined = 0;
  let dropped = 0;
  let errors = 0;
  let actErrors = 0;
  let running = true;

  const attach = (bot: Bot<S>, room: Room<S>): void => {
    room.reconnection.enabled = reconnect;
    bot.room = room;
    bot.connectedAt = bot.lastPatchAt = performance.now();
    room.onStateChange(() => {
      const at = performance.now();
      bot.patches++;
      bot.windowPatches++;
      const gap = at - bot.lastPatchAt;
      bot.lastPatchAt = at;
      patchGap.record(gap);
      bot.windowGaps.record(gap);
    });
    room.onMessage('*', () => {
      bot.messages++;
      bot.windowMessages++;
    });
    room.onError((code, message) => {
      errors++;
      report?.write('error', { bot: bot.index, code, message });
    });
    room.onLeave((code) => {
      bot.closeCode = code;
      bot.endedAt = performance.now();
      bot.room = null;
      if (!running) return;
      dropped++;
      bump(closeCodes, String(code));
      report?.write('drop', { bot: bot.index, code });
    });
  };

  const join = async (bot: Bot<S>): Promise<void> => {
    const began = performance.now();
    try {
      const room = await lobby.joinOrCreate(roomName, joinOptions(bot.index), schema);
      if (!running) {
        await room.leave(true).catch(() => undefined);
        return;
      }
      joined++;
      const took = performance.now() - began;
      joinMs.record(took);
      attach(bot, room);
      report?.write('join', { bot: bot.index, ms: Math.round(took) });
    } catch (error) {
      const reason = error instanceof JoinError ? error.reason : 'failed';
      bump(joinFailures, reason);
      report?.write('joinFailed', { bot: bot.index, reason });
    }
  };

  report?.write('start', { clients, durationMs, rampMs, sampleMs, actMs, roomName });

  const joins = Promise.all(
    bots.map(async (bot) => {
      await sleep(clients === 1 ? 0 : (rampMs * bot.index) / (clients - 1), signal);
      if (running && !signal?.aborted) await join(bot);
    }),
  );

  const actTimer = act
    ? setInterval(() => {
        for (const bot of bots) {
          if (!bot.room) continue;
          try {
            act({ index: bot.index, room: bot.room });
          } catch (error) {
            actErrors++;
            if (actErrors === 1)
              report?.write('actError', { bot: bot.index, message: String(error) });
          }
        }
      }, actMs)
    : undefined;

  let sampledAt = performance.now();
  const sampleTimer = setInterval(() => {
    const at = performance.now();
    const seconds = Math.max(0.001, (at - sampledAt) / 1000);
    sampledAt = at;
    let connected = 0;
    let patches = 0;
    let messages = 0;
    for (const bot of bots) {
      patches += bot.windowPatches;
      messages += bot.windowMessages;
      if (!bot.room) continue;
      connected++;
      bot.room.ping((ms) => pingMs.record(ms));
      if (perBotSamples)
        report?.write('sample', {
          bot: bot.index,
          patchHz: Number((bot.windowPatches / seconds).toFixed(2)),
          messageHz: Number((bot.windowMessages / seconds).toFixed(2)),
          gapP99Ms: bot.windowGaps.percentile(0.99),
          gapMaxMs: bot.windowGaps.max,
        });
      bot.windowPatches = bot.windowMessages = 0;
      bot.windowGaps.reset();
    }
    report?.write('fleet', {
      connected,
      patchHz: Number((patches / seconds / Math.max(1, connected)).toFixed(2)),
      messageHz: Number((messages / seconds / Math.max(1, connected)).toFixed(2)),
      pingP99Ms: pingMs.percentile(0.99),
      gapP99Ms: patchGap.percentile(0.99),
    });
    for (const bot of bots) bot.windowPatches = bot.windowMessages = 0;
  }, sampleMs);

  await sleep(durationMs, signal);
  running = false;
  clearInterval(actTimer);
  clearInterval(sampleTimer);
  await joins;

  const elapsedMs = performance.now() - startedAt;
  let connectedSeconds = 0;
  let patches = 0;
  let messages = 0;
  for (const bot of bots) {
    if (bot.connectedAt === 0) continue;
    const end = bot.endedAt > 0 ? bot.endedAt : performance.now();
    connectedSeconds += (end - bot.connectedAt) / 1000;
    patches += bot.patches;
    messages += bot.messages;
  }
  await Promise.all(
    bots.flatMap((bot) => (bot.room ? [bot.room.leave(true).catch(() => undefined)] : [])),
  );

  const summary: FleetSummary = {
    clients,
    joined,
    joinFailures,
    dropped,
    closeCodes,
    errors,
    actErrors,
    durationMs: Math.round(elapsedMs),
    joinMs: summarizeHistogram(joinMs),
    patchGapMs: summarizeHistogram(patchGap),
    pingMs: summarizeHistogram(pingMs),
    patchesPerSecond: connectedSeconds > 0 ? patches / connectedSeconds : 0,
    messagesPerSecond: connectedSeconds > 0 ? messages / connectedSeconds : 0,
  };
  report?.write('summary', { ...summary });
  return summary;
}
