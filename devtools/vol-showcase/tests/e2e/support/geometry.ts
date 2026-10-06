import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dokunma hedefi geometri ölçümü. `layout.spec.ts` yalnız `getBoundingClientRect`
 * ve saydamlığa bakarsa üç kör nokta kalır:
 *
 * - Saydam ama tıklanabilir yerel girişler (kaydırıcının `opacity: 0` range
 *   girişi) "görünmez" sayılıp dışlanır, oysa parmağın vurduğu eleman odur.
 * - Başka bir elemanın örttüğü ya da `overflow: hidden` atasının kırptığı hedef
 *   kutusu büyük olsa da gerçekte vurulamaz.
 * - Kapalı katmanın içi hiç çizilmediği için sessizce atlanır; "ölçüldü" ile
 *   "çizilmediği için ölçülemedi" birbirinden ayrılmadığında kapı yalan söyler.
 *
 * Bu modül her hedefi dört durumdan biriyle etiketler ve gerçek tıklama
 * noktasını `elementFromPoint` ile sınar.
 */

export type RenderState =
  /** Çizilir ve vurulabilir. */
  | 'painted'
  /** Etkin saydamlık 0 ama gerçek vuruş hedefi (parmağın dokunduğu eleman). */
  | 'transparent-hit'
  /** Çizilmiyor ve vurulamıyor (saydam + vuruş almıyor ya da örtülü). */
  | 'hidden'
  /** Kutusu yok (`display: none`, kapalı katman): ölçülemedi. */
  | 'unrendered';

export interface TargetMeasure {
  readonly selector: string;
  readonly label: string;
  readonly render: RenderState;
  readonly width: number;
  readonly height: number;
  /** `overflow: hidden/clip` atalarıyla ve görüntü alanıyla kesişen görünür kutu. */
  readonly visibleWidth: number;
  readonly visibleHeight: number;
  /** Beş noktadan (merkez + dört iç nokta) başka bir elemana ait olanların sayısı. */
  readonly coveredPoints: number;
  /** Merkez noktası başka bir elemana ait: gerçek tıklama hedefi bu değil. */
  readonly centreCovered: boolean;
  /** Kaydırma kabının içinde: görünür kutu `scrollIntoView` sonrası ölçüldü. */
  readonly inScrollContainer: boolean;
  /** Merkezi örten eleman (teşhis için). */
  readonly coveredBy: string | null;
  /** Görünür kutuyu en çok daraltan `overflow` atası (teşhis için). */
  readonly clippedBy: string | null;
}

