import { angleDelta } from '@volstudio/core/math';
import type { TankCommand } from './command';
import type { Armament } from '@/config/vehicles';
import type { Vehicle } from './entities/Vehicle';
import { mountPose, muzzlePose, type MuzzlePose } from './muzzle';
import type { ChassisPose } from './chassis/ChassisState';
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
const shotLaunch: LaunchBuffer = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };

/**
 * Verilen poz ve araç hızından `mount`. yuvanın atışını türetir; sim, öngörü ve nişan çizgisi (ara
 * değerli poz) aynı işlevi kullanır. Mermi namlu ekseni boyunca çıkar ve aracın hızından yalnız
 * eksen bileşenini devralır: yan kayarken ateş eden aracın mermisi namlunun gösterdiği yönden
 * sapmaz, bu yüzden nişan çizgisi ile namlu her zaman aynı doğrultudadır.
 */
export function launchFrom(
  pose: ChassisPose,
  vehicleVx: number,
  vehicleVy: number,
  armament: Armament,
  mount: number,
  out: LaunchBuffer,
): Launch {
  const muzzle = muzzlePose(pose, armament, mount, shotMuzzle);
  const dirX = Math.cos(muzzle.angle);
  const dirY = Math.sin(muzzle.angle);
  const speed = armament.weapon.projectileSpeed + vehicleVx * dirX + vehicleVy * dirY;
  out.x = muzzle.x;
  out.y = muzzle.y;
  out.vx = dirX * speed;
  out.vy = dirY * speed;
  out.angle = muzzle.angle;
  return out;
}

/**
 * Atışın yuvadan araca geri tepmesi: ters yönde itki ve süspansiyon vuruşu (yandan ateş yalpa
 * yapar). Mermi aracın hızını devralarak çıkar; bu çağrı mermi doğduktan SONRA yapılmalıdır.
 */
function applyRecoil(vehicle: Vehicle, angle: number): void {
  const chassis = vehicle.chassis;
  const weapon = vehicle.weapon;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  chassis.applyImpulse(-dirX * weapon.recoilImpulse, -dirY * weapon.recoilImpulse);
  const fx = Math.cos(chassis.hull);
  const fy = Math.sin(chassis.hull);
  chassis.suspension.kick(
    -(dirX * fx + dirY * fy) * weapon.recoilKick,
    -(-dirX * fy + dirY * fx) * weapon.recoilKick,
  );
}

/**
 * Bir tetik çekişi: sıradaki yuva grubunun her namlusu ateşlenir. `onLaunch` her namlunun atışını
 * geri tepmeden ÖNCE alır (sunucu mermiyi doğurur, istemci kendi mermisini görsel olarak aynı
 * değerlerle uçurur); ardından geri tepmeler uygulanır ve sıra bir sonraki gruba geçer. `launch`
 * paylaşılan bir arabellektir: değerler çağrı içinde okunur, saklanmaz.
 */
export function triggerVolley(
  vehicle: Vehicle,
  onLaunch?: (launch: Launch, mount: number) => void,
): void {
  const armament = vehicle.armament;
  const group = armament.salvo[vehicle.salvo];
  const chassis = vehicle.chassis;
  chassis.readPose(shotPose);
  for (const mount of group) {
    launchFrom(shotPose, chassis.vx, chassis.vy, armament, mount, shotLaunch);
    onLaunch?.(shotLaunch, mount);
  }
  for (const mount of group) {
    applyRecoil(vehicle, mountPose(shotPose, armament, mount, shotMuzzle).angle);
  }
  vehicle.salvo = (vehicle.salvo + 1) % armament.salvo.length;
}

/**
 * Tek aracın komutla sürülen adımı: `Simulation.step`in bu araç için yaptığı iş, araç teması ve
 * mermi çözümü olmadan. İstemci öngörüsü ve yeniden oynatma bunu çağırır; sunucuda aynı
 * adımın parçaları `Simulation` içinde bu işlevlerle ortaktır. Mermiyi sunucu doğurur, burada yalnız
 * aracın tepkisi uygulanır; `onLaunch` varsa her atışın değerlerini geri tepmeden önce alır.
 * Ateş edildiyse `true` döner.
 */
export function stepPredictedVehicle(
  vehicle: Vehicle,
  command: TankCommand,
  world: World,
  stepMs: number,
  onLaunch?: (launch: Launch, mount: number) => void,
): boolean {
  if (!Number.isFinite(stepMs) || stepMs < 0)
    throw new RangeError('Öngörü adımı sonlu ve negatif olmayan süre olmalı');
  if (stepMs === 0) return false;
  const chassis = vehicle.chassis;
  chassis.capturePose();
  if (!vehicle.vitality.alive) return false;
  chassis.step(command, world, stepMs / 1000);
  vehicle.gun.update(stepMs * vehicle.effect.fireRate);
  if (command.fire && aimAligned(vehicle, command) && vehicle.gun.tryTrigger()) {
    triggerVolley(vehicle, onLaunch);
    return true;
  }
  return false;
}
