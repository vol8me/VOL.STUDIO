import { animationValue, type AnimSpec } from './anim';
import { textureKey } from './assets/textures';
import { BLEND, type PartFactory, type PartPort } from './parts';
import type { SpiderBody } from './spiderBody';
import {
  ABDOMEN_PIVOT_BODY,
  DEFAULT_SPIDER,
  REACTOR_BODY,
  SHADOW_BODY,
  SHADOW_SCALE,
  SPIDER_ANCHORS,
  TIBIA_LENGTH,
} from './spiderRig';

export interface SpiderViewOptions {
  /** Ekranda tasarım birimi başına piksel. */
  readonly zoom: number;
  /** Dokuların rasterlendiği çözünürlük (tasarım birimi başına piksel). */
  readonly pxPerUnit: number;
  /** Bu örümceğin çizim derinliği tabanı: örümcekler birbirine karışmasın diye aralıklıdır. */
  readonly depthBase: number;
  /** Nabız ve karın salınımı faz kayması (sn): sürüde hepsi aynı anda atmasın. */
  readonly phase: number;
  /** Bacak parçalarının kalınlığı, adım tepesinde bu oranda artar (ayak kameraya yaklaşır). */
  readonly liftScale?: number;
}

/** Her örümcekte gövde parçası katmanları; sıra çizim sırasıdır. */
export const SPIDER_PART_COUNT = 1 + 8 + 8 + 8 + 8 + 1 + 1 + 1;

const REACTOR_PULSE: AnimSpec = { kind: 'pulse', min: 0.55, max: 1, hz: 0.9 };
const ABDOMEN_SWAY_DEG = 3.2;
const ABDOMEN_SWAY_HZ = 0.8;

interface LegParts {
  readonly coxa: PartPort;
  readonly femur: PartPort;
  readonly tibia: PartPort;
  readonly claw: PartPort;
}

/**
 * Bir `SpiderBody`nin Phaser nesneleri. Gövde uzayındaki pozu dünyaya ve ekrana çevirir; mantık
 * taşımaz. Parçalar dünya uzayında düz nesnelerdir (iç içe kap yok): ekran piksel konumu doğrudan
 * hesaplanır, böylece binlerce parça kare başına yalnız atama maliyeti öder.
 */
export class SpiderView {
  private readonly shadow: PartPort;
  private readonly abdomen: PartPort;
  private readonly carapace: PartPort;
  private readonly reactor: PartPort;
  private readonly legs: LegParts[] = [];
  private readonly scale: number;
  private readonly liftScale: number;
  private readonly parts: PartPort[] = [];

  constructor(
    factory: PartFactory,
    private readonly options: SpiderViewOptions,
    legCount: number,
  ) {
    this.scale = options.zoom / options.pxPerUnit;
    this.liftScale = options.liftScale ?? DEFAULT_SPIDER.liftScale;
    const base = options.depthBase;
    const make = (id: Parameters<typeof textureKey>[0], depth: number): PartPort => {
      const part = factory.image(textureKey(id, options.pxPerUnit));
      part.setDepth(base + depth);
      part.scaleX = this.scale;
      part.scaleY = this.scale;
      this.parts.push(part);
      return part;
    };
    const origin = (
      part: PartPort,
      anchor: readonly [number, number],
      width: number,
      height: number,
    ): void => {
      part.setOrigin(anchor[0] / width, anchor[1] / height);
    };

    this.shadow = make('arachnid-shadow', 0);
    this.shadow.scaleX = this.scale * SHADOW_SCALE[0];
    this.shadow.scaleY = this.scale * SHADOW_SCALE[1];
    const shadow = SPIDER_ANCHORS.shadow;
    origin(this.shadow, shadow.center, shadow.width, shadow.height);

    const { femur, tibia, claw, coxa } = SPIDER_ANCHORS;
    for (let index = 0; index < legCount; index++) {
      const legParts: LegParts = {
        femur: make('arachnid-femur', 1),
        tibia: make('arachnid-tibia', 2),
        claw: make('arachnid-claw', 3),
        coxa: make('arachnid-coxa', 4),
      };
      origin(legParts.femur, femur.a, femur.width, femur.height);
      origin(legParts.tibia, tibia.a, tibia.width, tibia.height);
      origin(legParts.claw, claw.a, claw.width, claw.height);
      origin(legParts.coxa, coxa.center, coxa.width, coxa.height);
      this.legs.push(legParts);
    }

    this.abdomen = make('arachnid-abdomen', 5);
    origin(
      this.abdomen,
      SPIDER_ANCHORS.abdomen.pivot,
      SPIDER_ANCHORS.abdomen.width,
      SPIDER_ANCHORS.abdomen.height,
    );
    this.carapace = make('arachnid-carapace', 6);
    origin(
      this.carapace,
      SPIDER_ANCHORS.carapace.center,
      SPIDER_ANCHORS.carapace.width,
      SPIDER_ANCHORS.carapace.height,
    );
    this.reactor = make('arachnid-reactor', 7);
    this.reactor.setBlendMode(BLEND.add);
    origin(
      this.reactor,
      SPIDER_ANCHORS.reactor.center,
      SPIDER_ANCHORS.reactor.width,
      SPIDER_ANCHORS.reactor.height,
    );
  }

