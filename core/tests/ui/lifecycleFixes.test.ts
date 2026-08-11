import { describe, it, expect, vi, afterEach } from 'vitest';
import { UIRoot } from '../../src/ui/layout/UIRoot';
import { Modal } from '../../src/ui/overlays/Modal';
import { Joystick } from '../../src/ui/controls/Joystick';
import { SquareJoystick } from '../../src/ui/controls/SquareJoystick';
import { Wizard } from '../../src/ui/layout/Wizard';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

function makeStep(id: string) {
  return { id, title: id, content: { element: document.createElement('div') } };
}

describe('O3 — UIRoot paylaşılan elementi referans sayar', () => {
  it('ikinci UIRoot aynı elementi kullanır', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const first = new UIRoot(parent);
    const second = new UIRoot(parent);

    expect(second.element).toBe(first.element);
  });

  it('bir sahibin destroy() çağrısı diğerinin zeminini silmez', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const first = new UIRoot(parent);
    const second = new UIRoot(parent);

    first.destroy();
    expect(second.element.isConnected).toBe(true);

    second.destroy();
    expect(first.element.isConnected).toBe(false);
  });

  it('tek sahip destroy() edince element kaldırılır', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const root = new UIRoot(parent);
    root.destroy();

    expect(root.element.isConnected).toBe(false);
  });
});

describe('Y7 — Modal gövde kilidi açık modal yığınından türetilir', () => {
  const LOCK = 'vol-modal__body-locked';

  it('açık modal destroy edilince kilit kalkar', () => {
    const modal = new Modal();
    document.body.appendChild(modal.element);
    modal.open();

    expect(document.body.classList.contains(LOCK)).toBe(true);

    // close() çağrılmadan doğrudan destroy — eski sayaç tabanlı tasarımda
    // sayaç hiç azalmaz ve sayfa kalıcı kilitli kalırdı.
    modal.destroy();
    expect(document.body.classList.contains(LOCK)).toBe(false);
  });

  it('iç içe modallarda kilit yalnızca sonuncusu kapanınca kalkar', () => {
    const outer = new Modal();
    const inner = new Modal();
    document.body.append(outer.element, inner.element);

    outer.open();
    inner.open();
    expect(document.body.classList.contains(LOCK)).toBe(true);

    inner.close();
    expect(document.body.classList.contains(LOCK)).toBe(true);

    outer.close();
    expect(document.body.classList.contains(LOCK)).toBe(false);
  });
});

describe('Y6 — Joystick global dinleyicileri yalnızca sürükleme boyunca bağlar', () => {
  for (const [name, Ctor] of [
    ['Joystick', Joystick],
    ['SquareJoystick', SquareJoystick],
  ] as const) {
    it(`${name} boştayken window'a bağlı değil`, () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const stick = new Ctor();

      const globalDrag = addSpy.mock.calls.filter(([type]) =>
        ['pointermove', 'pointerup', 'pointercancel'].includes(type),
      );
      expect(globalDrag).toHaveLength(0);

      stick.destroy();
      addSpy.mockRestore();
    });

    it(`${name} pointerdown'da bağlar, pointerup'ta çözer`, () => {
      const stick = new Ctor();
      document.body.appendChild(stick.element);

      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const base = stick.element.firstElementChild as HTMLElement;
      base.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }),
      );
      expect(
        addSpy.mock.calls.filter(([type]) => type === 'pointermove').length,
      ).toBeGreaterThanOrEqual(1);

      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      expect(
        removeSpy.mock.calls.filter(([type]) => type === 'pointermove').length,
      ).toBeGreaterThanOrEqual(1);

      stick.destroy();
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  }
});

describe('O17 — Wizard yeniden giriş koruması ve constructor sessizliği', () => {
  it('constructor onStepChange tetiklemez', () => {
    const onStepChange = vi.fn();
    const wizard = new Wizard({ steps: [makeStep('a'), makeStep('b')], onStepChange });

    // Tüketici henüz Wizard referansına sahip değilken callback çalışmamalı.
    expect(onStepChange).not.toHaveBeenCalled();

    wizard.goToStep(1);
    expect(onStepChange).toHaveBeenCalledTimes(1);

    wizard.destroy();
  });

  it('yavaş validate sırasında çift tıklama iki adım atlatmaz', async () => {
    let resolveValidate: ((value: boolean) => void) | undefined;
    const validate = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        resolveValidate = resolve;
      });

    const steps = [{ ...makeStep('a'), validate }, makeStep('b'), makeStep('c')];
    const wizard = new Wizard({ steps });
    document.body.appendChild(wizard.element);

    const next = wizard.element.querySelector<HTMLButtonElement>('.vol-wizard__nav-button--next');
    expect(next).not.toBeNull();

    next!.click();
    next!.click(); // validate beklerken ikinci tıklama
    expect(next!.disabled).toBe(true);

    resolveValidate?.(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(wizard.getCurrentIndex()).toBe(1);
    wizard.destroy();
  });

  it('destroy bekleyen geçiş zamanlayıcısını iptal eder', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    const wizard = new Wizard({ steps: [makeStep('a'), makeStep('b')] });
    wizard.goToStep(1); // geçiş zamanlayıcısı planlanır
    wizard.destroy();

    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});
