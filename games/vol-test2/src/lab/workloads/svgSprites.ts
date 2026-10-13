import Phaser from 'phaser';
import { ASSETS, TILE_UNITS, type AssetId } from '../assets/manifest';
import { kitFacts, loadKit, textureKey, type KitLoad } from '../assets/textures';
import { LAB_SCENE_KEY } from '../LabScene';
import type { Invariant } from '../judge';
import type { ParamSpec } from '../params';
import type { WorkloadDef, WorkloadInstance } from '../workload';

/** Yağmura giren bütün parçalar: bacak, halka, parıltı gibi tek başına anlamsız parçalar ölçümü yanıltırdı. */
const POOL: readonly AssetId[] = [
  'ore-a',
  'wall',
  'conveyor-base',
  'ore-b',
  'drill-base',
  'smelter-base',
  'ore-c',
  'turret-base',
  'core-base',
];

const PARAMS: readonly ParamSpec[] = [
  {
    name: 'count',
    type: 'integer',
    default: 400,
    min: 1,
    max: 20000,
    description: 'sprite sayısı',
  },
  {
    name: 'size',
    type: 'integer',
    default: 64,
    min: 16,
    max: 512,
    description: 'bir karonun ekranda kenarı (px); çekirdek 3 karodur',
  },
  {
    name: 'raster',
    type: 'choice',
    default: '2',
    choices: ['1', '2', '4'],
    description:
      'SVG doku çözünürlüğü (tasarım birimi başına px); doku belleğini ve ilk rasterleme maliyetini belirler',
  },
  {
    name: 'kinds',
    type: 'integer',
    default: POOL.length,
    min: 1,
    max: POOL.length,
    description: 'kullanılan farklı doku sayısı (parti kırılmasını artırır)',
  },
  {
    name: 'blend',
    type: 'choice',
    default: 'normal',
    choices: ['normal', 'add'],
    description: 'karıştırma kipi',
  },
  {
    name: 'alpha',
    type: 'number',
    default: 1,
    min: 0.1,
    max: 1,
    description: 'saydamlık (karışım maliyeti)',
  },
  { name: 'speed', type: 'number', default: 60, min: 0, max: 600, description: 'hız (px/sn)' },
  {
    name: 'spin',
    type: 'boolean',
    default: true,
    description: 'her karede dönüş (matris güncellemesi)',
  },
];

const BLEND: Readonly<Record<string, number>> = {
  normal: Phaser.BlendModes.NORMAL,
  add: Phaser.BlendModes.ADD,
};

