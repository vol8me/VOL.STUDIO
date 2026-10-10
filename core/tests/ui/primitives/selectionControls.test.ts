import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { FocusNavController } from '../../../src/ui/focus/FocusNavController';
import { Checkbox } from '../../../src/ui/primitives/Checkbox';
import { ColorPicker } from '../../../src/ui/primitives/ColorPicker';
import { CurveEditor, type CurvePoint } from '../../../src/ui/primitives/CurveEditor';
import { Popover } from '../../../src/ui/overlays/Popover';
import { RangeSlider } from '../../../src/ui/primitives/RangeSlider';
import { Select } from '../../../src/ui/primitives/Select';

/**
 * Seçim ve eğri denetimleri (UI-05.2): devre dışı seçenek/boş liste, switch anlamı, pasif renk kutucuğu,
 * taslak iptali, eğri düzenleyicinin klavye/dokunma/kol eşdeğerleri ve bileşik denetimin ok sahipliği.
 */
afterEach(() => {
  document.body.replaceChildren();
});

function intents(): { seen: UiIntent[]; release: () => void } {
  const handle = uiIntentBusFor(document.body);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  return { seen, release: handle.release };
}

const key = (target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alfa' },
    { value: 'b', label: 'Bravo', disabled: true },
    { value: 'c', label: 'Charlie' },
  ];
  const optionOf = (value: string) =>
    document.querySelector<HTMLButtonElement>(`.vol-select__option[data-value="${value}"]`)!;

  it('devre dışı seçenek seçilemez, gezinme onu atlar, kalıcı değişiklik üretmez', () => {
    const onCommit = vi.fn();
    const select = new Select({ options, value: 'a', onCommit });
    document.body.append(select.element);
    select.element.click();

    expect(optionOf('b').disabled).toBe(true);
    expect(optionOf('b').getAttribute('aria-disabled')).toBe('true');
    optionOf('b').click();
    select.setValueAndNotify('b');
    expect(onCommit).not.toHaveBeenCalled();

    key(optionOf('a'), 'ArrowDown');
    expect(document.activeElement).toBe(optionOf('c'));
    key(optionOf('c'), 'ArrowUp');
    expect(document.activeElement).toBe(optionOf('a'));
    key(optionOf('a'), 'End');
    expect(document.activeElement).toBe(optionOf('c'));
    key(optionOf('c'), 'b');
    // "b" yalnız devre dışı Bravo ile başlar; odak kalır.
    expect(document.activeElement).toBe(optionOf('c'));
    select.destroy();
  });

  it('harfle gezinme arayüz diliyle küçültür: Türkçede I → ı, İ → i (sistem yerelinden bağımsız)', async () => {
    const turkish = [
      { value: 'izmir', label: 'İzmir' },
      { value: 'isik', label: 'Işık' },
    ];
    const open = () => {
      const select = new Select({ options: turkish, value: 'izmir', onCommit: vi.fn() });
      document.body.append(select.element);
      select.element.click();
      return select;
    };
    await i18next.changeLanguage('tr');
    try {
      const first = open();
      key(optionOf('izmir'), 'I'); // Türkçe klavyede Shift+ı
      expect(document.activeElement).toBe(optionOf('isik'));
      key(optionOf('isik'), 'i');
      expect(document.activeElement).toBe(optionOf('izmir'));
      first.destroy();
      key(document.body, 'Escape');
      await i18next.changeLanguage('en');
      const second = open();
      // İngilizcede I → i: ilk eşleşen "Işık"tan sonra gelen İzmir ("i̇zmir") değil, sıradaki eşleşmedir.
      key(optionOf('izmir'), 'I');
      expect(document.activeElement).toBe(optionOf('isik'));
      second.destroy();
    } finally {
      await i18next.changeLanguage('tr');
    }
  });

  it('boş liste nedenini söyler (seçilemez tek satır), tetikleyici açılır ama değer üretmez', () => {
    const onCommit = vi.fn();
    const select = new Select({ options: [], onCommit });
    document.body.append(select.element);
    select.element.click();
    const empty = document.querySelector('.vol-select__empty')!;
    expect(empty.textContent).toBe('Seçenek yok');
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    (empty as HTMLElement).click();
    expect(onCommit).not.toHaveBeenCalled();

    select.setOptions([{ value: 'x', label: 'X' }]);
    expect(document.querySelector('.vol-select__empty')).toBeNull();
    select.setInvalid(true);
    expect(select.element.getAttribute('aria-invalid')).toBe('true');
    select.destroy();
  });
});

