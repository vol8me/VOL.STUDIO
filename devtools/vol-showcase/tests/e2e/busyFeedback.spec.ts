import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { distribution, writeReport } from './support/perfReport';

/**
 * Meşgul durum 100 ms içinde görünür (UI-10.4). Kullanıcı uzun süren bir eylem başlattığında arayüz "çalışıyor"u
 * sonuçtan ÖNCE söylemelidir. Gerçek akış: çıkış istemindeki "Kaydet ve çık" → `aria-busy` + duyuru (kaydetme sürerken).
 *
 * Ölçü, `latency.spec.ts` ile aynıdır: `click` olayının `timeStamp`inden, o olayın ardındaki karenin çizim sonrası mesaj
 * turuna kadar; o turda meşgul durum GERÇEKTEN DOM'da olmalıdır. Başsız tarayıcıda sunulan kare ölçülmez (bu yüzden ortam
 * tabanı da ölçülür): ayrıca bir sayfa dinleyicisinin senkron yazdığı özniteliğin aynı yoldan gecikmesi. Karar iki yönlüdür:
 *   1) meşgul durum tabana en çok bir kare (16 ms) eklemelidir: meşgul durumu özel olarak geciktiren bir şey yoktur;
 *   2) Chromium'da mutlak p95 < 100 ms (WebKit başsız ortam tabanı bunu tek başına aşar; rapora yazılır, kapı değildir —
 *      bkz. UI-03.4).
 */
const en = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../src/i18n/en.json'), 'utf8'),
) as { panels: Record<string, string> };
const t = en.panels;

const SAMPLES = 20;
const BUSY_BUDGET_MS = 100;
const ONE_FRAME_MS = 16;

interface Reading {
  readonly latencyMs: number;
  readonly seen: boolean;
}

/** Sonraki `click` olayının görünür geri bildirim gecikmesini ve o andaki durumu kaydeder. */
async function armProbe(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    const holder = window as unknown as { __busy?: Promise<{ latencyMs: number; seen: boolean }> };
    holder.__busy = new Promise((resolveProbe) => {
      window.addEventListener(
        'click',
        (event) => {
          const origin = event.timeStamp;
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () =>
              resolveProbe({
                latencyMs: performance.now() - origin,
                seen: document.querySelector(target) !== null,
              });
            channel.port2.postMessage(0);
          });
        },
        { capture: true, once: true },
      );
    });
  }, selector);
}

const readProbe = (page: Page): Promise<Reading> =>
  page.evaluate(() => (window as unknown as { __busy: Promise<Reading> }).__busy);

test('meşgul durum, olaydan sonraki ilk karede görünür ve ortam tabanına en çok bir kare ekler', async ({
  page,
}, info) => {
  // Dondurulmuş saat kullanılmaz: `performance.now` ve rAF gerçek olmalı.
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[role="tab"][id$="-tab-panels"]').click();
  await page.locator('[role="tabpanel"][id$="-panel-panels"]:not([aria-hidden="true"])').waitFor();

  // Ortam tabanı: bir sayfa dinleyicisi özniteliği ANINDA yazar; aynı yoldan ölçülür.
  await page.evaluate(() => {
    const floor = document.createElement('button');
    floor.id = 'busy-floor';
    floor.textContent = 'floor';
    floor.style.cssText = 'position:fixed;right:0;bottom:0;z-index:99999';
    floor.addEventListener('click', () => {
      document.documentElement.dataset.busyFloor = 'on';
    });
    document.body.append(floor);
  });

  const floorSamples: Reading[] = [];
  const busySamples: Reading[] = [];
  const open = page.getByRole('button', { name: t.dpExit, exact: true });
  const dialog = page.locator('.vol-dialog.vol-modal--visible');

  for (let index = 0; index < SAMPLES + 3; index += 1) {
    await page.evaluate(() => delete document.documentElement.dataset.busyFloor);
    await armProbe(page, 'html[data-busy-floor="on"]');
    await page.locator('#busy-floor').click();
    const floorReading = await readProbe(page);

    await open.click();
    await expect(dialog).toHaveCount(1);
    await armProbe(page, '.vol-dialog [role$="dialog"][aria-busy="true"]');
    await dialog.getByRole('button', { name: 'Save and exit', exact: true }).click();
    const busyReading = await readProbe(page);

    // Çalışırken iptal açık ve odaklıdır; diyalog kapanır ve sonraki örnek temiz başlar. Klavyeyle kapatılır: fare
    // tıklamasının eyleme-uygunluk beklemesi benzetilmiş kaydetme süresiyle yarışır (kaydetme bitince diyalog
    // kendiliğinden kapanır, tıklama hedefsiz kalır); odak sözleşmesi zaten burada doğrulanır.
    await expect(dialog.getByRole('button', { name: 'Cancel, stay', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);

    // İlk üç tur ısınmadır (JIT, yerleşim).
    if (index >= 3) {
      floorSamples.push(floorReading);
      busySamples.push(busyReading);
    }
  }

  expect(
    busySamples.filter((sample) => sample.seen).length,
    "meşgul durum ilk karede DOM'da olmalı",
  ).toBe(SAMPLES);
  expect(floorSamples.filter((sample) => sample.seen).length).toBe(SAMPLES);

  const busy = distribution(busySamples.map((sample) => sample.latencyMs));
  const floor = distribution(floorSamples.map((sample) => sample.latencyMs));
  writeReport(`${info.project.name}-busy-feedback`, {
    schema: 'BusyFeedbackV1',
    engine: info.project.name,
    basis:
      'click timeStamp → sonraki karenin çizim sonrası mesaj turu; ekrana sunulan kare değildir',
    budgetMs: BUSY_BUDGET_MS,
    busy,
    floor,
    busyMinusFloorP95Ms: busy.p95 - floor.p95,
  });
  info.annotations.push({
    type: 'ölçü',
    description: `meşgul p95=${busy.p95.toFixed(1)}ms, ortam tabanı p95=${floor.p95.toFixed(1)}ms, örnek=${SAMPLES}`,
  });

  expect(
    busy.p95 - floor.p95,
    `meşgul durum tabana ${(busy.p95 - floor.p95).toFixed(1)} ms ekledi (sınır ${ONE_FRAME_MS})`,
  ).toBeLessThanOrEqual(ONE_FRAME_MS);
  if (info.project.name === 'chromium') {
    expect(busy.p95, `meşgul durum p95 ${busy.p95.toFixed(1)} ms`).toBeLessThan(BUSY_BUDGET_MS);
  }
});
