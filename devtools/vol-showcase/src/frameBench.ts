/**
 * Vitrin kare ölçeri: her sekmeyi aynı yöntemle (sayfayı sabit hızla ileri-geri kaydırarak) gerçek karelerle
 * ölçer. Aynı kod Steam Deck'te (WebKitGTK), Android'de (Chrome/WebView) ve masaüstünde çalışır; böylece
 * "şu cihazda şu kadar FPS" iddiası ölçüm yöntemi cihazdan cihaza değişmeden karşılaştırılır.
 *
 * Ölçülen şey SUNULAN karedir (rAF aralığı): durağan bir sayfa kare üretmediği için ölçerin kendisi sayfayı
 * kaydırır; yani sonuç "bu sayfa kaydırılırken/yeniden boyanırken kaç kare sunuluyor"dur. Oyun FPS'i değildir.
 */

export interface BenchResult {
  readonly tab: string;
  readonly frames: number;
  /** Sunulan ortalama kare/sn. */
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly worstMs: number;
  /** 20 ms'yi (≈48 FPS altı) aşan karelerin oranı (0–1). */
  readonly slowShare: number;
}

export interface BenchHooks {
  readonly tabs: readonly string[];
  select(tab: string): void;
  /** Kaydırılacak kap; kaydırılacak yer yoksa kap hafifçe oynatılarak yeniden boyama zorlanır. */
  scroller(): HTMLElement | null;
}

export interface BenchOptions {
  /** Sekme başına ölçüm süresi (ms). Varsayılan 3000. */
  durationMs?: number;
  /** Sekme seçildikten sonra yerleşimin oturması için bekleme (ms). Varsayılan 400. */
  settleMs?: number;
  /** Kaydırma hızı (px/sn). Varsayılan 900. */
  speedPxPerSec?: number;
  onProgress?: (tab: string, index: number, total: number) => void;
}

const SLOW_MS = 20;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index];
}

/** Kare aralıklarından (ms) sonuç satırı üretir; saf işlev (birim testi buradan). */
export function summarizeFrames(tab: string, intervalsMs: readonly number[]): BenchResult {
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const total = intervalsMs.reduce((sum, v) => sum + v, 0);
  const slow = intervalsMs.filter((v) => v > SLOW_MS).length;
  return {
    tab,
    frames: intervalsMs.length,
    fps: total > 0 ? (intervalsMs.length / total) * 1000 : 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    worstMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    slowShare: intervalsMs.length > 0 ? slow / intervalsMs.length : 0,
  };
}

const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame((time) => resolve(time)));

async function measureTab(
  tab: string,
  scroller: HTMLElement | null,
  durationMs: number,
  speedPxPerSec: number,
): Promise<BenchResult> {
  const intervals: number[] = [];
  const range = scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0;
  let previous = await nextFrame();
  const start = previous;
  let flip = false;
  for (;;) {
    const now = await nextFrame();
    intervals.push(now - previous);
    previous = now;
    const elapsed = now - start;
    if (scroller) {
      if (range > 200) {
        // Üçgen dalga: aşağı, sonra yukarı; her karede gerçek kaydırma = gerçek yeniden boyama.
        const distance = (elapsed / 1000) * speedPxPerSec;
        const phase = distance % (range * 2);
        scroller.scrollTop = phase <= range ? phase : range * 2 - phase;
      } else {
        flip = !flip;
        scroller.style.transform = `translateY(${flip ? 0.01 : 0}px)`;
      }
    }
    if (elapsed >= durationMs) break;
  }
  if (scroller) {
    scroller.scrollTop = 0;
    scroller.style.transform = '';
  }
  return summarizeFrames(tab, intervals);
}

/** Verilen sekmelerin hepsini sırayla ölçer; sekme seçimi ve kap tüketiciden gelir. */
export async function runFrameBench(
  hooks: BenchHooks,
  options: BenchOptions = {},
): Promise<BenchResult[]> {
  const durationMs = options.durationMs ?? 3000;
  const settleMs = options.settleMs ?? 400;
  const speed = options.speedPxPerSec ?? 900;
  const results: BenchResult[] = [];
  for (const [index, tab] of hooks.tabs.entries()) {
    options.onProgress?.(tab, index, hooks.tabs.length);
    hooks.select(tab);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    results.push(await measureTab(tab, hooks.scroller(), durationMs, speed));
  }
  return results;
}

export interface BisectRow {
  readonly title: string;
  /** Bu kart gizliyken sunulan kare/sn. */
  readonly fps: number;
  /** Kartın gizlenmesiyle kazanılan FPS (taban çizgisine göre). */
  readonly gain: number;
}

export interface BisectResult {
  readonly tab: string;
  readonly baselineFps: number;
  readonly rows: readonly BisectRow[];
}

