import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pickDirectionalTarget } from '../../src/ui/focus/directional';
import { listFocusable } from '../../src/ui/focus/focusable';
import { FocusNavController, FOCUS_NAV_CLASS } from '../../src/ui/focus/FocusNavController';
import { pushBackHandler, triggerBack } from '../../src/platform/backNavigation';
import { GAMEPAD_BUTTON, type PadLike } from '../../src/input/GamepadState';

function rect(x: number, y: number, w = 10, h = 10) {
  return { x, y, width: w, height: h };
}

/**
 * jsdom'da `getBoundingClientRect` hep 0 döner — konum testin konusudur,
 * elemana elle dikdörtgen verilir.
 */
function place(el: HTMLElement, x: number, y: number, w = 40, h = 20): void {
  el.getBoundingClientRect = () => rect(x, y, w, h) as DOMRect;
}

function makeButton(x: number, y: number): HTMLButtonElement {
  const el = document.createElement('button');
  place(el, x, y);
  document.body.appendChild(el);
  return el;
}

function makePad(buttons: readonly number[] = [], axes: readonly number[] = [0, 0]): PadLike {
  return {
    id: 'test-pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      value: buttons.includes(i) ? 1 : 0,
    })),
  };
}

describe('pickDirectionalTarget', () => {
  it('yönün ilerisindeki en yakın aday kazanır', () => {
    const right = { element: 'right', rect: rect(100, 0) };
    const wrong = { element: 'wrong-dir', rect: rect(-100, 0) };
    const behind = { element: 'behind', rect: rect(0, -100) };
    expect(pickDirectionalTarget(rect(0, 0), [right, wrong, behind], 'right')).toBe('right');
  });

  it('aynı yönde çapraz sapması az olan tercih edilir', () => {
    const near = { element: 'near', rect: rect(30, 60) };
    const aligned = { element: 'aligned', rect: rect(50, 5) };
    // near ana eksende daha yakın ama çaprazda çok uzak; aligned kazanmalı.
    expect(pickDirectionalTarget(rect(0, 0), [near, aligned], 'right')).toBe('aligned');
  });

  it('ileride aday yoksa null döner', () => {
    expect(
      pickDirectionalTarget(rect(0, 0), [{ element: 'x', rect: rect(0, -50) }], 'down'),
    ).toBeNull();
  });
});