/** Tohumlu, deterministik rastgele: aynı parametreler aynı yerleşimi verir (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Mover {
  readonly image: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

class SvgSpritesInstance implements WorkloadInstance {
  private readonly movers: Mover[] = [];
  private readonly random: () => number;
  private readonly view: { width: number; height: number };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly pieces: readonly AssetId[],
    private readonly pxPerUnit: number,
    private readonly options: {
      readonly count: number;
      readonly size: number;
      readonly blend: number;
      readonly alpha: number;
      readonly speed: number;
      readonly spin: boolean;
    },
    private readonly load: KitLoad,
  ) {
    this.random = seeded(0x5eed);
    this.view = { width: scene.scale.width, height: scene.scale.height };
    this.setCount(options.count);
  }

  /** Sprite sayısını canlı değiştirir: önceki sprite'lar korunur, yerleşim tohumludur. */
  setCount(count: number): number {
    while (this.movers.length > count) this.movers.pop()?.image.destroy();
    while (this.movers.length < count) {
      const index = this.movers.length;
      const piece = ASSETS[this.pieces[index % this.pieces.length]];
      const image = this.scene.add.image(
        this.random() * this.view.width,
        this.random() * this.view.height,
        textureKey(piece.id, this.pxPerUnit),
      );
      const unit = this.options.size / TILE_UNITS;
      image.setDisplaySize(piece.width * unit, piece.height * unit);
      image.setBlendMode(this.options.blend);
      image.setAlpha(this.options.alpha);
      const heading = this.random() * Math.PI * 2;
      this.movers.push({
        image,
        vx: Math.cos(heading) * this.options.speed,
        vy: Math.sin(heading) * this.options.speed,
        spin: (this.random() - 0.5) * 2,
      });
    }
    return this.movers.length;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const { width, height } = this.view;
    const spin = this.options.spin;
    for (const mover of this.movers) {
      const image = mover.image;
      let x = image.x + mover.vx * dt;
      let y = image.y + mover.vy * dt;
      if (x < 0) x += width;
      else if (x > width) x -= width;
      if (y < 0) y += height;
      else if (y > height) y -= height;
      image.setPosition(x, y);
      if (spin) image.rotation += mover.spin * dt;
    }
  }

  counters(): Record<string, number> {
    const area = this.movers.reduce(
      (sum, mover) => sum + mover.image.displayWidth * mover.image.displayHeight,
      0,
    );
    const screen = this.view.width * this.view.height;
    return {
      sprites: this.movers.length,
      textures: this.pieces.length,
      overdraw: screen > 0 ? Math.round((area / screen) * 100) / 100 : 0,
      fillMpx: Math.round(area / 1e4) / 100,
    };
  }

  facts(): Record<string, string | number | boolean> {
    return {
      ...kitFacts(this.load, this.pxPerUnit),
      size: this.options.size,
      blend: this.options.blend === BLEND.add ? 'add' : 'normal',
      pieces: this.pieces.join(','),
    };
  }

  invariants(): Invariant[] {
    const keys = this.pieces.map((id) => textureKey(id, this.pxPerUnit));
    const missing = keys.filter((key) => !this.scene.textures.exists(key));
    return [
      {
        id: 'textures-loaded',
        ok: missing.length === 0,
        detail: missing.length === 0 ? `${keys.length} doku yüklü` : `eksik: ${missing.join(', ')}`,
      },
      {
        id: 'sprites-alive',
        ok: this.movers.length > 0 && this.movers.every((mover) => mover.image.active),
        detail: `${this.movers.length} sprite`,
      },
    ];
  }

  act(name: string, args: Record<string, unknown>): unknown {
    if (name === 'setCount') return { count: this.setCount(Number(args.count)) };
    throw new Error(`bilinmeyen eylem: ${name}`);
  }

  destroy(): void {
    for (const mover of this.movers) mover.image.destroy();
    this.movers.length = 0;
  }
}

export const svgSprites: WorkloadDef = {
  id: 'svg-sprites',
  title: 'Tasarlanmış SVG sprite yağmuru',
  summary:
    'Üstten bakışlı tam parçalar (cevher, duvar, konveyör, matkap, dökümhane, taret, çekirdek) dokuya rasterlenir ve count kadar sprite her karede hareket eder. Sürekli maliyet: sprite sayısı × alan × karıştırma; yol karmaşıklığı yalnız ilk rasterlemede ödenir (facts: svg.loadMs, svg.textureKB).',
  scene: LAB_SCENE_KEY,
  params: PARAMS,
  actions: [
    {
      name: 'setCount',
      summary: 'Sprite sayısını canlı değiştirir (kapasite taraması için).',
      args: [PARAMS[0]],
    },
  ],
  async create(context, params) {
    const pxPerUnit = Number(params.raster);
    const pieces = POOL.slice(0, Number(params.kinds));
    const load = await loadKit(context.scene, pieces, pxPerUnit);
    return new SvgSpritesInstance(
      context.scene,
      pieces,
      pxPerUnit,
      {
        count: Number(params.count),
        size: Number(params.size),
        blend: BLEND[String(params.blend)],
        alpha: Number(params.alpha),
        speed: Number(params.speed),
        spin: params.spin === true,
      },
      load,
    );
  },
};
