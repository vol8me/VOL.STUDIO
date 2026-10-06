import { expect, test } from '@playwright/test';
import {
  aaNoise,
  baselineScopes,
  distribution,
  estimateHz,
  timerResolution,
  judge,
  validateReport,
  writeReport,
  type Scope,
  type ScopeName,
  type UiPerfReport,
} from './support/perfReport';
import { SHOWCASE_TABS } from './support/determinism';

/**
 * UI maliyet raporunun düzeneği ve vitrin etkileşiminin UI JS maliyeti.
 *
 * İlk grup rapor şemasının KENDİSİNİ sınar: desteklenmeyen, ölçülmemiş ya da
 * yalnız yaklaşık ölçülmüş bir kapsam, A/A gürültüsü eşiği aşan ölçüm ve eksik
 * Hz hiçbir koşulda PASS üretmez. İkinci grup gerçek tarayıcıda etkileşim
 * maliyetini ve A/A gürültüsünü ölçer; bu KARE başına UI JS maliyeti değildir
 * (o ölçü oyun içi yük ve native iz gerektirir) ve raporda öyle işaretlenir.
 */
const measuredScope = (values: number[], basis: Scope['basis'] = 'presented'): Scope => ({
  status: 'measured',
  basis,
  distribution: distribution(values),
});

const flat = (value: number): number[] => Array.from({ length: 40 }, () => value);

function complete(over: Partial<Record<ScopeName, Scope>> = {}): UiPerfReport {
  const scopes = Object.fromEntries(
    (Object.keys(baselineScopes()) as ScopeName[]).map((name) => [name, measuredScope(flat(0.1))]),
  ) as Record<ScopeName, Scope>;
  return {
    schema: 'UiPerfReportV1',
    engine: 'test',
    hz: 60,
    frameBudgetMs: 1000 / 60,
    timerResolutionMs: 0.005,
    scopes: { ...scopes, ...over },
    aa: { samples: 40, noiseMs: 0.01 },
  };
}

