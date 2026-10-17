import { describe, expect, it, vi } from 'vitest';
import { Input } from '../../../src/ui/primitives/Input';

describe('Input tamamlanmış değer sözleşmesi', () => {
  it('disabled Input native odağı ve tıklamayı engeller; yeniden açılınca erişilir', () => {
    const input = new Input({ value: 'saklı', disabled: true });
    const click = vi.fn();
    input.element.addEventListener('click', click);
    document.body.append(input.element);
    input.element.focus();
    input.element.click();
    expect(input.element.disabled).toBe(true);
    expect(document.activeElement).not.toBe(input.element);
    expect(click).not.toHaveBeenCalled();
    expect(input.getValue()).toBe('saklı');
    input.setDisabled(false);
    input.element.focus();
    input.element.click();
    expect(document.activeElement).toBe(input.element);
    expect(click).toHaveBeenCalledTimes(1);
    input.destroy();
  });

  it('boş ve altı haneli sayı metni programatik ayarda olay üretmeden korunur', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const emptyValue = '';
    const input = new Input({ type: 'number', onInput, onCommit });
    expect(input.getValue()).toBe(emptyValue);
    input.setValue('999999');
    expect(input.getValue()).toBe('999999');
    input.setValue(emptyValue);
    expect(input.element.value).toBe(emptyValue);
    expect(onInput).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    input.destroy();
  });

  it('Enter gönderimi tamamlanan güncel modeli okur', () => {
    let saved = 'eski';
    const submitted: string[] = [];
    const input = new Input({
      value: saved,
      onCommit: (value) => {
        saved = value;
      },
      onEnter: () => submitted.push(saved),
    });
    input.element.value = 'yeni';
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(submitted).toEqual(['yeni']);
    input.destroy();
  });

  it('basılı Enter otomatik tekrarı yeniden göndermez', () => {
    const onEnter = vi.fn();
    const input = new Input({ onEnter });
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    expect(onEnter).toHaveBeenCalledTimes(1);
    input.destroy();
  });

  it('commit alanı kapatırsa aynı olay ikinci kullanıcı işlemi üretmez', () => {
    const onEnter = vi.fn();
    const input = new Input({ onCommit: () => input.destroy(), onEnter });
    input.element.value = 'son';
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('sayı setterı tarayıcının temizlediği değeri bildirir ve tekrar commit üretmez', () => {
    const onCommit = vi.fn();
    const onInput = vi.fn();
    const input = new Input({ type: 'number', value: '2', onCommit, onInput });
    input.setValueAndNotify('geçersiz');
    expect(input.getValue()).toBe('');
    expect(onInput).toHaveBeenCalledWith('');
    expect(onCommit).toHaveBeenCalledWith('');
    input.element.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    input.setValue('geçersiz');
    input.element.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    input.destroy();
  });
});
