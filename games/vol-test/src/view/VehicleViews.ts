import Phaser from 'phaser';
import { TANK_LIGHTS } from '@/config/tankView';
import { TankView } from './TankView';

/**
 * Kimlik → tank görünümü kaydı. Her kare simülasyondaki araç kimlikleriyle
 * eşitlenir: yeni araca görünüm kurulur, kaybolanınki sökülür. Sahne
 * görünümleri tek tek değil bu kayıt üzerinden yönetir.
 */
export class VehicleViews {
  private readonly views = new Map<number, TankView>();
  private readonly lighting: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {
    this.lighting = scene.add
      .container(0, 0)
      .setDepth(TANK_LIGHTS.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Kayıttaki kimlikleri `ids` ile eşitler; kaldırılan kimlikleri döner. */
  sync(ids: Iterable<number>): number[] {
    const alive = new Set(ids);
    for (const id of alive) {
      if (!this.views.has(id)) this.views.set(id, new TankView(this.scene, this.lighting));
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

  get(id: number): TankView | undefined {
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
}
