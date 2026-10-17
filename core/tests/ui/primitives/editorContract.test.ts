import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { Input } from '../../../src/ui/primitives/Input';
import { TextArea } from '../../../src/ui/primitives/TextArea';
import { NumberStepper } from '../../../src/ui/primitives/NumberStepper';
import { Slider } from '../../../src/ui/primitives/Slider';
import { RangeSlider } from '../../../src/ui/primitives/RangeSlider';

/**
 * Adlandırılmış editör sözleşmesi (UI-05.1): IME bileşiminde Enter göndermez, taslak Escape ile geri
 * alınır, geçersiz sayı sessizce değere dönüşmez, readOnly/disabled değer, niyet ve geri çağrım üretmez,
 * erişilebilir ad/değer metni/yön dilden ve biçimleyiciden gelir.
 */
function intents(): { seen: UiIntent[]; release: () => void } {
  const handle = uiIntentBusFor(document.body);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  return { seen, release: handle.release };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Input', () => {
  const key = (init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent =>
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

  it('IME bileşiminde Enter göndermez ve kalıcı değişiklik üretmez; bileşim bitince Enter çalışır', () => {
    const onEnter = vi.fn();
    const onCommit = vi.fn();
    const input = new Input({ onEnter, onCommit });
    document.body.append(input.element);
    input.element.value = 'かな';

    input.element.dispatchEvent(key({ key: 'Enter', isComposing: true }));
    input.element.dispatchEvent(key({ key: 'Enter', keyCode: 229 }));
    expect(onEnter).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();

    input.element.dispatchEvent(key({ key: 'Enter' }));
    expect(onEnter).toHaveBeenCalledWith('かな');
    expect(onCommit).toHaveBeenCalledTimes(1);
    input.destroy();
  });

  it('Escape taslağı son kalıcı değere döndürür ve katmanı kapatmaz; taslak yokken yayılır', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const outer = vi.fn();
    const input = new Input({ value: 'kayıtlı', onInput, onCommit });
    document.body.append(input.element);
    document.body.addEventListener('keydown', outer);

    input.element.value = 'taslak';
    input.element.dispatchEvent(new Event('input'));
    onInput.mockClear();
    const reverting = key({ key: 'Escape' });
    input.element.dispatchEvent(reverting);
    expect(input.getValue()).toBe('kayıtlı');
    expect(reverting.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenCalledWith('kayıtlı');
    expect(onCommit).not.toHaveBeenCalled();

    input.element.dispatchEvent(key({ key: 'Escape' }));
    expect(outer).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', outer);
    input.destroy();
  });

  it('readOnly, invalid ve ariaLabel yerel özniteliklere yansır; setterlar geri alınır', () => {
    const input = new Input({ readOnly: true, invalid: true, ariaLabel: 'Oyuncu adı' });
    expect(input.element.readOnly).toBe(true);
    expect(input.element.getAttribute('aria-invalid')).toBe('true');
    expect(input.element.getAttribute('aria-label')).toBe('Oyuncu adı');
    input.setReadOnly(false);
    input.setInvalid(false);
    expect(input.element.readOnly).toBe(false);
    expect(input.element.hasAttribute('aria-invalid')).toBe(false);
    input.destroy();
  });
});

describe('TextArea', () => {
  it('yazma önizleme, change kalıcı değişiklik niyeti üretir; programatik atama sessizdir', () => {
    const { seen, release } = intents();
    const onCommit = vi.fn();
    const area = new TextArea({ onCommit, ariaLabel: 'Not' });
    document.body.append(area.element);
    const textarea = area.element.querySelector('textarea')!;
    expect(textarea.getAttribute('aria-label')).toBe('Not');

    textarea.value = 'merhaba';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen.map((intent) => `${intent.kind}:${intent.origin}`)).toEqual([
      'valuePreview:TextArea',
      'valueCommit:TextArea',
    ]);
    expect(onCommit).toHaveBeenCalledTimes(1);

    seen.length = 0;
    area.setValue('sessiz');
    expect(seen).toEqual([]);
    release();
    area.destroy();
  });

  it('Escape taslağı geri alır; IME bileşiminde geri alma yok; readOnly/invalid yansır', () => {
    const onInput = vi.fn();
    const area = new TextArea({ value: 'kayıtlı', maxLength: 20, onInput, readOnly: true });
    document.body.append(area.element);
    const textarea = area.element.querySelector('textarea')!;
    expect(textarea.readOnly).toBe(true);

    textarea.value = 'taslak';
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, cancelable: true }),
    );
    expect(textarea.value).toBe('taslak');

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(textarea.value).toBe('kayıtlı');
    expect(onInput).toHaveBeenLastCalledWith('kayıtlı');
    expect(area.element.querySelector('.vol-textarea__counter')!.textContent).toBe('7 / 20');

    area.setReadOnly(false);
    area.setInvalid(true);
    expect(textarea.readOnly).toBe(false);
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    area.destroy();
  });
});

