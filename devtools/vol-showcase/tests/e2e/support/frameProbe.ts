import type { CDPSession, Page } from '@playwright/test';

/**
 * Tarayıcı ölçüm probu: AYNI KARE atfı, girdi→görünür bağı, iz/kare kimliği ve
 * A/A kalibrasyonu (UI-00.6). Rapor şemasının (`perfReport.ts`) tersine bu
 * modül ölçer; üretim kodunda hiçbir şey çalıştırmaz, her şey test tarafından
 * `addInitScript` ve CDP ile eklenir.
 *
 * İki katman vardır:
 * - SAYFA katmanı (her motor): girdi olaylarının `timeStamp`i, her girdiden
 *   sonraki ilk karenin rAF başlangıcı ve çizim sonrası mesaj turu. Kare
 *   kimliği sayfa içi sıra numarasıdır.
 * - İZ katmanı (yalnız Chromium, CDP `Tracing`): her ana iş parçacığı karesi
 *   `BeginMainThreadFrame.frameId` ile kimliklenir; JS (olay/rAF/zamanlayıcı),
 *   stil, yerleşim, boyama ve commit süreleri, önceki commit sonu ile bu karenin
 *   commit sonu arasındaki pencerede AYNI kareye atfedilir. WebKit'te Playwright
 *   iz API'si yoktur: kapsam `unsupported` raporlanır, 0 değildir.
 *
 * Başsız tarayıcı gerçek panele sunum yapmaz: bu modül kare SUNUMU iddia etmez.
 */

export interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  /** Mikrosaniye. */
  readonly ts: number;
  readonly dur?: number;
  readonly pid?: number;
  readonly tid?: number;
  readonly args?: Record<string, unknown>;
}

export interface FrameAttribution {
  readonly frameId: number;
  /** Önceki commit sonu → bu karenin commit sonu (ms, iz saati). */
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  /** JS olay/rAF/zamanlayıcı pencereleri birleşimi (ms). */
  readonly jsGrossMs: number;
  readonly styleMs: number;
  readonly layoutMs: number;
  readonly paintMs: number;
  readonly commitMs: number;
  /** JS içinde tetiklenen eşzamanlı stil/yerleşim (JS ∩ stil/yerleşim). */
  readonly forcedMs: number;
  /** Aynı pencerede gönderilen girdi olayı türleri. */
  readonly inputs: readonly string[];
}

const JS_EVENTS = new Set([
  'EventDispatch',
  'FireAnimationFrame',
  'TimerFire',
  'FunctionCall',
  'RunMicrotasks',
  'EvaluateScript',
]);
const STYLE_EVENTS = new Set(['UpdateLayoutTree']);
const LAYOUT_EVENTS = new Set(['Layout']);
const PAINT_EVENTS = new Set(['PrePaint', 'Paint', 'Layerize', 'UpdateLayer']);

type Interval = readonly [number, number];

/** Kesişen aralıkları birleştirir; iç içe olayların (FunctionCall ⊂ EventDispatch) çift sayılmasını önler. */
export function unionIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const total = (intervals: readonly Interval[]): number =>
  intervals.reduce((sum, [start, end]) => sum + (end - start), 0);

function intersectionTotal(a: readonly Interval[], b: readonly Interval[]): number {
  let sum = 0;
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
      if (overlap > 0) sum += overlap;
    }
  }
  return sum;
}

