import type { PartFactory, TilePort } from '../../src/lab/parts';

/** Sahne nesnesi portunun bellek içi karşılığı: konum, ölçek ve çağrılan ayarlar okunabilir. */
export class FakePart implements TilePort {
  x = 0;
  y = 0;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  alpha = 1;
  visible = true;
  tilePositionX = 0;
  tilePositionY = 0;
  tileScaleX = 1;
  tileScaleY = 1;
  originX = 0;
  originY = 0;
  blend = 0;
  depth = 0;
  destroyed = false;

  constructor(
    readonly key: string,
    readonly kind: 'image' | 'tile',
    readonly width = 0,
    readonly height = 0,
  ) {}

  setOrigin(x: number, y: number): this {
    this.originX = x;
    this.originY = y;
    return this;
  }

  setBlendMode(mode: number): this {
    this.blend = mode;
    return this;
  }

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeFactory implements PartFactory {
  readonly parts: FakePart[] = [];

  image(key: string): FakePart {
    const part = new FakePart(key, 'image');
    this.parts.push(part);
    return part;
  }

  tile(key: string, width: number, height: number): FakePart {
    const part = new FakePart(key, 'tile', width, height);
    this.parts.push(part);
    return part;
  }

  byKey(key: string): FakePart[] {
    return this.parts.filter((part) => part.key === key);
  }
}
