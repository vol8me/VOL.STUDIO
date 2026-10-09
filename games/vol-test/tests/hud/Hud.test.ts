import { describe, expect, it, vi } from 'vitest';
import { Vector2, VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { EFFECT_LEVELS, type EffectLevel, type EffectProfile } from '@/config/quality';
import { IntegrityFeed } from '@/app/IntegrityFeed';
import type { GameServices } from '@/app/GameServices';
import { Hud } from '@/hud/Hud';
import { TEST_ACTIONS, type TestAction } from '@/input/bindings';
import { hudFrame } from './support';

function mount(touch = false, fullscreen = true) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onResume = vi.fn();
  const source = new VirtualActionSource<TestAction>();
  const sticks = new VirtualStickSource();
  const quality = new GraphicsQuality<EffectLevel, EffectProfile>({
    levels: EFFECT_LEVELS,
    initial: 'high',
  });
  const hud = new Hud({
    parent,
    metre: 32,
    worldWidth: 4096,
    worldHeight: 4096,
    mapGridStep: 128,
    mapGridMajorEvery: 8,
    actionSource: source,
    stickSource: sticks,
    touch,
    fullscreen,
    onResume,
    quality,
  });
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    parent.querySelector<T>(`[data-testid="${id}"]`)!;
  return { hud, parent, onResume, source, sticks, find, quality };
}

describe('Hud kayıt bütünlüğü bildirimi', () => {
  function mountWithFeed(feed: IntegrityFeed) {
    const parent = document.createElement('div');
    document.body.append(parent);
    const hud = new Hud({
      parent,
      metre: 32,
      worldWidth: 4096,
      worldHeight: 4096,
      mapGridStep: 128,
      mapGridMajorEvery: 8,
      actionSource: new VirtualActionSource<TestAction>(),
      stickSource: new VirtualStickSource(),
      touch: false,
      fullscreen: false,
      onResume: vi.fn(),
      quality: new GraphicsQuality<EffectLevel, EffectProfile>({
        levels: EFFECT_LEVELS,
        initial: 'high',
      }),
      services: { integrity: feed } as unknown as GameServices,
    });
    return { hud, parent };
  }

  it('HUD kurulmadan önce olan kurtarma ve sıfırlama oyuncuya görünür kalıcı bildirim olur', () => {
    const feed = new IntegrityFeed();
    feed.record({ name: 'voltest-device.json', kind: 'recovered' });
    feed.record({ name: 'voltest-synced.json', kind: 'reset' });
    const { parent } = mountWithFeed(feed);
    const alerts = [...parent.querySelectorAll('.vol-toast')].map((el) => el.textContent ?? '');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toContain('yedeğinden geri yüklendi');
    expect(alerts[1]).toContain('yeni kayıt başlatıldı');
    expect(parent.querySelectorAll('.vol-toast__dismiss')).toHaveLength(2);
  });

  it('HUD kurulduktan sonra gelen olay da bildirilir', () => {
    const feed = new IntegrityFeed();
    const { parent } = mountWithFeed(feed);
    expect(parent.querySelectorAll('.vol-toast')).toHaveLength(0);
    feed.record({ name: 'voltest-device.json', kind: 'reset' });
    expect(parent.querySelectorAll('.vol-toast')).toHaveLength(1);
  });
});

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
  it('harita adı ve araç özeti HUD dil geçişinde birlikte yenilenir', async () => {
    await i18next.changeLanguage('tr');
    const { hud, parent } = mount();
    hud.update(
      hudFrame({ vehicles: () => [{ id: 2, x: 300, y: 400, hull: 0, player: false }] }),
      0,
    );
    const canvas = parent.querySelector('.vt-hud__map canvas')!;
    expect(canvas.getAttribute('aria-label')).toBe(i18next.t('voltest:hud.map'));
    await i18next.changeLanguage('en');
    expect(canvas.getAttribute('aria-label')).toBe(i18next.t('voltest:hud.map'));
    expect(canvas.getAttribute('aria-description')).toBe(
      i18next.t('voltest:hud.mapSummary', { vehicles: 1, zoom: 1 }),
    );
    hud.destroy();
    await i18next.changeLanguage('tr');
  });
  it('atış dolum barı kalan beklemeyi gösterir ve dil değişiminde erişilebilir adı yenilenir', async () => {
    const { hud, parent } = mount();
    const bar = parent.querySelector<HTMLElement>('.vt-hud__fire-bar')!;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toBe('Atış dolumu');
    hud.update(hudFrame({ fireProgress: 0.25 }), 0);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(25);
    hud.update(hudFrame({ fireProgress: 1 }), 1000);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(100);
    await i18next.changeLanguage('en');
    expect(bar.getAttribute('aria-label')).toBe('Shot reload');
    await i18next.changeLanguage('tr');
    hud.destroy();
    expect(parent.querySelector('.vt-hud__fire-bar')).toBeNull();
  });

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
    hud.update(hudFrame({ speed: 128, reversing: true, braking: true }), 1400);
    expect(find('telemetry').textContent).toBe('4.0 m/s · 090° · Fren');
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
    const brake = find('touch-brake');
    brake.dispatchEvent(pointer('pointerdown'));
    expect(read(source).brake).toBe(true);
    brake.dispatchEvent(pointer('pointerup'));
    expect(read(source).brake).toBe(false);
    find<HTMLButtonElement>('touch-zoomIn').click();
    expect(read(source).zoomIn).toBe(true);
    expect(read(source).zoomIn).toBe(false);
    find<HTMLButtonElement>('touch-pause').click();
    hud.setTouchMode(false);
    expect(read(source).pause).toBe(false);
    hud.destroy();
  });

  it('sabit joystick sürüklendikçe eksen kaynağına yazar, bırakınca sıfırlar', () => {
    const { hud, find, sticks } = mount(true);
    const base = find('stick-move').querySelector<HTMLElement>('.vol-joystick__base')!;
    const event = (type: string, x: number, y: number) => {
      const pointerEvent = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
      Object.defineProperties(pointerEvent, {
        pointerId: { value: 7 },
        clientX: { value: x },
        clientY: { value: y },
      });
      return pointerEvent;
    };
    base.dispatchEvent(event('pointerdown', 0, 0));
    window.dispatchEvent(event('pointermove', 60, 0));
    expect(sticks.isHeld('move')).toBe(true);
    expect(sticks.write('move', Vector2.zero()).x).toBeGreaterThan(0.5);
    window.dispatchEvent(event('pointerup', 60, 0));
    expect(sticks.isHeld('move')).toBe(false);
    hud.setTouchMode(false);
    expect(sticks.hasInput).toBe(false);
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

  it('duraklatmada efekt kalitesi CORE GraphicsQuality kademesini değiştirir', () => {
    const { hud, find, quality } = mount();
    hud.showPause();
    const picker = find('pause-quality');
    const buttons = [...picker.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Yüksek', 'Düşük']);
    buttons[1].click();
    expect(quality.getLevel()).toBe('low');
    hud.destroy();
  });

  it('dil değişimi metinleri yeniler; native kabukta tam ekran düğmesi yok', async () => {
    const { hud, find, parent } = mount(true, false);
    expect(parent.querySelector('.vt-hud__fullscreen')).toBeNull();
    await i18next.changeLanguage('en');
    hud.update(hudFrame(), 0);
    expect(find('telemetry').textContent).toContain('Forward');
    expect(find('touch-boost').getAttribute('aria-label')).toBe('Boost');
    expect(find('touch-brake').getAttribute('aria-label')).toBe('Brake');
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
