import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorControllerOptions } from '@volstudio/core/ui';
import { WorldCursor } from '@/scenes/world/WorldCursor';

const data = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../../core/public/assets/cursors/cursors.json'),
    'utf8',
  ),
) as NonNullable<CursorControllerOptions['data']>;

function pointer(target: Element, x: number, y: number, pointerType = 'mouse'): void {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

async function make(): Promise<{ canvas: HTMLElement; cursor: WorldCursor }> {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const cursor = new WorldCursor({ target: canvas, data });
  // Kayıt `ready` ile gelir; mikro görev sırası bir turda biter.
  await Promise.resolve();
  await Promise.resolve();
  return { canvas, cursor };
}

const ALIVE = { mode: 'pc', paused: false, alive: true } as const;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('any-pointer') }));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('WorldCursor', () => {
  it('fare girdisinde sistem imleci tuvalde gizlenir, nişangâh imleci izler', async () => {
    const { canvas, cursor } = await make();
    cursor.update(ALIVE);
    expect(cursor.visible).toBe(true);
    expect(canvas.style.cursor).toBe('none');
    pointer(canvas, 120, 80);
    const reticle = document.querySelector<HTMLElement>('.vol-reticle');
    expect(reticle).not.toBeNull();
    expect(reticle?.hidden).toBe(false);
    expect(reticle?.style.transform).toContain('120px, 80px');
    cursor.dispose();
    expect(document.querySelector('.vol-reticle')).toBeNull();
    expect(canvas.style.cursor).toBe('');
  });

  it('duraklatma, ölüm, kol ve dokunma kipinde nişangâh söner ve sistem imleci geri gelir', async () => {
    const { canvas, cursor } = await make();
    for (const state of [
      { mode: 'pc', paused: true, alive: true },
      { mode: 'pc', paused: false, alive: false },
      { mode: 'gamepad', paused: false, alive: true },
      { mode: 'touch', paused: false, alive: true },
    ] as const) {
      cursor.update(ALIVE);
      expect(canvas.style.cursor).toBe('none');
      cursor.update(state);
      expect(cursor.visible).toBe(false);
      expect(canvas.style.cursor).toBe('');
    }
    cursor.dispose();
  });

  it('girdi kipi henüz bilinmiyorsa fare varsayılır; atış ve isabet gizliyken sessizdir', async () => {
    const { cursor } = await make();
    cursor.update({ mode: undefined, paused: true, alive: true });
    expect(() => {
      cursor.fired();
      cursor.hit();
    }).not.toThrow();
    cursor.update({ mode: undefined, paused: false, alive: true });
    expect(cursor.visible).toBe(true);
    cursor.dispose();
  });

  it('atışta nişangâh büyür, isabette ton rengine döner', async () => {
    const { canvas, cursor } = await make();
    cursor.update(ALIVE);
    pointer(canvas, 10, 10);
    const reticle = document.querySelector<HTMLElement>('.vol-reticle')!;
    const animate = vi.fn();
    // Büyüme kabuğa değil içindeki SVG'ye uygulanır (kabuğa verilen `scale` konumu da çarpıp kaydırırdı).
    Object.defineProperty(reticle.firstElementChild, 'animate', { value: animate });
    cursor.fired();
    expect(animate).toHaveBeenCalledTimes(1);
    const before = reticle.style.color;
    cursor.hit();
    expect(reticle.style.color).not.toBe(before);
    cursor.dispose();
  });
});
