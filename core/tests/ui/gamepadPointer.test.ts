import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { GAMEPAD_BUTTON, type PadLike } from '../../src/input/GamepadState';
import {
  GamepadPointerController,
  computeGamepadPointerVelocity,
} from '../../src/ui/focus/GamepadPointerController';
import { FocusNavController } from '../../src/ui/focus/FocusNavController';
import { LevelUpPicker } from '../../src/ui/cards/LevelUpPicker';

function pad(x = 0, y = 0, pressed = false, index = 0): PadLike {
  return {
    id: `pad-${index}`,
    index,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, x, y],
    buttons: Array.from({ length: 17 }, (_, button) => ({
      pressed: pressed && button === GAMEPAD_BUTTON.primary,
      value: pressed && button === GAMEPAD_BUTTON.primary ? 1 : 0,
    })),
  };
}

function bounds(element: HTMLElement, x = 0, y = 0, width = 100, height = 100): void {
  element.getBoundingClientRect = () =>
    ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height }) as DOMRect;
}

function nativePointer(type = 'pointermove', x = 20, y = 30): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
}

describe('Sanal kol pointer hızı', () => {
  it('radial deadzone gürültüsünü hareketten çıkarır', () => {
    expect(
      computeGamepadPointerVelocity({ x: 0.1, y: 0.1 }, { x: 0, y: 0 }, 100, {
        deadZone: 0.2,
        speed: 200,
        acceleration: 0,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('tam çapraz çubuk toplam hızı aşmaz', () => {
    const velocity = computeGamepadPointerVelocity({ x: 1, y: 1 }, { x: 0, y: 0 }, 100, {
      deadZone: 0.2,
      speed: 200,
      acceleration: 0,
    });
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(200);
    expect(velocity.x).toBeCloseTo(Math.SQRT1_2 * 200);
  });

  it('ivme hızı saniye üzerinden kademeli artırır', () => {
    expect(
      computeGamepadPointerVelocity({ x: 1, y: 0 }, { x: 0, y: 0 }, 100, {
        deadZone: 0.2,
        speed: 200,
        acceleration: 100,
      }),
    ).toEqual({ x: 10, y: 0 });
  });

  it('nötr çubuk bırakıldığında cursor sürüklenmez', () => {
    expect(
      computeGamepadPointerVelocity({ x: 0, y: 0 }, { x: 100, y: 0 }, 100, {
        deadZone: 0.2,
        speed: 200,
        acceleration: 100,
      }),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('GamepadPointerController DOM niyeti', () => {
  let controller: GamepadPointerController;
  let active: boolean;
  let snapshot: PadLike | null;
  let target: Element | null;
  let root: HTMLDivElement;
  let first: HTMLButtonElement;
  let second: HTMLButtonElement;
  let events: string[];
  let cancel: MockInstance<(handle: number) => void>;

  beforeEach(() => {
    const Original = PointerEvent;
    vi.stubGlobal(
      'PointerEvent',
      class extends Original {
        readonly pointerType: string;
        constructor(type: string, options: PointerEventInit = {}) {
          super(type, options);
          this.pointerType = options.pointerType ?? '';
        }
      },
    );
    document.body.innerHTML = '';
    root = document.createElement('div');
    bounds(root, 0, 0, 200, 200);
    first = document.createElement('button');
    second = document.createElement('button');
    bounds(first);
    bounds(second, 100, 0);
    root.append(first, second);
    document.body.appendChild(root);
    target = first;
    active = true;
    snapshot = pad();
    events = [];
    cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
      first.addEventListener(type, (event) =>
        events.push(`${event.type}:${(event as PointerEvent).pointerType}`),
      );
    }
    controller = new GamepadPointerController({
      root,
      isActive: () => active,
      getGamepads: () => [snapshot],
      hitTest: () => target,
      initialPosition: { x: 50, y: 50 },
      speed: 100,
      acceleration: 0,
      deadZone: 0.2,
    });
    controller.start();
    controller.update(0);
  });

  afterEach(() => {
    controller.destroy();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function update(next: PadLike | null, delta = 16): void {
    snapshot = next;
    controller.update(delta);
  }

  it('oynanışta sağ stick AIM kalır ve A DOM pointer üretmez', () => {
    active = false;
    update(pad(1, 0, true));
    update(pad(1, 0));
    expect(controller.ownsPointer).toBe(false);
    expect(controller.position).toEqual({ x: 50, y: 50 });
    expect(events).toEqual([]);
  });

  it('UI sağ stick gerçek hit hedefinde hover/focus ve pointermove üretir', () => {
    let moved: PointerEvent | null = null;
    first.addEventListener('pointermove', (event) => {
      moved = event;
    });
    update(pad(1), 100);
    expect(controller.position).toEqual({ x: 60, y: 50 });
    expect(controller.ownsPointer).toBe(true);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(moved).toMatchObject({ clientX: 60, clientY: 50, pointerType: 'gamepad' });
  });

  it('hover hedef değişiminde enter/leave ve class yaşam döngüsü taşınır', () => {
    const transitions: string[] = [];
    first.addEventListener('pointerleave', () => transitions.push('leave-first'));
    second.addEventListener('pointerenter', () => transitions.push('enter-second'));
    update(pad(1));
    target = second;
    update(pad(1));
    expect(transitions).toEqual(['leave-first', 'enter-second']);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(false);
    expect(second.classList.contains('vol-gamepad-hover')).toBe(true);
  });

  it('kısa A jesti bir down/up/click üretir, tutuş tekrar etmez', () => {
    update(pad(1));
    update(pad(0, 0, true));
    update(pad(0, 0, true));
    expect(events).toEqual(['pointerdown:gamepad']);
    update(pad());
    expect(events).toEqual(['pointerdown:gamepad', 'pointerup:gamepad', 'click:gamepad']);
  });

  it('pointer sahibi A focus activation yolunu tüketir ve çift click üretmez', () => {
    const nav = new FocusNavController({ onActivate: () => controller.ownsPointer });
    update(pad(1));
    update(pad(0, 0, true));
    nav.pollPad(pad(0, 0, true));
    expect(events.filter((event) => event.startsWith('click'))).toHaveLength(0);
    update(pad());
    nav.pollPad(pad());
    expect(events.filter((event) => event.startsWith('click'))).toHaveLength(1);
    nav.destroy();
  });

  it('farklı hedefte bırakılan A click yapmaz', () => {
    update(pad(1));
    update(pad(0, 0, true));
    target = second;
    update(pad());
    expect(events.filter((event) => event.startsWith('click'))).toEqual([]);
  });

  it('oynanışta tutulan A kart bağlamına taşınmaz, yeni basış çalışır', () => {
    active = false;
    update(pad(1, 0, true));
    active = true;
    update(pad(1, 0, true));
    update(pad());
    expect(events).toEqual([]);
    update(pad(0, 0, true));
    update(pad());
    expect(events.filter((event) => event.startsWith('click'))).toHaveLength(1);
  });

  it('basılı A sırasında UI kapanırsa cancel gelir ve click gelmez', () => {
    update(pad(1));
    update(pad(0, 0, true));
    active = false;
    update(pad());
    expect(events).toEqual(['pointerdown:gamepad', 'pointercancel:gamepad']);
  });

  it('native touchpad sahipliği alır, tutulan stick nötrleşmeden geri alamaz', () => {
    update(pad(1));
    first.dispatchEvent(nativePointer());
    expect(controller.ownsPointer).toBe(false);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(false);
    update(pad(1));
    expect(controller.ownsPointer).toBe(false);
    expect(controller.position).toEqual({ x: 20, y: 30 });
    update(pad());
    update(pad(1));
    expect(controller.ownsPointer).toBe(true);
  });

  it('native keyboard sanal pointer niyetini bırakır', () => {
    update(pad(1));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    update(pad(1));
    expect(controller.ownsPointer).toBe(false);
  });

  it('D-pad gezinmesine dönünce A cursor yerine odaktaki düğmeye gider', () => {
    update(pad(1));
    expect(controller.ownsPointer).toBe(true);
    const navigation = pad();
    update({ ...navigation, axes: [1, 0, 0, 0] });
    expect(controller.ownsPointer).toBe(false);
    const nav = new FocusNavController({ onActivate: () => controller.ownsPointer });
    second.focus();
    let clicks = 0;
    second.addEventListener('click', () => clicks++);
    nav.activate();
    expect(clicks).toBe(1);
    nav.destroy();
  });

  it('inert, hidden, disabled ve kapanan hedefler sanal click alamaz', () => {
    for (const state of ['inert', 'hidden', 'disabled', 'aria-hidden']) {
      first.removeAttribute('inert');
      first.hidden = false;
      first.disabled = false;
      first.removeAttribute('aria-hidden');
      if (state === 'inert') first.setAttribute('inert', '');
      if (state === 'hidden') first.hidden = true;
      if (state === 'disabled') first.disabled = true;
      if (state === 'aria-hidden') first.setAttribute('aria-hidden', 'true');
      update(pad(1));
      update(pad(0, 0, true));
      update(pad());
    }
    expect(events).toEqual([]);
  });

  it('üst modal dışında hit test dönse bile arka plan aktive olmaz', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    bounds(modal);
    const inside = document.createElement('button');
    bounds(inside);
    modal.appendChild(inside);
    root.appendChild(modal);
    update(pad(1));
    update(pad(0, 0, true));
    update(pad());
    expect(events).toEqual([]);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(false);
  });

  it('demo kökü dışında açılan modal pointer sahipliğini odak gezinmesine bırakır', () => {
    update(pad(1));
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    bounds(modal);
    document.body.appendChild(modal);
    update(pad(1));
    expect(controller.ownsPointer).toBe(false);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(false);
  });

  it('mount öncesi sıfır ölçülü kök ilk hareketi canlı kök merkezinden başlatır', () => {
    controller.destroy();
    const pending = document.createElement('div');
    controller = new GamepadPointerController({
      root: pending,
      getGamepads: () => [snapshot],
      hitTest: () => null,
      acceleration: 0,
      speed: 100,
    });
    document.body.appendChild(pending);
    bounds(pending, 200, 300, 200, 100);
    controller.update(0, pad());
    controller.update(100, pad(1));
    expect(controller.position).toEqual({ x: 310, y: 350 });
  });

  it('kart hide animasyonu sırasında daha önce basılan A seçimi tamamlayamaz', () => {
    const selected: string[] = [];
    const picker = new LevelUpPicker({
      selectLabel: 'Seç',
      modal: true,
      requireFreshActivation: true,
      onSelect: (id) => selected.push(id),
    });
    root.appendChild(picker.element);
    bounds(picker.element);
    picker.present([{ id: 'a', title: 'A', description: 'A', rarity: 'rare' }]);
    target = picker.element.querySelector('button')!;
    bounds(target as HTMLElement);
    update(pad(1));
    update(pad(0, 0, true));
    picker.hide();
    update(pad());
    expect(selected).toEqual([]);
    expect(target.classList.contains('vol-gamepad-hover')).toBe(false);
    picker.destroy();
  });

  it('tutuş sırasında üst modal değişirse aynı hedef nesnesi click alamaz', () => {
    update(pad(1));
    update(pad(0, 0, true));
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    bounds(modal);
    root.appendChild(modal);
    modal.appendChild(first);
    update(pad());
    expect(events.filter((event) => event.startsWith('click'))).toEqual([]);
  });

  it('aynı kart yüzeyi show yenilense bile önceki A pointer jesti seçim yapamaz', () => {
    const selected: string[] = [];
    const picker = new LevelUpPicker({
      selectLabel: 'Seç',
      modal: true,
      requireFreshActivation: true,
      onSelect: (id) => selected.push(id),
    });
    root.appendChild(picker.element);
    bounds(picker.element);
    picker.present([{ id: 'a', title: 'A', description: 'A', rarity: 'rare' }]);
    target = picker.element.querySelector('button')!;
    bounds(target as HTMLElement);
    update(pad(1));
    update(pad(0, 0, true));
    picker.show();
    update(pad());
    expect(selected).toEqual([]);
    update(pad(0, 0, true));
    update(pad());
    expect(selected).toEqual(['a']);
    picker.destroy();
  });

  it('pointerdown tüketilirse click çalışmaz', () => {
    first.addEventListener('pointerdown', (event) => event.preventDefault());
    update(pad(1));
    update(pad(0, 0, true));
    update(pad());
    expect(events.filter((event) => event.startsWith('click'))).toEqual([]);
  });

  it('viewport/root kenarı cursor konumunu sınırlar', () => {
    for (let i = 0; i < 30; i++) update(pad(1, 1), 100);
    expect(controller.position.x).toBe(199);
    expect(controller.position.y).toBe(199);
    for (let i = 0; i < 30; i++) update(pad(-1, -1), 100);
    expect(controller.position).toEqual({ x: 0, y: 0 });
  });

  it('panel kenarında yalnız en yakın kaydırılabilir panel ilerler', () => {
    root.style.overflowY = 'auto';
    Object.defineProperty(root, 'clientHeight', { value: 200 });
    Object.defineProperty(root, 'scrollHeight', { value: 600 });
    root.scrollTop = 0;
    for (let i = 0; i < 20; i++) update(pad(0, 1), 100);
    expect(root.scrollTop).toBeGreaterThan(0);
    expect(root.scrollTop).toBeLessThanOrEqual(400);
  });

  it('kol ayrılırsa basılı pointer iptal edilir', () => {
    update(pad(1));
    update(pad(0, 0, true));
    update(null);
    expect(controller.ownsPointer).toBe(false);
    expect(events).toEqual(['pointerdown:gamepad', 'pointercancel:gamepad']);
  });

  it('destroy hover, tutuş ve rAF kaynaklarını kaldırır', () => {
    update(pad(1));
    update(pad(0, 0, true));
    controller.destroy();
    expect(controller.ownsPointer).toBe(false);
    expect(first.classList.contains('vol-gamepad-hover')).toBe(false);
    expect(events).toEqual(['pointerdown:gamepad', 'pointercancel:gamepad']);
    expect(cancel).toHaveBeenCalled();
    update(pad());
    expect(events.filter((event) => event.startsWith('click'))).toEqual([]);
  });
});
