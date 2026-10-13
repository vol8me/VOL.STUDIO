import { angleDelta } from '@volstudio/core/math';
import type { TankCommand } from './command';
import type { WeaponConfig } from '@/config/tank';
import type { Vehicle } from './entities/Vehicle';
import { muzzlePose, type MuzzlePose } from './muzzle';
import type { ChassisPose } from './tank/Tank';
import type { World } from './world/World';

/**
 * Namlu komuttaki nişan yönüne yeterince yakın mı? Nişan yoksa (sıfır vektör) taret olduğu yerde
 * ateş eder. Sunucu ve istemci öngörüsü aynı kapıyı kullanır.
 */
export function aimAligned(vehicle: Vehicle, command: TankCommand): boolean {
  if (command.aimX === 0 && command.aimY === 0) return true;
  return (
    Math.abs(angleDelta(vehicle.chassis.turret, Math.atan2(command.aimY, command.aimX))) <=
    vehicle.weapon.aimTolerance
  );
}

/** Atış anında mermiyi belirleyen değerler: namlu ucu, ilk hız ve yön. */
export interface Launch {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

/** `launchFrom`un yazdığı yeniden kullanılabilir arabellek. */
export type LaunchBuffer = { -readonly [K in keyof Launch]: Launch[K] };

const shotPose: ChassisPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
const shotMuzzle: MuzzlePose = { x: 0, y: 0, angle: 0 };

/**
 * Verilen poz ve tank hızından atışı türetir; sim, öngörü ve nişan çizgisi (ara değerli poz) aynı
 * işlevi kullanır. Mermi namlu ekseni boyunca çıkar ve tankın hızından yalnız eksen bileşenini
 * devralır: yan kayarken ateş eden tankın mermisi namlunun gösterdiği yönden sapmaz, bu yüzden
 * nişan çizgisi ile namlu her zaman aynı doğrultudadır.
 */
export function launchFrom(
  pose: ChassisPose,
  tankVx: number,
  tankVy: number,
  weapon: WeaponConfig,
  out: LaunchBuffer,
): Launch {
  const muzzle = muzzlePose(pose, weapon.muzzleOffset, shotMuzzle);
  const dirX = Math.cos(pose.turret);
  const dirY = Math.sin(pose.turret);
  const speed = weapon.projectileSpeed + tankVx * dirX + tankVy * dirY;
  out.x = muzzle.x;
  out.y = muzzle.y;
  out.vx = dirX * speed;
  out.vy = dirY * speed;
  out.angle = pose.turret;
  return out;
}

/**
 * Mermi namlu ucundan çıkar. Geri tepme mermi doğduktan SONRA uygulanır; bu yüzden çağrı
 * `applyRecoil`den önce yapılmalıdır.
 */
export function muzzleLaunch(vehicle: Vehicle): Launch {
  const tank = vehicle.chassis;
  return launchFrom(tank.readPose(shotPose), tank.vx, tank.vy, vehicle.weapon, {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
  });
}

/**
 * Atışın tanka geri tepmesi: ters yönde itki ve süspansiyon vuruşu (yandan ateş yalpa yapar).
 * Mermi tankın hızını devralarak çıkar; bu çağrı mermi doğduktan SONRA yapılmalıdır.
 */
export function applyRecoil(vehicle: Vehicle): void {
  const tank = vehicle.chassis;
  const weapon = vehicle.weapon;
  const dirX = Math.cos(tank.turret);
  const dirY = Math.sin(tank.turret);
  tank.applyImpulse(-dirX * weapon.recoilImpulse, -dirY * weapon.recoilImpulse);
  const fx = Math.cos(tank.hull);
  const fy = Math.sin(tank.hull);
  tank.suspension.kick(
    -(dirX * fx + dirY * fy) * weapon.recoilKick,
    -(-dirX * fy + dirY * fx) * weapon.recoilKick,
  );
}

/**
 * Tek aracın komutla sürülen adımı: `Simulation.step`in bu araç için yaptığı iş, araç teması ve
 * mermi çözümü olmadan. İstemci öngörüsü ve yeniden oynatma bunu çağırır; sunucuda aynı
 * adımın parçaları `Simulation` içinde bu işlevlerle ortaktır. Mermiyi sunucu doğurur, burada yalnız
 * tankın tepkisi uygulanır; `onLaunch` varsa atışın değerlerini geri tepmeden önce alır (istemci
 * kendi mermisini görsel olarak aynı değerlerle uçurur). Ateş edildiyse `true` döner.
 */
export function stepPredictedVehicle(
  vehicle: Vehicle,
  command: TankCommand,
  world: World,
  stepMs: number,
  onLaunch?: (launch: Launch) => void,
): boolean {
  const tank = vehicle.chassis;
  tank.capturePose();
  if (!vehicle.vitality.alive) return false;
  tank.step(command, world, stepMs / 1000);
  vehicle.gun.update(stepMs);
  if (command.fire && aimAligned(vehicle, command) && vehicle.gun.tryTrigger()) {
    onLaunch?.(muzzleLaunch(vehicle));
    applyRecoil(vehicle);
    return true;
  }
  return false;
}