describe('NumberStepper', () => {
  function stepper(options: ConstructorParameters<typeof NumberStepper>[0] = {}) {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const control = new NumberStepper({ onInput, onCommit, ...options });
    document.body.append(control.element);
    const input = control.element.querySelector<HTMLInputElement>('input')!;
    const type = (text: string, eventName: 'input' | 'change'): void => {
      input.value = text;
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    return { control, input, onInput, onCommit, type };
  }

  it('boş ya da sayı olmayan metin değer değildir: son geçerli değere döner, kalıcı değişiklik yok', () => {
    const { control, input, onCommit, type } = stepper({ value: 5, min: 2, max: 10 });
    type('', 'change');
    expect(input.value).toBe('5');
    expect(control.getValue()).toBe(5);
    type('abc', 'change');
    expect(input.value).toBe('5');
    expect(onCommit).not.toHaveBeenCalled();
    control.destroy();
  });

  it('yazılan değer aralığa sığar ve adım ızgarasına oturur; alan normalize değeri gösterir', () => {
    const { control, input, onCommit, type } = stepper({ value: 0, min: 0, max: 20, step: 5 });
    type('7', 'change');
    expect(control.getValue()).toBe(5);
    expect(input.value).toBe('5');
    type('99', 'change');
    expect(control.getValue()).toBe(20);
    expect(onCommit).toHaveBeenCalledTimes(2);
    // Normalize sonrası aynı değere inen giriş yeni kalıcı değişiklik değildir ama alan düzelir.
    type('21', 'change');
    expect(input.value).toBe('20');
    expect(onCommit).toHaveBeenCalledTimes(2);
    control.destroy();
  });

  it('ondalık adımda kayan nokta artığı üretmez', () => {
    const { control, input, type } = stepper({ value: 0, min: 0, max: 1, step: 0.1 });
    type('0.30000000000000004', 'change');
    expect(input.value).toBe('0.3');
    control.element.querySelectorAll<HTMLButtonElement>('.vol-stepper__button')[1].click();
    expect(control.getValue()).toBe(0.4);
    control.destroy();
  });

  it('Escape yazılırken alınan önizlemeyi son kalıcı değere döndürür ve yayılmaz', () => {
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    const { control, input, onInput, onCommit, type } = stepper({ value: 3, min: 0, max: 10 });
    type('8', 'input');
    expect(onInput).toHaveBeenLastCalledWith(8);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(escape);
    expect(input.value).toBe('3');
    expect(onInput).toHaveBeenLastCalledWith(3);
    expect(onCommit).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();

    // Taslak yokken Escape üst katmana gider.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(outer).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', outer);
    control.destroy();
  });

  it('readOnly alanı okunur bırakır, düğmeleri kilitler; disabled/readOnly birbirini açmaz', () => {
    const { control, input } = stepper({ value: 4, readOnly: true });
    const [minus, plus] = control.element.querySelectorAll<HTMLButtonElement>('button');
    expect(input.readOnly).toBe(true);
    expect([minus.disabled, plus.disabled]).toEqual([true, true]);

    control.setDisabled(true);
    control.setReadOnly(false);
    expect(input.disabled).toBe(true);
    expect([minus.disabled, plus.disabled]).toEqual([true, true]);
    control.setDisabled(false);
    expect([minus.disabled, plus.disabled]).toEqual([false, false]);
    control.setInvalid(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    control.destroy();
  });

  it('ses perdesi için aralığı bildirir', () => {
    const { control, input } = stepper({ min: 10, max: 50 });
    expect([input.dataset.volPitchMin, input.dataset.volPitchMax]).toEqual(['10', '50']);
    control.destroy();
  });
});

describe('Slider', () => {
  it('dikey kaydırıcı yönünü erişilebilirlik ağacına bildirir; yatay bildirmez', () => {
    const vertical = new Slider({ orientation: 'vertical', ariaLabel: 'Ses' });
    const horizontal = new Slider({ ariaLabel: 'Ses' });
    expect(vertical.element.querySelector('input')!.getAttribute('aria-orientation')).toBe(
      'vertical',
    );
    expect(horizontal.element.querySelector('input')!.hasAttribute('aria-orientation')).toBe(false);
    vertical.destroy();
    horizontal.destroy();
  });

  it('readOnly yerel hareketi sessizce geri alır: değer, niyet ve geri çağrım yok', () => {
    const { seen, release } = intents();
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const slider = new Slider({ value: 40, readOnly: true, onInput, onCommit });
    document.body.append(slider.element);
    const input = slider.element.querySelector('input')!;
    expect(input.getAttribute('aria-readonly')).toBe('true');

    input.value = '90';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(slider.getValue()).toBe(40);
    expect(onInput).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(seen).toEqual([]);

    slider.setReadOnly(false);
    expect(input.hasAttribute('aria-readonly')).toBe(false);
    release();
    slider.destroy();
  });

  it('sürükleme sürerken devre dışı kalırsa önizleme geri alınır, kalıcı değişiklik olmaz', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const slider = new Slider({ value: 10, onInput, onCommit });
    document.body.append(slider.element);
    const input = slider.element.querySelector('input')!;
    input.value = '70';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenLastCalledWith(70);

    slider.setDisabled(true);
    expect(slider.getValue()).toBe(10);
    expect(onInput).toHaveBeenLastCalledWith(10);
    expect(onCommit).not.toHaveBeenCalled();
    slider.destroy();
  });
});

describe('RangeSlider', () => {
  const handles = (slider: RangeSlider): HTMLElement[] => [
    ...slider.element.querySelectorAll<HTMLElement>('.vol-range-slider__handle'),
  ];
  const press = (handle: HTMLElement, key: string): void => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };

  it('tutamak adları dilden gelir ve dil değişince yenilenir; etiket yoksa yalın ad', async () => {
    const labeled = new RangeSlider({ label: 'Seviye' });
    const bare = new RangeSlider({ ariaLabel: 'Fiyat' });
    const anonymous = new RangeSlider();
    expect(handles(labeled).map((h) => h.getAttribute('aria-label'))).toEqual([
      'Seviye (alt sınır)',
      'Seviye (üst sınır)',
    ]);
    expect(handles(bare).map((h) => h.getAttribute('aria-label'))).toEqual([
      'Fiyat (alt sınır)',
      'Fiyat (üst sınır)',
    ]);
    expect(handles(anonymous).map((h) => h.getAttribute('aria-label'))).toEqual([
      'Alt sınır',
      'Üst sınır',
    ]);

    await i18next.changeLanguage('en');
    expect(handles(labeled).map((h) => h.getAttribute('aria-label'))).toEqual([
      'Seviye (minimum)',
      'Seviye (maximum)',
    ]);
    labeled.setLabel('Level');
    expect(handles(labeled)[0].getAttribute('aria-label')).toBe('Level (minimum)');
    await i18next.changeLanguage('tr');
    labeled.destroy();
    bare.destroy();
    anonymous.destroy();
  });

  it('ekran okuyucuya biçimlenmiş değer metni verir ve değişimle günceller', () => {
    const slider = new RangeSlider({
      min: 0,
      max: 100,
      step: 10,
      value: { min: 20, max: 80 },
      formatValue: (v) => `%${v}`,
    });
    const [minHandle, maxHandle] = handles(slider);
    expect(minHandle.getAttribute('aria-valuetext')).toBe('%20');
    expect(maxHandle.getAttribute('aria-valuetext')).toBe('%80');
    press(minHandle, 'ArrowRight');
    expect(minHandle.getAttribute('aria-valuetext')).toBe('%30');
    slider.destroy();
  });

  it('PageUp/PageDown aralığın onda biri kadar büyük adım atar ve sınırda durur', () => {
    const onCommit = vi.fn();
    const slider = new RangeSlider({
      min: 0,
      max: 100,
      step: 5,
      value: { min: 0, max: 100 },
      onCommit,
    });
    const [minHandle, maxHandle] = handles(slider);
    press(minHandle, 'PageUp');
    expect(slider.getValue().min).toBe(10);
    press(maxHandle, 'PageDown');
    expect(slider.getValue().max).toBe(90);
    press(minHandle, 'PageDown');
    press(minHandle, 'PageDown');
    expect(slider.getValue().min).toBe(0);
    expect(onCommit).toHaveBeenCalledTimes(3);
    slider.destroy();
  });

  it('readOnly klavye ve işaretçiyi engeller; disabled aria-disabled taşır', () => {
    const { seen, release } = intents();
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const slider = new RangeSlider({
      value: { min: 20, max: 80 },
      readOnly: true,
      onInput,
      onCommit,
    });
    document.body.append(slider.element);
    const [minHandle] = handles(slider);
    const track = slider.element.querySelector<HTMLElement>('.vol-range-slider__track')!;
    expect(minHandle.getAttribute('aria-readonly')).toBe('true');

    press(minHandle, 'ArrowRight');
    track.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        bubbles: true,
        isPrimary: true,
      }),
    );
    expect(slider.getValue()).toEqual({ min: 20, max: 80 });
    expect(onInput).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(seen).toEqual([]);

    slider.setReadOnly(false);
    expect(minHandle.hasAttribute('aria-readonly')).toBe(false);
    slider.setDisabled(true);
    expect(minHandle.getAttribute('aria-disabled')).toBe('true');
    slider.setDisabled(false);
    expect(minHandle.getAttribute('aria-disabled')).toBe('false');
    release();
    slider.destroy();
  });
});
