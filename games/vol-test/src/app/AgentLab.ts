import { RingBuffer } from '@volstudio/core/collections';
import { LAB } from '@/config/lab';
import type { TankCommand } from '@/sim/command';

/** Laboratuvarın okuduğu dünya özeti: düz sayı ve dizgi, JSON'a doğrudan yazılır. */
export interface LabState {
  readonly scenario: string;
  readonly seed: number;
  readonly online: boolean;
  readonly vehicle: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly speed: number;
  readonly health: number;
  readonly alive: boolean;
  readonly vehicles: number;
  readonly projectiles: number;
  readonly paused: boolean;
  readonly extra: Readonly<Record<string, number>>;
}

/** Laboratuvarın sahneye bağlandığı yüzey: okuma ve girdi geçersiz kılma. */
export interface LabSource {
  state(): LabState;
  /** `null` girdiyi bırakır; verilen alanlar oyuncu komutunun üstüne yazılır. */
  setInput(patch: Partial<TankCommand> | null): void;
  /** Oyuncu aracını verilen yere koyar (çevrimdışı alıştırma; çevrimiçi oturumda fırlatır). */
  teleport(x: number, y: number, hull?: number): void;
}

export interface LabRecord {
  readonly t: number;
  readonly ev: string;
  readonly [key: string]: unknown;
}

type Json = Record<string, unknown>;

interface LabCommand {
  readonly description: string;
  run(args: Json): unknown;
}

const INPUT_NUMBERS = ['moveX', 'moveY', 'aimX', 'aimY'] as const;
const INPUT_FLAGS = ['fire', 'boost', 'brake'] as const;

function clampCount(value: unknown): number {
  const count =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : LAB.defaultCount;
  return Math.min(LAB.maxCount, Math.max(1, count));
}

/**
 * Ajan laboratuvarı: bir ajan (insan ya da model) çalışan oyunu `window.volLab` üzerinden okur ve
 * sürer. Komutlar tek kayıttadır (`commands`); her yanıt JSON'a yazılabilir düz veridir. Telemetri
 * sınırlı halkadadır (`jsonl` komutu satır başına bir JSON nesnesi olarak dışa verir), böylece uzun
 * oturumda bellek büyümez. Yalnız `?lab=1` ile açılır ve oyun mantığını değiştirmez: girdi geçersiz
 * kılma oyuncunun kendi komut yolundan geçer; simülasyon saati, RNG ve kurallar aynıdır.
 */
export class AgentLab {
  private readonly telemetry = new RingBuffer<LabRecord>(LAB.telemetryCapacity);
  private readonly events = new RingBuffer<LabRecord>(LAB.eventCapacity);
  private readonly registry = new Map<string, LabCommand>();
  private sampledAt = Number.NEGATIVE_INFINITY;
  private startedAt: number | null = null;
  private lastTimeMs = 0;

  constructor(private readonly source: LabSource) {
    const add = (name: string, description: string, run: LabCommand['run']): void => {
      this.registry.set(name, { description, run });
    };
    add('help', 'Komut adlarını ve açıklamalarını döner.', () => this.help());
    add('state', 'Dünyanın o anki özeti: oyuncu, araç sayısı, senaryo, tohum.', () =>
      structuredClone(this.source.state()),
    );
    add('telemetry', 'Son durum örnekleri (count, en çok 600), eskiden yeniye.', (args) =>
      structuredClone(this.telemetry.toArray().slice(-clampCount(args.count))),
    );
    add('events', 'Son oyun olayları ve işaretler (count, en çok 600), eskiden yeniye.', (args) =>
      structuredClone(this.events.toArray().slice(-clampCount(args.count))),
    );
    add(
      'input',
      'Oyuncu girdisini geçersiz kılar: moveX, moveY, aimX, aimY, fire, boost, brake.',
      (args) => this.setInput(args),
    );
    add('teleport', 'Oyuncu aracını (x, y) noktasına koyar; isteğe bağlı hull (rad).', (args) =>
      this.teleport(args),
    );
    add('release', 'Girdi geçersiz kılmayı bırakır.', () => {
      this.source.setInput(null);
      return { released: true };
    });
    add('mark', 'Olay halkasına etiketli bir işaret yazar (label).', (args) => {
      const label = typeof args.label === 'string' ? args.label.slice(0, 80) : '';
      this.record('mark', { label });
      return { label };
    });
    add(
      'jsonl',
      'Telemetri ve olay halkasını zamana göre sıralı, satır başına bir JSON verir.',
      () => this.jsonl(),
    );
  }

