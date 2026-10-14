import type { Wall } from '@volstudio/core/physics';
import type { LakeSpec } from '@/config/lakes';
import { LakeField } from './LakeField';

/**
 * Sınırlı dünya. Engel yoktur; dört duvar dünyanın kenarıdır. Izgara yalnız görsel ölçü ve konum
 * hissi içindir. Göller (`lakes`) dünyanın sabit coğrafyasıdır ve şasiler suya buradan tepki verir:
 * sunucu, çevrimdışı alıştırma ve istemci öngörüsü aynı `World`ü kurduğundan göl verisi ağdan geçmez.
 * Savaş dünyası `createBattleWorld` ile kurulur; göl listesi verilmeyen dünya karadır.
 */
export class World {
  readonly walls: readonly Wall[];
  readonly lakes: LakeField;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly gridStep: number,
    lakes: readonly LakeSpec[] = [],
  ) {
    if (!(width > 0 && height > 0 && gridStep > 0)) {
      throw new RangeError(`Geçersiz dünya: ${width}×${height}, ızgara ${gridStep}`);
    }
    this.lakes = new LakeField(width, height, lakes);
    this.walls = [
      { nx: 1, ny: 0, offset: 0 },
      { nx: -1, ny: 0, offset: -width },
      { nx: 0, ny: 1, offset: 0 },
      { nx: 0, ny: -1, offset: -height },
    ];
  }

  get center(): { x: number; y: number } {
    return { x: this.width / 2, y: this.height / 2 };
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x <= this.width && y <= this.height;
  }
}
