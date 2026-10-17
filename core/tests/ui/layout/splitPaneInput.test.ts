import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitPane, type SplitPaneOptions } from '../../../src/ui/layout/SplitPane';

/**
 * SplitPane işaretçi sahipliği ve iptal (UI-10.2). Sürüklemenin tek sahibi ilk birincil işaretçidir; bırakmak işler
 * (`onCommit`), `pointercancel` ve Escape iptal eder (boyut başlangıca döner, `onCommit` çağrılmaz). Gerçek tarayıcıda
 * ve cihazda aynı davranış `devtools/vol-showcase/tests/e2e/scrollSplit.spec.ts` ve `tests/device/scrollSplit.spec.ts`
 * ile sınanır.
 */
const tracked: SplitPane[] = [];

function make(options: Partial<SplitPaneOptions> = {}): SplitPane {
  const pane = new SplitPane({
    primary: document.createElement('aside'),
    secondary: document.createElement('main'),
    initialSize: 200,
    minPrimary: 100,
    minSecondary: 120,
    ...options,
  });
  document.body.append(pane.element);
  Object.defineProperty(pane.element, 'clientWidth', { configurable: true, value: 800 });
  pane.setSize(200);
  tracked.push(pane);
  return pane;
}

function pointer(
  type: string,
  init: { pointerId: number; clientX?: number; isPrimary?: boolean; button?: number },
): PointerEvent {
  return new PointerEvent(type, { isPrimary: true, bubbles: true, cancelable: true, ...init });
}

function escape(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
}

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  document.body.replaceChildren();
});

describe('SplitPane sürükleme sahipliği', () => {
  it('ikinci işaretçi (ikinci parmak) sürüklemeyi devralmaz ve bırakması işlenmez', () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    const pane = make({ onResize, onCommit });
    const { separator } = pane;

    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 260 }));
    expect(pane.getSize()).toBe(260);

    // İkinci parmak ayırıcıya basar, sürükler, kaldırılır: hiçbiri sürüklemeyi etkilemez.
    separator.dispatchEvent(
      pointer('pointerdown', { pointerId: 2, clientX: 500, isPrimary: false }),
    );
    separator.dispatchEvent(
      pointer('pointermove', { pointerId: 2, clientX: 700, isPrimary: false }),
    );
    separator.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 700, isPrimary: false }));
    expect(pane.getSize()).toBe(260);
    expect(onCommit).not.toHaveBeenCalled();

    // Sahip hareket etmeye devam eder ve bırakınca TEK kez işler.
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 300 }));
    separator.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 300 }));
    expect(pane.getSize()).toBe(300);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(300);
    expect(onResize).toHaveBeenLastCalledWith(300);
  });

  it('sürükleme sürerken gelen ikinci BİRİNCİL işaretçi de sahipliği almaz', () => {
    const pane = make();
    const { separator } = pane;
    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    // Aynı anda ikinci bir "birincil" (ör. fare + kalem): sürükleme zaten sahipli.
    separator.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 400 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 600 }));
    expect(pane.getSize()).toBe(200);
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 250 }));
    expect(pane.getSize()).toBe(250);
  });

  it('birincil olmayan işaretçi ve ikincil fare düğmesi sürükleme başlatmaz', () => {
    const onResize = vi.fn();
    const pane = make({ onResize });
    const { separator } = pane;
    separator.dispatchEvent(
      pointer('pointerdown', { pointerId: 3, clientX: 200, isPrimary: false }),
    );
    separator.dispatchEvent(
      pointer('pointermove', { pointerId: 3, clientX: 300, isPrimary: false }),
    );
    expect(onResize).not.toHaveBeenCalled();
    expect(pane.element.classList.contains('vol-split-pane--resizing')).toBe(false);
  });

  it('sürükleme başlayınca ayırıcı odağı alır (Escape ona gelsin)', () => {
    const pane = make();
    pane.separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    expect(document.activeElement).toBe(pane.separator);
  });
});

