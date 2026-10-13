import { kitFacts, loadKit, type KitLoad } from '../assets/textures';
import type { Invariant } from '../judge';
import { LAB_SCENE_KEY } from '../LabScene';
import type { ParamSpec } from '../params';
import { phaserParts } from '../phaserParts';
import type { PartFactory } from '../parts';
import { seeded } from '../random';
import { SpiderBody } from '../spiderBody';
import { SpiderView, SPIDER_PART_COUNT } from '../spiderView';
import { round3, SpanTimer } from '../timing';
import {
  createWander,
  stepWander,
  velocityOf,
  type WanderOptions,
  type WanderState,
} from '../wander';
import type { WorkloadDef, WorkloadInstance } from '../workload';
import type { AssetId } from '../assets/manifest';

const SPIDER_ASSETS: readonly AssetId[] = [
  'arachnid-abdomen',
  'arachnid-carapace',
  'arachnid-claw',
  'arachnid-coxa',
  'arachnid-femur',
  'arachnid-reactor',
  'arachnid-shadow',
  'arachnid-tibia',
];

const PARAMS: readonly ParamSpec[] = [
  { name: 'count', type: 'integer', default: 24, min: 1, max: 2000, description: 'örümcek sayısı' },
  {
    name: 'zoom',
    type: 'number',
    default: 0.45,
    min: 0.1,
    max: 2,
    description: 'ekranda tasarım birimi başına piksel (örümcek ≈ 126 birim uzunluğundadır)',
  },
  {
    name: 'speed',
    type: 'number',
    default: 110,
    min: 0,
    max: 400,
    description: 'seyir hızı (tasarım birimi/sn)',
  },
  {
    name: 'turn',
    type: 'number',
    default: 0.6,
    min: 0.1,
    max: 3,
    description: 'en büyük dönüş hızı (rad/sn)',
  },
  {
    name: 'raster',
    type: 'choice',
    default: '2',
    choices: ['1', '2', '4'],
    description: 'SVG doku çözünürlüğü (tasarım birimi başına px)',
  },
  {
    name: 'seed',
    type: 'integer',
    default: 11,
    min: 0,
    max: 2_147_483_647,
    description: 'hareket tohumu',
  },
];

interface Walker {
  readonly state: WanderState;
  readonly body: SpiderBody;
  readonly view: SpiderView;
}

class SwarmInstance implements WorkloadInstance {
  private readonly walkers: Walker[] = [];
  private readonly random: () => number;
  private readonly wander: WanderOptions;
  private time = 0;
  /** Sim: gezinme + yürüyüş (CORE LegGait, IK, denge). Sunum: parçaları yerleştirmek. İkisi ayrı ölçülür. */
  private readonly sim = new SpanTimer(240);
  private readonly present = new SpanTimer(240);

  constructor(
    private readonly factory: PartFactory,
    private readonly load: KitLoad,
    private readonly options: {
      readonly zoom: number;
      readonly pxPerUnit: number;
      readonly speed: number;
      readonly turn: number;
      readonly width: number;
      readonly height: number;
    },
    seed: number,
    count: number,
  ) {
    this.random = seeded(seed);
    this.wander = {
      width: options.width / options.zoom,
      height: options.height / options.zoom,
      margin: Math.min(160, options.width / options.zoom / 5),
      cruise: options.speed,
      maxTurnRate: options.turn,
    };
    this.setCount(count);
  }

  setCount(count: number): number {
    while (this.walkers.length > count) this.walkers.pop()?.view.destroy();
    while (this.walkers.length < count) {
      const index = this.walkers.length;
      const state = createWander(this.random, this.wander);
      const body = new SpiderBody();
      body.reset(state.x, state.y, state.heading);
      const view = new SpiderView(
        this.factory,
        {
          zoom: this.options.zoom,
          pxPerUnit: this.options.pxPerUnit,
          depthBase: index * 10,
          phase: this.random() * 4,
        },
        body.legCount,
      );
      this.walkers.push({ state, body, view });
    }
    return this.walkers.length;
  }

