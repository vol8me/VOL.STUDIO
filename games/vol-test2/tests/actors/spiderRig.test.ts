import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART } from '../../scripts/art/spider';
import { ASSETS, type AssetId } from '../../src/art/manifest';
import {
  ABDOMEN_PIVOT_BODY,
  buildLegs,
  DEFAULT_SPIDER,
  FEMUR_LENGTH,
  LOWER_LENGTH,
  MAX_REACH,
  REACTOR_BODY,
  SPIDER_ANCHORS,
  STANCE_DEG,
} from '../../src/actors/spiderRig';

const DIR = join(import.meta.dirname, '../../src/art/kit');
const read = (id: AssetId): string => readFileSync(join(DIR, ASSETS[id].file), 'utf8');

interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

function circles(svg: string): Circle[] {
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    r: Number(match[3]),
  }));
}

const hasCircle = (svg: string, x: number, y: number): boolean =>
  circles(svg).some((circle) => Math.abs(circle.x - x) < 0.01 && Math.abs(circle.y - y) < 0.01);

/** `<g transform="scale(k)">` çarpanı: başgöğüs ve karın taban koordinatlarında çizilip büyütülür. */
function groupScale(svg: string): number {
  const match = /transform="scale\(([\d.]+)\)"/.exec(svg);
  return match === null ? 1 : Number(match[1]);
}

