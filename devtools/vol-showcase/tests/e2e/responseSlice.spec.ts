import { expect, test, type Page } from '@playwright/test';
import { installVirtualPad } from './support/gamepad';
import { selectTab } from './support/determinism';
import { aaNoise, distribution, writeReport } from './support/perfReport';

/** DOM kabulü ve sonraki rAF ayrı ölçülür; fiziksel piksel sunumu veya CPU süresi değildir. */
interface ResponseSample {
  commitMs: number;
  dispatchToCommitMs: number;
  rafMs: number;
  changed: boolean;
}

declare global {
  interface Window {
    __responseSample?: Promise<ResponseSample>;
    __responseOrigin?: number;
  }
}

const TARGET = '.vol-showcase-checkbox-group .vol-checkbox:nth-child(3)';
const SAMPLES = 30;

async function arm(page: Page, mode: 'pointer' | 'touch' | 'gamepad'): Promise<void> {
  await page.evaluate(
    ({ selector, inputMode }) => {
      const label = document.querySelector<HTMLElement>(selector);
      const input = label?.querySelector<HTMLInputElement>('input');
      if (!label || !input) throw new Error('yanıt dilimi anahtarı yok');
      const previous = input.checked;
      let origin = inputMode === 'gamepad' ? performance.now() : 0;
      let dispatch = 0;
      const start = (event: Event): void => {
        origin = event.timeStamp;
      };
      const click = (): void => {
        dispatch = performance.now();
      };
      if (inputMode !== 'gamepad')
        label.addEventListener('pointerdown', start, { once: true, capture: true });
      label.addEventListener('click', click, { once: true, capture: true });
      window.__responseOrigin = origin;
      window.__responseSample = new Promise<ResponseSample>((resolve) => {
        input.addEventListener(
          'change',
          () => {
            const commit = performance.now();
            const since = inputMode === 'gamepad' ? window.__responseOrigin! : origin;
            const changed = input.checked !== previous;
            requestAnimationFrame(() => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () => {
                const rafMs = performance.now() - since;
                channel.port1.close();
                channel.port2.close();
                resolve({
                  commitMs: commit - since,
                  dispatchToCommitMs: commit - dispatch,
                  rafMs,
                  changed,
                });
              };
              channel.port2.postMessage(0);
            });
          },
          { once: true },
        );
      });
    },
    { selector: TARGET, inputMode: mode },
  );
}

async function samples(
  page: Page,
  mode: 'pointer' | 'touch' | 'gamepad',
): Promise<ResponseSample[]> {
  const result: ResponseSample[] = [];
  const target = page.locator(TARGET);
  await target.scrollIntoViewIfNeeded();
  if (mode === 'gamepad') await target.locator('input').focus();
  for (let index = 0; index < SAMPLES + 3; index++) {
    await arm(page, mode);
    if (mode === 'pointer') await target.click();
    else if (mode === 'touch') await target.tap();
    else {
      // Durum değişiminden hemen önce aynı tarayıcı saati alınır; IPC süresi ölçüye katılmaz.
      await page.evaluate(async () => {
        window.__responseOrigin = performance.now();
        const pad = window.__virtualPad;
        pad.timestamp++;
        pad.buttons[0].pressed = true;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        pad.timestamp++;
        pad.buttons[0].pressed = false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
    }
    const sample = await page.evaluate(() => window.__responseSample!);
    if (index >= 3) result.push(sample);
  }
  return result;
}

test.describe('kısa kalibre yanıt dilimi', () => {
  test.use({ hasTouch: true });
  for (const skin of ['default', 'aurum'] as const) {
    test(`${skin}: %30 etiket, altı hane ve pointer/touch/sanal kol DOM yanıtı`, async ({
      page,
    }, info) => {
      await installVirtualPad(page);
      await page.goto('/?lang=pseudo');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector('[role="tablist"]');
      if (skin === 'aurum') await page.locator('.vol-showcase-skin-button').click();
      await expect(page.locator('html')).toHaveAttribute('data-vol-theme', skin);
      await expect(page.locator('html')).toHaveAttribute('lang', 'qps');
      await selectTab(page, 'forms');
      await expect(page.locator('.vol-showcase-six-digits')).toContainText('999999');
      const calibration = await page.evaluate(() => {
        const start = performance.now();
        for (let index = 0; index < 20000; index++) performance.now();
        return { clockReadCostMs: (performance.now() - start) / 20000 };
      });
      const scopes = [];
      for (const mode of ['pointer', 'touch', 'gamepad'] as const) {
        const measured = await samples(page, mode);
        expect(
          measured.every((sample) => sample.changed),
          `${mode}: her girdi DOM değişikliği üretmeli`,
        ).toBe(true);
        for (const sample of measured) {
          for (const value of [sample.commitMs, sample.dispatchToCommitMs, sample.rafMs]) {
            expect(Number.isFinite(value) && value >= 0).toBe(true);
          }
        }
        const commit = distribution(measured.map((sample) => sample.commitMs));
        const raf = distribution(measured.map((sample) => sample.rafMs));
        const dispatchToCommit = distribution(measured.map((sample) => sample.dispatchToCommitMs));
        const values = measured.map((sample) => sample.commitMs);
        scopes.push({
          mode,
          commit,
          raf,
          dispatchToCommit,
          aaNoiseMs: aaNoise(values.slice(0, 15), values.slice(15)),
          samples: measured,
        });
      }
      writeReport(
        `${info.project.name}-response-slice-${skin}`,
        {
          schema: 'UiResponseSliceV1',
          engine: info.project.name,
          skin,
          locale: 'pseudo30',
          digits: 6,
          calibration,
          scopes,
          basis:
            'olay/sanal kol durumu → DOM commit; dispatch → commit ve sonraki rAF ayrı duvar saati ölçüleridir',
          cpu: {
            status: 'not-run',
            reason: 'duvar saati JS CPU tüketimi değildir; native CPU probu ayrı ölçer',
          },
          presentation: {
            status: 'unsupported',
            reason: 'başsız motor fiziksel kare sunumu sağlamaz',
          },
          gamepad: 'navigator.getGamepads sanal girdisi; fiziksel donanım gecikmesi ölçülmedi',
        },
        { retry: info.retry, testId: info.testId, repeatEachIndex: info.repeatEachIndex },
      );
      for (const scope of scopes) {
        expect(scope.commit.p95, `${scope.mode}: olay → DOM ilk yanıt p95`).toBeLessThan(100);
      }
    });
  }
});
