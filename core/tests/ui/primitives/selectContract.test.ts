import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../../../src/ui/primitives/Select';

const mounted: Select[] = [];

function make(onCommit = vi.fn(), value?: string): Select {
  const select = new Select({
    options: [
      { value: 'a', label: 'Alfa' },
      { value: 'b', label: 'Bravo' },
      { value: 'c', label: 'Beta' },
    ],
    value,
    onCommit,
  });
  document.body.appendChild(select.element);
  mounted.push(select);
  return select;
}

const optionOf = (value: string) =>
  document.querySelector<HTMLButtonElement>(`.vol-select__option[data-value="${value}"]`)!;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.destroy();
  document.body.innerHTML = '';
});

describe('Select sözleşmesi', () => {
  it('aynı değeri yeniden seçmek kalıcı değişiklik üretmez ve listeyi kapatır', () => {
    const onCommit = vi.fn();
    const select = make(onCommit, 'a');
    select.element.click();
    optionOf('a').click();
    expect(onCommit).not.toHaveBeenCalled();
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(select.element);
    select.element.click();
    optionOf('b').click();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('açıkken devre dışı bırakma listeyi kapatır ve odağı tetikleyiciye alır', () => {
    const select = make();
    select.element.click();
    expect(select.element.getAttribute('aria-expanded')).toBe('true');
    const popupElement = optionOf('a').parentElement!;
    expect(popupElement.contains(document.activeElement)).toBe(true);
    select.setDisabled(true);
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(select.element.disabled).toBe(true);
    expect(popupElement.contains(document.activeElement)).toBe(false);
  });

  it('seçenek üzerinde harf yazmak sıradaki eşleşen etikete gider', () => {
    const select = make();
    select.element.click();
    optionOf('a').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionOf('b'));
    optionOf('b').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionOf('c'));
    optionOf('c').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionOf('c'));
  });
});
