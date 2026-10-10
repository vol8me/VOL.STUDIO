import { expect, test, type Page } from '@playwright/test';
import { attributeFrames, startTrace, type FrameAttribution } from './support/frameProbe';
import { distribution, writeReport } from './support/perfReport';
import { selectTab } from './support/determinism';

/**
 * Hareket ölçümleri (UI-01.7, UI-01.10) GERÇEK saatle: dondurma katmanı kullanılmaz.
 *
 * 1. Hasar şeridi: değer düşünce şerit eski seviyede `trailDelayMs` kalır, sonra `trailDurationMs`
 *    sürede erir; dolgu her an şeridin gerisinde ya da eşit olur (şerit hiçbir karede dolgunun
 *    altına inmez).
 * 2. Flaş sınırı (WCAG 2.3.1/2.3.2): art arda vuruşta bir saniyelik her pencerede en çok 3 flaş
 *    başlar; flaş alanı 341×256 CSS px'i aşmaz. Azaltılmış harekette de geçerlidir.
 * 3. Maliyet (yalnız Chromium izi): eşzamanlı juice etkilerinde kare başına ana iş parçacığı
 *    CPU'su. GPU ve sunum ölçümü başsız tarayıcıda yoktur ve burada iddia edilmez.
 */
const TRAIL_DELAY_MS = 420;
const TRAIL_DURATION_MS = 380;
const FLASH_LIMIT = { perSecond: 3, maxAreaPx: 341 * 256 };

async function openLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
}

/** HUD sekmesindeki ilk can çubuğu ve onu azaltan "-20" düğmesi. */
async function healthBar(page: Page) {
  await selectTab(page, 'hud');
  const card = page.locator('.vol-bar--health').first().locator('xpath=ancestor::*[.//button][1]');
  return {
    bar: page.locator('.vol-bar--health').first(),
    damage: card.getByRole('button', { name: '-20', exact: true }),
    heal: card.getByRole('button', { name: '+20', exact: true }),
  };
}