describe('Checkbox', () => {
  it('switch varyantı switch rolü taşır; varsayılan checkbox kalır; adsız denetim ariaLabel alır', () => {
    const toggle = new Checkbox({ variant: 'switch', ariaLabel: 'Titreşim', invalid: true });
    const plain = new Checkbox({ label: 'Kabul ediyorum' });
    const input = toggle.element.querySelector('input')!;
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-label')).toBe('Titreşim');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(plain.element.querySelector('input')!.hasAttribute('role')).toBe(false);
    toggle.setInvalid(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    toggle.destroy();
    plain.destroy();
  });
});

describe('ColorPicker', () => {
  it('hazır renk yokken kutucuk pasif göstergedir (inert); varken etkindir', () => {
    const passive = new ColorPicker({ label: 'Renk' });
    const interactive = new ColorPicker({ label: 'Renk', swatches: ['#ffffff'] });
    expect(passive.element.querySelector('.vol-color-picker__swatch')!.hasAttribute('inert')).toBe(
      true,
    );
    expect(
      interactive.element.querySelector('.vol-color-picker__swatch')!.hasAttribute('inert'),
    ).toBe(false);
    passive.destroy();
    interactive.destroy();
  });

  it('yarım hex aria-invalid taşır, geçerli olunca temizlenir; Escape taslağı geri alır ve yayılmaz', () => {
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    const onCommit = vi.fn();
    const picker = new ColorPicker({ value: '#112233', onCommit });
    document.body.append(picker.element);
    const hex = picker.element.querySelector<HTMLInputElement>('.vol-color-picker__hex')!;

    hex.value = '#12';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    hex.value = '#abcdef';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hex.hasAttribute('aria-invalid')).toBe(false);
    expect(picker.getValue()).toBe('#abcdef');

    const escape = key(hex, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(picker.getValue()).toBe('#112233');
    expect(hex.value).toBe('#112233');
    expect(onCommit).not.toHaveBeenCalled();

    // Yarım yazılmış metinle Escape de metni geri alır.
    hex.value = '#zz';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    key(hex, 'Escape');
    expect(hex.value).toBe('#112233');
    expect(hex.hasAttribute('aria-invalid')).toBe(false);

    key(hex, 'Escape');
    expect(outer).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', outer);
    picker.destroy();
  });

  it('hex kalıcı değişikliği valueCommit niyeti üretir; programatik atama sessizdir', () => {
    const { seen, release } = intents();
    const picker = new ColorPicker({ value: '#000000' });
    document.body.append(picker.element);
    const hex = picker.element.querySelector<HTMLInputElement>('.vol-color-picker__hex')!;
    hex.value = '#ff0000';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen.map((intent) => `${intent.kind}:${intent.origin}`)).toEqual([
      'valueCommit:ColorPicker',
    ]);
    seen.length = 0;
    picker.setValue('#00ff00');
    expect(seen).toEqual([]);
    release();
    picker.destroy();
  });
});

