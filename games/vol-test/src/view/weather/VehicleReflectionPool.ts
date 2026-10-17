import type Phaser from 'phaser';
import { TANK_ART } from '@/config/tankView';
import type { TankId, VehicleSpec } from '@/config/vehicles';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { TankFrame } from '../VehicleView';
import { TreadRig } from '../TreadRig';
import { tankTexture, TEXTURE_SCALE, VEHICLE_ATLAS } from '../textures';
import type { WeatherRect } from './WeatherParticles';
import type { WeatherSource } from './SurfaceLayer';

export interface WeatherVehicleFrame extends TankFrame {
  readonly id: number;
  readonly spec: VehicleSpec;
}

interface ReflectionSlot {
  readonly root: Phaser.GameObjects.Container;
  readonly turret: Phaser.GameObjects.Image;
  readonly treads: TreadRig;
}

/**
 * Su birikintisindeki yansımalar. Havuz araç türüne göre tembel kurulur: her tür kendi
 * gövde ve taret dokusuyla en çok `vehicleCapacity` yuva açar, toplam çizim yine tavanı aşmaz.
 */
export class VehicleReflectionPool {
  private readonly pools = new Map<TankId, ReflectionSlot[]>();
  private readonly used = new Map<TankId, number>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(
    weather: WeatherSource,
    rect: WeatherRect,
    vehicles: Iterable<WeatherVehicleFrame>,
  ): number {
    this.used.clear();
    let count = 0;
    for (const vehicle of vehicles) {
      if (count >= WEATHER_VIEW.vehicleCapacity) break;
      if (vehicle.spec.kind !== 'tank') continue;
      if (
        vehicle.x < rect.x ||
        vehicle.y < rect.y ||
        vehicle.x > rect.x + rect.width ||
        vehicle.y > rect.y + rect.height
      )
        continue;
      const puddle = weather.sample(vehicle.x, vehicle.y).puddleDepth;
      if (puddle < WEATHER_VIEW.wake.minPuddleDepth) continue;
      const id = vehicle.spec.id;
      const index = this.used.get(id) ?? 0;
      this.used.set(id, index + 1);
      count++;
      const slot = this.slot(vehicle.spec, index);
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
    for (const [id, slots] of this.pools) {
      for (let index = this.used.get(id) ?? 0; index < slots.length; index++)
        slots[index].root.setVisible(false);
    }
    return count;
  }

  destroy(): void {
    for (const slots of this.pools.values()) for (const slot of slots) slot.root.destroy();
    this.pools.clear();
  }

  private slot(spec: VehicleSpec, index: number): ReflectionSlot {
    if (spec.kind !== 'tank') throw new Error('Yansıma yalnız paletli araç içindir');
    let slots = this.pools.get(spec.id);
    if (!slots) {
      slots = [];
      this.pools.set(spec.id, slots);
    }
    while (slots.length <= index) slots.push(this.build(spec));
    return slots[index];
  }

  private build(spec: Extract<VehicleSpec, { kind: 'tank' }>): ReflectionSlot {
    const scene = this.scene;
    const art = TANK_ART[spec.id];
    const treads = new TreadRig(scene, spec);
    const hull = scene.add
      .image(0, 0, VEHICLE_ATLAS, tankTexture(spec.id, 'hull'))
      .setScale(1 / TEXTURE_SCALE);
    const turret = scene.add
      .image(0, 0, VEHICLE_ATLAS, tankTexture(spec.id, 'turret'))
      .setOrigin(art.turret.pivotX / art.turret.width, 0.5)
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
  }
}