/** İz olaylarından ana iş parçacığı kare atfı. Saf işlev: gerçek ve yapay izle sınanır. */
export function attributeFrames(events: readonly TraceEvent[]): FrameAttribution[] {
  const mainThreads = new Set<string>();
  for (const event of events) {
    if (event.ph === 'M' && event.name === 'thread_name' && event.args?.name === 'CrRendererMain')
      mainThreads.add(`${event.pid}:${event.tid}`);
  }
  const onMain = (event: TraceEvent): boolean => mainThreads.has(`${event.pid}:${event.tid}`);
  const complete = events.filter(
    (event) => event.ph === 'X' && event.dur !== undefined && onMain(event),
  );
  const interval = (event: TraceEvent): Interval => [
    event.ts / 1000,
    (event.ts + event.dur!) / 1000,
  ];

  const begins = events
    .filter((event) => event.name === 'BeginMainThreadFrame' && onMain(event))
    .map((event) => ({
      ts: event.ts / 1000,
      frameId: Number((event.args?.data as { frameId?: number } | undefined)?.frameId),
    }))
    .filter((begin) => Number.isFinite(begin.frameId))
    .sort((a, b) => a.ts - b.ts);
  const commits = complete.filter((event) => event.name === 'Commit').map(interval);
  commits.sort((a, b) => a[0] - b[0]);

  const frames: FrameAttribution[] = [];
  let previousEnd = -Infinity;
  for (const begin of begins) {
    const commit = commits.find(([start]) => start >= begin.ts);
    if (!commit) continue;
    const windowStart = previousEnd === -Infinity ? begin.ts - 1000 : previousEnd;
    const windowEnd = commit[1];
    const inWindow = (event: TraceEvent): boolean => {
      const start = event.ts / 1000;
      return start >= windowStart && start <= windowEnd;
    };
    // Playwright'ın kendi araç olayları (`__playwright_*`) sayfa işi değildir.
    const isTool = (event: TraceEvent): boolean =>
      String((event.args?.data as { type?: string } | undefined)?.type ?? '').startsWith(
        '__playwright',
      );
    const pick = (names: Set<string>): Interval[] =>
      unionIntervals(
        complete
          .filter((event) => names.has(event.name) && inWindow(event) && !isTool(event))
          .map(interval),
      );
    const js = pick(JS_EVENTS);
    const style = pick(STYLE_EVENTS);
    const layout = pick(LAYOUT_EVENTS);
    const paint = pick(PAINT_EVENTS);
    const inputs = complete
      .filter((event) => event.name === 'EventDispatch' && inWindow(event) && !isTool(event))
      .map((event) => String((event.args?.data as { type?: string } | undefined)?.type ?? '?'));
    frames.push({
      frameId: begin.frameId,
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      jsGrossMs: total(js),
      styleMs: total(style),
      layoutMs: total(layout),
      paintMs: total(paint),
      commitMs: commit[1] - commit[0],
      forcedMs: intersectionTotal(js, unionIntervals([...style, ...layout])),
      inputs,
    });
    previousEnd = windowEnd;
  }
  return frames;
}

/** Sunum sayacı: iz `PipelineReporter` durumları (başsız ortamda gerçek panel DEĞİL). */
export function pipelineStates(events: readonly TraceEvent[]): Record<string, number> {
  const states: Record<string, number> = {};
  for (const event of events) {
    if (event.name !== 'PipelineReporter' || event.ph !== 'b') continue;
    const state = (event.args?.frame_reporter as { state?: string } | undefined)?.state;
    if (state) states[state] = (states[state] ?? 0) + 1;
  }
  return states;
}

// ─── Sayfa katmanı ──────────────────────────────────────────────────────────

export interface PageInput {
  readonly type: string;
  /** `event.timeStamp` (sayfa saati, ms). */
  readonly timeStamp: number;
}

export interface PageFrame {
  readonly seq: number;
  readonly rafStart: number;
  readonly postPaint: number;
}

export interface PageCapture {
  readonly inputs: PageInput[];
  readonly frames: PageFrame[];
  /** `performance.mark` ile iz saatine hizalama noktası (sayfa saati, ms). */
  readonly syncMark: number | null;
}

