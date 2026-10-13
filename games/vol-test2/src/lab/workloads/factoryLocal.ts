import { FactoryController } from '@/app/FactoryController';
import type { FactoryHost } from '@/app/host';
import { TOOLS } from '@/config/game';
import { NET } from '@/config/factory';
import { FACTORY_SCENE_KEY } from '@/scenes/FactoryScene';
import { buildComb, type CombReport } from '@/sim/scenario';
import { FactorySim } from '@/sim/sim';
import type { Invariant } from '../judge';
import { LocalSession } from '../localSession';
import type { ParamSpec, ParamValues } from '../params';
import type { WorkloadContext, WorkloadDef, WorkloadInstance } from '../workload';

const TOOL_IDS = TOOLS.map((tool) => tool.id) as string[];

const PARAMS: readonly ParamSpec[] = [
  {
    name: 'size',
    type: 'choice',
    default: '128',
    choices: ['64', '128', '256'],
    description: 'dünya kenarı (tile)',
  },
  {
    name: 'belts',
    type: 'integer',
    default: 3000,
    min: 0,
    max: 30000,
    description: 'en çok konveyör sayısı',
  },
  {
    name: 'turrets',
    type: 'integer',
    default: 24,
    min: 0,
    max: 64,
    description: 'çekirdek çevresi taret sayısı',
  },
  {
    name: 'fill',
    type: 'integer',
    default: 2,
    min: 0,
    max: 4,
    description: 'bant karesi başına eşya (adım maliyeti)',
  },
  {
    name: 'smelterEvery',
    type: 'integer',
    default: 3,
    min: 0,
    max: 20,
    description: 'her N. satıra hat içi işleyici (0: yok)',
  },
  {
    name: 'sustainUnits',
    type: 'integer',
    default: 150,
    min: 0,
    max: 2000,
    description: 'canlı tutulan düşman birim sayısı',
  },
  {
    name: 'seed',
    type: 'integer',
    default: 7,
    min: 1,
    max: 1_000_000,
    description: 'dünya tohumu',
  },
];

const round = (value: number): number => Math.round(value * 1000) / 1000;

class FactoryLocalInstance implements WorkloadInstance {
  private faultsInjected = 0;

  constructor(
    private readonly host: FactoryHost,
    private readonly session: LocalSession,
    private readonly controller: FactoryController,
    private readonly report: CombReport,
    private readonly size: number,
  ) {}

  /** Yetkili dünyayı duvar saatine yetiştirir; sahne güncellemesinden (denetleyici karesinden) önce koşar. */
  update(): void {
    this.session.pump();
  }

  counters(): Record<string, number> {
    const hud = this.controller.hud();
    const lockstep = this.session.lockstep;
    return {
      tick: lockstep.sim?.tick ?? 0,
      lagTicks: lockstep.lagTicks,
      units: hud?.units ?? 0,
      hashChecks: lockstep.metrics.hashChecks,
      desyncs: this.controller.desyncs,
      resyncs: this.session.resyncs,
      stepMsP50: round(this.controller.stepMs.percentile(0.5)),
      stepMsP99: round(this.controller.stepMs.percentile(0.99)),
      authorityStepMs: round(this.session.authorityStepMs),
    };
  }

  facts(): Record<string, string | number | boolean> {
    return {
      size: this.size,
      belts: this.report.belts,
      drills: this.report.drills,
      smelters: this.report.smelters,
      turrets: this.report.turrets,
      items: this.report.items,
      loopback: true,
      'cost.includesAuthority': true,
    };
  }

  invariants(): Invariant[] {
    const lockstep = this.session.lockstep;
    const tick = lockstep.sim?.tick ?? 0;
    const due = tick >= NET.hashEvery * 2;
    return [
      {
        id: 'lockstep-running',
        ok: lockstep.status === 'running',
        detail: `durum ${lockstep.status}`,
      },
      {
        id: 'hash-verified',
        ok: !due || lockstep.metrics.hashChecks > 0,
        detail: due
          ? `${lockstep.metrics.hashChecks} karma denetimi`
          : 'henüz karma aralığına varılmadı',
      },
      {
        id: 'desyncs-explained',
        ok: this.controller.desyncs <= this.faultsInjected,
        detail: `${this.controller.desyncs} sapma, ${this.faultsInjected} enjekte hata`,
      },
    ];
  }

  act(name: string, args: Record<string, unknown>): unknown {
    if (name === 'corrupt') {
      const injected = this.session.corruptClient();
      if (injected) this.faultsInjected++;
      return { injected };
    }
    if (name === 'tap') {
      const tool = String(args.tool);
      if (!TOOL_IDS.includes(tool)) throw new Error(`bilinmeyen araç: ${tool}`);
      this.controller.select(tool as (typeof TOOLS)[number]['id']);
      const pending = this.controller.tap(Number(args.x), Number(args.y), args.secondary === true);
      return { submitted: pending !== null };
    }
    throw new Error(`bilinmeyen eylem: ${name}`);
  }

  destroy(): void {
    if (this.host.controller === this.controller) this.host.detach();
  }
}

export const factoryLocal: WorkloadDef = {
  id: 'factory-local',
  title: 'Fabrika döngü yükü',
  summary:
    'Sunucusuz kilit adım: yetkili FactorySim, sunucunun LockstepFeed paketleri, gerçek LockstepClient ve FactoryScene/WorldView çizimi aynı sayfada. Binlerce bant ve yüzlerce birimle simülasyon ve çizim maliyetini, karma denetimini ve yeniden eşitlemeyi sınar. Yetkili simülasyonun CPU maliyeti kare süresine girer (counters.authorityStepMs).',
  scene: FACTORY_SCENE_KEY,
  params: PARAMS,
  actions: [
    {
      name: 'corrupt',
      summary:
        'İstemci durumunu bozar; karma denetimi sapmayı yakalayıp yeniden eşitlemeli (hata enjeksiyonu).',
      args: [],
    },
    {
      name: 'tap',
      summary: "Bir tile'a araç uygular (yerleştirme/silme komutu gönderir).",
      args: [
        {
          name: 'tool',
          type: 'choice',
          default: 'conveyor',
          choices: TOOL_IDS,
          description: 'araç',
        },
        { name: 'x', type: 'integer', default: 0, min: 0, max: 255, description: 'tile x' },
        { name: 'y', type: 'integer', default: 0, min: 0, max: 255, description: 'tile y' },
        {
          name: 'secondary',
          type: 'boolean',
          default: false,
          description: 'ikincil dokunuş (silme)',
        },
      ],
    },
  ],
  create(context, params) {
    return Promise.resolve(build(context, params));
  },
};

function build(context: WorkloadContext, params: ParamValues): FactoryLocalInstance {
  const size = Number(params.size);
  const sustainUnits = Number(params.sustainUnits);
  const authority = FactorySim.create({
    width: size,
    height: size,
    seed: Number(params.seed),
    sustainUnits,
  });
  const report = buildComb(authority, {
    maxBelts: Number(params.belts),
    turrets: Number(params.turrets),
    fill: Number(params.fill),
    smelterEvery: Number(params.smelterEvery),
  });
  const session = new LocalSession(authority, { sustainUnits });
  const controller = new FactoryController(session, (notice) =>
    context.log.info('workload', 'notice', { ...notice }),
  );
  context.host.attach(controller);
  return new FactoryLocalInstance(context.host, session, controller, report, size);
}
