import { angleDelta } from '@volstudio/core/math';
import type { TankCommand } from './command';
import type { Vehicle } from './entities/Vehicle';
import type { World } from './world/World';

/**
 * Namlu komuttaki nişan yönüne yeterince yakın mı? Nişan yoksa (sıfır vektör) taret olduğu yerde
 * ateş eder. Sunucu ve istemci öngörüsü aynı kapıyı kullanır.
 */
export function aimAligned(vehicle: Vehicle, command: TankCommand): boolean {
  if (command.aimX === 0 && command.aimY === 0) return true;
  return (
    Math.abs(angleDelta(vehicle.tank.turret, Math.atan2(command.aimY, command.aimX))) <=
    vehicle.weapon.aimTolerance
  );
}

/**
 * Atışın tanka geri tepmesi: ters yönde itki ve süspansiyon vuruşu (yandan ateş yalpa yapar).
 * Mermi tankın hızını devralarak çıkar; bu çağrı mermi doğduktan SONRA yapılmalıdır.
 */
export function applyRecoil(vehicle: Vehicle): void {
  const tank = vehicle.tank;
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
 * tankın tepkisi uygulanır. Ateş edildiyse `true` döner.
 */
export function stepPredictedVehicle(
  vehicle: Vehicle,
  command: TankCommand,
  world: World,
  stepMs: number,
): boolean {
  const tank = vehicle.tank;
  tank.capturePose();
  if (!vehicle.vitality.alive) return false;
  tank.step(command, world, stepMs / 1000);
  vehicle.gun.update(stepMs);
  if (command.fire && aimAligned(vehicle, command) && vehicle.gun.tryTrigger()) {
    applyRecoil(vehicle);
    return true;
  }
  return false;
}
