import { settleTransitions } from './support/settle';
import { expect, test, type Page } from '@playwright/test';
import { selectTab, SHOWCASE_TABS } from './support/determinism';

/**
 * Boşta maliyet sözleşmesi (UI-06.4/UI-13.3): kullanıcı hiçbir şey yapmazken ekranda görünmeyen bir şey kare
 * üretmez. Windows yerel WebView2 sondası (`native-frame-probe.mjs --idle-only`) boşta CPU'nun büyük payını
 * kök düzeyde bağlı, KAPALI bir diyalogun saydam (`opacity: 0`) devam okunun sonsuz zıplamasında buldu: saydam
 * öğenin sonsuz animasyonu da her karede kompozit işi üretir. Bu tarama bunun bir daha olmamasını sınar.
 */
/**
 * `openShowcase` animasyonları kapatan `STILL_CSS`i ekler; burada ise tam tersi gerekir: gerçek animasyonlar
 * çalışmalı. Bu yüzden sayfa dondurulmadan açılır ve tarama animasyon GÖRDÜĞÜNÜ ayrıca kanıtlar.
 */
async function openLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
}

interface InvisibleLoop {
  animation: string;
  element: string;
  reason: string;
}

/** Çalışan sonsuz animasyonlardan görünmez öğede olanlar. */
async function invisibleInfiniteAnimations(page: Page): Promise<InvisibleLoop[]> {
  return page.evaluate(() => {
    const out: { animation: string; element: string; reason: string }[] = [];
    const label = (el: Element): string =>
      `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue;
      const effect = animation.effect;
      if (!effect || effect.getComputedTiming().iterations !== Infinity) continue;
      const target = (effect as KeyframeEffect).target;
      if (!(target instanceof HTMLElement || target instanceof SVGElement)) continue;
      const name =
        (animation as CSSAnimation).animationName ??
        (animation as CSSTransition).transitionProperty ??
        'animasyon';
      let reason = '';
      let opacity = 1;
      for (let node: Element | null = target; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        if (style.visibility === 'hidden' && node === target) reason = 'visibility: hidden';
        if (node.closest('[aria-hidden="true"][inert]')) reason ||= 'inert + aria-hidden panel';
      }
      if (!reason && opacity === 0) reason = 'etkin saydamlık 0';
      const rect = target.getBoundingClientRect();
      if (!reason && (rect.width === 0 || rect.height === 0)) reason = 'sıfır boyut';
      if (reason) out.push({ animation: name, element: label(target), reason });
    }
    return out;
  });
}

test.describe('boşta maliyet: görünmeyen sonsuz animasyon yok', () => {
  for (const tab of SHOWCASE_TABS) {
    test(tab, async ({ page }) => {
      await openLive(page);
      await selectTab(page, tab);
      // Açılıştaki sonlu geçişler tamamlanır; sonsuz animasyonlar beklenmez.
      await settleTransitions(page);
      expect(await invisibleInfiniteAnimations(page)).toEqual([]);
    });
  }

  test('tarama animasyon görür: Düğmeler sekmesinde çalışan sonsuz animasyon vardır', async ({
    page,
  }) => {
    await openLive(page);
    await selectTab(page, 'buttons');
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity,
          ).length,
    );
    expect(
      running,
      'yükleme döndürücüsü sonsuz animasyondur; 0 ise tarama boşuna geçiyor',
    ).toBeGreaterThan(0);
  });

  test('düzenek: saydam öğedeki sonsuz animasyonu yakalar, görünür olanı yakalamaz', async ({
    page,
  }) => {
    await openLive(page);
    await selectTab(page, 'buttons');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '@keyframes idle-test { 50% { transform: translateY(4px); } }' +
        '.idle-test { position: fixed; top: 10px; left: 10px; width: 20px; height: 20px;' +
        ' background: #fff; animation: 1s ease-in-out infinite idle-test; }';
      document.head.append(style);
      const ghost = document.createElement('div');
      ghost.className = 'idle-test';
      ghost.style.opacity = '0';
      ghost.dataset.ghost = '';
      const visible = document.createElement('div');
      visible.className = 'idle-test';
      visible.style.left = '60px';
      document.body.append(ghost, visible);
    });
    const found = await invisibleInfiniteAnimations(page);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ animation: 'idle-test', reason: 'etkin saydamlık 0' });
  });
});
