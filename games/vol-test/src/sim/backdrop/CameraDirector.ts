import { clamp01, lerp } from '@volstudio/core/math/interpolation';
import { BACKDROP } from '@/config/backdrop';

/** Yönetmenin gördüğü araç: konum, cephe ve canlılık yeter. */
export interface DirectedVehicle {
  readonly id: number;
  readonly team: number | null;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
}

export interface Shot {
  /** Çekimin odağı (dünya birimi) ve yakınlaştırması. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** Odak başka bir çifte atladı: görüntü kesilmeli (karartıp yeni yere oturur). */
  readonly cut: boolean;
}

type Config = typeof BACKDROP.camera;
type Pair = readonly [DirectedVehicle, DirectedVehicle];

function distance(a: DirectedVehicle, b: DirectedVehicle): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Menü arka planının kamera yönetmeni: savaştaki en yakın düşman çiftini bulur ve onları çerçeveler.
 * Çift ölür ya da açılırsa, ya da en uzun tutuşu aşarsa yeni çifte kesilir; çiftin yakınlığı
 * yakınlaştırmayı belirler. Saf mantıktır: kareyi çizmez, yalnız nereye bakılacağını söyler.
 */
export class CameraDirector {
  private pair: readonly [number, number] | undefined;
  private heldMs = 0;
  private x = 0;
  private y = 0;
  private zoom: number;
  private located = false;

  constructor(private readonly config: Config = BACKDROP.camera) {
    this.zoom = config.zoomMax;
  }

  /** Bir kare ilerler ve güncel çekimi döner. */
  update(vehicles: readonly DirectedVehicle[], deltaMs: number): Shot {
    this.heldMs += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    const current = this.pair && this.resolve(vehicles, this.pair);
    const keep =
      current !== undefined &&
      this.heldMs < this.config.maxHoldMs &&
      distance(current[0], current[1]) <= this.config.breakRange;
    let cut = false;
    if (keep) this.frame(current);
    else {
      const next = this.choose(vehicles);
      if (next) {
        const changed = !this.pair || next[0].id !== this.pair[0] || next[1].id !== this.pair[1];
        this.pair = [next[0].id, next[1].id];
        this.heldMs = 0;
        cut = changed && this.located;
        this.frame(next);
      } else if (!this.located) this.centre(vehicles);
    }
    return { x: this.x, y: this.y, zoom: this.zoom, cut };
  }

  private frame(pair: Pair): void {
    this.x = (pair[0].x + pair[1].x) / 2;
    this.y = (pair[0].y + pair[1].y) / 2;
    const closeness = 1 - clamp01(distance(pair[0], pair[1]) / this.config.breakRange);
    this.zoom = lerp(this.config.zoomMin, this.config.zoomMax, closeness);
    this.located = true;
  }

  /** Düşman çifti yokken (herkes ölü ya da tek cephe) kadronun ortasına bakılır. */
  private centre(vehicles: readonly DirectedVehicle[]): void {
    let count = 0;
    let sx = 0;
    let sy = 0;
    for (const vehicle of vehicles) {
      if (!vehicle.alive) continue;
      count++;
      sx += vehicle.x;
      sy += vehicle.y;
    }
    if (count === 0) return;
    this.x = sx / count;
    this.y = sy / count;
    this.located = true;
  }

  private resolve(
    vehicles: readonly DirectedVehicle[],
    pair: readonly [number, number],
  ): Pair | undefined {
    const a = vehicles.find((vehicle) => vehicle.id === pair[0]);
    const b = vehicles.find((vehicle) => vehicle.id === pair[1]);
    return a?.alive && b?.alive ? [a, b] : undefined;
  }

  /**
   * En yakın düşman çiftini seçer. Şimdiki çift, yakında başka bir çatışma varsa elenir: aynı iki aracın
   * başında beklemek yerine sahne el değiştirir.
   */
  private choose(vehicles: readonly DirectedVehicle[]): Pair | undefined {
    let best: Pair | undefined;
    let bestScore = Infinity;
    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        if (!b.alive || a.team === null || b.team === null || a.team === b.team) continue;
        const previous = this.pair;
        const repeat =
          previous !== undefined &&
          ((a.id === previous[0] && b.id === previous[1]) ||
            (a.id === previous[1] && b.id === previous[0]));
        const score = distance(a, b) + (repeat ? this.config.engageRange : 0);
        if (score < bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    }
    return best;
  }
}
