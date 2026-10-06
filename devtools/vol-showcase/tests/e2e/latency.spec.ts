import { expect, test, type Page } from '@playwright/test';
import {
  aaNoise,
  baselineScopes,
  distribution,
  estimateHz,
  judge,
  timerResolution,
  writeReport,
  type Scope,
  type UiPerfReport,
} from './support/perfReport';
import { SHOWCASE_TABS } from './support/determinism';

/**
 * Girdi zaman damgası → ilk görünür geri bildirim gecikmesi.
 *
 * Ölçü: girdi olayının `timeStamp`inden, o olayın tetiklediği DOM değişikliğinin
 * ardındaki ilk karenin çizim sonrası mesaj turuna kadar (rAF + MessageChannel).
 * Bu, başsız tarayıcıda gözlenebilen en iyi YAKLAŞIM'dır ama ekrana sunulan
 * kare değildir; bu yüzden kapsam `basis: event-to-raf` taşır ve rapor ne kadar
 * düşük olursa olsun PASS olamaz (bkz. `support/perfReport.ts`). Olay Zamanlaması
 * (`PerformanceObserver` türü `event`) yalnız destekleniyorsa ek gözlem olarak
 * yazılır; WebKit'te yokluğu "desteklenmiyor"dur, 0 değildir.
 *
 * İşaretçi, klavye, kol ve yardımcı teknoloji ayrı kapsamlardır: yalnız ilk ikisi
 * burada ölçülür, diğer ikisi gerekçeli `not-run` kalır.
 */
const SAMPLES = 30;

interface Sample {
  readonly latencyMs: number;
  readonly changed: boolean;
}

/** Sonraki olayın gecikmesini kaydedecek tek seferlik dinleyiciyi kurar. */
async function armProbe(page: Page, type: 'pointerdown' | 'keydown'): Promise<void> {
  await page.evaluate((eventType) => {
    const holder = window as unknown as { __latency?: Promise<number> };
    holder.__latency = new Promise<number>((resolve) => {
      window.addEventListener(
        eventType,
        (event) => {
          const origin = event.timeStamp;
          requestAnimationFrame(() => {
            // rAF geri çağrısı kareden ÖNCE koşar; mesaj turu çizimden sonra döner.
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve(performance.now() - origin);
            channel.port2.postMessage(0);
          });
        },
        { capture: true, once: true },
      );
    });
  }, type);
}

async function readProbe(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __latency: Promise<number> }).__latency);
}

/** Kabuğun ana sekme şeridi: sekme demoları ve karusel noktaları da `role=tab` taşır. */
const MAIN_TABLIST = '[role="tablist"]:has([role="tab"][id$="-tab-buttons"])';

const selectedTab = (page: Page): Promise<string | null> =>
  page.evaluate(
    (list) => document.querySelector(`${list} [aria-selected="true"]`)?.id ?? null,
    MAIN_TABLIST,
  );

async function pointerSamples(page: Page, count: number): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let index = 0; index < count; index += 1) {
    const tab = SHOWCASE_TABS[(index + 1) % SHOWCASE_TABS.length];
    const target = page.locator(`[role="tab"][id$="-tab-${tab}"]`);
    const before = await selectedTab(page);
    await armProbe(page, 'pointerdown');
    await target.click();
    const latencyMs = await readProbe(page);
    out.push({ latencyMs, changed: (await selectedTab(page)) !== before });
  }
  return out;
}

async function keyboardSamples(page: Page, count: number): Promise<Sample[]> {
  const out: Sample[] = [];
  await page.locator(`${MAIN_TABLIST} [aria-selected="true"]`).focus();
  for (let index = 0; index < count; index += 1) {
    const before = await selectedTab(page);
    await armProbe(page, 'keydown');
    await page.keyboard.press('ArrowDown');
    const latencyMs = await readProbe(page);
    out.push({ latencyMs, changed: (await selectedTab(page)) !== before });
  }
  return out;
}

function toScope(samples: readonly Sample[]): { scope: Scope; values: number[] } {
  const values = samples.map((sample) => sample.latencyMs);
  return {
    scope: { status: 'measured', basis: 'event-to-raf', distribution: distribution(values) },
    values,
  };
}