describe('FocusNavController', () => {
  let nav: FocusNavController;

  beforeEach(() => {
    document.body.innerHTML = '';
    nav = new FocusNavController();
    nav.start();
  });

  afterEach(() => {
    nav.destroy();
    document.body.innerHTML = '';
  });

  it('ilk yön basımı ilk odaklanabilir elemana odaklanır', () => {
    const a = makeButton(0, 0);
    makeButton(100, 0);
    nav.move('right');
    expect(document.activeElement).toBe(a);
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(true);
  });

  it('sağa hareket uzamsal komşuya geçer', () => {
    makeButton(0, 0);
    const b = makeButton(100, 0);
    nav.move('right');
    nav.move('right');
    expect(document.activeElement).toBe(b);
  });

  it('activate odaktaki elemana click gönderir', () => {
    const a = makeButton(0, 0);
    let clicked = 0;
    a.addEventListener('click', () => clicked++);
    nav.move('right');
    nav.activate();
    expect(clicked).toBe(1);
  });

  it('Escape ortak geri yığınına düşer', () => {
    let calls = 0;
    const off = pushBackHandler(() => {
      calls++;
      return true;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(calls).toBe(1);
    off();
  });

  it('inert alt ağaçtaki elemanlar aday olmaz', () => {
    makeButton(0, 0);
    const host = document.createElement('div');
    // `inert` özelliği tarayıcıda attribute'a yansır; jsdom'da attribute'u
    // doğrudan kurmak aynı DOM durumunu temsil eder.
    host.setAttribute('inert', '');
    const hidden = document.createElement('button');
    place(hidden, 200, 0);
    host.appendChild(hidden);
    document.body.appendChild(host);
    const list = listFocusable();
    expect(list).toHaveLength(1);
  });

  it('açık Select listesinde tabindex -1 seçenekleri kolla gezilir ve seçilir', () => {
    const listbox = document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    listbox.className = 'vol-popup--visible';
    place(listbox, 0, 0, 120, 100);
    const first = document.createElement('button');
    const second = document.createElement('button');
    for (const [index, option] of [first, second].entries()) {
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      place(option, 0, index * 35);
      listbox.appendChild(option);
    }
    document.body.appendChild(listbox);
    let clicks = 0;
    second.addEventListener('click', () => clicks++);
    first.focus();
    nav.move('down');
    expect(document.activeElement).toBe(second);
    nav.activate();
    expect(clicks).toBe(1);
  });

  it('Select kendi yön tuşunu işlediyse FocusNav ikinci hareket yapmaz', () => {
    const first = makeButton(0, 0);
    const second = makeButton(0, 35);
    makeButton(0, 70);
    first.addEventListener('keydown', (event) => {
      event.preventDefault();
      second.focus();
    });
    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(second);
  });

  it('açık modal varken adaylar diyalog içeriğiyle sınırlanır', () => {
    makeButton(0, 0);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const inside = document.createElement('button');
    place(inside, 50, 50);
    dialog.appendChild(inside);
    // Diyalogun kendisi de görünür olmalı.
    place(dialog, 0, 0, 500, 500);
    document.body.appendChild(dialog);
    expect(listFocusable()).toEqual([inside]);
  });

  it('kol D-pad kenarı hareket ettir, A etkinleştir, B geri yapar', () => {
    const a = makeButton(0, 0);
    const b = makeButton(100, 0);
    nav.start();
    nav.pollPad(makePad([GAMEPAD_BUTTON.dpadRight]));
    expect(document.activeElement).toBe(a);
    // Düğme basılı tutulurken tekrar tetiklemez (kenar, seviye değil).
    nav.pollPad(makePad([GAMEPAD_BUTTON.dpadRight]));
    nav.pollPad(makePad());
    nav.pollPad(makePad([GAMEPAD_BUTTON.dpadRight]));
    expect(document.activeElement).toBe(b);

    let clicks = 0;
    b.addEventListener('click', () => clicks++);
    nav.pollPad(makePad());
    nav.pollPad(makePad([GAMEPAD_BUTTON.primary]));
    expect(clicks).toBe(1);
  });

  it('sol çubuk yön değişince bir kez hareket eder, geri dönünce yeniden silahlanır', () => {
    const a = makeButton(0, 0);
    const b = makeButton(100, 0);
    void a;
    nav.start();
    nav.pollPad(makePad([], [1, 0]));
    nav.pollPad(makePad([], [1, 0])); // tutuluyor — tekrar yok
    expect(document.activeElement).toBe(a);
    nav.pollPad(makePad()); // nötr — yeniden silahlanır
    nav.pollPad(makePad([], [1, 0]));
    expect(document.activeElement).toBe(b);
  });

  it("kol B ortak geri yığınını tetikler, Menu onMenu callback'ine gider", () => {
    let backs = 0;
    let menus = 0;
    const navWithMenu = new FocusNavController({ onMenu: () => menus++ });
    const off = pushBackHandler(() => {
      backs++;
      return true;
    });
    navWithMenu.start();
    navWithMenu.pollPad(makePad([GAMEPAD_BUTTON.secondary]));
    navWithMenu.pollPad(makePad([GAMEPAD_BUTTON.start]));
    expect(backs).toBe(1);
    expect(menus).toBe(1);
    navWithMenu.destroy();
    off();
  });

  it('oynanışta hareket ve dash arayüz düğmelerini tetiklemez; Menu yine ulaşır', () => {
    const button = makeButton(0, 0);
    let clicks = 0;
    let menus = 0;
    let active = false;
    button.addEventListener('click', () => clicks++);
    const gameNav = new FocusNavController({
      isNavigationActive: () => active,
      onMenu: () => menus++,
    });
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.primary], [1, 0]));
    expect(clicks).toBe(0);
    expect(document.activeElement).not.toBe(button);
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.start]));
    expect(menus).toBe(1);
    active = true;
    gameNav.pollPad(makePad());
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.primary]));
    expect(clicks).toBe(0);
    expect(document.activeElement).toBe(button);
    gameNav.pollPad(makePad());
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.primary]));
    expect(clicks).toBe(1);
    gameNav.destroy();
  });

  it('oynanıştan kart ekranına geçerken tutulan A yeni seçimi otomatik onaylamaz', () => {
    let active = false;
    const button = makeButton(0, 0);
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    const gameNav = new FocusNavController({ isNavigationActive: () => active });
    gameNav.pollPad(makePad());
    active = true;
    button.focus();
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.primary]));
    expect(clicks).toBe(0);
    gameNav.pollPad(makePad());
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.primary]));
    expect(clicks).toBe(1);
    gameNav.destroy();
  });

  it('B oynanışta da arayüzde de aynı geri yığınına gider', () => {
    let active = false;
    let backs = 0;
    const off = pushBackHandler(() => {
      backs++;
      return true;
    });
    const gameNav = new FocusNavController({ isNavigationActive: () => active });
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.secondary]));
    expect(backs).toBe(1);
    gameNav.pollPad(makePad());
    active = true;
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.secondary]));
    expect(backs).toBe(2);
    gameNav.destroy();
    off();
  });

  it('sol çubuğun basılı tutulması kontrollü bir hızla yeni seçeneklere ilerler', () => {
    const a = makeButton(0, 0);
    const b = makeButton(100, 0);
    const c = makeButton(200, 0);
    let now = 0;
    const gameNav = new FocusNavController({ now: () => now });
    gameNav.pollPad(makePad([], [1, 0]));
    expect(document.activeElement).toBe(a);
    now = 100;
    gameNav.pollPad(makePad([], [1, 0]));
    expect(document.activeElement).toBe(a);
    now = 300;
    gameNav.pollPad(makePad([], [1, 0]));
    expect(document.activeElement).toBe(b);
    now = 410;
    gameNav.pollPad(makePad([], [1, 0]));
    expect(document.activeElement).toBe(c);
    gameNav.destroy();
  });

  it('oynanışta LB/RB yetenek delegelerine gider', () => {
    const calls: string[] = [];
    const gameNav = new FocusNavController({
      isNavigationActive: () => false,
      onPrevTab: () => calls.push('left'),
      onNextTab: () => calls.push('right'),
    });
    gameNav.pollPad(makePad([GAMEPAD_BUTTON.leftBumper, GAMEPAD_BUTTON.rightBumper]));
    expect(calls).toEqual(['left', 'right']);
    gameNav.destroy();
  });

  it('Steam Input B düğmesini Escape olarak da üretince geri iki kez çalışmaz', () => {
    nav.destroy();
    let backs = 0;
    let pad = makePad();
    const off = pushBackHandler(() => {
      backs++;
      return true;
    });
    const gameNav = new FocusNavController({ getGamepads: () => [pad] });
    gameNav.start();
    pad = makePad([GAMEPAD_BUTTON.secondary]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    gameNav.pollPad(pad);
    expect(backs).toBe(1);
    gameNav.destroy();
    off();
  });

  it('odaklanan slider sağ/sol kol yönüyle değeri değiştirir ve odağı tutar', () => {
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.1';
    range.value = '0.5';
    place(range, 0, 0);
    document.body.appendChild(range);
    nav.move('right');
    nav.pollPad(makePad([GAMEPAD_BUTTON.dpadRight]));
    expect(Number(range.value)).toBeCloseTo(0.6);
    expect(document.activeElement).toBe(range);
  });

  it('işaretçi basımı nav halkasını siler', () => {
    const a = makeButton(0, 0);
    nav.move('right');
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(true);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(false);
  });

  it('metin alanındayken ok tuşları gezinmeyi devralmaz', () => {
    const input = document.createElement('input');
    place(input, 0, 0);
    document.body.appendChild(input);
    input.focus();
    makeButton(100, 0);
    nav.start();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    // Olay input'un içinden kabarır; odak değişmemeli.
    expect(document.activeElement).toBe(input);
  });
});

describe('triggerBack', () => {
  it('son kayıtlı işleyici önce dener, true tüketir', () => {
    const order: string[] = [];
    const off1 = pushBackHandler(() => {
      order.push('first');
      return false;
    });
    const off2 = pushBackHandler(() => {
      order.push('second');
      return true;
    });
    expect(triggerBack()).toBe(true);
    expect(order).toEqual(['second']);
    off1();
    off2();
  });

  it('işleyici yoksa false döner', () => {
    expect(triggerBack()).toBe(false);
  });
});
