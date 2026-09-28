import { expect, test, type Page } from '@playwright/test';

interface VirtualPad {
  id: string;
  connected: boolean;
  timestamp: number;
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

declare global {
  interface Window {
    __deckPad: VirtualPad;
  }
}

const PAD = { a: 0, b: 1, mode: 9, down: 13, right: 15 } as const;
const start = (page: Page) => page.getByRole('button', { name: /BAŞLA|START/i });
const settings = (page: Page) => page.getByRole('button', { name: /AYARLAR|SETTINGS/i });

async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox standard test controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__deckPad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad.connected ? pad : null, null, null, null],
    });
  });
}

async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function button(page: Page, index: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ({ index, pressed }) => {
      const pad = window.__deckPad;
      pad.timestamp += 1;
      pad.buttons[index] = { pressed, touched: pressed, value: pressed ? 1 : 0 };
    },
    { index, pressed },
  );
  await frames(page);
}

async function press(page: Page, index: number): Promise<void> {
  await button(page, index, true);
  await button(page, index, false);
}

function textViolations(): string[] {
  const result: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    if (!text) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      rect.width < 3 ||
      rect.height < 3 ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= innerWidth ||
      rect.top >= innerHeight ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    )
      continue;
    if (Number.parseFloat(style.fontSize) < 12)
      result.push(`${element.tagName}.${element.className}: ${style.fontSize}`);
  }
  return result;
}

test.beforeEach(async ({ page }) => {
  await installPad(page);
  await page.goto('/');
  await expect(start(page)).toBeVisible();
});

test('gönderilen menü, savaş ve ateş OGG dosyaları tarayıcıda çözülür', async ({ page }) => {
  const decoded = await page.evaluate(async () => {
    const context = new AudioContext();
    const paths = [
      '/assets/audio/music/main-menu/hollow-signal.ogg',
      '/assets/audio/music/combat/surge-protocol.ogg',
      '/assets/audio/sfx/player/fire-0.ogg',
    ];
    try {
      const durations: number[] = [];
      for (const path of paths) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        durations.push(buffer.duration);
      }
      return durations;
    } finally {
      await context.close();
    }
  });
  expect(decoded).toHaveLength(3);
  expect(decoded.every((duration) => Number.isFinite(duration) && duration > 0)).toBe(true);
});

test('menü A/B kısa ve tutulu basışları tek niyet taşır; sonraki geri basışı geçerlidir', async ({
  page,
}) => {
  await settings(page).focus();
  await button(page, PAD.a, true);
  await expect(page.locator('.vol-game-settings')).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator('.vol-game-settings')).toBeVisible();
  await button(page, PAD.a, false);
  await button(page, PAD.b, true);
  await expect(start(page)).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await button(page, PAD.b, false);

  await settings(page).focus();
  await press(page, PAD.a);
  await expect(page.locator('.vol-game-settings')).toBeVisible();
  await press(page, PAD.b);
  await expect(start(page)).toBeVisible();
  await press(page, PAD.b);
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await press(page, PAD.b);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test('pause ayarlarından tutulu B yalnız üst katmanı kapatır; yeni B koşuyu sürdürür', async ({
  page,
}) => {
  await start(page).click();
  await expect(page.locator('.vol-hud-stats')).toBeVisible();
  await press(page, PAD.mode);
  const pause = page.locator('.vol-pause-overlay--visible');
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: /^(AYARLAR|SETTINGS)$/i }).focus();
  await press(page, PAD.a);
  await expect(page.locator('.pause-settings-panel')).toBeVisible();
  await button(page, PAD.b, true);
  await expect(page.locator('.pause-settings-panel')).toHaveAttribute('inert', '');
  await expect(page.locator('.pause-settings-panel')).not.toHaveClass(/vol-panel--visible/);
  await page.waitForTimeout(400);
  await expect(pause).toBeVisible();
  await button(page, PAD.b, false);
  await press(page, PAD.b);
  await expect(pause).toHaveCount(0);
});

