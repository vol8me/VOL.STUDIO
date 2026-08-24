import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DomCursorContext, VolCursorTheme } from '../../../src/input/cursor';

describe('DomCursorContext', () => {
  let root: HTMLElement;
  let context: DomCursorContext;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    context = new DomCursorContext(root, VolCursorTheme, { size: 24 });
  });

  afterEach(() => {
    context.destroy();
    root.remove();
  });

  it('metin alanına girdiğinde text cursor gösterir', () => {
    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);

    input.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(context.renderer['currentAsset']?.id).toBe('text');
  });

  it('buton üzerine gelindiğinde pointer cursor gösterir', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Tıkla';
    root.appendChild(button);

    button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(context.renderer['currentAsset']?.id).toBe('pointer');
  });

  it('data-cursor-danger özniteliğine not-allowed cursor gösterir', () => {
    const span = document.createElement('span');
    span.setAttribute('data-cursor-danger', '');
    root.appendChild(span);

    span.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(context.renderer['currentAsset']?.id).toBe('not-allowed');
  });

  it('data-cursor özniteliği bilinen cursoru doğrudan uygular', () => {
    const div = document.createElement('div');
    div.setAttribute('data-cursor', 'wait');
    root.appendChild(div);

    div.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(context.renderer['currentAsset']?.id).toBe('wait');
  });

  it('bilinmeyen hedefte varsayılan cursora döner', () => {
    const div = document.createElement('div');
    root.appendChild(div);

    div.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(context.renderer['currentAsset']?.id).toBe('default');
  });
});
