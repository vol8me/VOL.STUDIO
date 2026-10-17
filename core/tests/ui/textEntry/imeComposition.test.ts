import { afterEach, describe, expect, it, vi } from 'vitest';
import { isComposingKey, setEnterKeyHint } from '../../../src/ui/textEntry/ime';
import { CommandPalette } from '../../../src/ui/overlays/CommandPalette';
import { ColorPicker } from '../../../src/ui/primitives/ColorPicker';
import { Input } from '../../../src/ui/primitives/Input';
import { NumberStepper } from '../../../src/ui/primitives/NumberStepper';
import { TextArea } from '../../../src/ui/primitives/TextArea';

/**
 * IME bileşimi (UI-11.1): kompozisyon sürerken Enter/Escape/oklar IME'nindir. Her metin girişi bileşeni bu tuşları
 * kendi eylemi sanmamalı: palet komut çalıştırmaz/kapanmaz, sayı alanı önizlemeyi geri almaz, renk taslağı silinmez.
 * İki sinyal de ayrı sınanır: standart `isComposing` ve WebKit/eski Chromium'un `keyCode === 229`'u.
 */
type Signal = { name: string; init: KeyboardEventInit & { keyCode?: number } };
const SIGNALS: Signal[] = [
  { name: 'isComposing', init: { isComposing: true } },
  { name: 'keyCode 229', init: { keyCode: 229 } },
];

const press = (
  target: Element,
  key: string,
  init: KeyboardEventInit & { keyCode?: number } = {},
): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('isComposingKey', () => {
  it('yalnız IME tuşlarını tanır: isComposing ya da keyCode 229', () => {
    expect(isComposingKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
    expect(isComposingKey(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }))).toBe(false);
    expect(isComposingKey(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(
      true,
    );
    expect(isComposingKey(new KeyboardEvent('keydown', { key: 'Process', keyCode: 229 }))).toBe(
      true,
    );
  });
});

describe.each(SIGNALS)('CommandPalette — $name', ({ init }) => {
  const setup = () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const palette = new CommandPalette({ onClose });
    palette.setItems([
      { id: 'a', label: 'Kule kur', onSelect },
      { id: 'b', label: 'Kule yık', onSelect: vi.fn() },
    ]);
    document.body.append(palette.element);
    palette.open();
    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    return { palette, input, onSelect, onClose };
  };

  it('bileşim sürerken Enter komut çalıştırmaz, Escape paleti kapatmaz, oklar seçimi oynatmaz', () => {
    const { palette, input, onSelect, onClose } = setup();
    const activeBefore = palette.element.querySelector('[aria-selected="true"]')?.id;

    const enter = press(input, 'Enter', init);
    const escape = press(input, 'Escape', init);
    press(input, 'ArrowDown', init);

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(palette.isOpen()).toBe(true);
    // IME'nin kendi davranışı (aday seçme/iptal) engellenmez: tarayıcı varsayılanı korunur.
    expect(enter.defaultPrevented).toBe(false);
    expect(escape.defaultPrevented).toBe(false);
    expect(palette.element.querySelector('[aria-selected="true"]')?.id).toBe(activeBefore);
    palette.destroy();
  });

  it('bileşim bitince aynı tuşlar çalışır: ok seçimi taşır, Enter komutu çalıştırır, Escape kapatır', () => {
    const { palette, input, onSelect } = setup();
    press(input, 'Enter');
    expect(onSelect).toHaveBeenCalledTimes(1);

    palette.open();
    press(input, 'Escape');
    expect(palette.isOpen()).toBe(false);
    palette.destroy();
  });

  it('belge düzeyi Escape de bileşimde paleti kapatmaz', () => {
    const { palette, input } = setup();
    // Odak kayınca devreye giren belge dinleyicisi: hedef paletin girişi olmasa da aynı kural geçerli.
    press(document.body, 'Escape', init);
    press(input, 'Escape', init);
    expect(palette.isOpen()).toBe(true);
    press(document.body, 'Escape');
    expect(palette.isOpen()).toBe(false);
    palette.destroy();
  });
});

