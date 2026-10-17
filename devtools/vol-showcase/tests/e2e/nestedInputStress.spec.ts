import { expect, test } from '@playwright/test';
import { openShowcase, selectTab } from './support/determinism';
import { installVirtualPad, pressButton } from './support/gamepad';

for (const skin of ['default', 'aurum'] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`${skin}/${dir}: %200 alanda Modal → Select → OSK → tarayıcı metin girişi, LIFO ve söküm`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 640, height: 400 });
      await openShowcase(page, 20260101, `/?dir=${dir}`);
      if (skin === 'aurum') await page.locator('.vol-showcase-skin-button').click();
      await selectTab(page, 'panels');
      const trigger = page.getByRole('button', { name: 'Open Modal', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const Modal = page.locator('.vol-modal--visible:has(.vol-showcase-nested-input)');
      const Select = Modal.locator('.vol-select');
      const Input = Modal.locator('input.vol-input');
      await expect(Modal).toHaveCount(1);
      await Select.click();
      await expect(Modal.locator('[role="listbox"].vol-popup--visible')).toHaveCount(1);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(Select).toContainText('Hard');
      await expect(Modal).toHaveCount(1);
      const open = Modal.getByRole('button', { name: 'Open keyboard', exact: true });
      await open.click();
      const OnScreenKeyboard = page.locator('.vol-osk');
      await expect(OnScreenKeyboard).toHaveCount(1);
      expect(await page.evaluate(() => !!document.activeElement?.closest('.vol-osk'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(OnScreenKeyboard).toHaveCount(0);
      await expect(Modal).toHaveCount(1);
      await expect(open).toBeFocused();
      await Input.focus();
      await Input.fill('İğüşç');
      await page.keyboard.press('End');
      await page.keyboard.insertText(' örnek');
      await expect(Input).toHaveValue('İğüşç örnek');
      expect(
        await Input.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hit === element;
        }),
        'metin alanı örtülmez',
      ).toBe(true);
      await open.click();
      await expect(OnScreenKeyboard).toHaveCount(1);
      // Dil değişimi uygulama kökünü söküp yeniden kurar; eski OSK sonucu yeni köke sızamaz.
      await page.evaluate(() =>
        document.querySelector<HTMLButtonElement>('.vol-showcase-lang-button')!.click(),
      );
      await expect(OnScreenKeyboard).toHaveCount(0);
      await expect(page.locator('.vol-modal--visible')).toHaveCount(0);
      await selectTab(page, 'buttons');
      expect(await page.evaluate(() => document.body.hasAttribute('inert'))).toBe(false);
      expect(errors).toEqual([]);
    });
  }
}

test.describe('sanal kol ↔ dokunma ve hotplug', () => {
  test.use({ hasTouch: true });
  test('OSK açıkken sanal kol çıkarılır; dokunma iptali ve yeniden takılan kolla tek geri sahibi kalır', async ({
    page,
  }) => {
    await installVirtualPad(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[role="tablist"]');
    await selectTab(page, 'panels');
    await page.getByRole('button', { name: 'Open Modal', exact: true }).tap();
    const Modal = page.locator('.vol-modal--visible:has(.vol-showcase-nested-input)');
    await Modal.getByRole('button', { name: 'Open keyboard', exact: true }).tap();
    await expect(page.locator('.vol-osk')).toHaveCount(1);
    await page.evaluate(() => {
      navigator.getGamepads = () => [null, null, null, null];
    });
    await page.locator('.vol-osk').getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(page.locator('.vol-osk')).toHaveCount(0);
    await expect(Modal).toHaveCount(1);
    await page.evaluate(() => {
      const pad = window.__virtualPad;
      navigator.getGamepads = () => [pad as unknown as Gamepad, null, null, null];
    });
    await pressButton(page, 1);
    await expect(Modal).toHaveCount(0);
    await expect(page.locator('.vol-osk')).toHaveCount(0);
  });
});
