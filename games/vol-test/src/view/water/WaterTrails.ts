import Phaser from 'phaser';
import { WATER_VIEW } from '@/config/waterView';
import type { ChassisKind } from '@/sim/chassis/Chassis';
import type { LakeField, LakeProbe } from '@/sim/world/LakeField';
import { iceFront } from './LakeView';

const TRAILS = WATER_VIEW.trails;
const SINK = WATER_VIEW.sink;
const WAKE = TRAILS.wake;
const CRACK = TRAILS.crack;
const SHARD = TRAILS.shard;

type MarkKind = 'ring' | 'wake' | 'hole' | 'channel' | 'bubble' | 'crack' | 'shard';

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

/** Aracın arkasında akan su yarığı: eski noktadan yeniye halka tampon (x, y, doğum ms). */
interface Ribbon {
  readonly points: Float32Array;
  head: number;
  count: number;
  /** Şu anki konum ve yön (araç hareket ediyorsa şeridin başı). */
  x: number;
  y: number;
  heading: number;
  moving: boolean;
  width: number;
  power: number;
  lastMs: number;
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

interface Pt {
  x: number;
  y: number;
}

/**
 * Göldeki araçların yüzey izleri ve batış işaretleri: tek bir Graphics, sabit boyutlu bir havuz.
 * Fiziğe dokunmaz; araç suya girdiği için derinlik `LakeField.depthAt` ile aynı işlevden okunur.
 * Buz yalnız sunumdur (istemci yerel hava): kırık delik, buz örtüsü olan kıyı şeridinde açılır; yıldız
 * çatlak ve yüzen buz parçaları deliğin etrafında kalır. Açık suda araç, arkasında sürekli bir yarık
 * (açılan ve kapanan koyu su), yayılan köpüklü kollar ve önünde pruva dalgası bırakır.
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
  private readonly ribbons = new Map<number, Ribbon>();
  private readonly probeOut: LakeProbe = { lake: -1, depth: 0, s: Infinity };
  private readonly jag = Array.from(
    { length: TRAILS.hole.points },
    () => new Phaser.Math.Vector2(),
  );
  /** Şerit çokgeni ve kolları için yeniden kullanılan noktalar (sol, sağ, çokgen). */
  private readonly left: Pt[] = Array.from({ length: WAKE.points + 1 }, () => ({ x: 0, y: 0 }));
  private readonly right: Pt[] = Array.from({ length: WAKE.points + 1 }, () => ({ x: 0, y: 0 }));
  private readonly armLeft: Pt[] = Array.from({ length: WAKE.points + 1 }, () => ({ x: 0, y: 0 }));
  private readonly armRight: Pt[] = Array.from({ length: WAKE.points + 1 }, () => ({ x: 0, y: 0 }));
  private readonly poly: Pt[] = Array.from({ length: (WAKE.points + 1) * 2 }, () => ({
    x: 0,
    y: 0,
  }));
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

  /** Canlı su yarığı (şerit) sayısı: arkasında iz taşıyan araç sayısı (ölçüm ve test). */
  get ribbonCount(): number {
    return this.ribbons.size;
  }

  /**
   * Her kare: araçların bıraktığı izi üretir ve işaretleri çizer. `ice` [0, 1] göl donma payıdır.
   * `deltaMs` sunum süresidir; duraklatmada sıfır olur ve işaretler donar.
   */
  update(subjects: readonly TrailSubject[], ice: number, deltaMs: number): void {
    this.clock += deltaMs;
    this.frame++;
    const front = ice > 0 ? iceFront(ice) : Infinity;
    for (const ribbon of this.ribbons.values()) ribbon.moving = false;
    for (const subject of subjects) this.follow(subject, front);
    for (const [id, track] of this.tracks) if (track.seen !== this.frame) this.tracks.delete(id);
    this.draw();
  }