/** Sayfa içinde koşar; kök ve seçiciler `evaluate` ile serileştirilir. */
export function measureInPage(root: Element, selectors: string[]): TargetMeasure[] {
  const out: TargetMeasure[] = [];

  const describe = (element: Element): string => {
    const cls = [...element.classList].slice(0, 2).join('.');
    return cls ? `${element.tagName.toLowerCase()}.${cls}` : element.tagName.toLowerCase();
  };

  const related = (target: Element, hit: Element | null): boolean => {
    if (hit === null) return false;
    // Atanın vuruş alması hedefin vuruş almadığını gösterir (`pointer-events: none`,
    // üstte duran kap): yalnız hedefin kendisi ya da torunu sayılır.
    if (hit === target || target.contains(hit)) return true;
    // Etiketli giriş: etiket vuruşu girişe yönlenir.
    const label = hit.closest('label');
    return label !== null && (label.control === target || label.contains(target));
  };

  const effectiveOpacity = (element: Element): number => {
    let product = 1;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      product *= Number.parseFloat(getComputedStyle(node).opacity);
    }
    return product;
  };

  for (const selector of selectors) {
    const matches = new Set<Element>(root.querySelectorAll(selector));
    if (root.matches(selector)) matches.add(root);
    for (const element of matches) {
      const style = getComputedStyle(element);
      const base = {
        selector,
        label: describe(element),
        coveredPoints: 0,
        centreCovered: false,
        inScrollContainer: false,
        coveredBy: null,
        clippedBy: null,
      };
      const first = element.getBoundingClientRect();
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (first.width === 0 && first.height === 0)
      ) {
        out.push({
          ...base,
          render: 'unrendered',
          width: 0,
          height: 0,
          visibleWidth: 0,
          visibleHeight: 0,
        });
        continue;
      }

      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();

      let left = Math.max(rect.left, 0);
      let right = Math.min(rect.right, window.innerWidth);
      let top = Math.max(rect.top, 0);
      let bottom = Math.min(rect.bottom, window.innerHeight);
      let inScrollContainer = false;
      let clippedBy: string | null = null;
      // Kırpma, kutunun containing block zincirine göre uygulanır: `fixed` hedefi
      // atanın `overflow`u kırpmaz, `absolute` hedefi yalnız konumlu ata kırpar.
      let position = style.position;
      for (let node = element.parentElement; node !== null; node = node.parentElement) {
        const parent = getComputedStyle(node);
        const parentStatic = parent.position === 'static';
        const skip = position === 'fixed' || (position === 'absolute' && parentStatic);
        // `body`/`html` kaydırması görüntü alanına yayılır; görüntü alanı zaten kırpılıyor.
        const isRoot = node === document.body || node === document.documentElement;
        if (!skip && !isRoot) {
          const box = node.getBoundingClientRect();
          if (parent.overflowX === 'hidden' || parent.overflowX === 'clip') {
            if (box.left > left || box.right < right) clippedBy = describe(node);
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
          if (parent.overflowY === 'hidden' || parent.overflowY === 'clip') {
            if (box.top > top || box.bottom < bottom) clippedBy = describe(node);
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.bottom);
          }
        }
        if (
          ['auto', 'scroll'].includes(parent.overflowX) ||
          ['auto', 'scroll'].includes(parent.overflowY)
        ) {
          if (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
            inScrollContainer = true;
        }
        if (position !== 'fixed') {
          position = position === 'absolute' && parentStatic ? 'absolute' : parent.position;
        }
      }
      const visibleWidth = Math.max(0, right - left);
      const visibleHeight = Math.max(0, bottom - top);

      const points: [number, number][] = [
        [0.5, 0.5],
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ];
      let coveredPoints = 0;
      let centreCovered = false;
      let coveredBy: string | null = null;
      points.forEach(([fx, fy], index) => {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (!related(element, hit)) {
          coveredPoints += 1;
          if (index === 0) {
            centreCovered = true;
            coveredBy = hit === null ? 'görüntü alanı dışı' : describe(hit);
          }
        }
      });

      const opacity = effectiveOpacity(element);
      let render: RenderState;
      if (opacity === 0) render = centreCovered ? 'hidden' : 'transparent-hit';
      else render = 'painted';

      out.push({
        ...base,
        render,
        width: rect.width,
        height: rect.height,
        visibleWidth,
        visibleHeight,
        coveredPoints,
        centreCovered,
        inScrollContainer,
        coveredBy,
        clippedBy,
      });
    }
  }
  return out;
}

export function measureTargets(root: Locator, selectors: string[]): Promise<TargetMeasure[]> {
  return root.first().evaluate(measureInPage, selectors);
}

/** 44 px hedefinin yarım piksel payı: tarayıcı kutuyu alt piksele yuvarlayabilir. */
export const HIT_MIN_PX = 43.5;

/**
 * Kabul edilemez hedef bulgusu. `rule` kararlı bir sınıftır (`size`: görünür kutu
 * 44 px altında, `clipped`: kutu büyük ama atası kırpıyor, `covered`: merkez başka
 * bir elemana ait); `target` politika seçicisidir. Ölçülen piksel `detail`dedir
 * ve kayıt eşleşmesine girmez: kayıt yarım piksel oynayınca bayatlamamalı.
 */
export interface HitProblem {
  readonly rule: 'size' | 'clipped' | 'covered';
  readonly target: string;
  readonly detail: string;
}