test.describe('hasar gecikme şeridi', () => {
  test('şerit eski seviyede gecikme süresi kalır, sonra erir; dolgunun altına inmez', async ({
    page,
  }) => {
    await openLive(page);
    const { bar, damage } = await healthBar(page);
    await bar.scrollIntoViewIfNeeded();
    await damage.evaluate((element) => element.setAttribute('data-measure-damage', ''));
    const samples = await bar.evaluate(async (element) => {
      const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
      const trail = element.querySelector<HTMLElement>('.vol-bar__trail')!;
      const full = element.getBoundingClientRect().width;
      const out: { t: number; fill: number; trail: number }[] = [];
      const button = document.querySelector<HTMLElement>('[data-measure-damage]')!;
      const started = performance.now();
      button.click();
      await new Promise<void>((resolve) => {
        const step = (): void => {
          const t = performance.now() - started;
          out.push({
            t,
            fill: (fill.getBoundingClientRect().width / full) * 100,
            trail: (trail.getBoundingClientRect().width / full) * 100,
          });
          if (t < 1500) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return out;
    });

    // Kenar payı: iç kenarlık ve alt piksel yuvarlaması.
    const SLACK = 3;
    const settledFill = samples.at(-1)!.fill;
    const settledTrail = samples.at(-1)!.trail;
    expect(Math.abs(settledFill - 80), 'dolgu son değere oturdu (%80)').toBeLessThan(SLACK);
    expect(Math.abs(settledTrail - settledFill), 'şerit sonunda dolguyla aynı').toBeLessThan(SLACK);

    const holding = samples.filter((sample) => sample.t < TRAIL_DELAY_MS - 80);
    expect(holding.length).toBeGreaterThan(2);
    for (const sample of holding)
      expect(sample.trail, `t=${sample.t.toFixed(0)} ms: şerit eski seviyede`).toBeGreaterThan(
        100 - SLACK * 2,
      );

    const melting = samples.filter((sample) => sample.trail < 100 - SLACK * 2);
    const meltStart = melting[0].t;
    const meltEnd = samples.find((sample) => Math.abs(sample.trail - settledFill) < SLACK)!.t;
    expect(meltStart, 'erime gecikmeden önce başlamaz').toBeGreaterThan(TRAIL_DELAY_MS - 80);
    expect(meltEnd, 'erime gecikme + süre + pay içinde biter').toBeLessThan(
      TRAIL_DELAY_MS + TRAIL_DURATION_MS + 150,
    );
    for (const sample of samples)
      expect(sample.trail, `t=${sample.t.toFixed(0)} ms`).toBeGreaterThanOrEqual(
        sample.fill - SLACK,
      );
  });

  test('azaltılmış harekette şerit gecikmesiz son değere iner (aynı son durum)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLive(page);
    const { bar, damage } = await healthBar(page);
    await damage.click();
    await expect
      .poll(
        () =>
          bar.evaluate((element) => {
            const full = element.getBoundingClientRect().width;
            const trail = element.querySelector<HTMLElement>('.vol-bar__trail')!;
            const fill = element.querySelector<HTMLElement>('.vol-bar__fill')!;
            return (
              Math.abs(trail.getBoundingClientRect().width - fill.getBoundingClientRect().width) /
              full
            );
          }),
        { timeout: 450 },
      )
      .toBeLessThan(0.04);
  });
});

test.describe('flaş sınırı (WCAG 2.3.1 / 2.3.2)', () => {
  for (const reduced of [false, true]) {
    test(`art arda vuruşta saniyede en çok 3 flaş, alan sınır altı (azaltılmış hareket: ${reduced})`, async ({
      page,
    }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await openLive(page);
      const { damage, heal } = await healthBar(page);
      await page.evaluate(() => {
        const log: { at: number; area: number }[] = [];
        (window as unknown as { __flashes: typeof log }).__flashes = log;
        document.addEventListener('animationstart', (event) => {
          if (event.animationName !== 'vol-juice-flash') return;
          const rect = (event.target as HTMLElement).getBoundingClientRect();
          log.push({ at: performance.now(), area: rect.width * rect.height });
        });
      });
      // 3 saniye boyunca ~25 ms aralıkla indir/yükselt: her indirme bir flaş talebidir.
      for (let round = 0; round < 12; round++) {
        for (let i = 0; i < 5; i++) await damage.click({ delay: 0 });
        for (let i = 0; i < 5; i++) await heal.click({ delay: 0 });
      }
      const flashes = await page.evaluate(
        () => (window as unknown as { __flashes: { at: number; area: number }[] }).__flashes,
      );
      expect(flashes.length, 'flaş hiç başlamadı: ölçüm geçersiz').toBeGreaterThan(0);
      // 12 turda 60 indirme denendi; sınır devreye girmediyse ölçüm hiçbir şey kanıtlamaz.
      expect(flashes.length, 'flaşlar sınırlandı (talepten az)').toBeLessThan(60);
      let worstWindow = 0;
      for (const flash of flashes) {
        const inWindow = flashes.filter(
          (other) => other.at >= flash.at && other.at < flash.at + 1000,
        ).length;
        worstWindow = Math.max(worstWindow, inWindow);
      }
      expect(worstWindow, 'bir saniyelik pencerede flaş sayısı').toBeLessThanOrEqual(
        FLASH_LIMIT.perSecond,
      );
      for (const flash of flashes)
        expect(flash.area, 'flaş alanı (CSS px²)').toBeLessThanOrEqual(FLASH_LIMIT.maxAreaPx);
    });
  }
});

test.describe('juice maliyeti', () => {
  test('eşzamanlı juice etkilerinin kare başına ana iş parçacığı CPU maliyeti A/B ölçülür (Chromium izi)', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'iz yalnız Chromium: WebKit kapsamı unsupported');
    await openLive(page);
    await selectTab(page, 'kimlik');
    const group = page
      .locator('.vol-showcase-material__surfaces')
      .locator('xpath=ancestor::*[.//button][last()]')
      .first();
    const button = (name: string) => group.getByRole('button', { name, exact: true });
    const effects = ['Number pop', 'Hit flash', 'Shake', 'Panel enter', 'Sequenced enter'];
    // A: aynı sayıda tıklama, etkisi olmayan düğmelerde (tıklama, kaydırma ve işaretçi maliyeti ortak).
    const neutral = ['Default', 'Primary', 'Danger', 'Default', 'Primary'];
    for (const name of [...effects, ...neutral.slice(0, 3)])
      await expect(button(name)).toBeVisible();

    const measureBlock = async (names: string[]): Promise<number[]> => {
      const trace = (await startTrace(page))!;
      for (let round = 0; round < 6; round++) {
        for (const name of names) await button(name).click();
        await page.waitForTimeout(120);
      }
      const frames = attributeFrames(await trace.stop()).filter(
        (frame) => frame.jsGrossMs + frame.styleMs + frame.layoutMs + frame.paintMs > 0,
      );
      return frames.map(
        (frame: FrameAttribution) =>
          frame.jsGrossMs +
          frame.styleMs +
          frame.layoutMs +
          frame.paintMs +
          frame.commitMs -
          frame.forcedMs,
      );
    };
    await measureBlock(neutral); // ısınma
    const a1 = await measureBlock(neutral);
    const b1 = await measureBlock(effects);
    const b2 = await measureBlock(effects);
    const a2 = await measureBlock(neutral);
    const a = [...a1, ...a2];
    const b = [...b1, ...b2];
    expect(Math.min(a.length, b.length), 'ölçülen kare sayısı').toBeGreaterThan(30);
    const dA = distribution(a);
    const dB = distribution(b);
    const delta = { p50: dB.p50 - dA.p50, p95: dB.p95 - dA.p95 };
    const noise = Math.abs(distribution(a1).p95 - distribution(a2).p95);
    writeReport('juice-cost-chromium', {
      note: 'kare başına ana iş parçacığı CPU (ms), etkin kareler; A = etkisiz tıklama, B = 5 juice etkisi eşzamanlı. GPU/sunum başsızda yok.',
      a: dA,
      b: dB,
      aaNoiseMs: noise,
      deltaMs: delta,
    });
    info.annotations.push({
      type: 'ölçü',
      description: `A p50=${dA.p50.toFixed(2)} p95=${dA.p95.toFixed(2)} | B p50=${dB.p50.toFixed(2)} p95=${dB.p95.toFixed(2)} | A/A=${noise.toFixed(2)} ms`,
    });
    // Gerilememe bekçisi: kabul eşiği (kare süresinin %5'i, p95) cihaz A/B'sindedir; burada başsız
    // Chromium'da beş eşzamanlı etkinin tıklama maliyetinin üstüne bindirdiği yük sınırlı kalmalı.
    expect(delta.p50, 'ortanca ek CPU (ms)').toBeLessThan(1.5);
    expect(delta.p95, 'p95 ek CPU (ms)').toBeLessThan(4);
  });
});
