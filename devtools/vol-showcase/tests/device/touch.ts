import { settleFrames } from '../e2e/support/settle';
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
  await settleFrames(target.page());
  const box = await target.boundingBox();
  if (!box) throw new Error('dokunulacak öğenin kutusu yok');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const covering = await target.evaluate((element, at) => {
    const top = document.elementFromPoint(at.x, at.y);
    if (top !== null && (element === top || element.contains(top) || top.contains(element)))
      return null;
    return top === null
      ? 'yok'
      : `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}`;
  }, point);
  if (covering !== null) {
    throw new Error(
      `hedef örtülü: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) üstte: ${covering}`,
    );
  }
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
    // Jest hızı fiziksel zamana bağlıdır; ham olayları aynı kareye yığmamak için 60 Hz örnekleme.
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

/** CDP dokunuşunun uyumluluk `click`i `pointerup`tan ~250-300 ms SONRA gelir (gerçek çekirdek dokunuşunda 3-5 ms: `adb input tap` ile ölçüldü). */
const CLICK_SETTLE_MS = 600;

/**
 * Ekran koordinatına gerçek dokunuş. `click` gecikmeli geldiği için bu aralıkta bir sonraki işlem sayfayı kaydırırsa (örn.
 * `centerOf`) gecikmiş tıklama AYNI EKRAN KOORDİNATINDAKİ başka öğeye düşer; bu yüzden tıklama gelene (ya da çıkış payı
 * dolana: sayfa `pointerdown`u iptal ettiyse tıklama hiç gelmez) kadar beklenir.
 */
export async function tapAt(page: Page, point: Point): Promise<void> {
  await page.evaluate((settle) => {
    (window as unknown as { __tapSettled: Promise<void> }).__tapSettled = new Promise<void>(
      (resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          window.removeEventListener('click', done, true);
          resolve();
        };
        const timer = setTimeout(done, settle);
        window.addEventListener('click', done, true);
      },
    );
  }, CLICK_SETTLE_MS);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.evaluate(() => (window as unknown as { __tapSettled: Promise<void> }).__tapSettled);
}

/** Hedefin merkezine (örtülme denetimiyle) gerçek dokunuş. */
export async function tap(page: Page, target: Locator): Promise<void> {
  await tapAt(page, await centerOf(target));
}
