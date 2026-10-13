import { ASSET_LIST, TILE_UNITS, type AssetId } from '../assets/manifest';
import { kitFacts, loadKit, type KitLoad } from '../assets/textures';
import type { Invariant } from '../judge';
import { LAB_SCENE_KEY } from '../LabScene';
import { layoutFactory, type Layout } from '../layout';
import type { ParamSpec } from '../params';
import { phaserParts } from '../phaserParts';
import { PropField } from '../propField';
import { PROPS } from '../props';
import { seeded } from '../random';
import { round3, SpanTimer } from '../timing';
import type { WorkloadDef, WorkloadInstance } from '../workload';

const PARAMS: readonly ParamSpec[] = [
  {
    name: 'cols',
    type: 'integer',
    default: 40,
    min: 9,
    max: 160,
    description: 'zemin genişliği (karo)',
  },
  {
    name: 'rows',
    type: 'integer',
    default: 24,
    min: 9,
    max: 100,
    description: 'zemin yüksekliği (karo)',
  },
  {
    name: 'raster',
    type: 'choice',
    default: '1',
    choices: ['1', '2', '4'],
    description: 'SVG doku çözünürlüğü (tasarım birimi başına px); doku belleğini belirler',
  },
  {
    name: 'fill',
    type: 'number',
    default: 0.3,
    min: 0,
    max: 1,
    description: 'boş zemini dolduran cevher/duvar yoğunluğu',
  },
  {
    name: 'animate',
    type: 'boolean',
    default: true,
    description: 'bant, rotor, fan, parıltı, taret ve halka animasyonu',
  },
  {
    name: 'seed',
    type: 'integer',
    default: 7,
    min: 0,
    max: 2_147_483_647,
    description: 'yerleşim tohumu',
  },
];

/** Yapıların kullandığı bütün varlıklar (tekrarsız): raster tek kez yapılır. */
function usedAssets(): AssetId[] {
  const ids = new Set<AssetId>();
  for (const def of Object.values(PROPS)) for (const layer of def.layers) ids.add(layer.asset);
  return ASSET_LIST.map((asset) => asset.id).filter((id) => ids.has(id));
}

class SvgPropsInstance implements WorkloadInstance {
  private time = 0;
  private animate: boolean;
  private readonly anim = new SpanTimer(240);

  constructor(
    private readonly field: PropField,
    private readonly layout: Layout,
    private readonly load: KitLoad,
    private readonly pxPerUnit: number,
    private readonly zoom: number,
    animate: boolean,
  ) {
    this.animate = animate;
  }

  update(deltaMs: number): void {
    if (!this.animate) return;
    this.time += Math.min(deltaMs, 50) / 1000;
    this.anim.begin();
    this.field.update(this.time);
    this.anim.end();
  }

  counters(): Record<string, number> {
    const counts = this.field.counts();
    return {
      props: counts.props,
      parts: counts.parts,
      dynamicLayers: this.animate ? counts.dynamicLayers : 0,
      tileSprites: counts.tileSprites,
      animMsP50: round3(this.anim.p50()),
      animMsP95: round3(this.anim.p95()),
      animTime: round3(this.time),
    };
  }

  facts(): Record<string, string | number | boolean> {
    const facts: Record<string, string | number | boolean> = {
      ...kitFacts(this.load, this.pxPerUnit),
      grid: `${this.layout.cols}x${this.layout.rows}`,
      tilePx: round3(TILE_UNITS * this.zoom),
      animate: this.animate,
      emptyRatio: round3(this.layout.emptyRatio),
    };
    for (const [kind, count] of Object.entries(this.layout.counts)) facts[`props.${kind}`] = count;
    return facts;
  }

  invariants(): Invariant[] {
    const counts = this.field.counts();
    return [
      {
        id: 'props-built',
        ok: counts.props === this.layout.placements.length && counts.props > 0,
        detail: `${counts.props}/${this.layout.placements.length} yapı, ${counts.parts} parça`,
      },
      {
        id: 'animation-advanced',
        ok: !this.animate || this.time > 0,
        detail: `animasyon saati ${round3(this.time)} sn`,
      },
    ];
  }

  act(name: string, args: Record<string, unknown>): unknown {
    if (name === 'setAnimate') {
      this.animate = args.on === true;
      return { animate: this.animate };
    }
    if (name === 'seek') {
      // Animasyonu dondurur ve kesin bir ana götürür: tekrarlanabilir ekran görüntüsü için.
      this.animate = false;
      this.time = Number(args.seconds);
      this.field.update(this.time);
      return { animate: false, time: this.time };
    }
    throw new Error(`bilinmeyen eylem: ${name}`);
  }

  destroy(): void {
    this.field.destroy();
  }
}

export const svgProps: WorkloadDef = {
  id: 'svg-props',
  title: 'Animasyonlu fabrika zemini',
  summary:
    'Üstten bakışlı tam bir fabrika: konveyör hatları (kayan bant), matkaplar ve cevher yamaları, dökümhaneler (parıltı ve fan), taretler (süpürme, geri tepme, namlu ateşi), duvarlar ve dönen halkalı çekirdek. Zemin ekrana sığdırılır, böylece bütün yapılar çizilir. Maliyet: parça sayısı × alan (çizim) ve hareketli katman sayısı (animMs). animate=false yalnız çizimi ölçer.',
  scene: LAB_SCENE_KEY,
  params: PARAMS,
  actions: [
    {
      name: 'setAnimate',
      summary: 'Animasyonu canlı açar ya da kapatır: çizim ve animasyon maliyetini ayırmak için.',
      args: [{ name: 'on', type: 'boolean', default: true, description: 'animasyon açık mı' }],
    },
    {
      name: 'seek',
      summary:
        'Animasyonu dondurur ve verilen saniyeye götürür: aynı an her seferinde aynı kareyi verir (görsel kıyas ve ekran görüntüsü).',
      args: [
        {
          name: 'seconds',
          type: 'number',
          default: 0,
          min: 0,
          max: 3600,
          required: true,
          description: 'animasyon saati (sn)',
        },
      ],
    },
  ],
  async create(context, params) {
    const cols = Number(params.cols);
    const rows = Number(params.rows);
    const pxPerUnit = Number(params.raster);
    const layout = layoutFactory({
      cols,
      rows,
      fill: Number(params.fill),
      random: seeded(Number(params.seed)),
    });
    const load = await loadKit(context.scene, usedAssets(), pxPerUnit);
    const { width, height } = context.scene.scale;
    const zoom = Math.min(width / (cols * TILE_UNITS), height / (rows * TILE_UNITS));
    const field = new PropField(phaserParts(context.scene), { zoom, pxPerUnit });
    for (const placement of layout.placements)
      field.add(placement.kind, placement.col, placement.row, placement.turns, placement.phase);
    return new SvgPropsInstance(field, layout, load, pxPerUnit, zoom, params.animate === true);
  },
};