  /** Kayıtlı komut adları; belge ile eşitlik testi bunu okur. */
  get commands(): readonly string[] {
    return [...this.registry.keys()];
  }

  /** Bir komutu çalıştırır; bilinmeyen komut ya da geçersiz argüman fırlatır. */
  run(name: string, args: Json = {}): unknown {
    const command = this.registry.get(name);
    if (!command) throw new RangeError(`Bilinmeyen laboratuvar komutu: ${name}`);
    return command.run(args);
  }

  /** Sahne karesinde çağrılır: örnekleme aralığı dolduysa durum örneği yazar. */
  sample(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < this.lastTimeMs) return;
    this.startedAt ??= timeMs;
    this.lastTimeMs = timeMs;
    if (timeMs - this.sampledAt < LAB.sampleMs) return;
    this.sampledAt = timeMs;
    this.telemetry.push({
      ...structuredClone(this.source.state()),
      t: Math.round(timeMs - this.startedAt),
      ev: 'sample',
    });
  }

  /** Oyun olayını ya da işareti olay halkasına yazar (zaman: son örneklenen sahne saati). */
  record(ev: string, data: Json = {}): void {
    const started = this.startedAt ?? this.lastTimeMs;
    this.events.push({ ...structuredClone(data), t: Math.round(this.lastTimeMs - started), ev });
  }

  private help(): Array<{ name: string; description: string }> {
    return [...this.registry].map(([name, command]) => ({
      name,
      description: command.description,
    }));
  }

  private setInput(args: Json): Json {
    const patch: Partial<TankCommand> = {};
    for (const key of INPUT_NUMBERS) {
      const value = args[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1)
        throw new RangeError(`${key}: [-1, 1] aralığında sayı olmalı`);
      patch[key] = value;
    }
    for (const key of INPUT_FLAGS) {
      const value = args[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') throw new RangeError(`${key}: boolean olmalı`);
      patch[key] = value;
    }
    this.source.setInput(patch);
    return { input: patch };
  }

  private teleport(args: Json): Json {
    const { x, y, hull } = args;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      throw new RangeError('x ve y sonlu sayı olmalı');
    if (hull !== undefined && (typeof hull !== 'number' || !Number.isFinite(hull)))
      throw new RangeError('hull sonlu sayı olmalı');
    this.source.teleport(x, y, hull);
    return { x, y, hull: hull ?? null };
  }

  private jsonl(): string {
    const rows = [
      ...this.telemetry.toArray().slice(-LAB.maxCount),
      ...this.events.toArray().slice(-LAB.maxCount),
    ].sort((a, b) => a.t - b.t);
    return rows.map((row) => JSON.stringify(row)).join('\n');
  }
}

/** `window.volLab`: ajanın çağırdığı tek yüzey. */
export interface VolLabApi {
  readonly commands: readonly string[];
  run(name: string, args?: Json): unknown;
}

/** Laboratuvarı pencereye bağlar ve kaldıran işlevi döner. */
export function installAgentLab(target: object, lab: AgentLab): () => void {
  const host = target as { volLab?: VolLabApi };
  let closed = false;
  const api: VolLabApi = {
    commands: lab.commands,
    run: (name, args) => {
      if (closed) throw new Error('Laboratuvar kapalı.');
      return lab.run(name, args);
    },
  };
  host.volLab = api;
  return () => {
    if (closed) return;
    closed = true;
    if (host.volLab === api) {
      delete host.volLab;
      lab.run('release');
    }
  };
}
