import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootShowcase } from '../src/bootstrap';

/** Skin değiştirici: kök `data-vol-theme`, etiket ve kalıcılık (tarayıcı tabanlı sınama `skin.spec.ts`te). */
const BOOT_TIMEOUT_MS = 20_000;

describe('skin düğmesi', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-vol-theme');
    document.body.replaceChildren();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it(
    'tıklanınca iki kaplama arasında döner; etiket ve kök nitelik değişir; seçim kalıcıdır',
    async () => {
      const session = await bootShowcase(root);
      const button = root.querySelector<HTMLButtonElement>('.vol-showcase-skin-button');
      if (!button) throw new Error('skin düğmesi yok');
      expect(button.dataset.skin).toBe('default');
      expect(document.documentElement.dataset.volTheme).toBe('default');
      button.click();
      expect(button.dataset.skin).toBe('aurum');
      expect(document.documentElement.dataset.volTheme).toBe('aurum');
      expect(button.getAttribute('aria-label')).toContain('Aurum');
      await Promise.resolve();
      expect(localStorage.getItem('device.volui:theme')).toBe('"aurum"');
      button.click();
      expect(button.dataset.skin).toBe('default');
      session.destroy();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'kayıtlı skin açılışta uygulanır; bozuk kayıt varsayılana döner',
    async () => {
      localStorage.setItem('device.volui:theme', '"aurum"');
      const first = await bootShowcase(root);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.documentElement.dataset.volTheme).toBe('aurum');
      first.destroy();

      localStorage.setItem('device.volui:theme', '{bozuk');
      root = document.createElement('div');
      document.body.replaceChildren(root);
      const second = await bootShowcase(root);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.documentElement.dataset.volTheme).toBe('default');
      second.destroy();
    },
    BOOT_TIMEOUT_MS,
  );
});
