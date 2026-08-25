import { describe, it, expect, vi } from 'vitest';
import { ColorPicker } from '../../src/ui/primitives/ColorPicker';

function hexInput(picker: ColorPicker): HTMLInputElement {
  return picker.element.querySelector('.vol-color-picker__hex')!;
}
function swatch(picker: ColorPicker): HTMLButtonElement {
  return picker.element.querySelector('.vol-color-picker__swatch')!;
}
/**
 * Hazır renkler `picker.element`'in İÇİNDE değil, `Popover`'ın kendi
 * elementindedir — bu yalnızca `show()`/`toggle()` çağrıldığında (yani
 * kutucuğa tıklandığında) `document.body`'e eklenir. Bu yüzden presetleri
 * bulmak `document`den aranmalı, `picker.element`den değil.
 */
function openPresets(picker: ColorPicker): NodeListOf<HTMLButtonElement> {
  if (!picker.element.isConnected) document.body.appendChild(picker.element);
  swatch(picker).click();
  return document.querySelectorAll<HTMLButtonElement>('.vol-color-picker__preset');
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

  it('kutucuk yerli <input type="color"> DEĞİLDİR — tarayıcının kendi diyaloğunu açmaz', () => {
    // Bu tam olarak düzeltilen kritik hataydı: yerli seçici VOL temasız,
    // fontsuz, i18n'siz bir sistem penceresi açıyordu.
    const picker = new ColorPicker({ value: '#000000' });
    const input = swatch(picker);
    expect(input.tagName).toBe('BUTTON');
    expect(input.getAttribute('type')).toBe('button');
    picker.destroy();
  });

  it('swatch değeri arka plan rengi olarak yansıtır ve setValue ile güncellenir', () => {
    const picker = new ColorPicker({ value: '#123456' });
    expect(swatch(picker).style.backgroundColor).toBe('rgb(18, 52, 86)');
    picker.setValue('#abcdef');
    expect(swatch(picker).style.backgroundColor).toBe('rgb(171, 205, 239)');
    picker.destroy();
  });

  it('hazır renk yokken kutucuğa tıklamak hiçbir popover açmaz', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ value: '#000000', onChange });
    document.body.appendChild(picker.element);
    swatch(picker).click();
    expect(document.querySelector('.vol-popover')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
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
    const picker = new ColorPicker({ value: '#123456', swatches: ['#123456'], onChange });
    openPresets(picker)[0].click();
    expect(onChange).not.toHaveBeenCalled();
    picker.destroy();
  });

  it('kutucuğa tıklamak hazır renkleri Popover içinde açar', () => {
    const picker = new ColorPicker({ swatches: ['#ff0000', '#00ff00'] });
    document.body.appendChild(picker.element);
    // Popover DOM'a `container`sız (varsayılan `document.body`) monte edilir;
    // gösterilmeden önce hiç eklenmemiştir.
    expect(document.querySelector('.vol-popover')).toBeNull();
    const presets = openPresets(picker);
    expect(document.querySelector('.vol-popover')).not.toBeNull();
    expect(presets).toHaveLength(2);
    picker.destroy();
  });

  it('hazır renkler tıklanınca uygulanır ve popover kapanır', () => {
    const onChange = vi.fn();
    const picker = new ColorPicker({ swatches: ['#ff0000', '#00ff00'], onChange });
    const presets = openPresets(picker);
    expect(presets).toHaveLength(2);
    presets[1].click();
    expect(onChange).toHaveBeenCalledWith('#00ff00');
    // Kapalı Popup DOM'dan kaldırılmaz, yalnızca görünürlük class'ını kaybeder.
    expect(document.querySelector('.vol-popup--visible')).toBeNull();
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
    const picker = new ColorPicker({ swatches: ['#111111'], onChange });
    const preset = openPresets(picker)[0];
    picker.destroy();

    preset.click();
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.element.isConnected).toBe(false);
  });

  it('etiket güncellenebilir — dil değişimi', () => {
    const picker = new ColorPicker({ label: 'Renk' });
    picker.setLabel('Color');
    expect(picker.element.querySelector('.vol-color-picker__label')?.textContent).toBe('Color');
    expect(swatch(picker).getAttribute('aria-label')).toBe('Color');
    expect(hexInput(picker).getAttribute('aria-label')).toBe('Color');
    picker.destroy();
  });

  it('hazır renk düğmeleri erişilebilir ad taşır', () => {
    const picker = new ColorPicker({ label: 'Renk', swatches: ['#ff0000'] });
    const preset = openPresets(picker)[0];
    expect(preset.getAttribute('aria-label')).toBe('#ff0000');
    picker.destroy();
  });
});
