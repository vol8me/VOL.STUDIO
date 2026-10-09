import { afterEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from '../../../src/ui/touch/PullToRefresh';

const panels: PullToRefresh[] = [];
afterEach(() => {
  panels.splice(0).forEach((panel) => panel.destroy());
  vi.useRealTimers();
});

describe('PullToRefresh iptal sözleşmesi', () => {
  it('hazır çekmenin pointercancel olayı yenileme veya tıklama yutma zamanlayıcısı başlatmaz', () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    const content = document.createElement('div');
    const button = document.createElement('button');
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    content.appendChild(button);
    const panel = new PullToRefresh({ content, threshold: 60, onRefresh });
    panels.push(panel);
    document.body.appendChild(panel.element);
    const area = panel.element.querySelector<HTMLElement>('.vol-pull-refresh__scroll-area')!;
    const send = (type: string, clientY = 150) =>
      area.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientY, bubbles: true }));
    send('pointerdown', 0);
    send('pointermove');
    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(true);
    send('pointercancel');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(false);
    expect(panel.element.classList.contains('vol-pull-refresh--refreshing')).toBe(false);
    expect(area.hasPointerCapture(1)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    button.click();
    expect(clicked).toHaveBeenCalledOnce();
  });
});