test.describe('rapor düzeneği sahte PASS üretmez', () => {
  test('tam, sunulan kareye dayalı ve sınır altı rapor geçer', () => {
    expect(judge(complete())).toEqual({ verdict: 'pass', reasons: [] });
  });

  test('desteklenmeyen ya da çalıştırılmayan kapsam PASS olamaz', () => {
    for (const status of ['unsupported', 'not-run'] as const) {
      const result = judge(complete({ gpu: { status, reason: 'ölçülemedi' } }));
      expect(result.verdict).toBe('incomplete');
      expect(result.reasons.join('\n')).toContain('gpu');
    }
  });

  test('ekrana sunulan kare olmayan dayanak PASS olamaz', () => {
    for (const basis of ['event-to-raf', 'js-sync'] as const) {
      const result = judge(complete({ inputPointer: measuredScope(flat(1), basis) }));
      expect(result.verdict).toBe('incomplete');
      expect(result.reasons.join('\n')).toContain('ekrana sunulan kare değil');
    }
  });

  test('A/A gürültüsü 0.05F eşiğini aşarsa ölçüm yetersizdir', () => {
    // 60 Hz: F=16.667ms, 0.05F=0.8333ms.
    expect(judge({ ...complete(), aa: { samples: 40, noiseMs: 0.84 } }).verdict).toBe(
      'insufficient',
    );
    expect(judge({ ...complete(), aa: null }).verdict).toBe('insufficient');
    // Eşik altı gürültü yetersiz sayılmaz (0.7 + uiJs 0.1 < 0.8333ms); tolerans kaydırılmaz.
    expect(judge({ ...complete(), aa: { samples: 40, noiseMs: 0.7 } }).verdict).toBe('pass');
  });

  test('zamanlayıcı çözünürlüğü A/A gürültüsünün tabanıdır: 0 gürültü kusursuz sayılmaz', () => {
    // A/A farkı 0 ama zamanlayıcı 0.9ms'ye kuantalı: etkin gürültü 0.9ms ≥ 0.8333ms.
    const coarse = { ...complete(), timerResolutionMs: 0.9, aa: { samples: 40, noiseMs: 0 } };
    expect(judge(coarse).verdict).toBe('insufficient');
    expect(judge(coarse).reasons.join(' | ')).toContain('zamanlayıcı çözünürlüğü');
    expect(validateReport({ ...complete(), timerResolutionMs: Number.NaN }).join()).toContain(
      'çözünürlüğü',
    );
    expect(timerResolution([0, 0, 0.1, 0.1, 0.3, 0.3])).toBeCloseTo(0.1);
    expect(() => timerResolution([1, 1, 1])).toThrow(/ölçülemedi/);
  });

  test('UI JS p95 üst sınırı + A/A eşiği aşarsa FAIL, eksiklikten önce gelir', () => {
    const result = judge(
      complete({
        uiJs: measuredScope(flat(0.9)),
        gpu: { status: 'unsupported', reason: 'yok' },
      }),
    );
    expect(result.verdict).toBe('fail');
    expect(result.reasons[0]).toContain('uiJs');
  });

  test('girdi p95 100ms ve üstü FAIL olur', () => {
    expect(judge(complete({ inputKeyboard: measuredScope(flat(120)) })).verdict).toBe('fail');
  });

  test('Hz bilinmiyorsa kabul eşiği hesaplanamaz: PASS değil', () => {
    const result = judge({ ...complete(), hz: null, frameBudgetMs: null });
    expect(result.verdict).toBe('incomplete');
    expect(result.reasons.join('\n')).toContain('Hz bilinmiyor');
  });

  test('biçimsiz kayıt reddedilir: değersiz ölçü, gerekçesiz atlama, değerli atlama', () => {
    const empty = { status: 'measured', basis: 'presented' } as unknown as Scope;
    expect(judge(complete({ uiJs: empty })).verdict).toBe('invalid');
    expect(judge(complete({ gpu: { status: 'unsupported' } })).verdict).toBe('invalid');
    const withValue: Scope = {
      status: 'unsupported',
      reason: 'x',
      distribution: distribution([1, 2]),
    };
    expect(judge(complete({ gpu: withValue })).verdict).toBe('invalid');
    expect(validateReport({ ...complete(), frameBudgetMs: 99 }).join()).toContain('1000/hz');
  });

  test('NaN/sonsuz örnek 0 sayılmaz: dağılım kurulamaz', () => {
    expect(() => distribution([1, Number.NaN])).toThrow(/sonlu değil/);
    expect(() => distribution([1, Number.POSITIVE_INFINITY])).toThrow(/sonlu değil/);
    expect(() => distribution([])).toThrow(/örnek yok/);
  });

  test('dağılım ve Hz tahmini bilinen girdilerde beklenen değeri verir', () => {
    const d = distribution(Array.from({ length: 100 }, (_, index) => index + 1));
    expect([d.p50, d.p95, d.p99, d.max]).toEqual([50, 95, 99, 100]);
    expect(d.ci95Upper).toBeGreaterThanOrEqual(d.p95);
    // Bootstrap sabit tohumludur: aynı girdi aynı güven sınırını verir.
    const five = [1, 2, 3, 4, 5];
    expect(distribution(five).ci95Upper).toBe(distribution(five).ci95Upper);
    expect(estimateHz(Array.from({ length: 30 }, () => 1000 / 60))).toBe(60);
    expect(estimateHz(Array.from({ length: 30 }, () => 1000 / 90))).toBe(90);
    expect(estimateHz(Array.from({ length: 30 }, () => 1000 / 117))).toBe(120);
    // Hiçbir tanınan hıza yakın değil: tahmin yerine null.
    expect(estimateHz(Array.from({ length: 30 }, () => 22))).toBeNull();
    expect(estimateHz([])).toBeNull();
  });

  test('A/A gürültü iki bloğun p95 farkıdır', () => {
    expect(aaNoise([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBe(0);
    expect(aaNoise([1, 2, 3, 4, 5], [2, 3, 4, 5, 6])).toBe(1);
  });
});

test.describe('vitrin etkileşiminin UI JS maliyeti (gerçek tarayıcı)', () => {
  test('sekme geçişi JS maliyeti ve A/A gürültü ölçülür; rapor PASS üretmez', async ({
    page,
  }, info) => {
    // Dondurulmuş saat kullanılmaz: `performance.now` gerçek olmalı.
    await page.goto('/');
    await page.waitForSelector('[role="tablist"]');
    await page.evaluate(() => document.fonts.ready);

    const run = await page.evaluate(
      async (ids) => {
        const tabs = ids.map(
          (id) => document.querySelector(`[role="tab"][id$="-tab-${id}"]`) as HTMLElement,
        );
        const nextFrame = (): Promise<void> =>
          new Promise((resolve) => requestAnimationFrame(() => resolve()));
        const block = async (rounds: number): Promise<number[]> => {
          const out: number[] = [];
          for (let round = 0; round < rounds; round += 1) {
            for (const tab of tabs) {
              const start = performance.now();
              tab.click();
              out.push(performance.now() - start);
              await nextFrame();
            }
          }
          return out;
        };
        await block(2);
        const a1 = await block(5);
        const a2 = await block(5);
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
        return { a1, a2, intervals, readings };
      },
      SHOWCASE_TABS as unknown as string[],
    );

    const hz = estimateHz(run.intervals);
    const noise = aaNoise(run.a1, run.a2);
    const report: UiPerfReport = {
      schema: 'UiPerfReportV1',
      engine: info.project.name,
      hz,
      frameBudgetMs: hz === null ? null : 1000 / hz,
      timerResolutionMs: timerResolution(run.readings),
      scopes: baselineScopes(),
      aa: { samples: run.a1.length + run.a2.length, noiseMs: noise },
    };
    const verdict = judge(report);
    writeReport(`${info.project.name}-performance`, {
      report,
      verdict,
      probes: {
        tabSwitchJs: {
          note: 'sekme tıklamasının eşzamanlı JS süresi (stil/yerleşim/çizim hariç); kare başına UI JS değildir',
          a1: distribution(run.a1),
          a2: distribution(run.a2),
        },
      },
    });

    // 5 tur × sekme sayısı; sekme eklenince sabit değil listeden türer.
    expect(run.a1.length).toBe(SHOWCASE_TABS.length * 5);
    expect(Number.isFinite(noise)).toBe(true);
    expect(run.a1.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    // Başsız ortamda GPU/sunum/atıflı iz yok: rapor PASS olamaz.
    expect(verdict.verdict).not.toBe('pass');
    expect(JSON.stringify(verdict.reasons)).toMatch(/gpu|presentation|styleLayoutPaint|A\/A/);
    info.annotations.push({
      type: 'ölçü',
      description: `Hz=${hz ?? 'bilinmiyor'}, A/A gürültü=${noise.toFixed(3)}ms, karar=${verdict.verdict}`,
    });
  });
});
