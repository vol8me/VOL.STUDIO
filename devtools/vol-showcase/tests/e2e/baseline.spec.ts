import { test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openShowcase, selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * İlk referans kaydının TARAYICI tarafı (`scripts/quality/cli/ui-baseline.mjs
 * record`). Yalnız `UI_BASELINE_OUT` verilince koşar; rutin E2E'de atlanır ve
 * hiçbir şeyi iddia etmez: bir kapı değil, ölçüm toplayıcıdır. Çıktı git dışı
 * özel kayıt alanına gider ve karşılaştırma yöntemiyle (`compare`) okunur.
 *
 * İçerik:
 * - ekranlar: dondurulmuş ortamda her sekmenin PNG özeti (sha256), motor başına;
 * - hareket: hareket azaltma kapalı/açık iken sürekli (sonsuz döngülü)
 *   animasyon adları. Sonlu geçişler zamana bağlıdır ve kayda girmez.
 */
const outDir = process.env.UI_BASELINE_OUT;

test.describe('ilk referans toplayıcısı', () => {
  test.skip(!outDir, 'UI_BASELINE_OUT verilmedi: rutin koşuda toplayıcı çalışmaz');

  test('ekran özetleri ve hareket durumları', async ({ browser, page }, info) => {
    test.setTimeout(240_000);
    const engine = info.project.name;

    const screens: Record<string, string> = {};
    await openShowcase(page);
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const png = await page.screenshot({ animations: 'disabled', scale: 'css' });
      screens[tab] = createHash('sha256').update(png).digest('hex');
    }

    const motion: Record<string, Record<string, { looping: string[] }>> = {};
    for (const mode of ['no-preference', 'reduce'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: mode,
      });
      const motionPage = await context.newPage();
      await motionPage.goto(new URL('/', info.project.use.baseURL ?? 'http://127.0.0.1').href);
      await motionPage.waitForSelector('[role="tablist"]');
      await motionPage.evaluate(() => document.fonts.ready);
      for (const tab of SHOWCASE_TABS) {
        await selectTab(motionPage, tab);
        const looping = await motionPage.evaluate(() => {
          const names = new Set<string>();
          for (const animation of document.getAnimations()) {
            if (animation.playState !== 'running') continue;
            if (animation.effect?.getComputedTiming().iterations !== Infinity) continue;
            names.add(
              animation instanceof CSSAnimation
                ? animation.animationName
                : animation.constructor.name,
            );
          }
          return [...names].sort();
        });
        (motion[tab] ??= {})[mode] = { looping };
      }
      await context.close();
    }

    mkdirSync(outDir!, { recursive: true });
    writeFileSync(
      resolve(outDir!, `screens-${engine}.json`),
      `${JSON.stringify({ engine, screens, motion }, null, 2)}\n`,
    );
  });
});