  update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50);
    this.time += dt / 1000;
    const dtSeconds = dt / 1000;

    this.sim.begin();
    for (const walker of this.walkers) {
      stepWander(walker.state, dtSeconds, this.random, this.wander);
      const [vx, vy] = velocityOf(walker.state);
      walker.body.update(walker.state.x, walker.state.y, walker.state.heading, vx, vy, dt);
    }
    this.sim.end();

    this.present.begin();
    for (const walker of this.walkers)
      walker.view.update(
        walker.body,
        walker.state.x,
        walker.state.y,
        walker.state.heading,
        this.time,
      );
    this.present.end();
  }

  private totals(): {
    frames: number;
    legFrames: number;
    clamped: number;
    normal: number;
    unstable: number;
    emergency: number;
    steps: number;
    maxSlide: number;
    stepping: number;
  } {
    const totals = {
      frames: 0,
      legFrames: 0,
      clamped: 0,
      normal: 0,
      unstable: 0,
      emergency: 0,
      steps: 0,
      maxSlide: 0,
      stepping: 0,
    };
    for (const { body } of this.walkers) {
      const stats = body.stats;
      totals.frames += stats.frames;
      totals.legFrames += stats.legFrames;
      totals.clamped += stats.clampedLegFrames;
      totals.normal += stats.normalFrames;
      totals.unstable += stats.unstableNormalFrames;
      totals.emergency += stats.emergencyFrames;
      totals.steps += stats.steps;
      totals.maxSlide = Math.max(totals.maxSlide, stats.maxSlide);
      for (const leg of body.legs) if (!leg.grounded) totals.stepping++;
    }
    return totals;
  }

  counters(): Record<string, number> {
    const totals = this.totals();
    const spiders = this.walkers.length;
    return {
      spiders,
      parts: spiders * SPIDER_PART_COUNT,
      legsStepping: totals.stepping,
      stepsPerSecond: this.time > 0 ? round3(totals.steps / this.time) : 0,
      simMsP50: round3(this.sim.p50()),
      simMsP95: round3(this.sim.p95()),
      presentMsP50: round3(this.present.p50()),
      presentMsP95: round3(this.present.p95()),
      clampedRatio: totals.legFrames > 0 ? round3(totals.clamped / totals.legFrames) : 0,
      emergencyRatio:
        totals.normal + totals.emergency > 0
          ? round3(totals.emergency / (totals.normal + totals.emergency))
          : 0,
      unstableFrames: totals.unstable,
      maxSlide: round3(totals.maxSlide),
    };
  }

  facts(): Record<string, string | number | boolean> {
    return {
      ...kitFacts(this.load, this.options.pxPerUnit),
      zoom: this.options.zoom,
      speed: this.options.speed,
      turn: this.options.turn,
      legsPerSpider: this.walkers[0]?.body.legCount ?? 0,
      partsPerSpider: SPIDER_PART_COUNT,
    };
  }

  invariants(): Invariant[] {
    const totals = this.totals();
    const clampedRatio = totals.legFrames > 0 ? totals.clamped / totals.legFrames : 0;
    return [
      {
        id: 'support-stable',
        ok: totals.unstable === 0,
        detail: `normal rejimde ağırlık merkezi destek dışında kalan kare: ${totals.unstable}/${totals.normal}`,
      },
      {
        id: 'ik-reach',
        ok: clampedRatio <= 0.02,
        detail: `IK erişim dışı bacak-kare oranı ${round3(clampedRatio)} (sınır 0,02)`,
      },
      {
        id: 'spiders-walk',
        ok: this.options.speed === 0 || totals.steps > 0,
        detail: `${totals.steps} adım atıldı`,
      },
    ];
  }

  act(name: string, args: Record<string, unknown>): unknown {
    if (name === 'setCount') return { count: this.setCount(Number(args.count)) };
    throw new Error(`bilinmeyen eylem: ${name}`);
  }

  destroy(): void {
    for (const walker of this.walkers) walker.view.destroy();
    this.walkers.length = 0;
  }
}

export const arachnidSwarm: WorkloadDef = {
  id: 'arachnid-swarm',
  title: 'Bacaklı örümcek sürüsü',
  summary:
    'Her örümcek sekiz bacaklı ve 36 parçalı: CORE LegGait (ayak-sabitleyen çapraz tetrapod yürüyüşü), iki kemikli IK (uyluk, kaval, pençe) ve destek poligonu denetimi. Örümcekler yumuşakça gezinir, döner, yavaşlar ve durur. Maliyet iki parçadır ve ayrı ölçülür: sim (yürüyüş matematiği, simMs) ve sunum (parça yerleştirme, presentMs); çizim maliyeti kare süresindedir. Değişmezler: normal rejimde denge, IK erişimi.',
  scene: LAB_SCENE_KEY,
  params: PARAMS,
  actions: [
    {
      name: 'setCount',
      summary: 'Örümcek sayısını canlı değiştirir (kapasite taraması için).',
      args: [PARAMS[0]],
    },
  ],
  async create(context, params) {
    const pxPerUnit = Number(params.raster);
    const load = await loadKit(context.scene, SPIDER_ASSETS, pxPerUnit);
    const { width, height } = context.scene.scale;
    return new SwarmInstance(
      phaserParts(context.scene),
      load,
      {
        zoom: Number(params.zoom),
        pxPerUnit,
        speed: Number(params.speed),
        turn: Number(params.turn),
        width,
        height,
      },
      Number(params.seed),
      Number(params.count),
    );
  },
};