describe('SplitPane iptal', () => {
  it('pointercancel boyutu başlangıca döndürür, önizlemeyi bildirir ve onCommit çağırmaz', () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    const pane = make({ onResize, onCommit });
    expect(pane).toBeInstanceOf(SplitPane);
    const { separator } = pane;

    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 330 }));
    expect(pane.getSize()).toBe(330);

    separator.dispatchEvent(pointer('pointercancel', { pointerId: 1, clientX: 330 }));
    expect(pane.getSize()).toBe(200);
    expect(onResize).toHaveBeenLastCalledWith(200);
    expect(onCommit).not.toHaveBeenCalled();
    expect(pane.element.classList.contains('vol-split-pane--resizing')).toBe(false);
    expect(pane.element.style.getPropertyValue('--vol-split-primary-size')).toBe('200px');
    expect(separator.getAttribute('aria-valuenow')).toBe('200');
  });

  it('iptalden sonra yeni sürükleme başlar; iptal edilen işaretçinin geç olayları yok sayılır', () => {
    const onCommit = vi.fn();
    const pane = make({ onCommit });
    const { separator } = pane;
    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 280 }));
    separator.dispatchEvent(pointer('pointercancel', { pointerId: 1 }));

    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 400 }));
    separator.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 400 }));
    expect(pane.getSize()).toBe(200);
    expect(onCommit).not.toHaveBeenCalled();

    separator.dispatchEvent(pointer('pointerdown', { pointerId: 4, clientX: 200 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 4, clientX: 240 }));
    separator.dispatchEvent(pointer('pointerup', { pointerId: 4, clientX: 240 }));
    expect(pane.getSize()).toBe(240);
    expect(onCommit).toHaveBeenCalledWith(240);
  });

  it('hiç hareket olmadıysa iptal önizleme bildirmez', () => {
    const onResize = vi.fn();
    const pane = make({ onResize });
    pane.separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    pane.separator.dispatchEvent(pointer('pointercancel', { pointerId: 1 }));
    expect(onResize).not.toHaveBeenCalled();
    expect(pane.getSize()).toBe(200);
  });

  it('Escape sürüklemeyi iptal eder; sürükleme yokken Escape dokunulmaz', () => {
    const onCommit = vi.fn();
    const pane = make({ onCommit });
    const { separator } = pane;

    const idle = escape();
    separator.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);

    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 200 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 350 }));
    const active = escape();
    separator.dispatchEvent(active);
    expect(active.defaultPrevented).toBe(true);
    expect(pane.getSize()).toBe(200);
    expect(onCommit).not.toHaveBeenCalled();

    // Sürükleme bitti: aynı işaretçinin bırakması artık hiçbir şey işlemez.
    separator.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 350 }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('iptal kullanıcının tercihini geri yükler: daraltılmış pencerede başlayan sürükleme tercihi bozmaz', () => {
    const pane = make();
    Object.defineProperty(pane.element, 'clientWidth', { configurable: true, value: 800 });
    pane.setSize(500);
    const { separator } = pane;
    separator.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 500 }));
    separator.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 300 }));
    separator.dispatchEvent(pointer('pointercancel', { pointerId: 1 }));
    expect(pane.getSize()).toBe(500);
    // Klavye adımı iptal edilen boyuttan sürer.
    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(pane.getSize()).toBe(492);
  });
});

describe('SplitPane yerleşim sözleşmesi', () => {
  it('tutamağın kalınlığı kapın içindedir: ikinci bölme en küçük boyutunun altına inmez', () => {
    const pane = make({ minPrimary: 100, minSecondary: 120 });
    Object.defineProperty(pane.element, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(pane.separator, 'offsetWidth', { configurable: true, value: 44 });
    pane.setSize(9999);
    // 600 - 120 (ikinci bölme) - 44 (tutamak)
    expect(pane.getSize()).toBe(436);
    expect(pane.separator.getAttribute('aria-valuemax')).toBe('436');
  });

  it('dikey yönde tutamak yüksekliği hesaba katılır', () => {
    const pane = make({ direction: 'vertical', minPrimary: 40, minSecondary: 60 });
    Object.defineProperty(pane.element, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(pane.separator, 'offsetHeight', { configurable: true, value: 24 });
    pane.setSize(9999);
    expect(pane.getSize()).toBe(216);
  });

  it('bildirilen en küçük ikinci bölme boyutu yerleşime de yazılır (kap dar kalırsa dış panel kayar)', () => {
    const horizontal = make({ minSecondary: 280 });
    expect(horizontal.element.style.getPropertyValue('--vol-split-secondary-min')).toBe('280px');
    const vertical = make({ direction: 'vertical', minSecondary: 90 });
    expect(vertical.element.style.getPropertyValue('--vol-split-secondary-min')).toBe('90px');
  });
});
