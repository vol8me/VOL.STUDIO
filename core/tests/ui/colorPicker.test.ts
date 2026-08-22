import { describe, it, expect, vi } from 'vitest';
import { ColorPicker } from '../../src/ui/primitives/ColorPicker';

function hexInput(picker: ColorPicker): HTMLInputElement {
  return picker.element.querySelector('.vol-color-picker__hex')!;
}
function swatch(picker: ColorPicker): HTMLInputElement {
  return picker.element.querySelector('.vol-color-picker__swatch')!;
}

describe('ColorPicker', () => {
  it('değeri #rrggbb ve KÜÇÜK HARF olarak normalize eder', () => {
    // Palet verisi bu biçimi bekler; iki farklı yazımın aynı rengi göstermesi
    // karşılaştırmaları sessizce bozardı.
    const picker = new ColorPicker({ value: '#AABBCC' });
    expect(picker.getValue()).toBe('#aabbcc');
    picker.destroy();
  });

  it('geçersiz değer siyaha düşer', () => {
    const picker = new ColorPicker({ value: 'kirmizi' });
    expect(picker.getValue()).toBe('#000000');
    picker.destroy();
  });

  it('kutucuk değişince onChange tetiklenir', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ value: '#000000', onChange });
    const input = swatch(picker);
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('#123456');
    expect(picker.getValue()).toBe('#123456');
    picker.destroy();
  });

  it('hex alanı YALNIZCA geçerli değerde yayın yapar', () => {
    // Her tuş vuruşunda geçersiz bir ara değer yaymak dinleyicideki paleti
    // kırardı.
    const onChange = vi.fn();
    const picker = new ColorPicker({ value: '#000000', onChange });
    const input = hexInput(picker);

    input.value = '#12';
    input.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();

    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('#123456');
    picker.destroy();
  });

  it('odak kaybında yarım metin son geçerli değere döner', () => {
    const picker = new ColorPicker({ value: '#abcdef' });
    const input = hexInput(picker);
    input.value = '#ab';
    input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('#abcdef');
    picker.destroy();
  });

  it('setValue onChange TETİKLEMEZ — döngüyü kırar', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ value: '#000000', onChange });
    picker.setValue('#ffffff');
    expect(onChange).not.toHaveBeenCalled();
    expect(hexInput(picker).value).toBe('#ffffff');
    picker.destroy();
  });

  it('aynı değeri yeniden atamak yayın yapmaz', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ value: '#123456', onChange });
    const input = swatch(picker);
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    picker.destroy();
  });

  it('hazır renkler tıklanınca uygulanır', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ swatches: ['#ff0000', '#00ff00'], onChange });
    const presets = picker.element.querySelectorAll<HTMLButtonElement>('.vol-color-picker__preset');
    expect(presets).toHaveLength(2);
    presets[1].click();
    expect(onChange).toHaveBeenCalledWith('#00ff00');
    picker.destroy();
  });

  it('devre dışı bırakma tüm girdileri kapatır', () => {
    const picker = new ColorPicker({ swatches: ['#ff0000'] });
    picker.setDisabled(true);
    expect(swatch(picker).disabled).toBe(true);
    expect(hexInput(picker).disabled).toBe(true);
    picker.destroy();
  });

  it('destroy dinleyicileri bırakır ve elementi kaldırır', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ onChange });
    document.body.appendChild(picker.element);
    const input = swatch(picker);
    picker.destroy();

    input.value = '#111111';
    input.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.element.isConnected).toBe(false);
  });

  it('etiket güncellenebilir — dil değişimi', () => {
    const picker = new ColorPicker({ label: 'Renk' });
    picker.setLabel('Color');
    expect(picker.element.querySelector('.vol-color-picker__label')?.textContent).toBe('Color');
    picker.destroy();
  });
});