/** Bir yolun `M/L` köşeleri (çokgen yolları). */
function vertices(path: string): [number, number][] {
  return [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function distanceToPolygon(x: number, y: number, polygon: readonly [number, number][]): number {
  let best = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const [ax, ay] = polygon[index];
    const [bx, by] = polygon[(index + 1) % polygon.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

describe('SPIDER_ANCHORS: rig sabitleri üreteçle ve SVG dosyalarıyla örtüşür', () => {
  it('rig sayıları sanat üretecinin sayılarıdır (çizim değişirse rig sessizce bozulmaz)', () => {
    const { femur, tibia, carapace, abdomen, reactor, shadow } = SPIDER_ANCHORS;
    expect(femur).toEqual({
      width: SPIDER_ART.femur.w,
      height: SPIDER_ART.femur.h,
      a: SPIDER_ART.femur.a,
      b: SPIDER_ART.femur.b,
    });
    expect(tibia).toEqual({
      width: SPIDER_ART.tibia.w,
      height: SPIDER_ART.tibia.h,
      a: SPIDER_ART.tibia.a,
      tip: SPIDER_ART.tibia.tip,
    });
    expect(carapace.width).toBe(SPIDER_ART.carapace.w);
    expect(carapace.height).toBe(SPIDER_ART.carapace.h);
    expect(carapace.center).toEqual(SPIDER_ART.carapace.center);
    expect([...carapace.hipsX]).toEqual(SPIDER_ART.carapace.hipsX);
    expect([...carapace.hipsY]).toEqual(SPIDER_ART.carapace.hipsY);
    expect(abdomen.width).toBe(SPIDER_ART.abdomen.w);
    expect(abdomen.height).toBe(SPIDER_ART.abdomen.h);
    expect(abdomen.pivot).toEqual(SPIDER_ART.abdomen.pivot);
    expect(abdomen.vent).toEqual(SPIDER_ART.abdomen.vent);
    expect(reactor.width).toBe(SPIDER_ART.reactor.w);
    expect(shadow.width).toBe(SPIDER_ART.shadow.w);
  });

  it('bildirilen boyutlar manifestteki boyutlardır', () => {
    const sized: [AssetId, { width: number; height: number }][] = [
      ['arachnid-carapace', SPIDER_ANCHORS.carapace],
      ['arachnid-femur', SPIDER_ANCHORS.femur],
      ['arachnid-tibia', SPIDER_ANCHORS.tibia],
      ['arachnid-abdomen', SPIDER_ANCHORS.abdomen],
      ['arachnid-reactor', SPIDER_ANCHORS.reactor],
      ['arachnid-shadow', SPIDER_ANCHORS.shadow],
    ];
    for (const [id, anchor] of sized) {
      expect(ASSETS[id].width, id).toBe(anchor.width);
      expect(ASSETS[id].height, id).toBe(anchor.height);
    }
  });

  it('uyluk eklem daireleri bağlantı noktalarında, kavalın dizi A noktasındadır', () => {
    const { femur, tibia } = SPIDER_ANCHORS;
    const femurSvg = read('arachnid-femur');
    expect(hasCircle(femurSvg, femur.a[0], femur.a[1])).toBe(true);
    expect(hasCircle(femurSvg, femur.b[0], femur.b[1])).toBe(true);
    expect(hasCircle(read('arachnid-tibia'), tibia.a[0], tibia.a[1])).toBe(true);
  });

  it('kaval pençe ucunda biter: kemik yolu ucu (tip) köşe olarak taşır', () => {
    const { tibia } = SPIDER_ANCHORS;
    expect(read('arachnid-tibia')).toContain(`${tibia.tip[0]} ${tibia.tip[1]}C`);
  });

  it('reaktör ve gölge kendi merkezindedir', () => {
    expect(hasCircle(read('arachnid-reactor'), 32, 32)).toBe(true);
    expect(hasCircle(read('arachnid-shadow'), 96, 96)).toBe(true);
  });

  it('kalçalar kabuğun kenarındadır: ne içeride kaybolur ne boşlukta asılı kalır', () => {
    const { hipsX, hipsY, center } = SPIDER_ANCHORS.carapace;
    const svg = read('arachnid-carapace');
    const k = groupScale(svg);
    const hull = /<path d="(M106 54[^"]+)"/.exec(svg)?.[1] ?? '';
    const polygon = vertices(hull).map(([x, y]) => [x * k, y * k] as [number, number]);
    expect(polygon.length).toBeGreaterThanOrEqual(8);
    hipsX.forEach((x, pair) => {
      for (const y of [hipsY[pair], 2 * center[1] - hipsY[pair]])
        expect(distanceToPolygon(x, y, polygon), `çift ${pair}`).toBeLessThanOrEqual(4);
    });
  });

  it('karın bağlantı noktasında uçlanır ve reaktör havalandırması karnın içindedir', () => {
    const { abdomen } = SPIDER_ANCHORS;
    const svg = read('arachnid-abdomen');
    const k = groupScale(svg);
    expect(svg).toContain('M112 54C');
    expect(112 * k).toBeCloseTo(abdomen.pivot[0], 5);
    expect(hasCircle(svg, abdomen.vent[0] / k, abdomen.vent[1] / k)).toBe(true);
    expect(abdomen.vent[0]).toBeLessThan(abdomen.pivot[0]);
    expect(abdomen.vent[1]).toBe(abdomen.pivot[1]);
  });
});

describe('uzuv uzunlukları ve oranları', () => {
  it('kemik uzunlukları eklem noktalarından türer; ayak pençe ucundadır', () => {
    expect(FEMUR_LENGTH).toBe(44);
    expect(LOWER_LENGTH).toBe(64);
    expect(MAX_REACH).toBe(FEMUR_LENGTH + LOWER_LENGTH);
  });

  it('bacak ince çubuk değil dolgun kapsüldür: kalınlık uzunluğa oranla yeterli', () => {
    const { femur, tibia } = SPIDER_ANCHORS;
    expect(femur.height / FEMUR_LENGTH).toBeGreaterThanOrEqual(0.6);
    expect(tibia.height / LOWER_LENGTH).toBeGreaterThanOrEqual(0.4);
  });

  it('reaktör karın havalandırmasının gövdedeki izdüşümüdür', () => {
    expect(ABDOMEN_PIVOT_BODY).toEqual([-44, 0]);
    const { pivot, vent } = SPIDER_ANCHORS.abdomen;
    expect(REACTOR_BODY[0]).toBeCloseTo(-44 + (vent[0] - pivot[0]), 9);
    expect(REACTOR_BODY[1]).toBeCloseTo(0, 9);
    expect(REACTOR_BODY[0]).toBeLessThan(ABDOMEN_PIVOT_BODY[0]);
  });

  it('dinlenme erişimi dizi bükecek kadar kısa, adım tetiği erişim payının içindedir', () => {
    expect(DEFAULT_SPIDER.homeReach).toBeLessThan(MAX_REACH * 0.8);
    expect(DEFAULT_SPIDER.homeReach).toBeGreaterThan(FEMUR_LENGTH);
    expect(DEFAULT_SPIDER.homeReach + DEFAULT_SPIDER.stepTriggerPx).toBeLessThanOrEqual(MAX_REACH);
    expect(DEFAULT_SPIDER.maxStrainPx).toBeGreaterThan(DEFAULT_SPIDER.stepTriggerPx);
  });
});

describe('yürüyüş ayarı erişim payının içindedir', () => {
  const legs = buildLegs();
  const homeRelative = (leg: (typeof legs)[number]): [number, number] => [
    Math.cos(leg.stance) * DEFAULT_SPIDER.homeReach,
    leg.side * Math.sin(leg.stance) * DEFAULT_SPIDER.homeReach,
  ];
  const MIN_REACH = Math.abs(FEMUR_LENGTH - LOWER_LENGTH);

  it('acil eşikte geride kalan ayak hiçbir bacağın erişimini aşmaz (IK kelepçelemez)', () => {
    for (const leg of legs) {
      const [hx, hy] = homeRelative(leg);
      const reach = Math.hypot(hx - DEFAULT_SPIDER.maxStrainPx, hy);
      expect(reach, `çift ${leg.pair} yan ${leg.side}`).toBeLessThanOrEqual(MAX_REACH);
    }
  });

  it('öngörü noktası hiçbir bacağı gövdeye katlamaz ya da gerdirmez', () => {
    for (const leg of legs) {
      const [hx, hy] = homeRelative(leg);
      const reach = Math.hypot(hx + DEFAULT_SPIDER.maxLeadPx, hy);
      expect(reach, `çift ${leg.pair} yan ${leg.side}`).toBeLessThanOrEqual(MAX_REACH);
      expect(reach, `çift ${leg.pair} yan ${leg.side}`).toBeGreaterThan(MIN_REACH);
    }
  });
});

describe('buildLegs', () => {
  const legs = buildLegs();

  it('dört çift: her çiftte bir sol (y<0) bir sağ (y>0) bacak, kalçalar aynalıdır', () => {
    expect(legs).toHaveLength(8);
    for (let pair = 0; pair < 4; pair++) {
      const left = legs.find((leg) => leg.pair === pair && leg.side === -1);
      const right = legs.find((leg) => leg.pair === pair && leg.side === 1);
      expect(left && right).toBeTruthy();
      expect(left?.hip[1]).toBeLessThan(0);
      expect(right?.hip[1]).toBeGreaterThan(0);
      expect(left?.hip[0]).toBe(right?.hip[0]);
      expect(left?.hip[1]).toBe(-(right?.hip[1] ?? 0));
    }
  });

  it('komşu kalçalar uyluk başlığının çapından uzaktır: başlıklar üst üste binmez', () => {
    for (const a of legs)
      for (const b of legs) {
        if (a === b) continue;
        expect(Math.hypot(a.hip[0] - b.hip[0], a.hip[1] - b.hip[1])).toBeGreaterThanOrEqual(20);
      }
  });

  it('duruş açıları ön bacaktan arkaya doğru artar', () => {
    const stances = [0, 1, 2, 3].map((pair) => STANCE_DEG[pair]);
    expect([...stances].sort((a, b) => a - b)).toEqual(stances);
    expect(stances[0]).toBeLessThan(90);
    expect(stances[3]).toBeGreaterThan(90);
  });

  it('tetrapod grupları çaprazdır: sol-1, sağ-2, sol-3, sağ-4 birlikte', () => {
    const group = (pair: number, side: -1 | 1): number =>
      legs.find((leg) => leg.pair === pair && leg.side === side)?.group ?? -1;
    expect(group(0, -1)).toBe(group(1, 1));
    expect(group(0, -1)).toBe(group(2, -1));
    expect(group(0, -1)).toBe(group(3, 1));
    expect(group(0, 1)).toBe(group(1, -1));
    expect(group(0, 1)).toBe(group(2, 1));
    expect(group(0, 1)).toBe(group(3, -1));
    expect(group(0, -1)).not.toBe(group(0, 1));
    expect(legs.filter((leg) => leg.group === 0)).toHaveLength(4);
  });
});
