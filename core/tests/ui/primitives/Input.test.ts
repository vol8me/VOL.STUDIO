import { describe, expect, it, vi } from 'vitest';
import { Input } from '../../../src/ui/primitives/Input';

describe('Input tamamlanmış değer sözleşmesi', () => {
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