describe.each(SIGNALS)('NumberStepper — $name', ({ init }) => {
  it('bileşimde Escape yazılan önizlemeyi geri almaz ve yukarı yayılır; sonra Escape geri alır', () => {
    const onInput = vi.fn();
    const control = new NumberStepper({ value: 5, min: 0, max: 20, onInput });
    document.body.append(control.element);
    const input = control.element.querySelector<HTMLInputElement>('input')!;
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);

    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onInput.mockClear();

    const composing = press(input, 'Escape', init);
    expect(input.value).toBe('12');
    expect(composing.defaultPrevented).toBe(false);
    expect(onInput).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);

    const real = press(input, 'Escape');
    expect(real.defaultPrevented).toBe(true);
    expect(input.value).toBe('5');
    expect(onInput).toHaveBeenLastCalledWith(5);
    expect(outer).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', outer);
    control.destroy();
  });
});

describe.each(SIGNALS)('ColorPicker hex alanı — $name', ({ init }) => {
  it('bileşimde Escape taslağı silmez; bileşim bitince geri alır', () => {
    const picker = new ColorPicker({ value: '#112233' });
    document.body.append(picker.element);
    const hex = picker.element.querySelector<HTMLInputElement>('.vol-color-picker__hex')!;
    hex.value = '#abcdef';
    hex.dispatchEvent(new Event('input', { bubbles: true }));

    const composing = press(hex, 'Escape', init);
    expect(composing.defaultPrevented).toBe(false);
    expect(hex.value).toBe('#abcdef');

    const real = press(hex, 'Escape');
    expect(real.defaultPrevented).toBe(true);
    expect(hex.value).toBe('#112233');
    picker.destroy();
  });
});

describe.each(SIGNALS)('Input ve TextArea — $name', ({ init }) => {
  it('bileşimde Enter göndermez; Escape taslağı geri almaz', () => {
    const onEnter = vi.fn();
    const input = new Input({ value: 'kayıtlı', onEnter });
    document.body.append(input.element);
    input.element.value = 'かな';
    press(input.element, 'Enter', init);
    press(input.element, 'Escape', init);
    expect(onEnter).not.toHaveBeenCalled();
    expect(input.element.value).toBe('かな');
    input.destroy();

    const area = new TextArea({ value: 'kayıtlı' });
    document.body.append(area.element);
    const textarea = area.element.querySelector('textarea')!;
    textarea.value = '日本語';
    press(textarea, 'Escape', init);
    expect(textarea.value).toBe('日本語');
    area.destroy();
  });
});

/**
 * Ekran klavyesinin eylem tuşu (`enterkeyhint`): ipucu yoksa Android'de Gboard tek alanda "Sonraki" gösterir ve Chrome
 * bunu odak gezintisi sayar, sayfaya HİÇ Enter göndermez (Lenovo TB350FU'da ölçüldü). Enter ile çalışan alanlar
 * `go`/`done`/`search` ipucu DOM özniteliği olarak korunur.
 */
describe('enterkeyhint', () => {
  const hint = (element: Element): string | null => element.getAttribute('enterkeyhint');

  it('setEnterKeyHint ipucu verilmezse hiçbir şey yazmaz', () => {
    const element = document.createElement('input');
    setEnterKeyHint(element, undefined);
    expect(element.hasAttribute('enterkeyhint')).toBe(false);
    setEnterKeyHint(element, 'send');
    expect(hint(element)).toBe('send');
  });

  it('Input: onEnter varsa done, search alanı search, ikisi yoksa tarayıcıya bırakılır; açık seçim kazanır', () => {
    expect(hint(new Input().element)).toBeNull();
    expect(hint(new Input({ onEnter: vi.fn() }).element)).toBe('done');
    expect(hint(new Input({ type: 'search' }).element)).toBe('search');
    expect(hint(new Input({ type: 'search', onEnter: vi.fn() }).element)).toBe('search');
    expect(hint(new Input({ onEnter: vi.fn(), enterKeyHint: 'go' }).element)).toBe('go');
    expect(hint(new Input({ enterKeyHint: 'next' }).element)).toBe('next');
  });

  it('CommandPalette go, NumberStepper ve renk hex alanı done ister', () => {
    const palette = new CommandPalette();
    expect(hint(palette.element.querySelector('input')!)).toBe('go');
    palette.destroy();

    const stepper = new NumberStepper();
    expect(hint(stepper.element.querySelector('input')!)).toBe('done');
    stepper.destroy();

    const picker = new ColorPicker();
    expect(hint(picker.element.querySelector('.vol-color-picker__hex')!)).toBe('done');
    picker.destroy();
  });
});
