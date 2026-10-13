import { describe, expect, it } from 'vitest';
import { textureKey } from '../../src/lab/assets/textures';
import { BLEND } from '../../src/lab/parts';
import { SpiderBody } from '../../src/lab/spiderBody';
import {
  ABDOMEN_PIVOT_BODY,
  DEFAULT_SPIDER,
  REACTOR_BODY,
  SPIDER_ANCHORS,
  TIBIA_LENGTH,
} from '../../src/lab/spiderRig';
import { SPIDER_PART_COUNT, SpiderView, type SpiderViewOptions } from '../../src/lab/spiderView';
import { FakeFactory, type FakePart } from './fakeParts';

const OPTIONS: SpiderViewOptions = { zoom: 1.5, pxPerUnit: 2, depthBase: 30, phase: 0.3 };

function build(options: SpiderViewOptions = OPTIONS): {
  factory: FakeFactory;
  view: SpiderView;
  body: SpiderBody;
} {
  const factory = new FakeFactory();
  const body = new SpiderBody();
  body.reset(100, 50, 0);
  const view = new SpiderView(factory, options, body.legCount);
  return { factory, view, body };
}

const only = (factory: FakeFactory, id: Parameters<typeof textureKey>[0]): FakePart[] =>
  factory.byKey(textureKey(id, OPTIONS.pxPerUnit));

