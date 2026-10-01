import type Phaser from 'phaser';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { TankFrame } from '../TankView';
import { TreadRig } from '../TreadRig';
import { TEXTURE, TEXTURE_SCALE } from '../textures';
import type { WeatherRect } from './WeatherParticles';
import type { WeatherSource } from './SurfaceLayer';

export interface WeatherVehicleFrame extends TankFrame {
  readonly id: number;
}

interface ReflectionSlot {
  readonly root: Phaser.GameObjects.Container;
  readonly turret: Phaser.GameObjects.Image;
  readonly treads: TreadRig;
}

export class VehicleReflectionPool {
  private readonly slots: readonly ReflectionSlot[];

  constructor(scene: Phaser.Scene) {
    this.slots = Array.from({ length: WEATHER_VIEW.vehicleCapacity }, () => {
      const treads = new TreadRig(scene);
      const hull = scene.add.image(0, 0, TEXTURE.hull).setScale(1 / TEXTURE_SCALE);
      const turret = scene.add
        .image(0, 0, TEXTURE.turret)
        .setOrigin(12 / 44, 0.5)
        .setScale(1 / TEXTURE_SCALE);
      for (const part of [hull, turret, ...treads.parts]) {
        (part as Phaser.GameObjects.Image).setTint(WEATHER_VIEW.reflection.tint);
      }
      const root = scene.add
        .container(0, 0, [...treads.parts, hull, turret])
        .setDepth(WEATHER_VIEW.reflectionDepth)
        .setScale(1, -WEATHER_VIEW.reflection.scaleY)
        .setVisible(false);
      return { root, turret, treads };
    });
  }

  update(
    weather: WeatherSource,
    rect: WeatherRect,
    vehicles: Iterable<WeatherVehicleFrame>,
  ): number {
    let count = 0;
    for (const vehicle of vehicles) {
      if (count >= this.slots.length) break;
      if (
        vehicle.x < rect.x ||
        vehicle.y < rect.y ||
        vehicle.x > rect.x + rect.width ||
        vehicle.y > rect.y + rect.height
      )
        continue;
      const puddle = weather.sample(vehicle.x, vehicle.y).puddleDepth;
      if (puddle < WEATHER_VIEW.wake.minPuddleDepth) continue;
      const slot = this.slots[count++];
      slot.root
        .setVisible(true)
        .setPosition(vehicle.x, vehicle.y + WEATHER_VIEW.reflection.offsetY)
        .setRotation(vehicle.hull)
        .setAlpha(
          Math.min(1, puddle / WEATHER_VIEW.surface.puddleFullDepth) *
            WEATHER_VIEW.reflection.alpha,
        );
      slot.turret.setRotation(vehicle.turret - vehicle.hull);
      slot.treads.update(vehicle.treadLeft, vehicle.treadRight);
    }
    for (let index = count; index < this.slots.length; index++)
      this.slots[index].root.setVisible(false);
    return count;
  }

  destroy(): void {
    for (const slot of this.slots) slot.root.destroy();
  }
}
