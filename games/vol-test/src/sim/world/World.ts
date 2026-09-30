import type { Wall } from '@volstudio/core/physics';

/**
 * Boş, sınırlı dünya. İçinde engel yoktur; dört duvar dünyanın kenarıdır.
 * Izgara yalnız görsel ölçü ve konum hissi içindir.
 */
export class World {
  readonly walls: readonly Wall[];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly gridStep: number,
  ) {
    if (!(width > 0 && height > 0 && gridStep > 0)) {
      throw new RangeError(`Geçersiz dünya: ${width}×${height}, ızgara ${gridStep}`);
    }
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
