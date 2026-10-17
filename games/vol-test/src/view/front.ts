import { WAR } from '@/config/war';
import { baseCenter } from '@/sim/war/Deployment';
import { NO_OWNER, ZoneField } from '@/sim/war/Zones';

/** Bir bölgenin sunumu: sabit geometri ve sürücünün her kare güncellediği durum. */
export interface ZoneFrame {
  readonly index: number;
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Sahip cephe; yoksa `NO_OWNER`. */
  owner: number;
  /** [-1, 1]: +1 tam 0. cephe, -1 tam 1. cephe. */
  progress: number;
  contested: boolean;
}

/** Bir cephenin üssü. */
export interface BaseFrame {
  readonly faction: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Cephe hattının görüntüsü: harita ve dünya çizimi aynı kareyi okur. Sürücü `zones` içindeki
 * durum alanlarını yerinde günceller; nesneler kareler arasında yeniden kullanılır.
 */
export interface FrontFrame {
  readonly zones: readonly ZoneFrame[];
  readonly bases: readonly BaseFrame[];
}

/**
 * Dünya ölçüsüne göre çözülmüş, durumu tarafsız bir cephe karesi. Geometri `ZoneField` ve
 * `baseCenter` ile sunucunun kullandığı hesaptan türer: sunucuyla istemci aynı yerde çizer.
 */
export function createFront(world: {
  readonly width: number;
  readonly height: number;
}): FrontFrame {
  const zones = new ZoneField(world).zones.map((zone): ZoneFrame => ({
    index: zone.index,
    id: zone.id,
    x: zone.x,
    y: zone.y,
    radius: zone.radius,
    owner: NO_OWNER,
    progress: 0,
    contested: false,
  }));
  const bases = WAR.bases.map((base, faction): BaseFrame => ({
    faction,
    ...baseCenter(world, faction),
    radius: base.radius,
  }));
  return { zones, bases };
}
