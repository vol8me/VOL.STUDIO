import { createServer, connect, type Server, type Socket } from 'node:net';

/**
 * Bağlantı bozulma profili. TCP sıralıdır: gecikme ve titreşim sırayı bozmaz (bir parça öncekinden
 * önce teslim edilmez), kayıp ise yeniden iletim bekleyişi olarak görünür: arkadaki her şey `stallMs`
 * kadar gecikir (başın engellenmesi). Gerçek paket kaybı bu katmanın altındadır ve modellenmez.
 */
export interface LinkProfile {
  /** Her yönde sabit gecikme (ms); gidiş-dönüş bunun iki katıdır. */
  readonly latencyMs: number;
  /** Gecikmeye eklenen düzgün dağılımlı ±pay (ms). */
  readonly jitterMs?: number;
  /** Parça başına yeniden iletim bekleyişi olasılığı (0-1) ve süresi. */
  readonly stallProbability?: number;
  readonly stallMs?: number;
  /** Yön başına bant genişliği (bayt/sn); verilmezse sınırsız. */
  readonly bytesPerSecond?: number;
}

export const CLEAN_LINK: LinkProfile = { latencyMs: 0 };

export interface LinkStats {
  readonly connections: number;
  readonly bytesUp: number;
  readonly bytesDown: number;
  readonly delayed: number;
}

type Direction = 'up' | 'down';

interface Pending {
  readonly at: number;
  readonly chunk: Buffer | null;
}

/** Bir yöndeki sıralı teslim kuyruğu: parçalar `at` anında, ama hiçbir zaman öncekinden önce teslim edilir. */
class Lane {
  private readonly queue: Pending[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastAt = 0;
  private busyUntil = 0;

  constructor(
    private readonly deliver: (chunk: Buffer | null) => void,
    private readonly held: () => boolean,
  ) {}

  push(chunk: Buffer | null, profile: LinkProfile, random: () => number): number {
    const now = performance.now();
    const jitter = (profile.jitterMs ?? 0) * (random() * 2 - 1);
    let delay = Math.max(0, profile.latencyMs + jitter);
    if (profile.stallProbability && random() < profile.stallProbability)
      delay += profile.stallMs ?? 200;
    if (chunk && profile.bytesPerSecond) {
      this.busyUntil =
        Math.max(this.busyUntil, now) + (chunk.length / profile.bytesPerSecond) * 1000;
      delay = Math.max(delay, this.busyUntil - now);
    }
    const at = Math.max(now + delay, this.lastAt);
    this.lastAt = at;
    this.queue.push({ at, chunk });
    this.schedule();
    return delay;
  }

  /** Tutulan parçalar bırakılınca teslim yeniden başlar. */
  resume(): void {
    this.schedule();
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue.length = 0;
  }

  private schedule(): void {
    if (this.timer || this.queue.length === 0 || this.held()) return;
    const wait = Math.max(0, this.queue[0].at - performance.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = performance.now();
      while (this.queue.length > 0 && this.queue[0].at <= now && !this.held()) {
        this.deliver(this.queue.shift()!.chunk);
      }
      this.schedule();
    }, wait);
  }
}

/**
 * Gerçek sunucuyla istemci arasına konan TCP aracısı: gecikme, titreşim, bekleyiş, bant genişliği ve
 * kesinti uygular. WebSocket üstüne bindiği için tarayıcı ya da SDK istemcisi adresini ona çevirir.
 * `blackhole` ağın sessizce kaybolmasını (telefon uykuya girdi, Wi-Fi koptu) taklit eder: iki yönde
 * her şey tutulur, bağlantı kapanmaz; `release` tutulanı sırayla teslim eder, `sever` bağlantıları keser.
 */
export class ImpairedLink {
  private readonly sockets = new Set<Socket>();
  private readonly lanes = new Set<Lane>();
  private profileNow: LinkProfile;
  private holding = false;
  private connections = 0;
  private up = 0;
  private down = 0;
  private delayedCount = 0;

  private constructor(
    private readonly server: Server,
    readonly port: number,
    profile: LinkProfile,
    private readonly random: () => number,
  ) {
    this.profileNow = profile;
  }

  /** Loopback'te rastgele portta dinler ve `target`a yönlendirir. */
  static async start(
    target: { host: string; port: number },
    options: { profile?: LinkProfile; random?: () => number } = {},
  ): Promise<ImpairedLink> {
    // Yarım açık bağlantı korunur: bir uç `end` derse öteki yönde kuyruktaki veri hâlâ teslim edilir.
    const server = createServer({ allowHalfOpen: true });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Aracı adresi çözülemedi.');
    const link = new ImpairedLink(
      server,
      address.port,
      options.profile ?? CLEAN_LINK,
      options.random ?? Math.random,
    );
    server.on('connection', (client) => link.accept(client, target));
    return link;
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get profile(): LinkProfile {
    return this.profileNow;
  }

  /** Profili yeni parçalar için değiştirir; kuyruktakiler eski zamanlarıyla teslim edilir. */
  setProfile(profile: LinkProfile): void {
    this.profileNow = profile;
  }

  /** Ağı sessizce keser: iki yönde her şey tutulur, bağlantılar açık kalır. */
  blackhole(): void {
    this.holding = true;
  }

  /** Tutulanı sırayla teslim eder. */
  release(): void {
    this.holding = false;
    for (const lane of this.lanes) lane.resume();
  }

  /** Açık bağlantıları hemen yok eder (ağ değişimi, RST). */
  sever(): void {
    for (const lane of this.lanes) lane.clear();
    for (const socket of this.sockets) socket.destroy();
  }

  stats(): LinkStats {
    return {
      connections: this.connections,
      bytesUp: this.up,
      bytesDown: this.down,
      delayed: this.delayedCount,
    };
  }

  async close(): Promise<void> {
    this.holding = false;
    this.sever();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(client: Socket, target: { host: string; port: number }): void {
    this.connections++;
    const upstream = connect({ port: target.port, host: target.host, allowHalfOpen: true });
    this.sockets.add(client).add(upstream);
    const own: Lane[] = [];
    const lane = (direction: Direction, to: Socket): void => {
      const created = new Lane(
        (chunk) => {
          if (chunk === null) to.end();
          else to.write(chunk);
        },
        () => this.holding,
      );
      own.push(created);
      this.lanes.add(created);
      const from = direction === 'up' ? client : upstream;
      from.on('data', (chunk: Buffer) => {
        if (direction === 'up') this.up += chunk.length;
        else this.down += chunk.length;
        if (created.push(chunk, this.profileNow, this.random) > 0) this.delayedCount++;
      });
      from.on('end', () => created.push(null, this.profileNow, this.random));
    };
    lane('up', upstream);
    lane('down', client);
    // Bir uç kapanınca öteki, kuyruktaki veri teslim edildikten sonra `end` ile kapanır; hata ise ikisini
    // hemen yok eder. Kayıt, iki uç da kapanınca silinir.
    const destroyBoth = (): void => {
      client.destroy();
      upstream.destroy();
    };
    const closed = (socket: Socket): void => {
      this.sockets.delete(socket);
      if (!this.sockets.has(client) && !this.sockets.has(upstream)) {
        for (const lane of own) {
          lane.clear();
          this.lanes.delete(lane);
        }
      }
    };
    client.on('error', destroyBoth).on('close', () => closed(client));
    upstream.on('error', destroyBoth).on('close', () => closed(upstream));
  }
}
