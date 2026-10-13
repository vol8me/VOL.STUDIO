import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS, type AssetId } from '../../src/lab/assets/manifest';
import {
  ABDOMEN_PIVOT_BODY,
  buildLegs,
  CLAW_LENGTH,
  DEFAULT_SPIDER,
  FEMUR_LENGTH,
  LOWER_LENGTH,
  MAX_REACH,
  REACTOR_BODY,
  SPIDER_ANCHORS,
  STANCE_DEG,
  TIBIA_LENGTH,
} from '../../src/lab/spiderRig';

const DIR = join(import.meta.dirname, '../../src/lab/assets');
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

describe('SPIDER_ANCHORS: rig sabitleri SVG dosyalarıyla örtüşür', () => {
  it('bildirilen boyutlar manifestteki boyutlardır', () => {
    const sized: [AssetId, { width: number; height: number }][] = [
      ['arachnid-carapace', SPIDER_ANCHORS.carapace],
      ['arachnid-femur', SPIDER_ANCHORS.femur],
      ['arachnid-tibia', SPIDER_ANCHORS.tibia],
      ['arachnid-claw', SPIDER_ANCHORS.claw],
      ['arachnid-coxa', SPIDER_ANCHORS.coxa],
      ['arachnid-abdomen', SPIDER_ANCHORS.abdomen],
      ['arachnid-reactor', SPIDER_ANCHORS.reactor],
      ['arachnid-shadow', SPIDER_ANCHORS.shadow],
    ];
    for (const [id, anchor] of sized) {
      expect(ASSETS[id].width, id).toBe(anchor.width);
      expect(ASSETS[id].height, id).toBe(anchor.height);
    }
  });

  it('uyluk ve kaval eklem daireleri tam bağlantı noktalarındadır', () => {
    const { femur, tibia } = SPIDER_ANCHORS;
    const femurSvg = read('arachnid-femur');
    expect(hasCircle(femurSvg, femur.a[0], femur.a[1])).toBe(true);
    expect(hasCircle(femurSvg, femur.b[0], femur.b[1])).toBe(true);
    const tibiaSvg = read('arachnid-tibia');
    expect(hasCircle(tibiaSvg, tibia.a[0], tibia.a[1])).toBe(true);
    expect(hasCircle(tibiaSvg, tibia.b[0], tibia.b[1])).toBe(true);
  });

  it('pençe eklemi dairesi (4,8) ve kırmızı uç çizgisi (20,9)da biter', () => {
    const { claw } = SPIDER_ANCHORS;
    const svg = read('arachnid-claw');
    expect(hasCircle(svg, claw.a[0], claw.a[1])).toBe(true);
    expect(svg).toContain(`${claw.tip[0]} ${claw.tip[1]}"`);
  });

  it('kalça plakası ve reaktör çekirdeği kendi merkezindedir', () => {
    expect(hasCircle(read('arachnid-coxa'), 10, 10)).toBe(true);
    expect(hasCircle(read('arachnid-reactor'), 24, 24)).toBe(true);
    expect(read('arachnid-shadow')).toContain('cx="64" cy="64"');
  });

  it('başgöğsün sekiz omuz yuvası hipsX/hipsY ile aynı yerdedir', () => {
    const { hipsX, hipsY, center } = SPIDER_ANCHORS.carapace;
    const svg = read('arachnid-carapace');
    hipsX.forEach((x, pair) => {
      expect(hasCircle(svg, x, center[1] - hipsY[pair]), `sol çift ${pair}`).toBe(true);
      expect(hasCircle(svg, x, center[1] + hipsY[pair]), `sağ çift ${pair}`).toBe(true);
    });
  });

  it('karın kabuğu bağlantı noktasında uçlanır ve perçinler havalandırma çevresinde simetriktir', () => {
    const { abdomen } = SPIDER_ANCHORS;
    const svg = read('arachnid-abdomen');
    const outline = /<path d="([^"]+)"/.exec(svg)?.[1] ?? '';
    const xs = [...outline.matchAll(/[ML](\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(abdomen.pivot[0]);
    expect(Math.min(...xs)).toBeLessThan(abdomen.vent[0]);
    const rivets = circles(svg);
    expect(rivets.length).toBeGreaterThanOrEqual(8);
    for (const rivet of rivets) {
      const mirror = rivets.find(
        (other) =>
          Math.abs(other.x - rivet.x) < 0.01 &&
          Math.abs(other.y - (2 * abdomen.vent[1] - rivet.y)) < 0.01,
      );
      expect(mirror, `(${rivet.x},${rivet.y}) simetriği`).toBeDefined();
    }
  });
});

describe('uzuv uzunlukları', () => {
  it('kemik uzunlukları eklem noktalarından türer ve ayak pençe ucundadır', () => {
    expect(FEMUR_LENGTH).toBe(40);
    expect(TIBIA_LENGTH).toBe(48);
    expect(CLAW_LENGTH).toBe(16);
    expect(LOWER_LENGTH).toBe(TIBIA_LENGTH + CLAW_LENGTH);
    expect(MAX_REACH).toBe(FEMUR_LENGTH + LOWER_LENGTH);
  });

  it('reaktör karın havalandırmasının gövdedeki izdüşümüdür', () => {
    expect(ABDOMEN_PIVOT_BODY).toEqual([-24, 0]);
    expect(REACTOR_BODY).toEqual([-56, 0]);
  });

  it('dinlenme erişimi dizi belirgin bükecek kadar kısa, uyluğu aşacak kadar uzundur', () => {
    expect(DEFAULT_SPIDER.homeReach).toBeLessThan(MAX_REACH * 0.8);
    expect(DEFAULT_SPIDER.homeReach).toBeGreaterThan(FEMUR_LENGTH);
    expect(DEFAULT_SPIDER.maxStrainPx).toBeGreaterThan(DEFAULT_SPIDER.stepTriggerPx);
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
