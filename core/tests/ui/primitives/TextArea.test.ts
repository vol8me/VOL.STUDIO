import { describe, expect, it, vi } from 'vitest';
import { TextArea } from '../../../src/ui/primitives/TextArea';

describe('TextArea yerel değer sözleşmesi', () => {
  it('satır sonu normalizasyonu fazladan commit veya farklı geri çağrım değeri üretmez', () => {
    const onCommit = vi.fn();
    const area = new TextArea({ value: 'a\r\nb', onCommit });
    const field = area.element.querySelector('textarea')!;
    field.dispatchEvent(new Event('change'));
    expect(onCommit).not.toHaveBeenCalled();
    area.setValue('c\r\nd');
    field.dispatchEvent(new Event('change'));
    expect(onCommit).not.toHaveBeenCalled();
    area.setValueAndNotify('e\r\nf');
    expect(onCommit).toHaveBeenCalledWith('e\nf');
    area.setValueAndNotify('e\r\nf');
    expect(onCommit).toHaveBeenCalledTimes(1);
    area.destroy();
  });

  it('sıfır uzunluk sınırı sınırsız alana dönüşmez', () => {
    const area = new TextArea({ maxLength: 0 });
    expect(area.element.querySelector('textarea')!.maxLength).toBe(0);
    expect(area.element.querySelector('.vol-textarea__counter')?.textContent).toBe('0 / 0');
    area.destroy();
  });
});
