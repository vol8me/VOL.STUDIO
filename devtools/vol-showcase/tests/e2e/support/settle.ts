import type { Locator, Page } from '@playwright/test';

/** İki çizim turu: yerleşim gözlemcileri ve çizim sonrası mesajları sabit süre tahmini olmadan boşaltır. */
export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              channel.port1.close();
              channel.port2.close();
              resolve();
            };
            channel.port2.postMessage(0);
          }),
        );
      }),
  );
}

/** Yalnız açılışta çalışan sonlu CSS geçişlerini bekler; bilinçli sonsuz göstergeler beklenmez. */
export async function settleTransitions(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().iterations !== Infinity,
      );
    await Promise.allSettled(finite.map((animation) => animation.finished));
  });
  await settleFrames(page);
}

/** Ataletli kaydırmada hedef dört ardışık kare boyunca aynı konumda kalınca örnek alınır. */
export async function settleScroll(target: Locator): Promise<void> {
  await target.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        let lastX = element.scrollLeft;
        let lastY = element.scrollTop;
        let stable = 0;
        const sample = (): void => {
          const x = element.scrollLeft;
          const y = element.scrollTop;
          stable = x === lastX && y === lastY ? stable + 1 : 0;
          lastX = x;
          lastY = y;
          if (stable >= 4) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}