test('glifler PC, kol, touch ve çıkarılıp takılan yeni aileyi izler', async ({ page }) => {
  const glyph = start(page).locator('[data-vol-input-glyph]');
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/keyboard\//);
  await button(page, PAD.mode, true);
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/xbox\//);
  await button(page, PAD.mode, false);
  const touchHidden = await page.evaluate(async () => {
    document.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'touch',
        bubbles: true,
        clientX: 5,
        clientY: 5,
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return document.querySelector('[data-vol-input-glyph]')?.hasAttribute('hidden');
  });
  expect(touchHidden).toBe(true);
  await page.keyboard.press('Shift');
  await expect(glyph).toBeVisible();
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/keyboard\//);
  await button(page, PAD.mode, true);
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/xbox\//);
  await page.evaluate(() => {
    window.__deckPad.connected = false;
    window.dispatchEvent(new Event('gamepaddisconnected'));
  });
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/keyboard\//);
  await page.evaluate(() => {
    window.__deckPad.id = 'DualSense test controller';
    window.__deckPad.connected = true;
    window.__deckPad.timestamp += 1;
    window.dispatchEvent(new Event('gamepadconnected'));
  });
  await expect(glyph.locator('img')).toHaveAttribute('src', /glyphs\/playstation\//);
  await expect(glyph).toBeVisible();
  await button(page, PAD.mode, false);
});

test('autoaim tercihi reload sonrası kalır; oyun cursor gizli, pause cursor görünürdür', async ({
  page,
}) => {
  await settings(page).click();
  const autoAim = page.locator('.vol-game-settings__aim input[type="checkbox"]');
  await page.locator('.vol-game-settings__aim').click();
  await expect(autoAim).toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(localStorage).some(
          (value) => typeof value === 'string' && value.includes('"autoAim":true'),
        ),
      ),
    )
    .toBe(true);
  await page.reload();
  await settings(page).click();
  await expect(autoAim).toBeChecked();
  await press(page, PAD.b);
  await start(page).click();
  await expect(page.locator('.vol-hud-stats')).toBeVisible();
  await page.mouse.move(600, 350);
  await expect(page.locator('.vol-custom-cursor')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.vol-pause-overlay--visible')).toBeVisible();
  await expect(page.locator('.vol-custom-cursor')).toBeVisible();
});

test('slider kol halkası görünür track üzerinde çizilir ve yön girdisi değeri değiştirir', async ({
  page,
}) => {
  await settings(page).click();
  await page.locator('.vol-slider__input').first().focus();
  const slider = page.locator('input.vol-slider__input.vol-focusnav-current');
  for (let index = 0; index < 12 && (await slider.count()) === 0; index += 1)
    await press(page, PAD.down);
  await expect(slider).toHaveCount(1);
  const track = slider.locator('..');
  await expect
    .poll(() => track.evaluate((element) => getComputedStyle(element).outlineStyle))
    .toBe('solid');
  expect(
    await track.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
  ).toBeGreaterThanOrEqual(2);
  await slider.press('Home');
  const before = Number(await slider.inputValue());
  await press(page, PAD.right);
  expect(Number(await slider.inputValue())).toBeGreaterThan(before);
});

test('oyun küçük metin sınıfları gerçek stylesheet ile en az 12px çizilir', async ({ page }) => {
  const measures = await page.evaluate(() => {
    const fixture = document.createElement('div');
    document.body.appendChild(fixture);
    const result = ['vol-ability-slot__key', 'vol-loadout__hint'].map((className) => {
      const text = document.createElement('span');
      text.className = className;
      text.textContent = 'ölçüm';
      fixture.appendChild(text);
      return { className, size: Number.parseFloat(getComputedStyle(text).fontSize) };
    });
    fixture.remove();
    return result;
  });
  expect(measures.filter((measure) => measure.size < 12)).toEqual([]);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`canvas ve görünür menü/settings/oyun/pause metinleri @ ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const canvas = page.locator('canvas');
    await expect
      .poll(() =>
        canvas.evaluate((element) => ({
          width: element.clientWidth,
          height: element.clientHeight,
        })),
      )
      .toEqual(viewport);
    expect(await page.evaluate(textViolations)).toEqual([]);
    await settings(page).click();
    expect(await page.evaluate(textViolations)).toEqual([]);
    await press(page, PAD.b);
    await start(page).click();
    await expect(page.locator('.vol-hud-stats')).toBeVisible();
    expect(await page.evaluate(textViolations)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vol-pause-overlay--visible')).toBeVisible();
    expect(await page.evaluate(textViolations)).toEqual([]);
  });
}