  get partCount(): number {
    return this.parts.length;
  }

  /** Gövdenin dünya konumu ve yönüne göre bütün parçaları yerleştirir (konum tasarım biriminde). */
  update(body: SpiderBody, x: number, y: number, angle: number, timeSeconds: number): void {
    const zoom = this.options.zoom;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (part: PartPort, lx: number, ly: number, rotation: number): void => {
      part.x = (x + lx * cos - ly * sin) * zoom;
      part.y = (y + lx * sin + ly * cos) * zoom;
      part.rotation = angle + rotation;
    };

    place(this.shadow, SHADOW_BODY[0], SHADOW_BODY[1], 0);
    for (let index = 0; index < this.legs.length; index++) {
      const pose = body.legs[index];
      const parts = this.legs[index];
      const thickness = this.scale * (1 + this.liftScale * pose.lift);
      place(parts.femur, pose.hipX, pose.hipY, pose.femurRad);
      parts.femur.scaleY = thickness;
      place(parts.tibia, pose.kneeX, pose.kneeY, pose.tibiaRad);
      parts.tibia.scaleY = thickness;
      // Pençe kavalın ucundan başlar: kaval B noktası eklemin 48 birim ilerisindedir.
      const reach = TIBIA_LENGTH;
      place(
        parts.claw,
        pose.kneeX + Math.cos(pose.tibiaRad) * reach,
        pose.kneeY + Math.sin(pose.tibiaRad) * reach,
        pose.tibiaRad,
      );
      parts.claw.scaleY = thickness;
      place(parts.coxa, pose.hipX, pose.hipY, 0);
    }

    // Karın hafifçe salınır; reaktör karnın havalandırmasında olduğu için onunla birlikte döner.
    const sway =
      ((ABDOMEN_SWAY_DEG * Math.PI) / 180) *
      Math.sin(2 * Math.PI * ABDOMEN_SWAY_HZ * (timeSeconds + this.options.phase));
    place(this.abdomen, ABDOMEN_PIVOT_BODY[0], ABDOMEN_PIVOT_BODY[1], sway);
    const offsetX = REACTOR_BODY[0] - ABDOMEN_PIVOT_BODY[0];
    const offsetY = REACTOR_BODY[1] - ABDOMEN_PIVOT_BODY[1];
    const swayCos = Math.cos(sway);
    const swaySin = Math.sin(sway);
    place(
      this.reactor,
      ABDOMEN_PIVOT_BODY[0] + offsetX * swayCos - offsetY * swaySin,
      ABDOMEN_PIVOT_BODY[1] + offsetX * swaySin + offsetY * swayCos,
      0,
    );
    this.reactor.alpha = animationValue(REACTOR_PULSE, timeSeconds, this.options.phase);
    place(this.carapace, 0, 0, 0);
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
    this.legs.length = 0;
  }
}
