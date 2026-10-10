import type { CDPSession, Locator, Page } from '@playwright/test';

/**
 * Cihaz belirtimlerinin ortak ham dokunma yardımcıları: gerçek `Input.dispatchTouchEvent` (pointerType: touch), çok parmaklı
 * hareket ve hedef örtülmesi denetimi. Fare tıklaması DEĞİL; Playwright'ın `tap()`i de örtülmeyi denetlediği için kullanılmaz.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Hedefin merkezi. Hedef önce görünümün ORTASINA getirilir ve yerleşimin oturması beklenir; ham dokunuş (CDP) Playwright'ın
 * tıklaması gibi örtülmeyi/hareketi denetlemez, bu yüzden merkezde gerçekten hedefin durduğu doğrulanır (aksi hâlde dokunuş
 * sessizce başka öğeye ya da boşluğa gider ve test nedenini söylemeden kırılır).
 */
export async function centerOf(target: Locator): Promise<Point> {
  await target.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }),
  );
  await target.page().waitForTimeout(120);
  const box = await target.boundingBox();
  if (!box) throw new Error('dokunulacak öğenin kutusu yok');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const covered = await target.evaluate((element, at) => {
    const top = document.elementFromPoint(at.x, at.y);
    return top === null || !(element === top || element.contains(top) || top.contains(element));
  }, point);
  if (covered) throw new Error(`hedef örtülü: (${point.x.toFixed(0)}, ${point.y.toFixed(0)})`);
  return point;
}

/** Birden çok parmağı aynı anda başlatır, adım adım hareket ettirir ve bırakır; her parmak kendi kimliğiyle. */
export async function gesture(
  page: Page,
  fingers: { from: Point; to: Point }[],
  steps = 10,
  hold = false,
): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  const at = (t: number) =>
    fingers.map((finger, id) => ({
      id,
      x: finger.from.x + (finger.to.x - finger.from.x) * t,
      y: finger.from.y + (finger.to.y - finger.from.y) * t,
    }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let step = 1; step <= steps; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(step / steps),
    });
    await page.waitForTimeout(16);
  }
  if (!hold) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  return session;
}

export async function release(session: CDPSession): Promise<void> {
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

/** Sistem dokunuşu keser (örn. başka bir uygulama öne gelir): tarayıcı açık parmaklar için `pointercancel` yollar. */
export async function cancel(session: CDPSession): Promise<void> {
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await session.detach();
}

export async function tap(page: Page, target: Locator): Promise<void> {
  const point = await centerOf(target);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
