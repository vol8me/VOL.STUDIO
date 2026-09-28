import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAMEPAD_BUTTON, type PadLike } from '../../src/input/GamepadState';
import { pushBackHandler } from '../../src/platform/backNavigation';
import { FocusNavController } from '../../src/ui/focus/FocusNavController';

function makePad(back = false): PadLike {
  return {
    id: 'test-pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: back && index === GAMEPAD_BUTTON.secondary,
      value: back && index === GAMEPAD_BUTTON.secondary ? 1 : 0,
    })),
  };
}

function escape(
  type: 'keydown' | 'keyup',
  target: EventTarget = document,
  repeat = false,
): KeyboardEvent {
  const event = new KeyboardEvent(type, { key: 'Escape', bubbles: true, cancelable: true, repeat });
  target.dispatchEvent(event);
  return event;
}

function place(element: HTMLElement, y = 0): void {
  element.getBoundingClientRect = () => ({ x: 0, y, width: 40, height: 20 }) as DOMRect;
  document.body.appendChild(element);
}

describe('FocusNav geri basış yaşam döngüsü', () => {
  let nav: FocusNavController;
  let pad: PadLike;
  let backs: number;
  let now: number;
  let off: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    pad = makePad();
    backs = 0;
    now = 0;
    off = pushBackHandler(() => {
      backs++;
      return true;
    });
    nav = new FocusNavController({ getGamepads: () => [pad], now: () => now });
    nav.start();
  });

  afterEach(() => {
    nav.destroy();
    off();
    document.body.innerHTML = '';
  });

  it('iki kısa Escape basışını zaman penceresi içinde ayrı işler', () => {
    escape('keydown');
    escape('keyup');
    now = 30;
    escape('keydown');
    escape('keyup');
    expect(backs).toBe(2);
  });

  it('iki kısa B basışını zaman penceresi içinde ayrı işler', () => {
    nav.pollPad(makePad(true));
    nav.pollPad(makePad());
    now = 30;
    nav.pollPad(makePad(true));
    expect(backs).toBe(2);
  });

  it('bırakılan B ardından bağımsız Escape basışını yutmaz', () => {
    nav.pollPad(makePad(true));
    nav.pollPad(makePad());
    escape('keydown');
    expect(backs).toBe(2);
  });

  it('B bırakılışı henüz yoklanmamışken yeni Escape gerçek kol durumunu okur', () => {
    pad = makePad(true);
    nav.pollPad(pad);
    pad = makePad();
    escape('keydown');
    expect(backs).toBe(2);
  });

  it('tutulan Escape repeat bayrağı olmadan yinelense bile yalnız bir geri üretir', () => {
    escape('keydown');
    now = 1000;
    escape('keydown');
    escape('keydown', document, true);
    expect(backs).toBe(1);
  });

  it('Escape önce görülüp eş B yoklaması gecikirse tutuş boyunca bir geri üretir', () => {
    escape('keydown');
    now = 1000;
    pad = makePad(true);
    nav.pollPad(pad);
    expect(backs).toBe(1);
    escape('keyup');
    pad = makePad();
    nav.pollPad(pad);
    escape('keydown');
    expect(backs).toBe(2);
  });

  it('B önce görülürse eş Escape ve uzun tutuş ikinci geri üretmez', () => {
    pad = makePad(true);
    nav.pollPad(pad);
    now = 1000;
    escape('keydown');
    escape('keydown', document, true);
    nav.pollPad(pad);
    expect(backs).toBe(1);
  });

  it('Escape sırasında zaten basılı B ilk yoklamayı beklemeden bir kez işler', () => {
    pad = makePad(true);
    escape('keydown');
    expect(backs).toBe(1);
    nav.pollPad(pad);
    expect(backs).toBe(1);
  });

  it('doğrudan back çağrıları bağımsız niyetleri yutmaz', () => {
    expect(nav.back()).toBe(true);
    expect(nav.back()).toBe(true);
    expect(backs).toBe(2);
  });

  it('pencere odağı kaybolunca Escape tutuşu sonraki basışı kilitlemez', () => {
    escape('keydown');
    window.dispatchEvent(new Event('blur'));
    escape('keydown');
    expect(backs).toBe(2);
  });

  it.each(['range', 'checkbox'])('%s odağında Escape geri yığınına ulaşır', (type) => {
    const input = document.createElement('input');
    input.type = type;
    place(input);
    input.focus();
    const event = escape('keydown', input);
    expect(backs).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('native select odağında işlenmemiş Escape geri yığınına ulaşır', () => {
    const select = document.createElement('select');
    place(select);
    select.focus();
    escape('keydown', select);
    expect(backs).toBe(1);
  });

  it('metin odağında B de düzenleme Escape gibi geri yığınını devralmaz', () => {
    const input = document.createElement('input');
    place(input);
    input.focus();
    pad = makePad(true);
    nav.pollPad(pad);
    expect(backs).toBe(0);
  });

  it('önceden işlenen Escape kol eşinde geri yığınına yeniden düşmez', () => {
    document.addEventListener('keydown', (event) => event.preventDefault(), {
      once: true,
      capture: true,
    });
    escape('keydown');
    pad = makePad(true);
    nav.pollPad(pad);
    expect(backs).toBe(0);
  });

  it.each(['input', 'textarea', 'contenteditable'])(
    '%s düzenlemesinde Escape ve yön devralınmaz',
    (kind) => {
      const input = document.createElement(kind === 'contenteditable' ? 'div' : kind);
      if (kind === 'contenteditable') {
        input.setAttribute('contenteditable', '');
        input.tabIndex = 0;
      }
      place(input);
      input.focus();
      const next = document.createElement('button');
      place(next, 60);
      const event = escape('keydown', input);
      const arrow = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(arrow);
      expect(backs).toBe(0);
      expect(event.defaultPrevented).toBe(false);
      expect(arrow.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(input);
    },
  );
});

describe('FocusNav range ayarı', () => {
  let nav: FocusNavController;
  let range: HTMLInputElement;
  let events: string[];

  beforeEach(() => {
    document.body.innerHTML = '';
    nav = new FocusNavController();
    nav.start();
    range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.1';
    range.value = '0.5';
    place(range);
    range.focus();
    events = [];
    range.addEventListener('input', () => events.push(`input:${range.value}`));
    range.addEventListener('change', () => events.push(`change:${range.value}`));
  });

  afterEach(() => {
    nav.destroy();
    document.body.innerHTML = '';
  });

  it('yatay range sağ okla native değeri değiştirir ve yalnız bir input/change yollar', () => {
    range.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(Number(range.value)).toBeCloseTo(0.6);
    expect(events).toEqual(['input:0.6', 'change:0.6']);
    expect(document.activeElement).toBe(range);
  });

  it('yatay range dikey yönde komşuya odak taşır', () => {
    const next = document.createElement('button');
    place(next, 60);
    nav.move('down');
    expect(document.activeElement).toBe(next);
    expect(range.value).toBe('0.5');
  });

  it('dikey range kendi ekseninde ayarlanır ve odağı tutar', () => {
    range.style.writingMode = 'vertical-lr';
    const next = document.createElement('button');
    place(next, 60);
    nav.move('down');
    expect(Number(range.value)).toBeCloseTo(0.6);
    expect(document.activeElement).toBe(range);
  });

  it('RTL yatay range sağ yönde azaltır', () => {
    range.style.direction = 'rtl';
    nav.move('right');
    expect(Number(range.value)).toBeCloseTo(0.4);
  });

  it('RTL dikey range yukarı yönde artırır', () => {
    range.style.writingMode = 'vertical-rl';
    range.style.direction = 'rtl';
    nav.move('up');
    expect(Number(range.value)).toBeCloseTo(0.6);
  });

  it.each([
    ['1', 'right'],
    ['0', 'left'],
  ] as const)('range %s sınırında %s yeni input/change üretmez', (value, direction) => {
    range.value = value;
    nav.move(direction);
    expect(range.value).toBe(value);
    expect(events).toEqual([]);
  });

  it('step tabanı min olan range değeri geçerli adıma hizalar', () => {
    range.min = '0.1';
    range.max = '1';
    range.step = '0.2';
    range.value = '0.4';
    nav.move('right');
    expect(Number(range.value)).toBeCloseTo(0.5);
    expect(events).toEqual(['input:0.5', 'change:0.5']);
  });

  it('step any range varsayılan adımla ayarlanır ve sınırda olay üretmez', () => {
    range.step = 'any';
    nav.move('right');
    expect(range.value).toBe('1');
    expect(events).toEqual(['input:1', 'change:1']);
    nav.move('right');
    expect(events).toEqual(['input:1', 'change:1']);
  });
});