describe('SpiderView: kurulum', () => {
  it('36 parça: gölge, 8×(uyluk, kaval, pençe, kalça), karın, başgöğüs, reaktör', () => {
    const { factory, view } = build();
    expect(SPIDER_PART_COUNT).toBe(36);
    expect(view.partCount).toBe(SPIDER_PART_COUNT);
    expect(factory.parts).toHaveLength(SPIDER_PART_COUNT);
    for (const id of ['femur', 'tibia', 'claw', 'coxa'] as const)
      expect(only(factory, `arachnid-${id}`)).toHaveLength(8);
    for (const id of ['shadow', 'abdomen', 'carapace', 'reactor'] as const)
      expect(only(factory, `arachnid-${id}`)).toHaveLength(1);
  });

  it('çizim sırası gölge < uyluk < kaval < pençe < kalça < karın < başgöğüs < reaktör ve tabana göre aralıklıdır', () => {
    const { factory } = build();
    const depth = (id: Parameters<typeof textureKey>[0]): number => only(factory, id)[0].depth;
    const order = [
      'arachnid-shadow',
      'arachnid-femur',
      'arachnid-tibia',
      'arachnid-claw',
      'arachnid-coxa',
      'arachnid-abdomen',
      'arachnid-carapace',
      'arachnid-reactor',
    ] as const;
    const depths = order.map(depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    expect(new Set(depths).size).toBe(order.length);
    expect(depths[0]).toBe(OPTIONS.depthBase);
    expect(depths[order.length - 1]).toBeLessThan(OPTIONS.depthBase + 10);
  });

  it('ölçek zoom/pxPerUnit; gölge ayrıca gövde ölçeğiyle büyür; bağlantı noktaları origin olur', () => {
    const { factory } = build();
    const scale = OPTIONS.zoom / OPTIONS.pxPerUnit;
    expect(only(factory, 'arachnid-femur')[0].scaleX).toBeCloseTo(scale);
    expect(only(factory, 'arachnid-shadow')[0].scaleX).toBeGreaterThan(scale);
    const femur = only(factory, 'arachnid-femur')[0];
    expect(femur.originX).toBeCloseTo(SPIDER_ANCHORS.femur.a[0] / SPIDER_ANCHORS.femur.width);
    expect(femur.originY).toBeCloseTo(SPIDER_ANCHORS.femur.a[1] / SPIDER_ANCHORS.femur.height);
    const abdomen = only(factory, 'arachnid-abdomen')[0];
    expect(abdomen.originX).toBeCloseTo(
      SPIDER_ANCHORS.abdomen.pivot[0] / SPIDER_ANCHORS.abdomen.width,
    );
    expect(only(factory, 'arachnid-reactor')[0].blend).toBe(BLEND.add);
    expect(only(factory, 'arachnid-carapace')[0].blend).toBe(BLEND.normal);
  });
});

describe('SpiderView: yerleştirme', () => {
  it('başgöğüs gövde konumundadır; uyluk kalçada, kaval dizde, pençe kavalın ucundadır', () => {
    const { factory, view, body } = build();
    view.update(body, 100, 50, 0, 0);
    expect(only(factory, 'arachnid-carapace')[0].x).toBeCloseTo(100 * OPTIONS.zoom);
    expect(only(factory, 'arachnid-carapace')[0].y).toBeCloseTo(50 * OPTIONS.zoom);
    const pose = body.legs[0];
    const femur = only(factory, 'arachnid-femur')[0];
    const tibia = only(factory, 'arachnid-tibia')[0];
    const claw = only(factory, 'arachnid-claw')[0];
    expect(femur.x).toBeCloseTo((100 + pose.hipX) * OPTIONS.zoom);
    expect(femur.y).toBeCloseTo((50 + pose.hipY) * OPTIONS.zoom);
    expect(femur.rotation).toBeCloseTo(pose.femurRad);
    expect(tibia.x).toBeCloseTo((100 + pose.kneeX) * OPTIONS.zoom);
    expect(tibia.rotation).toBeCloseTo(pose.tibiaRad);
    expect(claw.x).toBeCloseTo(
      (100 + pose.kneeX + Math.cos(pose.tibiaRad) * TIBIA_LENGTH) * OPTIONS.zoom,
    );
    expect(claw.y).toBeCloseTo(
      (50 + pose.kneeY + Math.sin(pose.tibiaRad) * TIBIA_LENGTH) * OPTIONS.zoom,
    );
  });

  it('gövde açısı bütün parçaları birlikte döndürür', () => {
    const { factory, view, body } = build();
    view.update(body, 0, 0, 0, 0);
    const offsetUnrotated = (): [number, number] => {
      const femur = only(factory, 'arachnid-femur')[0];
      return [femur.x, femur.y];
    };
    const [x0, y0] = offsetUnrotated();
    view.update(body, 0, 0, Math.PI / 2, 0);
    const [x1, y1] = offsetUnrotated();
    // 90° dönünce (x, y) → (-y, x).
    expect(x1).toBeCloseTo(-y0);
    expect(y1).toBeCloseTo(x0);
    expect(only(factory, 'arachnid-femur')[0].rotation).toBeCloseTo(
      body.legs[0].femurRad + Math.PI / 2,
    );
  });

  it('karın bağlantıda durur, reaktör karnın havalandırmasında; sallanma 3,2° ile sınırlıdır', () => {
    const { factory, view, body } = build();
    const abdomen = only(factory, 'arachnid-abdomen')[0];
    const reactor = only(factory, 'arachnid-reactor')[0];
    let maxSway = 0;
    for (let t = 0; t < 6; t += 0.05) {
      view.update(body, 0, 0, 0, t);
      maxSway = Math.max(maxSway, Math.abs(abdomen.rotation));
      expect(abdomen.x).toBeCloseTo(ABDOMEN_PIVOT_BODY[0] * OPTIONS.zoom);
      // Reaktör, karın dönse de bağlantıdan sabit uzaklıktadır.
      const radius = Math.hypot(
        reactor.x - ABDOMEN_PIVOT_BODY[0] * OPTIONS.zoom,
        reactor.y - ABDOMEN_PIVOT_BODY[1] * OPTIONS.zoom,
      );
      expect(radius).toBeCloseTo(
        Math.hypot(
          REACTOR_BODY[0] - ABDOMEN_PIVOT_BODY[0],
          REACTOR_BODY[1] - ABDOMEN_PIVOT_BODY[1],
        ) * OPTIONS.zoom,
        6,
      );
    }
    expect(maxSway).toBeGreaterThan(0.03);
    expect(maxSway).toBeLessThanOrEqual((3.2 * Math.PI) / 180 + 1e-9);
  });

  it('reaktör nabzı 0,55..1 alfa aralığında kalır; faz iki örümceği ayırır', () => {
    const a = build({ ...OPTIONS, phase: 0 });
    const b = build({ ...OPTIONS, phase: 0.6 });
    const alphaA = only(a.factory, 'arachnid-reactor')[0];
    const alphaB = only(b.factory, 'arachnid-reactor')[0];
    let differed = false;
    for (let t = 0; t < 3; t += 0.1) {
      a.view.update(a.body, 0, 0, 0, t);
      b.view.update(b.body, 0, 0, 0, t);
      for (const part of [alphaA, alphaB]) {
        expect(part.alpha).toBeGreaterThanOrEqual(0.55 - 1e-9);
        expect(part.alpha).toBeLessThanOrEqual(1 + 1e-9);
      }
      if (Math.abs(alphaA.alpha - alphaB.alpha) > 0.01) differed = true;
    }
    expect(differed).toBe(true);
  });

  it('adım tepesinde kaval ve pençe kalınlaşır (ayak kameraya yaklaşır), yerdeki bacak sabit kalır', () => {
    const { factory, view, body } = build();
    let x = 100;
    let lifted = -1;
    for (let frame = 0; frame < 120 && lifted < 0; frame++) {
      x += 1.5;
      body.update(x, 50, 0, 90, 0, 1000 / 60);
      lifted = body.legs.findIndex((leg) => leg.lift > 0.5);
    }
    expect(lifted).toBeGreaterThanOrEqual(0);
    view.update(body, x, 50, 0, 0);
    const base = OPTIONS.zoom / OPTIONS.pxPerUnit;
    const lift = body.legs[lifted].lift;
    expect(only(factory, 'arachnid-tibia')[lifted].scaleY).toBeCloseTo(
      base * (1 + DEFAULT_SPIDER.liftScale * lift),
    );
    const grounded = body.legs.findIndex((leg) => leg.lift === 0);
    expect(only(factory, 'arachnid-tibia')[grounded].scaleY).toBeCloseTo(base);
  });

  it('liftScale seçeneği kalınlaşmayı ayarlar; destroy 36 parçayı da yok eder', () => {
    const { factory, view, body } = build({ ...OPTIONS, liftScale: 0 });
    let x = 100;
    for (let frame = 0; frame < 60; frame++) {
      x += 1.5;
      body.update(x, 50, 0, 90, 0, 1000 / 60);
    }
    view.update(body, x, 50, 0, 0);
    for (const tibia of only(factory, 'arachnid-tibia'))
      expect(tibia.scaleY).toBeCloseTo(OPTIONS.zoom / OPTIONS.pxPerUnit);
    view.destroy();
    expect(factory.parts.every((part) => part.destroyed)).toBe(true);
    expect(view.partCount).toBe(0);
  });
});