/**
 * Yavaş bir sekmede hangi kartın pahalı olduğunu bulur: her kartı sırayla gizleyip aynı yöntemle yeniden ölçer.
 * Kazanç = kart gizliyken FPS − taban FPS; en büyük kazançlar boyama maliyetinin kaynağıdır (CPU boyayan
 * WebKitGTK'de gradyan, gölge, karışım ve canvas yüzeyleri).
 */
export async function bisectTab(
  hooks: BenchHooks,
  tab: string,
  options: { durationMs?: number; maxRows?: number } = {},
): Promise<BisectResult> {
  const durationMs = options.durationMs ?? 1500;
  hooks.select(tab);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const panel = document.querySelector('[role="tabpanel"]:not([aria-hidden="true"])');
  const cards = panel ? [...panel.querySelectorAll<HTMLElement>('.vol-showcase-card')] : [];
  const baseline = await measureTab(tab, hooks.scroller(), durationMs, 900);
  const rows: BisectRow[] = [];
  for (const card of cards) {
    const previous = card.style.display;
    card.style.display = 'none';
    const result = await measureTab(tab, hooks.scroller(), durationMs, 900);
    card.style.display = previous;
    const title =
      card.querySelector('.vol-showcase-card__title')?.textContent?.trim() ?? card.className;
    rows.push({ title, fps: result.fps, gain: result.fps - baseline.fps });
  }
  rows.sort((a, b) => b.gain - a.gain);
  return { tab, baselineFps: baseline.fps, rows: rows.slice(0, options.maxRows ?? 6) };
}

/** Boyama maliyeti kategorileri: her biri geçici bir stil kuralıyla (yalnız ölçüm sırasında) kapatılır. */
export const STYLE_VARIANTS: ReadonlyArray<readonly [id: string, css: string]> = [
  ['shadow', '*,*::before,*::after{box-shadow:none!important;text-shadow:none!important}'],
  ['gradient', '*,*::before,*::after{background-image:none!important}'],
  [
    'blend',
    '*,*::before,*::after{filter:none!important;mix-blend-mode:normal!important;background-blend-mode:normal!important;backdrop-filter:none!important}',
  ],
  ['motion', '*,*::before,*::after{animation:none!important;transition:none!important}'],
  ['radius', '*,*::before,*::after{border-radius:0!important}'],
  ['outline', '*,*::before,*::after{outline:none!important;border-image:none!important}'],
  // Katman terfisi: kaydırılan içerik doku olarak taşınırsa her karede yeniden boyanmaz (kapatma değil EKLEME denemeleri).
  ['layer-page', '.vol-showcase-page{will-change:transform}'],
  ['layer-cards', '.vol-showcase-card{will-change:transform}'],
  ['layer-scroller', '.vol-tabs__panels{transform:translateZ(0)}'],
  ['contain-cards', '.vol-showcase-card{contain:paint}'],
];

export interface StyleVariantRow {
  readonly id: string;
  readonly fps: number;
  readonly gain: number;
}

export interface StyleBisectResult {
  readonly tab: string;
  readonly baselineFps: number;
  readonly rows: readonly StyleVariantRow[];
}

/**
 * Boyama maliyetini kategoriye ayırır: sekmeyi her kategori kapalıyken yeniden ölçer. Büyük kazanç, o CSS
 * özelliğinin bu cihazda (CPU boyayan WebKitGTK) pahalı olduğunu gösterir; bileşenin görünüşünü değiştirme
 * kararı ölçümle verilir.
 */
export async function styleBisectTab(
  hooks: BenchHooks,
  tab: string,
  durationMs = 1500,
): Promise<StyleBisectResult> {
  hooks.select(tab);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const baseline = await measureTab(tab, hooks.scroller(), durationMs, 900);
  const rows: StyleVariantRow[] = [];
  for (const [id, css] of STYLE_VARIANTS) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await measureTab(tab, hooks.scroller(), durationMs, 900);
    style.remove();
    rows.push({ id, fps: result.fps, gain: result.fps - baseline.fps });
  }
  rows.sort((a, b) => b.gain - a.gain);
  return { tab, baselineFps: baseline.fps, rows };
}

export interface BenchEnvironment {
  readonly userAgent: string;
  readonly devicePixelRatio: number;
  readonly viewport: string;
  readonly cores: number;
}

export function readBenchEnvironment(): BenchEnvironment {
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: navigator.hardwareConcurrency ?? 0,
  };
}

/** CDP/otomasyon için sonuç yuvası: `window.__volFrameBench.done` bekler, `results` okunur. */
export interface BenchSlot {
  running: boolean;
  done: boolean;
  results: BenchResult[];
  bisect: BisectResult[];
  styleBisect: StyleBisectResult[];
  environment: BenchEnvironment | null;
}

export function benchSlot(): BenchSlot {
  const host = globalThis as unknown as { __volFrameBench?: BenchSlot };
  host.__volFrameBench ??= {
    running: false,
    done: false,
    results: [],
    bisect: [],
    styleBisect: [],
    environment: null,
  };
  return host.__volFrameBench;
}
