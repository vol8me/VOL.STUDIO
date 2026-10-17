import type { Wall } from '@volstudio/core/physics';
import { createRandom } from '@volstudio/core/random';
import { ROCKS, type OutcropSpec } from '@/config/rocks';

/** Tek bir kaya (lob): daire şeklinde fizik, kubbe profilinde yükseklik. */
export interface Rock {
  readonly outcrop: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Tırmanış yüksekliği [0, 1]. */
  readonly height: number;
  /** Görünümün düzensiz çokgeni için tohum. */
  readonly seed: number;
}

/** Bir öbeğin dünya çerçevesindeki hazır şekli. */
export interface Outcrop {
  readonly id: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  /** Merkezden en uzak lob kenarı: bunun ötesi kesin kayadan uzaktır. */
  readonly reach: number;
  readonly rocks: readonly Rock[];
}

interface MutableWall {
  nx: number;
  ny: number;
  offset: number;
}

const smooth = (value: number): number => {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
};

/**
 * Sabit kayaların saf geometrisi. Çarpışma, tırmanış, mermi engeli, bot kaçınma ve çizim aynı
 * lobları okur; iki kaynak olmadığından çizilen kaya ile fizik kayası ayrışamaz. Durumu yoktur:
 * sunucu ve istemci aynı tablodan aynı alanı kurar.
 */
export class RockField {
  readonly outcrops: readonly Outcrop[];
  readonly rocks: readonly Rock[];
  private readonly pool: MutableWall[] = [];

