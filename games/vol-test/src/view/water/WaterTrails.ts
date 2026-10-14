import Phaser from 'phaser';
import { WATER_VIEW } from '@/config/waterView';
import type { ChassisKind } from '@/sim/chassis/Chassis';
import type { LakeField, LakeProbe } from '@/sim/world/LakeField';
import { iceFront } from './LakeView';

const TRAILS = WATER_VIEW.trails;
const SINK = WATER_VIEW.sink;

type MarkKind = 'ring' | 'wake' | 'hole' | 'channel' | 'bubble';

interface Mark {
  kind: MarkKind;
  active: boolean;
  x: number;
  y: number;
  angle: number;
  size: number;
  strength: number;
  bornMs: number;
  lifeMs: number;
  seed: number;
}

interface Track {
  x: number;
  y: number;
  wet: boolean;
  seen: number;
}

/** Bir aracın iz için gereken kare durumu. */
export interface TrailSubject {
  readonly id: number;
  readonly kind: ChassisKind;
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly speed: number;
}

const TWO_PI = Math.PI * 2;

function hash(seed: number, index: number): number {
  let value = Math.imul(seed | 0, 73856093) ^ Math.imul(index | 0, 19349663);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * Göldeki araçların yüzey izleri ve batış işaretleri: tek bir Graphics, sabit boyutlu bir havuz.
 * Fiziğe dokunmaz; araç suya girdiği için derinlik `LakeField.depthAt` ile aynı işlevden okunur.
 * Buz yalnız sunumdur (istemci yerel hava): kırık delik, buz örtüsü olan kıyı şeridinde açılır.
 */
export class WaterTrails {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly marks: Mark[] = Array.from({ length: TRAILS.capacity }, () => ({
    kind: 'ring',
    active: false,
    x: 0,
    y: 0,
    angle: 0,
    size: 0,
    strength: 0,
    bornMs: 0,
    lifeMs: 1,
    seed: 0,
  }));
  private readonly tracks = new Map<number, Track>();
  private readonly probeOut: LakeProbe = { lake: -1, depth: 0, s: Infinity };
  private readonly jag = Array.from(
    { length: TRAILS.hole.points },
    () => new Phaser.Math.Vector2(),
  );
  private cursor = 0;
  private frame = 0;
  private clock = 0;
  private seeds = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly lakes: LakeField,
  ) {
    this.graphics = scene.add.graphics().setDepth(TRAILS.depth);
  }

  /** Şu an canlı işaret sayısı (ölçüm ve test). */
  get active(): number {
    let count = 0;
    for (const mark of this.marks) if (mark.active) count++;
    return count;
  }

  /** `kind` türündeki canlı işaret sayısı. */
  count(kind: MarkKind): number {
    let count = 0;
    for (const mark of this.marks) if (mark.active && mark.kind === kind) count++;
    return count;
  }

  /**
   * Her kare: araçların bıraktığı izi üretir ve işaretleri çizer. `ice` [0, 1] göl donma payıdır.
   * `deltaMs` sunum süresidir; duraklatmada sıfır olur ve işaretler donar.
   */
  update(subjects: readonly TrailSubject[], ice: number, deltaMs: number): void {
    this.clock += deltaMs;
    this.frame++;
    const front = ice > 0 ? iceFront(ice) : Infinity;
    for (const subject of subjects) this.follow(subject, front);
    for (const [id, track] of this.tracks) if (track.seen !== this.frame) this.tracks.delete(id);
    this.draw();
  }

  /** Dibe giden aracın üstündeki halkalar ve yükselen kabarcıklar (`radius` aracın yarıçapı). */
  splash(x: number, y: number, radius: number): void {
    for (let ring = 0; ring < SINK.rings; ring++)
      this.add('ring', x, y, 0, radius * (1 + ring * 0.35), 1, ring * SINK.ringGapMs);
    for (let bubble = 0; bubble < SINK.bubbles; bubble++) {
      const seed = this.seeds++;
      const spread = radius * 0.9;
      this.add(
        'bubble',
        x + (hash(seed, 1) - 0.5) * 2 * spread,
        y + (hash(seed, 2) - 0.5) * 2 * spread,
        0,
        2 + hash(seed, 3) * 2.2,
        1,
        hash(seed, 4) * SINK.durationMs * 0.7,
      );
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.tracks.clear();
  }

  private follow(subject: TrailSubject, front: number): void {
    const probe = this.lakes.probe(subject.x, subject.y, this.probeOut);
    const wet = probe.lake >= 0 && probe.depth >= TRAILS.minDepth;
    let track = this.tracks.get(subject.id);
    const fresh = track === undefined;
    if (track === undefined) {
      track = { x: subject.x, y: subject.y, wet: false, seen: 0 };
      this.tracks.set(subject.id, track);
    }
    track.seen = this.frame;
    const spacing = TRAILS.spacing[subject.kind];
    const travelled = Math.hypot(subject.x - track.x, subject.y - track.y);
    if (wet && Math.abs(subject.speed) >= TRAILS.minSpeed && (!track.wet || travelled >= spacing)) {
      this.leave(subject, probe.depth, probe.s >= front && probe.s < 1);
      track.x = subject.x;
      track.y = subject.y;
    } else if (!wet || fresh) {
      track.x = subject.x;
      track.y = subject.y;
    }
    track.wet = wet;
  }

  private leave(subject: TrailSubject, depth: number, onIce: boolean): void {
    const radius = TRAILS.radius[subject.kind];
    const strength = Math.min(1, 0.45 + depth);
    const seed = this.seeds++;
    if (subject.kind === 'hover') {
      if (onIce) this.add('channel', subject.x, subject.y, subject.hull, 1, 1, 0);
      else {
        this.add('wake', subject.x, subject.y, subject.hull, 1, strength, 0);
        this.add('ring', subject.x, subject.y, 0, radius * 0.7, strength * 0.6, 0);
      }
      return;
    }
    if (onIce) this.add('hole', subject.x, subject.y, hash(seed, 7) * TWO_PI, radius, 1, 0);
    else this.add('ring', subject.x, subject.y, 0, radius, strength, 0);
  }

  private add(
    kind: MarkKind,
    x: number,
    y: number,
    angle: number,
    size: number,
    strength: number,
    delayMs: number,
  ): void {
    const mark = this.marks[this.cursor];
    this.cursor = (this.cursor + 1) % this.marks.length;
    mark.kind = kind;
    mark.active = true;
    mark.x = x;
    mark.y = y;
    mark.angle = angle;
    mark.size = size;
    mark.strength = strength;
    mark.bornMs = this.clock + delayMs;
    mark.seed = this.seeds++;
    mark.lifeMs =
      kind === 'ring'
        ? TRAILS.ring.lifeMs
        : kind === 'wake'
          ? TRAILS.wake.lifeMs
          : kind === 'hole'
            ? TRAILS.hole.lifeMs
            : kind === 'channel'
              ? TRAILS.channel.lifeMs
              : SINK.bubbleLifeMs;
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    for (const mark of this.marks) {
      if (!mark.active) continue;
      const age = this.clock - mark.bornMs;
      if (age < 0) continue;
      const t = age / mark.lifeMs;
      if (t >= 1) {
        mark.active = false;
        continue;
      }
      switch (mark.kind) {
        case 'ring':
          this.drawRing(g, mark, t);
          break;
        case 'wake':
          this.drawWake(g, mark, t);
          break;
        case 'hole':
          this.drawHole(g, mark, t);
          break;
        case 'channel':
          this.drawChannel(g, mark, t);
          break;
        default:
          this.drawBubble(g, mark, t);
      }
    }
  }

  private drawRing(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { grow, width, alpha } = TRAILS.ring;
    const eased = 1 - (1 - t) * (1 - t);
    g.lineStyle(width, TRAILS.color, alpha * mark.strength * (1 - t));
    g.strokeCircle(mark.x, mark.y, mark.size * (0.35 + (grow - 0.35) * eased));
  }

  private drawWake(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { spread, length, width, alpha } = TRAILS.wake;
    const back = mark.angle + Math.PI;
    const reach = length * (0.25 + 0.75 * t);
    const fade = alpha * mark.strength * (1 - t);
    g.lineStyle(width, TRAILS.color, fade);
    for (const side of [-1, 1]) {
      const angle = back + side * spread * (0.6 + 0.4 * t);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      g.lineBetween(
        mark.x + cos * reach * 0.18,
        mark.y + sin * reach * 0.18,
        mark.x + cos * reach,
        mark.y + sin * reach,
      );
    }
  }

  private drawHole(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { color, edge, edgeWidth, points } = TRAILS.hole;
    // Su yavaş yavaş yeniden donar: delik son payda soluk bir buz tabakasıyla kapanır.
    const fade = Math.min(1, (1 - t) * 2.2);
    const open = Math.min(1, 0.55 + t * 4);
    for (let index = 0; index < points; index++) {
      const angle = mark.angle + (index / points) * TWO_PI;
      const radius = mark.size * open * (0.62 + 0.55 * hash(mark.seed, index));
      this.jag[index].set(
        mark.x + Math.cos(angle) * radius,
        mark.y + Math.sin(angle) * radius * 0.82,
      );
    }
    g.fillStyle(color, 0.85 * fade);
    g.fillPoints(this.jag, true);
    g.lineStyle(edgeWidth, edge, 0.75 * fade);
    g.strokePoints(this.jag, true, true);
  }

  private drawChannel(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { color, width, length } = TRAILS.channel;
    const cos = Math.cos(mark.angle) * length * 0.5;
    const sin = Math.sin(mark.angle) * length * 0.5;
    g.lineStyle(width * (1 - t * 0.5), color, 0.7 * (1 - t));
    g.lineBetween(mark.x - cos, mark.y - sin, mark.x + cos, mark.y + sin);
  }

  private drawBubble(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const rise = SINK.bubbleRise * t;
    g.lineStyle(1.2, TRAILS.color, 0.7 * (1 - t));
    g.strokeCircle(mark.x, mark.y - rise, mark.size * (0.7 + 0.5 * t));
  }
}