/** Sayfa betiği: girdileri ve her karenin rAF başlangıcı/çizim sonrası turunu kaydeder. */
function pageProbe(): void {
  const probe = {
    inputs: [] as PageInput[],
    frames: [] as PageFrame[],
    syncMark: null as number | null,
  };
  (window as unknown as { __volProbe: typeof probe }).__volProbe = probe;
  for (const type of ['pointerdown', 'click', 'keydown']) {
    window.addEventListener(
      type,
      (event) => probe.inputs.push({ type, timeStamp: event.timeStamp }),
      {
        capture: true,
      },
    );
  }
  let seq = 0;
  const tick = (start: number): void => {
    seq += 1;
    const current = seq;
    const channel = new MessageChannel();
    channel.port1.onmessage = () =>
      probe.frames.push({ seq: current, rafStart: start, postPaint: performance.now() });
    channel.port2.postMessage(0);
    requestAnimationFrame(() => tick(performance.now()));
  };
  requestAnimationFrame(() => tick(performance.now()));
}

export async function installPageProbe(page: Page): Promise<void> {
  await page.addInitScript(pageProbe);
}

export async function markSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __volProbe: { syncMark: number | null } }).__volProbe;
    probe.syncMark = performance.mark('vol-probe-sync').startTime;
  });
}

export async function readCapture(page: Page): Promise<PageCapture> {
  return page.evaluate(() => (window as unknown as { __volProbe: PageCapture }).__volProbe);
}

export interface LinkedInput {
  readonly type: string;
  /** Girdiyi işleyen ilk kare (sayfa sırası). */
  readonly pageFrame: number;
  /** İz kare kimliği; iz yoksa `null`. */
  readonly traceFrameId: number | null;
  /** Girdi zaman damgası → o karenin çizim sonrası turu (ms). */
  readonly inputToVisibleMs: number;
}

/**
 * Her girdiyi işlendiği ilk kareye bağlar. İz saati sayfa saatine `syncMark` ile
 * hizalanır (`traceOffsetMs`: iz_ms − sayfa_ms); eşleşme yoksa `traceFrameId` boş kalır.
 */
export function linkInputs(
  capture: PageCapture,
  traceFrames: readonly FrameAttribution[] | null,
  traceOffsetMs: number | null,
): LinkedInput[] {
  const linked: LinkedInput[] = [];
  for (const input of capture.inputs) {
    const frame = capture.frames.find((candidate) => candidate.rafStart >= input.timeStamp);
    if (!frame) continue;
    let traceFrameId: number | null = null;
    if (traceFrames && traceOffsetMs !== null) {
      const at = frame.rafStart + traceOffsetMs;
      traceFrameId =
        traceFrames.find(
          (candidate) => at >= candidate.windowStartMs && at <= candidate.windowEndMs,
        )?.frameId ?? null;
    }
    linked.push({
      type: input.type,
      pageFrame: frame.seq,
      traceFrameId,
      inputToVisibleMs: frame.postPaint - input.timeStamp,
    });
  }
  return linked;
}

// ─── İz katmanı (Chromium) ──────────────────────────────────────────────────

const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'benchmark',
  'cc',
  'viz',
];

export interface TraceSession {
  readonly stop: () => Promise<TraceEvent[]>;
}

/** Chromium iz kaydı; diğer motorlarda `null` (desteklenmiyor). */
export async function startTrace(page: Page): Promise<TraceSession | null> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return null;
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', (chunk) =>
    events.push(...(chunk.value as unknown as TraceEvent[])),
  );
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: TRACE_CATEGORIES, recordMode: 'recordContinuously' },
  } as never);
  return {
    stop: async () => {
      const complete = new Promise<void>((resolve) =>
        cdp.once('Tracing.tracingComplete', () => resolve()),
      );
      await cdp.send('Tracing.end');
      await complete;
      return events;
    },
  };
}

/** İz saati − sayfa saati (ms), `performance.mark` olayından; bulunamazsa `null`. */
export function traceClockOffset(
  events: readonly TraceEvent[],
  syncMark: number | null,
): number | null {
  if (syncMark === null) return null;
  const mark = events.find((event) => event.name === 'vol-probe-sync');
  return mark ? mark.ts / 1000 - syncMark : null;
}
