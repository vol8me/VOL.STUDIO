import { LAKE, type LakeHarmonic, type LakeSpec } from '@/config/lakes';

/** Bir gölün dünya çerçevesindeki hazır şekli. */
export interface Lake {
  readonly id: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly cos: number;
  readonly sin: number;
  readonly shape: readonly LakeHarmonic[];
  /** Merkezden kıyı şeridinin dışına en uzak mesafe: bunun ötesi kesin sudan uzaktır. */
  readonly reach: number;
}

/** Bir noktanın göle göre durumu: `depth` [0, 1], `edge` kıyı oranı (0 kıyıda, 1 merkezde). */
export interface LakeProbe {
  lake: number;
  depth: number;
  /** Merkezden kıyıya normalize uzaklık: 1 kıyı çizgisidir, 1'den küçük içeridir, büyük dışarıdır. */
  s: number;
}

const GRADIENT_STEP = 24;

const smooth = (value: number): number => {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
};

/**
 * Sabit göllerin saf geometrisi. Derinlik tek bir işlevdir (`depthAt`): simülasyon yavaşlamayı,
 * hasarı ve boğulmayı, görünüm derinlik bantlarını ve kıyıyı, bot kaçınmayı ve spawn denetimi aynı
 * işlevden okur; iki kaynak olmadığından çizilen kıyı ile fizik kıyısı ayrışamaz. Durumu yoktur:
 * sunucu ve istemci aynı tablodan aynı alanı kurar.
 */
export class LakeField {
  readonly lakes: readonly Lake[];

  constructor(width: number, height: number, specs: readonly LakeSpec[] = []) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new RangeError('Göl alanı ölçüleri sonlu ve pozitif olmalı.');
    const scale = Math.min(width, height) / LAKE.referenceSize;
    this.lakes = specs.map((spec, index) => {
      const amplitude = spec.shape.reduce((sum, harmonic) => sum + harmonic[1], 0);
      if (amplitude >= 0.5) throw new RangeError(`Göl şekli kendini keser: ${spec.id}`);
      const rx = spec.rx * scale;
      const ry = spec.ry * scale;
      return {
        id: spec.id,
        index,
        x: spec.x * width,
        y: spec.y * height,
        rx,
        ry,
        cos: Math.cos(spec.rotation),
        sin: Math.sin(spec.rotation),
        shape: spec.shape,
        reach: Math.max(rx, ry) * (1 + amplitude) * (1 + LAKE.bank),
      };
    });
  }

  get isEmpty(): boolean {
    return this.lakes.length === 0;
  }

  /** Noktanın gölün kıyı oranı `s`'i: merkezde 0, kıyıda 1, uzakta büyük (`Infinity` menzil dışı). */
  ratio(lake: Lake, x: number, y: number): number {
    const dx = x - lake.x;
    const dy = y - lake.y;
    if (dx * dx + dy * dy > lake.reach * lake.reach) return Infinity;
    const u = (dx * lake.cos + dy * lake.sin) / lake.rx;
    const v = (-dx * lake.sin + dy * lake.cos) / lake.ry;
    const rho = Math.hypot(u, v);
    if (rho === 0) return 0;
    const theta = Math.atan2(v, u);
    let bound = 1;
    for (const [count, amplitude, phase] of lake.shape)
      bound += amplitude * Math.cos(count * theta + phase);
    return rho / bound;
  }

  /** Kıyı oranından [0, 1] derinlik: kıyıda sıfır, `shelf` genişliğinde eğimle tam derinliğe iner. */
  depthOfRatio(s: number): number {
    return s >= 1 ? 0 : smooth((1 - s) / LAKE.shelf);
  }

  /** Noktanın su derinliği [0, 1]; göllerin dışı 0'dır. */
  depthAt(x: number, y: number): number {
    let best = 0;
    for (const lake of this.lakes) {
      const depth = this.depthOfRatio(this.ratio(lake, x, y));
      if (depth > best) best = depth;
    }
    return best;
  }

  /** Noktanın en yakın gölü ve derinliği (`out` yeniden kullanılır); göl yoksa `lake` -1'dir. */
  probe(x: number, y: number, out: LakeProbe): LakeProbe {
    out.lake = -1;
    out.depth = 0;
    out.s = Infinity;
    for (const lake of this.lakes) {
      const s = this.ratio(lake, x, y);
      if (s < out.s) {
        out.s = s;
        out.lake = lake.index;
        out.depth = this.depthOfRatio(s);
      }
    }
    return out;
  }

  /**
   * Derinliğin yükseldiği yön (birim vektör `out`'a yazılır; düz zeminde sıfır). Bot kaçınma bunun
   * tersine, boğulan araç kıyıya çıkış yönü olarak da bunun tersine gider.
   */
  gradient(x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
    const h = GRADIENT_STEP;
    const gx = this.depthAt(x + h, y) - this.depthAt(x - h, y);
    const gy = this.depthAt(x, y + h) - this.depthAt(x, y - h);
    const length = Math.hypot(gx, gy);
    out.x = length > 1e-9 ? gx / length : 0;
    out.y = length > 1e-9 ? gy / length : 0;
    return out;
  }

  /**
   * Göl kıyısının (ya da `scale` > 1 ile kıyı şeridinin dış kenarının) kapalı çokgeni: `points`
   * nokta, `[x0, y0, x1, y1, ...]`. Sunum ve harita bunu bir kez kurar; kare başına hesap yoktur.
   */
  outline(lake: Lake, scale = 1, points: number = LAKE.outlinePoints): Float64Array {
    const out = new Float64Array(points * 2);
    for (let index = 0; index < points; index++) {
      const theta = (index / points) * Math.PI * 2;
      let bound = 1;
      for (const [count, amplitude, phase] of lake.shape)
        bound += amplitude * Math.cos(count * theta + phase);
      const u = Math.cos(theta) * lake.rx * bound * scale;
      const v = Math.sin(theta) * lake.ry * bound * scale;
      out[index * 2] = lake.x + u * lake.cos - v * lake.sin;
      out[index * 2 + 1] = lake.y + u * lake.sin + v * lake.cos;
    }
    return out;
  }
}
