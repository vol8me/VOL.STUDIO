import { expect, test, type Page } from '@playwright/test';
import { skillOf, VEHICLE_IDS, VEHICLES } from '../../src/config/vehicles';

/**
 * Her aracın gerçek tarayıcıda sürülmesi: garajdan seçilir, alıştırma dünyasında yeteneği açılıp bırakılır;
 * araç sonlu konumda kalır, hareket eder ve konsol temiz kalır. Ajan laboratuvarı (`?lab=1`) girdiyi
 * oyuncunun kendi komut yolundan verir; bekleyişler durum yoklamasıdır.
 */
interface Lab {
  run(name: string, args?: Record<string, unknown>): unknown;
}

interface LabState {
  vehicle: string;
  x: number;
  y: number;
  speed: number;
  health: number;
  alive: boolean;
}

async function lab(page: Page, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return page.evaluate(
    ([command, input]) => (window as unknown as { volLab: Lab }).volLab.run(command, input),
    [name, args] as const,
  );
}

/** Tarayıcı saatinde `ms` geçene dek bekler (sabit uyku değil: sahne kareleri koşmaya devam eder). */
async function holdFor(page: Page, ms: number): Promise<void> {
  const until = (await page.evaluate(() => performance.now())) + ms;
  await page.waitForFunction((limit) => performance.now() >= limit, until);
}

const state = async (page: Page): Promise<LabState> => (await lab(page, 'state')) as LabState;

for (const id of VEHICLE_IDS) {
  test(`${id}: garajdan seçilir, yeteneği açılıp kapanır, konsol temiz kalır`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/?lab=1');
    await page.getByTestId('menu-play').click();
    const card = page.getByTestId(`garage-vehicle-${id}`);
    await card.scrollIntoViewIfNeeded();
    await card.locator('.vol-card__action').click();
    await page.getByTestId('garage-practice').click();
    await page.waitForFunction(() => Boolean((window as unknown as { volLab?: Lab }).volLab));
    await expect.poll(async () => (await state(page)).vehicle).toBe(id);

    await lab(page, 'input', { moveX: 1, moveY: 0, aimX: 1, aimY: 0, fire: true });
    const start = await state(page);
    await expect
      .poll(async () => {
        const now = await state(page);
        return Math.hypot(now.x - start.x, now.y - start.y);
      })
      .toBeGreaterThan(20);

    // Yetenek iki kez açılır ve bırakılır: tuşa basış, uçuş/kalkan evresi ve bitiş görünümden geçer.
    for (let round = 0; round < 2; round++) {
      await lab(page, 'input', { boost: true, brake: skillOf(VEHICLES[id]) !== 'dash' });
      await holdFor(page, 700);
      await lab(page, 'input', { boost: false, brake: false });
      await holdFor(page, 400);
    }
    const after = await state(page);
    expect(Number.isFinite(after.x) && Number.isFinite(after.y)).toBe(true);
    expect(after.alive).toBe(true);
    await lab(page, 'release');
    expect(errors).toEqual([]);
  });
}
