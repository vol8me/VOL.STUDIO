import { describe, expect, it, vi } from 'vitest';
import { VirtualActionSource } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { Hud } from '@/hud/Hud';
import { TEST_ACTIONS, type TestAction } from '@/input/bindings';
import { hudFrame } from './support';

function mount(touch = false, fullscreen = true) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onResume = vi.fn();
  const source = new VirtualActionSource<TestAction>();
  const hud = new Hud({
    parent,
    metre: 32,
    worldWidth: 4096,
    worldHeight: 4096,
    actionSource: source,
    touch,
    fullscreen,
    onResume,
  });
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    parent.querySelector<T>(`[data-testid="${id}"]`)!;
  return { hud, parent, onResume, source, find };
}

function read(source: VirtualActionSource<TestAction>): Record<TestAction, boolean> {
  const actions = Object.fromEntries(TEST_ACTIONS.map((action) => [action, false])) as Record<
    TestAction,
    boolean
  >;
  source.applyTo(actions);
  return actions;
}

function pointer(type: string): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' } });
  return event;
}

describe('Hud', () => {
  it('görünen her parça CORE bileşenidir', () => {
    const { hud, parent } = mount();
    const layer = parent.querySelector('.vt-hud')!;
    const containers = new Set(['vt-hud__hints', 'vt-hud__touch']);
    for (const child of layer.children) {
      const isContainer = [...child.classList].some((name) => containers.has(name));
      const isCore = [...child.classList].some((name) => name.startsWith('vol-'));
      expect(isContainer || isCore, child.className).toBe(true);
    }
    for (const row of parent.querySelectorAll('.vt-hud__hint')) {
      for (const cell of row.children) expect(cell.className).toMatch(/^vol-/);
    }
    for (const control of parent.querySelectorAll('.vt-hud__touch > *')) {
      expect(control.className).toMatch(/vol-/);
    }
    hud.destroy();
  });

  it('telemetri hız, rota ve vitesi yazar; güncelleme seyreltilir', () => {
    const { hud, find } = mount();
    hud.update(hudFrame({ speed: 64, hull: 0 }), 1000);
    expect(find('telemetry').textContent).toBe('2.0 m/s · 090° · İleri');
    hud.update(hudFrame({ speed: 128, reversing: true }), 1010);
    expect(find('telemetry').textContent).toBe('2.0 m/s · 090° · İleri');
    hud.update(hudFrame({ speed: 128, reversing: true }), 1200);
    expect(find('telemetry').textContent).toBe('4.0 m/s · 090° · Geri');
    hud.destroy();
  });

  it('hızlanma durumu HUD katmanına yansır', () => {
    const { hud, parent } = mount();
    hud.update(hudFrame({ boost: 25, boosting: true }), 0);
    expect(parent.querySelector('.vt-hud')!.classList.contains('vt-hud--boosting')).toBe(true);
    hud.update(hudFrame(), 1000);
    expect(parent.querySelector('.vt-hud')!.classList.contains('vt-hud--boosting')).toBe(false);
    hud.destroy();
  });

  it('dokunuş dokunmatik kipe, tuş masaüstü kipine geçirir', async () => {
    const { hud, find } = mount();
    const touch = new Event('pointerdown') as PointerEvent;
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    document.dispatchEvent(touch);
    await vi.waitFor(() => {
      hud.update(hudFrame(), 0);
      expect(find('hud').dataset.mode).toBe('touch');
    });
    expect(find('control-hints').hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    await vi.waitFor(() => {
      hud.update(hudFrame(), 0);
      expect(find('hud').dataset.mode).toBe('desktop');
    });
    expect(find('touch-controls').hidden).toBe(true);
    hud.destroy();
  });

  it('dokunmatik düğmeler sanal kaynağa yazar; kısa dokunuş kaybolmaz', () => {
    const { hud, find, source } = mount(true);
    const boost = find('touch-boost');
    boost.dispatchEvent(pointer('pointerdown'));
    expect(read(source).boost).toBe(true);
    boost.dispatchEvent(pointer('pointerup'));
    expect(read(source).boost).toBe(false);
    find<HTMLButtonElement>('touch-zoomIn').click();
    expect(read(source).zoomIn).toBe(true);
    expect(read(source).zoomIn).toBe(false);
    find<HTMLButtonElement>('touch-pause').click();
    hud.setTouchMode(false);
    expect(read(source).pause).toBe(false);
    hud.destroy();
  });

  it('duraklatma: düğmeyle kapanış devam eder, oyun kapatınca etmez', () => {
    const { hud, onResume, find } = mount();
    hud.showPause();
    expect(hud.paused).toBe(true);
    find<HTMLButtonElement>('pause-resume').click();
    expect(hud.paused).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    hud.showPause();
    hud.hidePause();
    expect(onResume).toHaveBeenCalledTimes(1);
    hud.destroy();
  });

  it('dil değişimi metinleri yeniler; native kabukta tam ekran düğmesi yok', async () => {
    const { hud, find, parent } = mount(true, false);
    expect(parent.querySelector('.vt-hud__fullscreen')).toBeNull();
    await i18next.changeLanguage('en');
    hud.update(hudFrame(), 0);
    expect(find('telemetry').textContent).toContain('Forward');
    expect(find('touch-boost').getAttribute('aria-label')).toBe('Boost');
    await i18next.changeLanguage('tr');
    hud.destroy();
    expect(parent.querySelector('[data-testid="hud"]')).toBeNull();
  });

  it('tam ekran düğmesi CORE denetleyicisini tetikler', () => {
    const { hud, parent } = mount();
    const button = parent.querySelector<HTMLButtonElement>('.vt-hud__fullscreen')!;
    expect(button.getAttribute('aria-label')).toBe('Tam ekran');
    button.click();
    hud.destroy();
  });
});
