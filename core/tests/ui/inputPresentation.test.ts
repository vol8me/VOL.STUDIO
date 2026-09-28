import { afterEach, describe, expect, it } from 'vitest';
import { InputPresentationController } from '../../src/ui/glyphs/InputPresentationController';
import type { PadLike } from '../../src/input/GamepadState';

const pad = (id: string, pressed = false): PadLike => ({
  id,
  index: 0,
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: [{ pressed, value: pressed ? 1 : 0 }],
});

afterEach(() => document.body.replaceChildren());

describe('InputPresentationController', () => {
  it('aynı glif düğümü canlı kol ailesine ve klavye/dokunmatik kipine geçer', () => {
    let now = 0;
    let pads: PadLike[] = [pad('Steam Deck')];
    const presentation = new InputPresentationController({
      initialMode: 'gamepad',
      getGamepads: () => pads,
      now: () => now,
    });
    const element = presentation.createGlyph({
      padName: 'faceDown',
      keyboardName: 'key',
      key: 'enter',
      label: 'Onay',
    });
    document.body.appendChild(element);
    presentation.start();
    presentation.poll();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/valve/');
    pads = [pad('DualSense')];
    presentation.poll();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/playstation/');
    now = 300;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    presentation.poll();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/keyboard/');
    now = 600;
    const touch = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    document.dispatchEvent(touch);
    presentation.poll();
    expect(element.hidden).toBe(true);
    now = 900;
    pads = [pad('Xbox', true)];
    presentation.poll();
    expect(element.hidden).toBe(false);
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/xbox/');
    presentation.destroy();
  });

  it('kol çıkarılınca eski kontrolcü ailesi ekranda kalmaz', () => {
    let pads: PadLike[] = [pad('DualSense')];
    const presentation = new InputPresentationController({
      initialMode: 'gamepad',
      getGamepads: () => pads,
    });
    const element = presentation.createGlyph({ padName: 'faceDown', label: 'Onay' });
    document.body.appendChild(element);
    presentation.poll();
    pads = [];
    presentation.poll();
    expect(element.hidden).toBe(true);
    presentation.destroy();
  });

  it('Deck oturumunda başlangıç glifi kalır, fakat görülen kol ayrılınca gizlenir', () => {
    let pads: readonly (PadLike | null)[] = [];
    const presentation = new InputPresentationController({
      initialMode: 'gamepad',
      context: () => ({ steamDeckSession: true }),
      getGamepads: () => pads,
    });
    const element = presentation.createGlyph({ padName: 'start', label: 'Duraklat' });
    document.body.appendChild(element);
    presentation.poll();
    expect(element.hidden).toBe(false);
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/valve/');
    pads = [pad('Xbox controller', true)];
    presentation.poll();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/xbox/');
    pads = [null];
    presentation.poll();
    expect(element.hidden).toBe(true);
    pads = [pad('DualSense', true)];
    presentation.poll();
    expect(element.hidden).toBe(false);
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/playstation/');
    presentation.destroy();
  });

  it('sanal kol imleci hareketi klavye/fare kipine geçirmez', () => {
    const presentation = new InputPresentationController({
      initialMode: 'gamepad',
      getGamepads: () => [pad('Steam Deck')],
    });
    presentation.start();
    const move = new Event('pointermove', { bubbles: true });
    Object.defineProperty(move, 'pointerType', { value: 'gamepad' });
    document.dispatchEvent(move);
    presentation.poll();
    expect(presentation.mode).toBe('gamepad');
    presentation.destroy();
  });
});
