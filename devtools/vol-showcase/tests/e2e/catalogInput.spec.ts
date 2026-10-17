import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';
import { installVirtualPad, pressButton } from './support/gamepad';
import { settleTransitions } from './support/settle';

type InputMode = 'keyboard' | 'gamepad' | 'touch';

async function activate(page: Page, target: Locator, mode: InputMode): Promise<void> {
  await expect(target).toBeEnabled();
  await target.scrollIntoViewIfNeeded();
  if (mode === 'touch') {
    await target.tap();
  } else {
    await page.keyboard.press('Tab');
    await target.focus();
    await expect(target).toBeFocused();
    if (mode === 'keyboard') await page.keyboard.press('Enter');
    else if (mode === 'gamepad') await pressButton(page, 0);
  }
}

test.use({ hasTouch: true });

for (const mode of ['keyboard', 'gamepad', 'touch'] as const) {
  test(`${mode}: Button, IconButton, Modal, ToastManager, LoadingScreen ve DataTable gerçek eylemi çalıştırır`, async ({
    page,
  }) => {
    await installVirtualPad(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const families = {
      Button: page.getByRole('button', { name: 'Open Modal', exact: true }),
      IconButton: page.locator('[role="tabpanel"]:visible .vol-icon-button').first(),
      Modal: page.locator('.vol-modal--visible'),
      Input: page.locator('.vol-modal--visible input.vol-input').first(),
      ToastManager: page.locator('.vol-toast[role="alert"]'),
      LoadingScreen: page.locator('.vol-loading'),
      DataTable: page.locator('[role="tabpanel"]:visible .vol-datatable').first(),
    };

    await selectTab(page, 'buttons');
    const iconLabel = await families.IconButton.getAttribute('aria-label');
    await activate(page, families.IconButton, mode);
    await expect(families.IconButton).not.toHaveAttribute('aria-label', iconLabel!);

    await selectTab(page, 'panels');
    await activate(page, families.Button, mode);
    await expect(families.Modal).toBeVisible();
    if (mode === 'touch') await families.Input.tap();
    else await families.Input.click();
    await expect(families.Input).toBeFocused();
    const resume = families.Modal.getByRole('button', { name: 'Resume', exact: true });
    await activate(page, resume, mode);
    await expect(families.Modal).toHaveCount(0);
    if (mode !== 'touch') await expect(families.Button).toBeFocused();

    await page.getByRole('button', { name: 'Show Danger', exact: true }).click();
    await expect(families.ToastManager).toBeVisible();
    const dismiss = families.ToastManager.locator('.vol-toast__dismiss');
    await expect(dismiss).toHaveAccessibleName('Close');
    await activate(page, dismiss, mode);
    await expect(families.ToastManager).toHaveCount(0);

    await selectTab(page, 'advanced');
    const row = families.DataTable.locator('tr.vol-datatable__row').first();
    await expect(row).toHaveAttribute('aria-selected', 'false');
    await activate(page, row, mode);
    await expect(row).toHaveAttribute('aria-selected', 'true');

    await selectTab(page, 'loading');
    await page.getByRole('button', { name: 'Simulate failed loading', exact: true }).click();
    await expect(families.LoadingScreen.locator('[role="alert"]')).toBeVisible();
    await expect(families.LoadingScreen).toHaveAttribute('aria-busy', 'false');
    const retry = families.LoadingScreen.locator('.vol-loading__failure button').first();
    await activate(page, retry, mode);
    await expect(families.LoadingScreen).toHaveAttribute('aria-busy', 'true');
    await expect(families.LoadingScreen.locator('[role="alert"]')).toHaveCount(0);
    await expect(families.LoadingScreen).toHaveCount(0);
  });
}

test('touch: Joystick gerçek birincil dokunuşu tek oturumda bırakır; ScrollView dokunarak odaklanır', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await selectTab(page, 'touch');
  const Joystick = page.locator('[role="tabpanel"]:visible .vol-joystick').first();
  const base = Joystick.locator('.vol-joystick__base');
  await base.scrollIntoViewIfNeeded();
  await base.evaluate((element) => {
    const seen: string[] = [];
    element.setAttribute('data-touch-events', '[]');
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
      element.addEventListener(type, (event) => {
        const pointer = event as PointerEvent;
        if (pointer.isTrusted && pointer.pointerType === 'touch' && pointer.isPrimary) {
          element.setAttribute('data-touch-pointer', String(pointer.pointerId));
          seen.push(type);
          element.setAttribute('data-touch-events', JSON.stringify(seen));
        }
      });
  });
  await base.tap({ position: { x: 80, y: 56 } });
  await expect(base).toHaveAttribute('data-touch-events', '["pointerdown","pointerup"]');
  await expect(Joystick.locator('.vol-joystick__thumb')).toHaveCSS(
    'transform',
    /matrix\(1, 0, 0, 1,/,
  );
  const residual = await base.evaluate((element) =>
    element.hasPointerCapture(Number(element.getAttribute('data-touch-pointer'))),
  );
  expect(residual).toBe(false);
  await expect(base).not.toHaveClass(/vol-joystick__base--active/);
  await expect
    .poll(() =>
      Joystick.locator('.vol-joystick__thumb').evaluate(
        (element) => (element as HTMLElement).style.transform,
      ),
    )
    .toBe('translate(-50%, -50%)');

  await selectTab(page, 'scroll');
  const ScrollView = page.locator('[role="tabpanel"]:visible .vol-scroll-view--vertical').first();
  await ScrollView.tap();
  await expect(ScrollView).toBeFocused();
  const surface = await ScrollView.evaluate((element) => ({
    overflow: getComputedStyle(element).overflowY,
    content: element.scrollHeight,
    height: element.clientHeight,
  }));
  expect(['auto', 'scroll']).toContain(surface.overflow);
  expect(surface.content).toBeGreaterThan(surface.height);
  // Native pan/atalet ölçümü değildir: parmakla erişilen yüzeyin odağı ve kaydırma kapasitesi sınanır.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => ScrollView.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await settleTransitions(page);
});
