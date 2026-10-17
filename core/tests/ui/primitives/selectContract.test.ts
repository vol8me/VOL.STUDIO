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

  it('yeni değer seçilince liste kapanır ve odak tetikleyiciye döner (tıklama ve Enter)', () => {
    const select = make(vi.fn(), 'a');
    select.element.click();
    optionOf('b').click();
    expect(select.getValue()).toBe('b');
    expect(document.activeElement).toBe(select.element);

    select.element.click();
    const option = optionOf('c');
    option.focus();
    option.click(); // Enter da düğmede tıklama üretir
    expect(select.getValue()).toBe('c');
    expect(document.activeElement).toBe(select.element);
  });

  it('commit geri çağrısı odak tetikleyicideyken çalışır', () => {
    let focusedAtCommit: Element | null = null;
    const select = make(
      vi.fn(() => {
        focusedAtCommit = document.activeElement;
      }),
      'a',
    );
    select.element.click();
    optionOf('b').click();
    expect(focusedAtCommit).toBe(select.element);
  });

  it('programatik ayar odağa dokunmaz', () => {
    const select = make(vi.fn(), 'a');
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    select.setValue('b');
    expect(document.activeElement).toBe(other);
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