test.describe('girdi → ilk görünür geri bildirim (başsız yaklaşım)', () => {
  test('işaretçi ve klavye gecikmesi ölçülür; rapor PASS üretmez', async ({ page }, info) => {
    // Dondurulmuş saat kullanılmaz: `performance.now` ve rAF gerçek olmalı.
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await page.evaluate(() => document.fonts.ready);

    const environment = await page.evaluate(async () => {
      const intervals: number[] = [];
      let last = 0;
      await new Promise<void>((resolve) => {
        let frames = 0;
        const step = (timestamp: number): void => {
          if (last) intervals.push(timestamp - last);
          last = timestamp;
          frames += 1;
          if (frames < 61) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const readings: number[] = [];
      for (let index = 0; index < 20000; index += 1) readings.push(performance.now());
      const eventTiming =
        typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes.includes('event');
      return { intervals, readings, eventTiming };
    });

    // Isınma: ilk olaylar JIT/yerleşim ısınması taşır.
    await pointerSamples(page, 4);
    const pointer = await pointerSamples(page, SAMPLES);
    const keyboard = await keyboardSamples(page, SAMPLES);

    // Geri bildirim GERÇEKTEN olmadıysa ölçü anlamsızdır (hiçbir şey çizilmedi).
    expect(
      pointer.filter((sample) => sample.changed).length,
      'işaretçi girdisi görünür değişiklik üretmedi',
    ).toBeGreaterThan(SAMPLES / 2);
    expect(
      keyboard.filter((sample) => sample.changed).length,
      'klavye girdisi görünür değişiklik üretmedi',
    ).toBeGreaterThan(SAMPLES / 2);
    for (const sample of [...pointer, ...keyboard]) {
      expect(
        Number.isFinite(sample.latencyMs) && sample.latencyMs >= 0,
        'negatif/sonsuz gecikme',
      ).toBe(true);
    }

    const p = toScope(pointer);
    const k = toScope(keyboard);
    const half = Math.floor(p.values.length / 2);
    const hz = estimateHz(environment.intervals);
    const report: UiPerfReport = {
      schema: 'UiPerfReportV1',
      engine: info.project.name,
      hz,
      frameBudgetMs: hz === null ? null : 1000 / hz,
      timerResolutionMs: timerResolution(environment.readings),
      scopes: { ...baselineScopes(), inputPointer: p.scope, inputKeyboard: k.scope },
      // A/A: aynı işaretçi koşulunun iki yarısı.
      aa: {
        samples: p.values.length,
        noiseMs: aaNoise(p.values.slice(0, half), p.values.slice(half)),
      },
    };
    const verdict = judge(report);
    writeReport(`${info.project.name}-latency`, {
      report,
      verdict,
      observations: {
        eventTimingSupported: environment.eventTiming,
        eventTimingNote: environment.eventTiming
          ? 'destekleniyor: gerçek olay kayıtları ek gözlemdir, 8ms yuvarlama sınırı vardır'
          : 'NOT-SUPPORTED: bu motorda Olay Zamanlaması türü yok; 0 değil, ölçülmedi',
        basis:
          'olay timeStamp → sonraki karenin çizim sonrası mesaj turu; ekrana sunulan kare değildir',
      },
    });

    expect(p.scope.distribution!.samples).toBe(SAMPLES);
    // Her koşuda: sunulan kare ölçülmediği için PASS olamaz.
    expect(verdict.verdict).not.toBe('pass');
    expect(verdict.reasons.join('\n')).toMatch(
      /ekrana sunulan kare|gpu|presentation|Hz bilinmiyor/,
    );
    info.annotations.push({
      type: 'ölçü',
      description:
        `işaretçi p95=${p.scope.distribution!.p95.toFixed(1)}ms, klavye p95=${k.scope.distribution!.p95.toFixed(1)}ms, ` +
        `Hz=${hz ?? 'bilinmiyor'}, olay zamanlaması=${environment.eventTiming ? 'var' : 'yok'}, karar=${verdict.verdict}`,
    });
  });
});
