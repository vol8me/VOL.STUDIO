import { describe, it, expect, vi } from 'vitest';
import { TextArea } from '../../src/ui/primitives/TextArea';
import { TouchButton } from '../../src/ui/controls/TouchButton';
import { Tabs } from '../../src/ui/layout/Tabs';

describe('Bellek sızıntısı regresyonları', () => {
  it('TextArea destroy edildiğinde ResizeObserver disconnect olur', () => {
    const instances: { disconnect: () => void }[] = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;

    globalThis.ResizeObserver = class ResizeObserver {
      constructor(private callback: () => void) {}
      observe() {}
      unobserve() {}
      disconnect() {
        instances.push({ disconnect: this.callback });
      }
    } as unknown as typeof ResizeObserver;

    const area = new TextArea({});
    area.destroy();

    globalThis.ResizeObserver = OriginalResizeObserver;

    expect(instances.length).toBeGreaterThanOrEqual(1);
  });

  it('TouchButton pointer capture serbest bırakılır ve listenerlar temizlenir', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onPress, onRelease });
    document.body.appendChild(button.element);

    const releaseSpy = vi.spyOn(button.element, 'releasePointerCapture');
    const removeListenerSpy = vi.spyOn(button.element, 'removeEventListener');

    const pointerId = 1;
    button.element.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId, bubbles: true, cancelable: true }),
    );
    expect(onPress).toHaveBeenCalled();

    button.element.dispatchEvent(
      new PointerEvent('pointerup', { pointerId, bubbles: true, cancelable: true }),
    );
    expect(onRelease).toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalledWith(pointerId);

    button.destroy();
    expect(removeListenerSpy).toHaveBeenCalledTimes(4);
    expect(button.element.isConnected).toBe(false);
  });

  it('Tabs.destroy tab içeriklerinin destroy metodunu çağırır', () => {
    const destroyA = vi.fn();
    const destroyB = vi.fn();

    const tabs = new Tabs(
      [
        {
          id: 'a',
          label: 'A',
          content: { element: document.createElement('div'), destroy: destroyA },
        },
        {
          id: 'b',
          label: 'B',
          content: { element: document.createElement('div'), destroy: destroyB },
        },
      ],
      {},
    );

    tabs.destroy();

    expect(destroyA).toHaveBeenCalled();
    expect(destroyB).toHaveBeenCalled();
  });
});