describe('CurveEditor — klavye, dokunma ve kol eşdeğerleri', () => {
  function editor(points?: CurvePoint[], onCommit = vi.fn(), onInput = vi.fn()) {
    const control = new CurveEditor({
      label: 'Eğri',
      points: points ?? [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ],
      onCommit,
      onInput,
    });
    document.body.append(control.element);
    const handles = (): HTMLButtonElement[] => [
      ...control.element.querySelectorAll<HTMLButtonElement>('.vol-curve-editor__point'),
    ];
    const buttons = () => {
      const [add, remove] = control.element.querySelectorAll<HTMLButtonElement>(
        '.vol-curve-editor__tools button',
      );
      return { add, remove };
    };
    return { control, handles, buttons, onCommit, onInput };
  }

  it('her nokta adlı bir düğmedir; tuval AT ağacından gizlidir; grup etiketle adlanır', () => {
    const { control, handles } = editor();
    expect(handles()).toHaveLength(3);
    expect(handles()[1].getAttribute('aria-label')).toBe('Nokta 2 / 3: X 0,5, Y 0,5');
    expect(control.element.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
    const group = control.element.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-labelledby')).toBe(
      control.element.querySelector('.vol-curve-editor__label')!.id,
    );
    expect(document.getElementById(group.getAttribute('aria-describedby')!)!.textContent).toMatch(
      /Ok tuşları/,
    );
    control.destroy();
  });

  it('ok tuşu noktayı bir adım taşır ve her adım kalıcıdır; Shift on kat; komşuyu geçmez, alanda durur', () => {
    const { control, handles, onCommit, onInput } = editor();
    const middle = handles()[1];
    key(middle, 'ArrowUp');
    expect(control.getPoints()[1]).toEqual([0.5, 0.51]);
    key(middle, 'ArrowLeft', { shiftKey: true });
    expect(control.getPoints()[1]).toEqual([0.4, 0.51]);
    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledTimes(2);

    // Komşu x'e (0) kadar gider, geçmez.
    for (let i = 0; i < 6; i++) key(middle, 'ArrowLeft', { shiftKey: true });
    expect(control.getPoints()[1][0]).toBe(0);
    expect(control.getPoints().map((point) => point[0])).toEqual([0, 0, 1]);
    // Alan sınırında adım değişim üretmez.
    const commits = onCommit.mock.calls.length;
    key(handles()[2], 'ArrowUp');
    expect(onCommit).toHaveBeenCalledTimes(commits);
    control.destroy();
  });

  it('Enter noktayı tutar (oklar kol D-pad için FocusNav’dan alınır), oklar taşır, ikinci Enter tek kalıcı değişiklik yapar', () => {
    const { control, handles, onCommit } = editor();
    const middle = handles()[1];
    middle.click();
    expect(middle.getAttribute('aria-pressed')).toBe('true');
    expect(middle.dataset.volArrows).toBe('both');

    key(middle, 'ArrowRight');
    key(middle, 'ArrowRight');
    key(middle, 'ArrowDown');
    expect(onCommit).not.toHaveBeenCalled();

    middle.click();
    expect(middle.hasAttribute('aria-pressed')).toBe(false);
    expect(middle.dataset.volArrows).toBeUndefined();
    expect(control.getPoints()[1]).toEqual([0.52, 0.49]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    control.destroy();
  });

  it('tutulu noktada Escape başlangıca döner ve katmanı kapatmaz; tutulmayan noktada yayılır', () => {
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    const { control, handles, onCommit, onInput } = editor();
    const middle = handles()[1];
    middle.click();
    key(middle, 'ArrowUp', { shiftKey: true });
    outer.mockClear();
    const escape = key(middle, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(control.getPoints()[1]).toEqual([0.5, 0.5]);
    expect(onInput).toHaveBeenLastCalledWith(control.getPoints());
    expect(onCommit).not.toHaveBeenCalled();
    expect(middle.hasAttribute('aria-pressed')).toBe(false);

    outer.mockClear();
    key(middle, 'Escape');
    expect(outer).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', outer);
    control.destroy();
  });

  it('"Nokta ekle" en geniş aralığın ortasına eğrinin değeriyle ekler (biçim değişmez); "Noktayı sil" seçiliyi siler', () => {
    const { control, handles, buttons, onCommit } = editor([
      [0, 0],
      [0.2, 0.4],
      [1, 1],
    ]);
    expect(buttons().remove.disabled).toBe(true);

    buttons().add.click();
    expect(control.getPoints()).toHaveLength(4);
    expect(control.getPoints()[2][0]).toBe(0.6);
    expect(control.getPoints()[2][1]).toBeCloseTo(control.sample(0.6), 4);
    expect(document.activeElement).toBe(handles()[2]);
    expect(onCommit).toHaveBeenCalledTimes(1);

    // Odak düğmeye gitse de son seçili nokta silinir; en az iki nokta kalır.
    expect(buttons().remove.disabled).toBe(false);
    buttons().remove.click();
    expect(control.getPoints()).toHaveLength(3);
    expect(onCommit).toHaveBeenCalledTimes(2);
    handles()[0].focus();
    key(handles()[0], 'Delete');
    expect(control.getPoints()).toHaveLength(2);
    expect(buttons().remove.disabled).toBe(true);
    key(handles()[0], 'Delete');
    expect(control.getPoints()).toHaveLength(2);
    control.destroy();
  });

  it('silinen noktanın odağı komşu noktaya geçer; eylemler canlı bölgeye yazılır', () => {
    const { control, handles } = editor();
    handles()[1].focus();
    key(handles()[1], 'Delete');
    expect(handles()).toHaveLength(2);
    expect(document.activeElement).toBe(handles()[1]);
    expect(control.element.querySelector('[role="status"]')!.textContent).toMatch(/Silindi\./);
    control.destroy();
  });

  it('devre dışı düzenleyicide düğmeler ve araçlar kilitlidir, klavye değişiklik üretmez', () => {
    const { control, handles, buttons, onCommit } = editor();
    control.setDisabled(true);
    expect(handles().every((handle) => handle.disabled)).toBe(true);
    expect(buttons().add.disabled).toBe(true);
    key(handles()[1], 'ArrowUp');
    expect(onCommit).not.toHaveBeenCalled();
    expect(control.element.querySelector('[role="group"]')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    control.destroy();
  });

  it('ikinci işaretçi sürüklemeyi devralmaz; iptal edilen sürükleme sessizce geri alınır', () => {
    const { control, onCommit, onInput } = editor();
    const canvas = control.element.querySelector('canvas')!;
    const down = (id: number, x: number, y: number, primary = true): void => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: id,
          clientX: x,
          clientY: y,
          isPrimary: primary,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    // Orta nokta tuval koordinatında (110, 70).
    down(1, 110, 70);
    down(2, 110, 70, false);
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 150, clientY: 20, bubbles: true }),
    );
    expect(control.getPoints()[1]).toEqual([0.5, 0.5]);

    canvas.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 20, bubbles: true }),
    );
    expect(control.getPoints()[1][0]).toBeGreaterThan(0.5);
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
    expect(control.getPoints()[1]).toEqual([0.5, 0.5]);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenLastCalledWith(control.getPoints());
    control.destroy();
  });

  it('klavye adımı önizleme ve kalıcı değişiklik niyeti taşır; programatik setPoints sessizdir', () => {
    const { seen, release } = intents();
    const { control, handles } = editor();
    key(handles()[1], 'ArrowUp');
    expect(seen.map((intent) => `${intent.kind}:${intent.origin}`)).toEqual([
      'valuePreview:CurveEditor',
      'valueCommit:CurveEditor',
    ]);
    seen.length = 0;
    control.setPoints([
      [0, 0],
      [1, 1],
    ]);
    expect(seen).toEqual([]);
    expect(handles()).toHaveLength(2);
    release();
    control.destroy();
  });
});

