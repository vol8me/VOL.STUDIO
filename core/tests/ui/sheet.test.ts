import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBackHandlerCount, pushBackHandler } from '../../src/platform/backNavigation';
import { Sheet } from '../../src/ui/overlays/Sheet';
import { Select } from '../../src/ui/primitives/Select';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  document.body.innerHTML = '';
  document.body.classList.remove('vol-modal__body-locked');
  expect(getBackHandlerCount()).toBe(0);
});

function mountSheet(options: ConstructorParameters<typeof Sheet>[0] = {}): Sheet {
  const sheet = new Sheet({ title: 'Ayarlar', closeLabel: 'Kapat', ...options });
  document.body.appendChild(sheet.element);
  cleanups.push(() => sheet.destroy());
  return sheet;
}

function androidBack(): void {
  window.dispatchEvent(new Event('vol:androidback'));
}

describe('Sheet', () => {
  it('başlık, görünür kapatma düğmesi ve klavyeyle kaydırılabilir gövde kurar', () => {
    const sheet = mountSheet();
    const title = sheet.element.querySelector('.vol-sheet__title');
    const close = sheet.element.querySelector<HTMLButtonElement>('.vol-sheet__close');
    const scroll = sheet.element.querySelector<HTMLElement>('.vol-scroll-view');
    const dialog = sheet.element.querySelector<HTMLElement>('[role="dialog"]');

    expect(title?.textContent).toBe('Ayarlar');
    expect(close?.getAttribute('aria-label')).toBe('Kapat');
    expect(scroll?.tabIndex).toBe(0);
    expect(dialog?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(sheet.isOpen()).toBe(false);
  });

  it('içerik ekler; başlık ve kapatma etiketini canlı günceller', () => {
    const sheet = mountSheet();
    const content = document.createElement('p');
    content.textContent = 'İçerik';

    sheet.add({ element: content });
    sheet.setTitle('Settings');
    sheet.setCloseLabel('Close');

    expect(sheet.element.querySelector('.vol-scroll-view__content')?.textContent).toBe('İçerik');
    expect(sheet.element.querySelector('.vol-sheet__title')?.textContent).toBe('Settings');
    expect(sheet.element.querySelector('.vol-sheet__close')?.getAttribute('aria-label')).toBe(
      'Close',
    );
  });

  it('Escape, scrim ve kapatma düğmesiyle kapanır; odağı tetikleyiciye döndürür', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const sheet = mountSheet({ onClose });

    sheet.open();
    expect(document.activeElement).toBe(sheet.element.querySelector('.vol-sheet__close'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);

    sheet.open();
    sheet.element
      .querySelector<HTMLElement>('.vol-modal__scrim')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sheet.isOpen()).toBe(false);

    sheet.open();
    sheet.element.querySelector<HTMLButtonElement>('.vol-sheet__close')?.click();
    expect(sheet.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('Android geri hareketini tüketir ve kapanınca alttaki işleyiciyi serbest bırakır', () => {
    const lower = vi.fn(() => true);
    cleanups.push(pushBackHandler(lower));
    const sheet = mountSheet();
    sheet.open();

    expect(getBackHandlerCount()).toBe(2);
    androidBack();
    expect(sheet.isOpen()).toBe(false);
    expect(lower).not.toHaveBeenCalled();
    expect(getBackHandlerCount()).toBe(1);

    androidBack();
    expect(lower).toHaveBeenCalledOnce();
  });

  it('iç Select Escape ile önce kendi listesini kapatır, Sheet açık kalır', () => {
    const sheet = mountSheet();
    const select = new Select({
      options: [
        { value: 'tr', label: 'Türkçe' },
        { value: 'en', label: 'İngilizce' },
      ],
      value: 'tr',
    });
    cleanups.push(() => select.destroy());
    sheet.add(select);
    sheet.open();
    select.element.click();
    const selected = document.querySelector<HTMLElement>(
      '.vol-select__option[aria-selected="true"]',
    )!;

    selected.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(sheet.isOpen()).toBe(true);
  });

  it('açıkken destroy bütün oturum kaynaklarını ve gövde kilidini bırakır', () => {
    const sheet = mountSheet();
    sheet.open();
    expect(getBackHandlerCount()).toBe(1);

    sheet.destroy();

    expect(sheet.element.isConnected).toBe(false);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
    expect(getBackHandlerCount()).toBe(0);
  });
});