  constructor(width: number, height: number, specs: readonly OutcropSpec[] = []) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new RangeError('Kaya alanı ölçüleri sonlu ve pozitif olmalı.');
    const scale = Math.min(width, height) / ROCKS.referenceSize;
    const all: Rock[] = [];
    this.outcrops = specs.map((spec, index) => {
      const random = createRandom(spec.seed);
      const span = spec.radius * scale;
      const cx = spec.x * width;
      const cy = spec.y * height;
      const rocks: Rock[] = [];
      let reach = 0;
      const [minRadius, maxRadius] = ROCKS.lobeRadius;
      const [minHeight, maxHeight] = ROCKS.height;
      for (let lobe = 0; lobe < spec.lobes; lobe++) {
        const radius = span * (minRadius + random.next() * (maxRadius - minRadius));
        // İlk lob merkezdedir; diğerleri halkada dağılır, yayılımı aşmaz.
        const ring =
          lobe === 0 ? 0 : (span - radius) * ROCKS.scatter * (0.45 + 0.55 * random.next());
        const angle = ((lobe + random.next() * 0.6) / spec.lobes) * Math.PI * 2;
        const rock: Rock = {
          outcrop: index,
          x: cx + Math.cos(angle) * ring,
          y: cy + Math.sin(angle) * ring,
          radius,
          height: minHeight + random.next() * (maxHeight - minHeight),
          seed: Math.floor(random.next() * 0x7fffffff),
        };
        reach = Math.max(reach, Math.hypot(rock.x - cx, rock.y - cy) + radius);
        rocks.push(rock);
        all.push(rock);
      }
      return { id: spec.id, index, x: cx, y: cy, reach, rocks };
    });
    this.rocks = all;
  }

  get isEmpty(): boolean {
    return this.rocks.length === 0;
  }

  /** Noktanın kaya yüksekliği [0, 1]: en yüksek lobun kubbe profili; kaya dışı 0'dır. */
  heightAt(x: number, y: number): number {
    let best = 0;
    for (const outcrop of this.outcrops) {
      const dx = x - outcrop.x;
      const dy = y - outcrop.y;
      if (dx * dx + dy * dy > outcrop.reach * outcrop.reach) continue;
      for (const rock of outcrop.rocks) {
        const d = Math.hypot(x - rock.x, y - rock.y);
        if (d >= rock.radius) continue;
        const profile = rock.height * smooth((1 - d / rock.radius) / (1 - ROCKS.plateau));
        if (profile > best) best = profile;
      }
    }
    return best;
  }

  /** Nokta bir kayanın (görsel) içinde mi? Doğma ve yerleştirme denetimi için. */
  covers(x: number, y: number, margin = 0): boolean {
    for (const outcrop of this.outcrops) {
      const dx = x - outcrop.x;
      const dy = y - outcrop.y;
      const reach = outcrop.reach + margin;
      if (dx * dx + dy * dy > reach * reach) continue;
      for (const rock of outcrop.rocks)
        if (Math.hypot(x - rock.x, y - rock.y) < rock.radius + margin) return true;
    }
    return false;
  }

  /**
   * Dönük dikdörtgen ayak izinin değdiği her lob için teğet bir duvar üretir ve `out`a ekler; eklenen
   * sayıyı döndürür. Duvarın normali kayadan gövdeye bakar ve gövdenin kayaya en yakın noktasından
   * geçer; böylece `resolveWallContacts` kaya teması için de duvar çözümünü yeniden kullanır.
   * Duvar nesneleri havuzdandır: adım başına ayırma yoktur.
   */
  contactWalls(
    x: number,
    y: number,
    angle: number,
    halfLength: number,
    halfWidth: number,
    out: Wall[],
  ): number {
    const body = Math.hypot(halfLength, halfWidth);
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    let count = 0;
    for (const outcrop of this.outcrops) {
      const ox = x - outcrop.x;
      const oy = y - outcrop.y;
      const near = outcrop.reach + body;
      if (ox * ox + oy * oy > near * near) continue;
      for (const rock of outcrop.rocks) {
        const radius = rock.radius * ROCKS.collisionInset;
        // Kaya merkezini gövde çerçevesine al; kutudaki en yakın nokta temas noktasıdır.
        const dx = rock.x - x;
        const dy = rock.y - y;
        const lx = dx * fx + dy * fy;
        const ly = -dx * fy + dy * fx;
        const qx = Math.max(-halfLength, Math.min(halfLength, lx));
        const qy = Math.max(-halfWidth, Math.min(halfWidth, ly));
        const gx = qx - lx;
        const gy = qy - ly;
        const gap = Math.hypot(gx, gy);
        if (gap >= radius) continue;
        // Kaya → gövde yönü (gövde çerçevesi). Merkez kutunun içindeyse gövde merkezine bakar.
        let ux = gx;
        let uy = gy;
        if (gap < 1e-6) {
          ux = -lx;
          uy = -ly;
          if (Math.hypot(ux, uy) < 1e-6) {
            ux = 1;
            uy = 0;
          }
        }
        const length = Math.hypot(ux, uy);
        ux /= length;
        uy /= length;
        const nx = ux * fx - uy * fy;
        const ny = ux * fy + uy * fx;
        const wall = (this.pool[count] ??= { nx: 0, ny: 0, offset: 0 });
        wall.nx = nx;
        wall.ny = ny;
        wall.offset = nx * rock.x + ny * rock.y + radius;
        out.push(wall);
        count++;
      }
    }
    return count;
  }

  /**
   * Doğru parçanın (`px,py → x,y`) ilk kayaya girdiği parametre `t` [0, 1]; kaya yoksa -1. Mermi
   * engeli ve nişan önizlemesi bunu kullanır. `h0` ve `h1` mermisinin parça başındaki ve sonundaki
   * yüksekliğidir: kayanın siper yüksekliğinin üstünden uçan mermi kayayı aşar. Başlangıç kayanın
   * içindeyse (ve siper altındaysa) 0 döner.
   */
  segmentHit(px: number, py: number, x: number, y: number, h0 = 0, h1 = h0): number {
    const sx = x - px;
    const sy = y - py;
    const a = sx * sx + sy * sy;
    let best = -1;
    for (const outcrop of this.outcrops) {
      // Parçanın öbek merkezine en yakın noktası menzil dışındaysa lobları denemeye gerek yok.
      const t =
        a === 0 ? 0 : Math.max(0, Math.min(1, ((outcrop.x - px) * sx + (outcrop.y - py) * sy) / a));
      const cx = px + sx * t - outcrop.x;
      const cy = py + sy * t - outcrop.y;
      if (cx * cx + cy * cy > outcrop.reach * outcrop.reach) continue;
      for (const rock of outcrop.rocks) {
        const top = rock.height * ROCKS.coverHeight;
        if (h0 >= top && h1 >= top) continue;
        const r = rock.radius * ROCKS.collisionInset;
        const mx = px - rock.x;
        const my = py - rock.y;
        const c = mx * mx + my * my - r * r;
        if (c <= 0) {
          // Başlangıç kayanın içinde: yamacın yüzeyinin altındaysa duvardır (0), üstündeyse kayada duran
          // atıcıdır ve kendi kayasını yok sayar. Yüzey yüksekliği kenara doğru düşer; silindir tavanı değil.
          if (h0 < top && h0 < this.heightAt(px, py) * ROCKS.coverHeight) return 0;
          continue;
        }
        if (a === 0) continue;
        const b = mx * sx + my * sy;
        const disc = b * b - a * c;
        if (disc < 0) continue;
        const hit = (-b - Math.sqrt(disc)) / a;
        if (hit < 0 || hit > 1) continue;
        if (h0 + (h1 - h0) * hit >= top) continue;
        if (best < 0 || hit < best) best = hit;
      }
    }
    return best;
  }

  /**
   * En yakın kayanın yüzeyine uzaklık (kaya içindeyse negatif) ve kayadan noktaya birim yön
   * (`out`). Bot kaçınma ve doğma denetimi okur; kaya yoksa `Infinity`.
   */
  nearest(x: number, y: number, out: { x: number; y: number }): number {
    let best = Infinity;
    out.x = 0;
    out.y = 0;
    for (const rock of this.rocks) {
      const dx = x - rock.x;
      const dy = y - rock.y;
      const length = Math.hypot(dx, dy);
      const distance = length - rock.radius;
      if (distance >= best) continue;
      best = distance;
      out.x = dx / (length || 1);
      out.y = dy / (length || 1);
    }
    return best;
  }
}