describe('FocusNav bileşik denetim sözleşmesi (data-vol-arrows)', () => {
  function place(element: HTMLElement, x: number, y: number): void {
    element.getBoundingClientRect = () =>
      ({ x, y, left: x, top: y, width: 60, height: 30 }) as DOMRect;
    document.body.append(element);
  }

  it('D-pad yatay eksende RangeSlider tutamağını ayarlar; dikey D-pad uzamsal gezinmeye gider', () => {
    const nav = new FocusNavController({ getGamepads: () => [] });
    const range = new RangeSlider({ min: 0, max: 100, step: 10, value: { min: 40, max: 60 } });
    const below = document.createElement('button');
    below.textContent = 'alt';
    document.body.append(range.element);
    const minHandle = range.element.querySelector<HTMLElement>('.vol-range-slider__handle--min')!;
    place(minHandle, 0, 0);
    place(below, 0, 100);

    minHandle.focus();
    nav.move('right');
    expect(range.getValue().min).toBe(50);
    expect(document.activeElement).toBe(minHandle);
    nav.move('left');
    expect(range.getValue().min).toBe(40);

    nav.move('down');
    expect(document.activeElement).toBe(below);
    range.destroy();
    nav.destroy();
  });

  it('denetim olayı tüketmezse gezinme sürer ve sentetik olay özyinelemez', () => {
    const nav = new FocusNavController({ getGamepads: () => [] });
    const owner = document.createElement('button');
    owner.dataset.volArrows = 'horizontal';
    const next = document.createElement('button');
    place(owner, 0, 0);
    place(next, 100, 0);
    const seen = vi.fn();
    owner.addEventListener('keydown', seen);

    owner.focus();
    nav.move('right');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(next);
    nav.destroy();
  });
});

describe('Popover', () => {
  it('aria-controls yalnız açıkken geçerli bir kimliğe işaret eder (kapalıyken DOM’da hedef yok)', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const popover = new Popover(anchor, { ariaLabel: 'Seçenekler' });
    expect(anchor.hasAttribute('aria-controls')).toBe(false);

    popover.show();
    const controlled = anchor.getAttribute('aria-controls')!;
    expect(document.getElementById(controlled)).toBe(popover.element);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');

    popover.close();
    expect(anchor.hasAttribute('aria-controls')).toBe(false);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    popover.destroy();
  });
});
