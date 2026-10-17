import { expect, test, type Locator } from '@playwright/test';
import { selectTab } from './support/determinism';
import { settleTransitions } from './support/settle';

async function insideViewport(target: Locator): Promise<void> {
  const bounds = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
}

for (const skin of ['default', 'aurum'] as const) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`${skin}/${reducedMotion}: ContextMenu/Popover/RadialMenu/FatalStartupError plaka, hareket ve %200 odak`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 640, height: 400 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/?dir=rtl');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector('[role="tablist"]');
      if (skin === 'aurum') await page.locator('.vol-showcase-skin-button').click();
      await selectTab(page, 'panels');
      const ContextMenu = page.locator('.vol-popup--visible:has(.vol-context-menu__item)');
      const Popover = page.locator('.vol-popover.vol-popup--visible');
      const FatalStartupError = page.locator('.vol-fatal-startup');
      await page.getByRole('button', { name: 'Actions', exact: true }).click();
      await expect(ContextMenu).toHaveCount(1);
      await settleTransitions(page);
      await insideViewport(ContextMenu);
      expect(await ContextMenu.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
        'none',
      );
      await page.keyboard.press('Escape');
      await expect(ContextMenu).toHaveCount(0);
      await page.getByRole('button', { name: 'Open Popover', exact: true }).click();
      await expect(Popover).toHaveCount(1);
      await settleTransitions(page);
      await insideViewport(Popover);
      expect(await Popover.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(Popover).toHaveCount(0);
      const popoverTrigger = page.getByRole('button', { name: 'Open Popover', exact: true });
      await popoverTrigger.click();
      await Popover.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(Popover).toHaveCount(0);
      await expect(popoverTrigger).toBeFocused();
      await expect(FatalStartupError).toHaveAttribute('role', 'alert');
      const fatalStyle = await FatalStartupError.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow,
          animation: style.animationName,
          transition: style.transitionDuration,
        };
      });
      expect(fatalStyle.shadow).not.toBe('none');
      expect(fatalStyle.animation).toBe('none');
      // Başlatma hatası ses sağlayıcısı kurulmadan da gösterilir; anında, hareketsiz ve okunur kalır.
      await selectTab(page, 'touch');
      const RadialMenu = page.locator('.vol-radial-menu--visible');
      await page.getByRole('button', { name: 'Open with keys', exact: true }).click();
      await expect(RadialMenu).toHaveCount(1);
      await settleTransitions(page);
      for (const item of await RadialMenu.getByRole('menuitem').all()) {
        await insideViewport(item);
        expect(await item.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
          'none',
        );
      }
      expect(await RadialMenu.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      if (reducedMotion === 'reduce') {
        expect(await RadialMenu.evaluate((element) => getComputedStyle(element).transform)).toBe(
          'none',
        );
      }
      await page.keyboard.press('Escape');
      await expect(RadialMenu).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open with keys', exact: true })).toBeFocused();
    });
  }
}
