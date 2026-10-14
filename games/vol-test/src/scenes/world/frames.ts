import type { HudFrame, HudVehicle } from '@/hud/HudFrame';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { lerpAngle } from '@volstudio/core/math';
import type { Chassis } from '@/sim/chassis/Chassis';
import type { Vitality } from '@/sim/combat/Vitality';
import { COMBAT } from '@/config/combat';
import type { TankFrame } from '@/view/TankView';

/**
 * Görünümün okuyacağı tank karesi: poz, taret ve süspansiyon önceki ve
 * güncel simülasyon adımı arasında `alpha` ile ara değerlenir.
 */
export function tankFrame(tank: Chassis, alpha: number): TankFrame {
  const previous = tank.previous;
  const mix = (from: number, to: number): number => from + (to - from) * alpha;
  return {
    x: mix(previous.x, tank.x),
    y: mix(previous.y, tank.y),
    hull: lerpAngle(previous.hull, tank.hull, alpha),
    turret: lerpAngle(previous.turret, tank.turret, alpha),
    pitch: mix(previous.pitch, tank.suspension.pitch),
    roll: mix(previous.roll, tank.suspension.roll),
    treadLeft: tank.treadLeft,
    treadRight: tank.treadRight,
    speed: tank.speed,
    vx: tank.vx,
    vy: tank.vy,
    angularVelocity: tank.angularVelocity,
    boosting: tank.boosting,
  };
}

/** HUD karesi: ara değerli poz, sürüş durumu ve kameranın görünen alanı. */
export function hudFrame(
  tank: Chassis,
  frame: TankFrame,
  boostCapacity: number,
  view: HudFrame['view'],
  fireProgress = 1,
  climate?: HudFrame['climate'],
  vehicles?: HudFrame['vehicles'],
  vitality?: Vitality,
  front?: HudFrame['front'],
): HudFrame {
  return {
    x: frame.x,
    y: frame.y,
    hull: frame.hull,
    boosting: tank.boosting,
    kind: tank.kind,
    boost: tank.boost,
    boostCapacity,
    fireProgress,
    health: vitality?.health ?? COMBAT.maxHealth,
    maxHealth: vitality?.maxHealth ?? COMBAT.maxHealth,
    alive: vitality?.alive ?? true,
    respawnRemainingMs: vitality?.respawnRemainingMs ?? 0,
    protectionRemainingMs: vitality?.protectionRemainingMs ?? 0,
    climate,
    vehicles,
    front,
    view,
  };
}

/** Her yineleme `alpha` ile ara değerlenmiş, nesneleri yeniden kullanılan harita aracı havuzu. */
type MutableHudVehicle = { -readonly [K in keyof HudVehicle]: HudVehicle[K] };
const mapPool: MutableHudVehicle[] = [];

/**
 * Harita için araç listesi: poz, çizilen kareyle aynı ara değerlidir (harita her karede güncellenir; adım
 * konumu kullanılsaydı işaret adım hızında sıçrar). Yield edilen nesneler çağrılar arasında yeniden
 * kullanılır; tüketici saklamaz.
 */
export function* hudVehicles(
  vehicles: readonly Vehicle[],
  playerId: number,
  alpha: number,
  isBot: (vehicleId: number) => boolean = () => false,
): Generator<HudVehicle> {
  let used = 0;
  for (const vehicle of vehicles) {
    if (!vehicle.vitality.alive) continue;
    const { previous, x, y, hull } = vehicle.chassis;
    const entry = (mapPool[used] ??= {
      id: 0,
      x: 0,
      y: 0,
      hull: 0,
      player: false,
      bot: false,
      team: -1,
    });
    used++;
    entry.id = vehicle.id;
    entry.x = previous.x + (x - previous.x) * alpha;
    entry.y = previous.y + (y - previous.y) * alpha;
    entry.hull = lerpAngle(previous.hull, hull, alpha);
    entry.player = vehicle.id === playerId;
    entry.bot = entry.player ? false : isBot(vehicle.id);
    entry.team = vehicle.team ?? -1;
    yield entry;
  }
}
