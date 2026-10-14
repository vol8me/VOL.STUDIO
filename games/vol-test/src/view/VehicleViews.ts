import Phaser from 'phaser';
import { TANK_LIGHTS } from '@/config/tankView';
import type { VehicleSpec } from '@/config/vehicles';
import { createVehicleView } from './createView';
import type { VehicleView } from './VehicleView';

/** Kayıttaki bir aracın görünüm için gereken kimliği ve tanımı. */
export interface ViewedVehicle {
  readonly id: number;
  readonly spec: VehicleSpec;
}

/**
 * Kimlik → araç görünümü kaydı. Her kare simülasyondaki araçlarla eşitlenir: yeni araca
 * tanımına uygun görünüm kurulur, kaybolanınki sökülür. Sahne görünümleri tek tek değil bu
 * kayıt üzerinden yönetir.
 */
export class VehicleViews {
  private readonly views = new Map<number, VehicleView>();
  private readonly lighting: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {
    this.lighting = scene.add
      .container(0, 0)
      .setDepth(TANK_LIGHTS.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Kayıttaki araçları `vehicles` ile eşitler; kaldırılan kimlikleri döner. */
  sync(vehicles: Iterable<ViewedVehicle>): number[] {
    const alive = new Set<number>();
    for (const vehicle of vehicles) {
      alive.add(vehicle.id);
      if (!this.views.has(vehicle.id)) this.views.set(vehicle.id, this.create(vehicle.spec));
    }
    const removed: number[] = [];
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      removed.push(id);
    }
    return removed;
  }

  get(id: number): VehicleView | undefined {
    return this.views.get(id);
  }

  get size(): number {
    return this.views.size;
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.lighting.destroy();
  }

  private create(spec: VehicleSpec): VehicleView {
    return createVehicleView(this.scene, spec, this.lighting);
  }
}
