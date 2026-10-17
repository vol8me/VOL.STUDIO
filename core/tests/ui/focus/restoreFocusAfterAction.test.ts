import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreFocusAfterAction } from '../../../src/ui/focus/restoreFocusAfterAction';

const frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function button(disabled = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.disabled = disabled;
  document.body.append(element);
  return element;
}

describe('katman dönüşünde geçici disabled odak hedefi', () => {
  it('etkin hedefe hemen döner; null, kopuk ve inert hedef için kare bile kurulmaz', () => {
    const target = button();
    restoreFocusAfterAction(target);
    expect(document.activeElement).toBe(target);
    restoreFocusAfterAction(null);
    restoreFocusAfterAction(document.createElement('button'));
    target.setAttribute('inert', '');
    restoreFocusAfterAction(target);
    expect(frames).toHaveLength(0);
  });

  it('click Promise mikroişleri disabledı kaldırınca tek karede döner', async () => {
    const target = button(true);
    restoreFocusAfterAction(target);
    expect(frames).toHaveLength(1);
    expect(document.activeElement).not.toBe(target);
    await Promise.resolve().then(() => {
      target.disabled = false;
    });
    frames[0](0);
    expect(document.activeElement).toBe(target);
  });

  it('kullanıcı başka hedefe geçtiyse geç odak geri çalınmaz', () => {
    const target = button(true);
    restoreFocusAfterAction(target);
    const other = button();
    other.focus();
    target.disabled = false;
    frames[0](0);
    expect(document.activeElement).toBe(other);
  });

  it.each(['disabled', 'inert', 'removed'] as const)(
    'kare geldiğinde %s hedef odağı alamaz',
    (state) => {
      const target = button(true);
      restoreFocusAfterAction(target);
      if (state !== 'disabled') target.disabled = false;
      if (state === 'inert') target.setAttribute('inert', '');
      if (state === 'removed') target.remove();
      frames[0](0);
      expect(document.activeElement).not.toBe(target);
    },
  );
});