  /** Dibe giden aracın üstündeki halkalar ve yükselen kabarcıklar (`radius` aracın yarıçapı). */
  splash(x: number, y: number, radius: number): void {
    for (let ring = 0; ring < SINK.rings; ring++)
      this.add('ring', x, y, 0, radius * (1 + ring * 0.35), 1, ring * SINK.ringGapMs);
    // Gövde kapanırken yüzeye vuran son kabarma: geniş, güçlü halka.
    this.add('ring', x, y, 0, radius * SINK.boil.radius, 1, SINK.durationMs * SINK.boil.at);
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
        hash(seed, 4) * SINK.durationMs * 0.9,
      );
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.tracks.clear();
    this.ribbons.clear();
  }

  private follow(subject: TrailSubject, front: number): void {
    const probe = this.lakes.probe(subject.x, subject.y, this.probeOut);
    const wet = probe.lake >= 0 && probe.depth >= TRAILS.minDepth;
    const onIce = wet && probe.s >= front && probe.s < 1;
    let track = this.tracks.get(subject.id);
    const fresh = track === undefined;
    if (track === undefined) {
      track = { x: subject.x, y: subject.y, wet: false, seen: 0 };
      this.tracks.set(subject.id, track);
    }
    track.seen = this.frame;
    const spacing = TRAILS.spacing[subject.kind];
    const travelled = Math.hypot(subject.x - track.x, subject.y - track.y);
    const moving = wet && Math.abs(subject.speed) >= TRAILS.minSpeed;
    if (moving && (!track.wet || travelled >= spacing)) {
      this.leave(subject, probe.depth, onIce);
      track.x = subject.x;
      track.y = subject.y;
    } else if (!wet || fresh) {
      track.x = subject.x;
      track.y = subject.y;
    }
    track.wet = wet;
    if (moving && !onIce) this.stream(subject, probe.depth);
  }

  /** Açık suda ilerleyen aracın yarığına nokta ekler; başı aracın o anki konumudur. */
  private stream(subject: TrailSubject, depth: number): void {
    let ribbon = this.ribbons.get(subject.id);
    if (ribbon === undefined) {
      ribbon = {
        points: new Float32Array(WAKE.points * 3),
        head: 0,
        count: 0,
        x: subject.x,
        y: subject.y,
        heading: subject.hull,
        moving: true,
        width: 0,
        power: 0,
        lastMs: this.clock,
      };
      this.ribbons.set(subject.id, ribbon);
    }
    ribbon.moving = true;
    ribbon.width = TRAILS.radius[subject.kind] * WAKE.widthScale;
    // Hızla ve derinlikle güçlenir; yüzeyde süzülen araç kalın bir iz bırakır, yürüyen daha silik.
    const speed = Math.min(1, Math.abs(subject.speed) / WAKE.fullSpeed);
    ribbon.power = Math.min(1, (0.35 + 0.65 * speed) * (0.55 + 0.45 * Math.min(1, depth * 2)));
    ribbon.heading = subject.hull;
    ribbon.x = subject.x;
    ribbon.y = subject.y;
    ribbon.lastMs = this.clock;
    const last = ribbon.count > 0 ? (ribbon.head + WAKE.points - 1) % WAKE.points : -1;
    const lastX = last >= 0 ? ribbon.points[last * 3] : Infinity;
    const lastY = last >= 0 ? ribbon.points[last * 3 + 1] : Infinity;
    if (Math.hypot(subject.x - lastX, subject.y - lastY) < WAKE.sample) return;
    const at = ribbon.head * 3;
    ribbon.points[at] = subject.x;
    ribbon.points[at + 1] = subject.y;
    ribbon.points[at + 2] = this.clock;
    ribbon.head = (ribbon.head + 1) % WAKE.points;
    if (ribbon.count < WAKE.points) ribbon.count++;
  }

  private leave(subject: TrailSubject, depth: number, onIce: boolean): void {
    const radius = TRAILS.radius[subject.kind];
    const strength = Math.min(1, 0.45 + depth);
    const seed = this.seeds++;
    if (subject.kind === 'hover') {
      if (onIce) this.add('channel', subject.x, subject.y, subject.hull, 1, 1, 0);
      else {
        this.add('wake', subject.x, subject.y, subject.hull, 1, strength, 0);
      }
      return;
    }
    if (onIce) {
      // Ağır araç buzu kırar: koyu su deliği, çevresinde yıldız çatlak ve yüzen buz parçaları.
      const angle = hash(seed, 7) * TWO_PI;
      this.add('hole', subject.x, subject.y, angle, radius, 1, 0);
      this.add('crack', subject.x, subject.y, angle + 0.5, radius, 1, 0);
      for (let shard = 0; shard < SHARD.count; shard++)
        this.add(
          'shard',
          subject.x,
          subject.y,
          angle + (shard / SHARD.count) * TWO_PI + hash(seed, 20 + shard),
          radius,
          1,
          0,
        );
    } else this.add('ring', subject.x, subject.y, 0, radius, strength, 0);
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
              : kind === 'crack'
                ? CRACK.lifeMs
                : kind === 'shard'
                  ? SHARD.lifeMs
                  : SINK.bubbleLifeMs;
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    // Sürekli su yarıkları marklardan önce: halka ve kırıklar üstte kalır.
    for (const [id, ribbon] of this.ribbons) {
      if (!this.drawRibbon(g, ribbon)) this.ribbons.delete(id);
    }
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
        case 'crack':
          this.drawCrack(g, mark, t);
          break;
        case 'shard':
          this.drawShard(g, mark, t);
          break;
        default:
          this.drawBubble(g, mark, t);
      }
    }
  }

  /**
   * Aracın arkasındaki yarığı çizer; hâlâ görünür bir şey kaldıysa `true` verir. Orta şerit su yarıldığı
   * için koyudur ve zamanla kapanır; yanlardaki kollar mesafeyle açılır (Kelvin kamasına yakın) ve
   * üstünde çapraz dalga sırtları vardır; tepede pruva dalgası ve kıçta köpük kalır.
   */
  private drawRibbon(g: Phaser.GameObjects.Graphics, ribbon: Ribbon): boolean {
    // Başın ardına en yeniden en eskiye dizilen noktalar; süresi dolanlar bırakılır.
    const left = this.left;
    const right = this.right;
    const armLeft = this.armLeft;
    const armRight = this.armRight;
    let shown = 0;
    let distance = 0;
    let previousX = ribbon.x;
    let previousY = ribbon.y;
    let nx = -Math.sin(ribbon.heading);
    let ny = Math.cos(ribbon.heading);
    const headFresh = ribbon.moving;
    // 0. nokta: aracın kendisi (yalnız hareket ederken); yoksa yalnızca geçmiş noktalar.
    const total = ribbon.count + (headFresh ? 1 : 0);
    for (let index = 0; index < total && shown < left.length; index++) {
      let x: number;
      let y: number;
      let born: number;
      if (headFresh && index === 0) {
        x = ribbon.x;
        y = ribbon.y;
        born = this.clock;
      } else {
        const offset = headFresh ? index - 1 : index;
        const slot = (ribbon.head - 1 - offset + WAKE.points * 2) % WAKE.points;
        x = ribbon.points[slot * 3];
        y = ribbon.points[slot * 3 + 1];
        born = ribbon.points[slot * 3 + 2];
      }
      const age = this.clock - born;
      if (age >= WAKE.lifeMs) break;
      if (shown > 0) {
        const dx = previousX - x;
        const dy = previousY - y;
        const length = Math.hypot(dx, dy);
        if (length > 0.001) {
          nx = -dy / length;
          ny = dx / length;
        }
        distance += length;
      }
      previousX = x;
      previousY = y;
      const u = age / WAKE.lifeMs;
      // Şerit zamanla kapanır; kollar yol uzadıkça açılır ve sönerken dışa kayar.
      const half = ribbon.width * 0.5 * (1 - 0.55 * u);
      const arm =
        ribbon.width * 0.5 + Math.min(WAKE.armMax, distance * WAKE.armSpread) * (0.6 + 0.4 * u);
      left[shown].x = x + nx * half;
      left[shown].y = y + ny * half;
      right[shown].x = x - nx * half;
      right[shown].y = y - ny * half;
      armLeft[shown].x = x + nx * arm;
      armLeft[shown].y = y + ny * arm;
      armRight[shown].x = x - nx * arm;
      armRight[shown].y = y - ny * arm;
      shown++;
    }
    if (shown < 2) return ribbon.moving || shown > 0;

    const power = ribbon.power;
    const poly = this.poly;
    for (let index = 0; index < shown; index++) {
      poly[index].x = left[index].x;
      poly[index].y = left[index].y;
      poly[shown * 2 - 1 - index].x = right[index].x;
      poly[shown * 2 - 1 - index].y = right[index].y;
    }
    // Yarık: koyu su şeridi (sığlıkta açık). Gradyan yok: iki üst üste şerit uç yumuşaklığı verir.
    g.fillStyle(WAKE.channelColor, WAKE.channelAlpha * power);
    this.path(g, poly, shown * 2);
    g.closePath();
    g.fillPath();

    // Kollar: iki taraf, uç noktada solar; kenar çizgileri şeridi belirtir.
    g.lineStyle(WAKE.armWidth, WAKE.color, WAKE.armAlpha * power);
    this.path(g, armLeft, shown);
    g.strokePath();
    this.path(g, armRight, shown);
    g.strokePath();
    g.lineStyle(WAKE.edgeWidth, WAKE.color, WAKE.edgeAlpha * power);
    this.path(g, left, shown);
    g.strokePath();
    this.path(g, right, shown);
    g.strokePath();

    // Çapraz dalga sırtları: koldan içeri doğru geri eğik kısa çizgiler; yaşla seyrekleşir.
    g.lineStyle(WAKE.crestWidth, WAKE.color, WAKE.crestAlpha * power);
    g.beginPath();
    for (let index = 1; index < shown; index += 2) {
      const fade = 1 - index / shown;
      for (const arm of [armLeft, armRight]) {
        const point = arm[index];
        const centre = (left[index].x + right[index].x) / 2;
        const middle = (left[index].y + right[index].y) / 2;
        // Sırt, kol ile şerit arasında kolun dışa bakan yönüne dik kısa bir parça.
        const toX = centre - point.x;
        const toY = middle - point.y;
        const length = Math.hypot(toX, toY) || 1;
        const reach = WAKE.crestLength * fade * (0.6 + 0.4 * hash(index, 7));
        g.moveTo(point.x, point.y);
        g.lineTo(point.x + (toX / length) * reach, point.y + (toY / length) * reach);
      }
    }
    g.strokePath();

    // Kıç köpüğü: en yeni birkaç noktada, şeridin ortasında küçük beyaz lekeler.
    if (ribbon.moving) {
      g.fillStyle(WAKE.color, WAKE.foamAlpha * power);
      const foam = Math.min(WAKE.foamPoints, shown);
      for (let index = 0; index < foam; index++) {
        const centreX = (left[index].x + right[index].x) / 2;
        const centreY = (left[index].y + right[index].y) / 2;
        const spread = ribbon.width * 0.3;
        const fade = 1 - index / (foam + 1);
        const jitterSeed = (ribbon.lastMs | 0) + index * 17;
        g.fillCircle(
          centreX + (hash(jitterSeed, 1) - 0.5) * spread,
          centreY + (hash(jitterSeed, 2) - 0.5) * spread,
          (1.1 + 1.4 * hash(jitterSeed, 3)) * fade,
        );
      }
      // Pruva dalgası: araçtan önce, gövde genişliğinde bir yay ve iki yana kaçan su.
      const bow = ribbon.width * WAKE.bowScale;
      g.lineStyle(WAKE.bowWidth, WAKE.color, WAKE.bowAlpha * power);
      g.beginPath();
      g.arc(
        ribbon.x + Math.cos(ribbon.heading) * bow * 0.35,
        ribbon.y + Math.sin(ribbon.heading) * bow * 0.35,
        bow,
        ribbon.heading - WAKE.bowArc,
        ribbon.heading + WAKE.bowArc,
        false,
      );
      g.strokePath();
    }
    return true;
  }

  /** `points`in ilk `count` noktasından bir yol kurar (çizimi çağıran yapar). */
  private path(g: Phaser.GameObjects.Graphics, points: readonly Pt[], count: number): void {
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < count; index++) g.lineTo(points[index].x, points[index].y);
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

  /**
   * Yıldız çatlak: delikten dışarı beş altı kırık ışın, ucu yarılır; kırık ayrı yaşar ve delik kapandıktan
   * sonra da uzun süre seçilir (buz yeniden donsa da çizik kalır).
   */
  private drawCrack(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { rays, reach, width, alpha, color, shade } = CRACK;
    // Kırık önce hızla açılır (ilk %12), sonra yalnız söner.
    const grow = Math.min(1, t / 0.12);
    const fade = (1 - t) * (1 - t);
    for (const pass of [0, 1]) {
      g.lineStyle(
        pass === 0 ? width * 1.8 : width,
        pass === 0 ? shade : color,
        alpha * fade * (pass === 0 ? 0.55 : 1),
      );
      g.beginPath();
      for (let ray = 0; ray < rays; ray++) {
        const base = mark.angle + (ray / rays) * TWO_PI + (hash(mark.seed, ray) - 0.5) * 0.7;
        const length = mark.size * reach * (0.55 + 0.9 * hash(mark.seed, 40 + ray)) * grow;
        let x = mark.x + Math.cos(base) * mark.size * 0.7;
        let y = mark.y + Math.sin(base) * mark.size * 0.7 * 0.82;
        g.moveTo(x, y);
        // Üç kırık parça: her biri bir öncekinden biraz sapar.
        for (let part = 1; part <= 3; part++) {
          const turn = base + (hash(mark.seed, 80 + ray * 3 + part) - 0.5) * 0.9;
          x += Math.cos(turn) * (length / 3);
          y += Math.sin(turn) * (length / 3) * 0.82;
          g.lineTo(x, y);
        }
        // Uçtan yarılan kısa çatal.
        const fork = base + (hash(mark.seed, 120 + ray) > 0.5 ? 0.7 : -0.7);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(fork) * length * 0.18, y + Math.sin(fork) * length * 0.18 * 0.82);
      }
      g.strokePath();
    }
  }

  /** Delikten savrulan, yavaş dönen küçük buz parçası: açık kenarlı ve uzaklaştıkça solar. */
  private drawShard(g: Phaser.GameObjects.Graphics, mark: Mark, t: number): void {
    const { color, edge, size, drift } = SHARD;
    const travel = drift * (1 - (1 - t) * (1 - t)) * (0.6 + 0.8 * hash(mark.seed, 1));
    const x = mark.x + Math.cos(mark.angle) * (mark.size * 0.6 + travel);
    const y = mark.y + Math.sin(mark.angle) * (mark.size * 0.6 + travel) * 0.82;
    const spin = mark.angle + t * 2.4 * (hash(mark.seed, 2) - 0.5);
    const scale = size * (0.7 + 0.6 * hash(mark.seed, 3));
    const fade = Math.min(1, (1 - t) * 1.6);
    for (let corner = 0; corner < 4; corner++) {
      const turn = spin + (corner / 4) * TWO_PI;
      const radius = scale * (0.55 + 0.7 * hash(mark.seed, 10 + corner));
      this.jag[corner].set(x + Math.cos(turn) * radius, y + Math.sin(turn) * radius * 0.8);
    }
    const shape = this.jag.slice(0, 4);
    g.fillStyle(color, 0.85 * fade);
    g.fillPoints(shape, true);
    g.lineStyle(1.1, edge, 0.8 * fade);
    g.strokePoints(shape, true, true);
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