export function hitTargetProblems(measures: readonly TargetMeasure[]): HitProblem[] {
  const problems = new Map<string, HitProblem>();
  const add = (problem: HitProblem): void => {
    problems.set(`${problem.rule} @ ${problem.target}`, problem);
  };
  for (const measure of measures) {
    if (measure.render === 'unrendered' || measure.render === 'hidden') continue;
    const size = `${Math.round(measure.visibleWidth)}x${Math.round(measure.visibleHeight)}`;
    if (measure.visibleWidth < HIT_MIN_PX || measure.visibleHeight < HIT_MIN_PX) {
      const boxLarge = measure.width >= HIT_MIN_PX && measure.height >= HIT_MIN_PX;
      add({
        rule: boxLarge ? 'clipped' : 'size',
        target: measure.selector,
        detail: `${size} [${measure.render}]${measure.clippedBy ? ` ← ${measure.clippedBy}` : ''}`,
      });
    } else if (measure.centreCovered) {
      add({
        rule: 'covered',
        target: measure.selector,
        detail: `merkez ${measure.coveredBy} tarafından örtülü`,
      });
    }
  }
  return [...problems.values()];
}

/** Kayıtlı bilinen kusur: sahip göreve bağlı, kesin kural + hedef. */
export interface GeometryRecord {
  readonly scope: string;
  readonly rule: HitProblem['rule'];
  readonly target: string;
  readonly owner: string;
  readonly reason: string;
}

/** Bilinen glif yüksekliği kusuru: yazı tipi örneği (`Aile boyutpx w<ağırlık>`) + sahip görev. */
export interface GlyphRecord {
  readonly font: string;
  /** Yalnız bu motorlarda geçerli (yedek sistem yazı tipi makineye bağlıdır); yoksa ikisi. */
  readonly engines?: readonly string[];
  readonly owner: string;
  readonly reason: string;
}

export const GEOMETRY_RECORDS_PATH = resolve(import.meta.dirname, 'geometryExceptions.json');

export function loadGeometryRecords(): readonly GeometryRecord[] {
  return (
    JSON.parse(readFileSync(GEOMETRY_RECORDS_PATH, 'utf8')) as { hitTargets: GeometryRecord[] }
  ).hitTargets;
}

export function loadGlyphRecords(): readonly GlyphRecord[] {
  return (
    JSON.parse(readFileSync(GEOMETRY_RECORDS_PATH, 'utf8')) as { glyphHeights: GlyphRecord[] }
  ).glyphHeights;
}

/** Ölçüm kapsamı: kaç hedef ölçüldü, kaçı çizilmediği için ölçülemedi. */
export function coverage(measures: readonly TargetMeasure[]): {
  measured: number;
  transparentHit: number;
  unrendered: number;
} {
  return {
    measured: measures.filter((m) => m.render === 'painted' || m.render === 'transparent-hit')
      .length,
    transparentHit: measures.filter((m) => m.render === 'transparent-hit').length,
    unrendered: measures.filter((m) => m.render === 'unrendered').length,
  };
}

/** Geometri anlık görüntüsü: seçici → kutular. Tema/mod değişiminde kayma sondası. */
export type GeometrySnapshot = Record<string, [number, number, number, number][]>;

export async function snapshotGeometry(
  page: Page,
  selectors: readonly string[],
): Promise<GeometrySnapshot> {
  return page.evaluate((list) => {
    const snapshot: Record<string, [number, number, number, number][]> = {};
    for (const selector of list) {
      snapshot[selector] = [...document.querySelectorAll(selector)].map((element) => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      });
    }
    return snapshot;
  }, selectors);
}

/** İki anlık görüntü arasındaki kutu kaymaları (CSS px, `tolerance` üstü). */
export function geometryShifts(
  before: GeometrySnapshot,
  after: GeometrySnapshot,
  tolerance = 0.5,
): string[] {
  const shifts: string[] = [];
  for (const selector of Object.keys(before)) {
    const a = before[selector];
    const b = after[selector] ?? [];
    if (a.length !== b.length) {
      shifts.push(`${selector}: eleman sayısı ${a.length} → ${b.length}`);
      continue;
    }
    a.forEach((box, index) => {
      const delta = box.map((value, axis) => Math.abs(value - b[index][axis]));
      if (Math.max(...delta) > tolerance) {
        shifts.push(
          `${selector}[${index}]: ${box.map(Math.round).join(',')} → ${b[index].map(Math.round).join(',')}`,
        );
      }
    });
  }
  return shifts;
}
