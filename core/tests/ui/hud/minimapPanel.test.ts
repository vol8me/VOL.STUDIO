import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinimapPanel, type MinimapPanelOptions } from '../../../src/ui/hud/MinimapPanel';
import { niceScaleMetres, resolveMinimapPalette } from '../../../src/ui/hud/minimapDraw';
import { ThemeController } from '../../../src/ui/themes/ThemeController';

/** Çizim çağrılarını kaydeden sahte 2B bağlam: davranış (ne, kaç kez) sınanır, piksel değil. */
function fakeContext() {
  const calls: string[] = [];
  const ctx: Record<string, unknown> = {};
  for (const name of [
    'clearRect',
    'fillRect',
    'strokeRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'closePath',
    'fill',
    'stroke',
    'arc',
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'setTransform',
    'fillText',
    'drawImage',
  ])
    ctx[name] = (): void => {
      calls.push(name);
    };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let fake: ReturnType<typeof fakeContext>;
const tracked: MinimapPanel[] = [];

function make(options: Partial<MinimapPanelOptions> = {}): MinimapPanel {
  const panel = new MinimapPanel({
    width: 200,
    height: 200,
    worldWidth: 2000,
    worldHeight: 2000,
    ...options,
  });
  document.body.appendChild(panel.element);
  tracked.push(panel);
  return panel;
}

const canvasOf = (panel: MinimapPanel): HTMLCanvasElement => panel.element.querySelector('canvas')!;
const draws = (): number => fake.calls.filter((c) => c === 'clearRect').length;

beforeEach(() => {
  fake = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake.ctx);
});
afterEach(() => {
  while (tracked.length > 0) tracked.pop()?.destroy();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-vol-theme');
  document.documentElement.style.cssText = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MinimapPanel — çizim sözleşmesi', () => {
  it('ilk kareden sonra mevcut scoped köke bağlanınca durağan harita temayı bulur', async () => {
    let frame!: FrameRequestCallback;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const host = document.createElement('section');
    document.body.append(host);
    const theme = new ThemeController({ theme: 'aurum' });
    theme.attach(host);
    const panel = new MinimapPanel({
      width: 200,
      height: 200,
      worldWidth: 2000,
      worldHeight: 2000,
    });
    tracked.push(panel);
    frame(0);
    await Promise.resolve();
    const before = draws();
    host.append(panel.element);
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(before + 1);
    theme.setTheme('default');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(before + 2);
    theme.dispose();
  });

  it('ayrılıp başka karede mevcut scoped köke bağlanan harita gözlemi yeniler', async () => {
    let frame!: FrameRequestCallback;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const host = document.createElement('section');
    document.body.append(host);
    const theme = new ThemeController({ theme: 'aurum' });
    theme.attach(host);
    const panel = make();
    frame(0);
    await Promise.resolve();
    panel.element.remove();
    await Promise.resolve();
    await Promise.resolve();
    const before = draws();
    host.append(panel.element);
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(before + 1);
    panel.element.remove();
    await Promise.resolve();
    await Promise.resolve();
    const detached = draws();
    panel.destroy();
    host.append(panel.element);
    theme.setTheme('default');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(detached);
    theme.dispose();
  });
  it('durağan scoped harita tema sahibini izler; reparent ve söküm bağı temizler', async () => {
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
      const style = document.createElement('div').style;
      style.setProperty(
        '--vol-ui-well',
        element.closest('[data-vol-theme]')?.getAttribute('data-vol-theme') === 'aurum'
          ? '#123456'
          : '#654321',
      );
      return style;
    });
    let frame!: FrameRequestCallback;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const outer = document.createElement('section');
    const inner = document.createElement('section');
    const outerTheme = new ThemeController();
    const innerTheme = new ThemeController();
    outerTheme.attach(outer);
    innerTheme.attach(inner);
    outer.append(inner);
    document.body.append(outer);
    const panel = make();
    inner.append(panel.element);
    frame(0);
    await Promise.resolve();
    const settled = draws();
    expect(fake.ctx.fillStyle).toBe('#654321');
    innerTheme.setTheme('aurum');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 1);
    expect(fake.ctx.fillStyle).toBe('#123456');
    outerTheme.setTheme('aurum');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 1);
    const other = document.createElement('section');
    const otherTheme = new ThemeController();
    otherTheme.attach(other);
    document.body.append(other);
    other.append(panel.element);
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 2);
    expect(fake.ctx.fillStyle).toBe('#654321');
    innerTheme.setTheme('default');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 2);
    otherTheme.setTheme('aurum');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 3);
    panel.destroy();
    otherTheme.setTheme('default');
    await Promise.resolve();
    await Promise.resolve();
    expect(draws()).toBe(settled + 3);
    outerTheme.dispose();
    innerTheme.dispose();
    otherTheme.dispose();
  });
  it('aynı çerçevedeki birçok değişiklik TEK çizim isteği olur (mikro görev)', async () => {
    const panel = make();
    const before = draws();
    panel.setMarker('a', { worldX: 100, worldY: 100, color: '#fff' });
    panel.setMarker('b', { worldX: 900, worldY: 900, color: '#fff' });
    panel.setViewport(0, 0, 500, 500);
    expect(draws()).toBe(before);
    await Promise.resolve();
    expect(draws()).toBe(before + 1);
  });

  it('piksel altı değişim ve aynı işaret hiç çizim istemez', async () => {
    const panel = make();
    panel.setMarker('a', { worldX: 100, worldY: 100, color: '#fff', radius: 4 });
    panel.setViewport(0, 0, 500, 500);
    await Promise.resolve();
    const settled = draws();
    panel.setMarker('a', { worldX: 102, worldY: 99, color: '#fff', radius: 4 });
    panel.setViewport(1, 1, 500, 500);
    await Promise.resolve();
    expect(draws()).toBe(settled);
    panel.setMarker('a', { worldX: 160, worldY: 100, color: '#fff', radius: 4 });
    await Promise.resolve();
    expect(draws()).toBe(settled + 1);
  });

  it('batch çıkışta bir çizim ister; flush bekleyeni hemen çizer', () => {
    const panel = make();
    const before = draws();
    panel.batch(() => {
      panel.setMarker('a', { worldX: 1, worldY: 1, color: '#fff' });
      panel.setMarker('b', { worldX: 500, worldY: 500, color: '#fff' });
    });
    panel.flush();
    expect(draws()).toBe(before + 1);
  });

  it('setMarkers listeyi eşitler: verilmeyen işaret kaldırılır, tek çizim', async () => {
    const panel = make({ describe: (counts) => JSON.stringify(counts) });
    panel.setMarkers([
      ['a', { worldX: 100, worldY: 100, color: '#fff', kind: 'tank' }],
      ['b', { worldX: 300, worldY: 300, color: '#fff', kind: 'tank' }],
    ]);
    await Promise.resolve();
    const before = draws();
    panel.setMarkers([['b', { worldX: 300, worldY: 300, color: '#fff', kind: 'tank' }]]);
    await Promise.resolve();
    expect(draws()).toBe(before + 1);
    expect(canvasOf(panel).getAttribute('aria-description')).toBe('{"tank":1}');
  });

  it('canvas cihaz piksel oranına göre ölçeklenir (üst sınır 2), CSS boyutu sabit kalır', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const panel = make({ width: 160, height: 120 });
    const canvas = canvasOf(panel);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    expect(panel.element.style.getPropertyValue('--vol-minimap-width')).toBe('160px');
    expect(panel.element.style.getPropertyValue('--vol-minimap-height')).toBe('120px');
  });

  it('ızgara, sınır, ölçek çubuğu ve kuzey seçeneklere göre çizilir', () => {
    make({ grid: { step: 200, majorEvery: 5 }, scaleBar: { unitsPerMetre: 10 }, north: true });
    expect(fake.calls).toContain('strokeRect');
    expect(fake.calls).toContain('fillText');
    const none = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => none.ctx);
    make({ showBounds: false });
    expect(none.calls).not.toContain('strokeRect');
    expect(none.calls).not.toContain('fillText');
  });
});

describe('MinimapPanel — tema paleti', () => {
  it('renkleri tema tokenlarından okur; eksik token çekirdek varsayılanına düşer', () => {
    const el = document.createElement('div');
    el.style.setProperty('--vol-ui-well', '#102030');
    document.body.appendChild(el);
    const palette = resolveMinimapPalette(el);
    expect(palette.well).toBe('#102030');
    expect(palette.cursor).toBe('#ffd37a');
  });

  it('kaplama değişince (data-vol-theme) harita yeniden çizilir', async () => {
    make();
    await Promise.resolve();
    const before = draws();
    document.documentElement.setAttribute('data-vol-theme', 'aurum');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(draws()).toBeGreaterThan(before);
  });
});

describe('MinimapPanel — etkileşim', () => {
  const rectOf = (panel: MinimapPanel): void => {
    vi.spyOn(canvasOf(panel), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  };
  const key = (panel: MinimapPanel, k: string, init: KeyboardEventInit = {}): void => {
    canvasOf(panel).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  };

  it('ok tuşları imleci taşır, Enter imlecin dünya konumunu seçer; Home sıfırlar', () => {
    const onClick = vi.fn();
    const panel = make({ onClick });
    key(panel, 'ArrowRight');
    key(panel, 'ArrowDown');
    key(panel, 'Enter');
    expect(onClick).toHaveBeenLastCalledWith(1200, 1200);
    key(panel, 'Home');
    key(panel, 'Enter');
    expect(onClick).toHaveBeenLastCalledWith(1000, 1000);
  });

  it('+/- yakınlaştırır [1, maxZoom] ve sınırda aria-disabled olur', () => {
    const panel = make({ onClick: vi.fn(), controls: true, maxZoom: 2 });
    const [zin, zout] = [
      ...panel.element.querySelectorAll<HTMLButtonElement>('.vol-minimap__zoom'),
    ];
    expect(zout.getAttribute('aria-disabled')).toBe('true');
    key(panel, '+');
    key(panel, '+');
    expect(panel.getZoom()).toBe(2);
    expect(zin.getAttribute('aria-disabled')).toBe('true');
    expect(zin.disabled).toBe(false);
    key(panel, '-');
    key(panel, '-');
    key(panel, '-');
    expect(panel.getZoom()).toBe(1);
  });

  it('zoom düğmeleri adlıdır ve tıklayınca yakınlaştırır', () => {
    const panel = make({ controls: true });
    const [zin] = [...panel.element.querySelectorAll<HTMLButtonElement>('.vol-minimap__zoom')];
    expect(zin.getAttribute('aria-label')).toBeTruthy();
    zin.click();
    expect(panel.getZoom()).toBeGreaterThan(1);
  });

  it('tekerlek imleç altındaki dünya noktasını yerinde tutarak yakınlaştırır', () => {
    const panel = make({ wheelZoom: true });
    rectOf(panel);
    const event = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    });
    canvasOf(panel).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(panel.getZoom()).toBeGreaterThan(1);
    const rect = panel.getVisibleRect();
    expect(rect.x + 0.25 * rect.width).toBeCloseTo(500, 3);
    expect(rect.y + 0.25 * rect.height).toBeCloseTo(500, 3);
  });

  it('sürükleme basışta ve harekette bildirir; iptal bildirimi bırakır', () => {
    const onNavigate = vi.fn();
    const panel = make({ onNavigate });
    rectOf(panel);
    const canvas = canvasOf(panel);
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    const ev = (type: string, x: number): PointerEvent =>
      new PointerEvent(type, {
        pointerId: 1,
        clientX: x,
        clientY: 100,
        isPrimary: true,
        bubbles: true,
      });
    canvas.dispatchEvent(ev('pointerdown', 20));
    canvas.dispatchEvent(ev('pointermove', 100));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 200, 1000);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 1000, 1000);
    canvas.dispatchEvent(ev('pointercancel', 100));
    canvas.dispatchEvent(ev('pointermove', 150));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(canvas.releasePointerCapture).toHaveBeenCalled();
  });

  it('follow yakınlaştırılmış haritada işareti ortada tutar; kaldırılınca takip biter', () => {
    const panel = make();
    panel.setMarker('p', { worldX: 400, worldY: 400, color: '#fff' });
    panel.setZoom(4);
    panel.follow('p');
    let rect = panel.getVisibleRect();
    expect(rect.x + rect.width / 2).toBeCloseTo(400, 3);
    panel.setMarker('p', { worldX: 1500, worldY: 1200, color: '#fff' });
    rect = panel.getVisibleRect();
    expect(rect.x + rect.width / 2).toBeCloseTo(1500, 3);
    panel.removeMarker('p');
    panel.setMarker('p', { worldX: 100, worldY: 100, color: '#fff' });
    rect = panel.getVisibleRect();
    expect(rect.x + rect.width / 2).toBeCloseTo(1500, 3);
  });
});

describe('MinimapPanel — okuyucu', () => {
  it('özet tür sayılarını ve yakınlaştırmayı taşır; yalnız değişince yazılır', () => {
    const panel = make({
      describe: (counts, zoom) =>
        `${counts.player ?? 0} oyuncu, ${counts.tank ?? 0} tank, ${zoom}x`,
    });
    const canvas = canvasOf(panel);
    const set = vi.spyOn(canvas, 'setAttribute');
    panel.setMarker('p', { worldX: 1, worldY: 1, color: '#fff', kind: 'player' });
    panel.setMarker('t', { worldX: 9, worldY: 9, color: '#fff', kind: 'tank' });
    expect(canvas.getAttribute('aria-description')).toBe('1 oyuncu, 1 tank, 1x');
    set.mockClear();
    panel.setMarker('t', { worldX: 400, worldY: 400, color: '#fff', kind: 'tank' });
    expect(set).not.toHaveBeenCalled();
    panel.setZoom(2);
    expect(canvas.getAttribute('aria-description')).toBe('1 oyuncu, 1 tank, 2x');
  });

  it('tıklanabilirse klavye kısayollarını bildirir; değilse görsel (img)', () => {
    expect(canvasOf(make()).getAttribute('role')).toBe('img');
    const interactive = canvasOf(make({ onNavigate: vi.fn() }));
    expect(interactive.getAttribute('role')).toBe('button');
    expect(interactive.getAttribute('aria-keyshortcuts')).toContain('ArrowUp');
  });
});

describe('MinimapPanel — halka dalgası ve temizlik', () => {
  it('ping animasyon karesiyle çizer, süre dolunca durur; destroy kareyi iptal eder', () => {
    vi.useFakeTimers();
    const panel = make();
    panel.ping(500, 500, '#f00');
    const before = draws();
    vi.advanceTimersByTime(300);
    expect(draws()).toBeGreaterThan(before);
    vi.advanceTimersByTime(2000);
    const settled = draws();
    vi.advanceTimersByTime(500);
    expect(draws()).toBe(settled);
    panel.ping(1, 1);
    panel.destroy();
    const afterDestroy = draws();
    vi.advanceTimersByTime(1000);
    expect(draws()).toBe(afterDestroy);
  });

  it('destroy dinleyicileri bırakır', () => {
    const panel = new MinimapPanel({
      width: 100,
      height: 100,
      worldWidth: 1000,
      worldHeight: 1000,
      onNavigate: vi.fn(),
      wheelZoom: true,
    });
    const remove = vi.spyOn(canvasOf(panel), 'removeEventListener');
    panel.destroy();
    const removed = remove.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(
      expect.arrayContaining(['keydown', 'pointerdown', 'wheel', 'pointerup']),
    );
  });
});

describe('ölçek çubuğu uzunluğu', () => {
  it('1-2-5 dizisinden sınırı aşmayan en büyük güzel uzunluğu seçer', () => {
    expect(niceScaleMetres(137)).toBe(100);
    expect(niceScaleMetres(250)).toBe(200);
    expect(niceScaleMetres(7.3)).toBe(5);
    expect(niceScaleMetres(0.4)).toBe(0.2);
    expect(niceScaleMetres(0)).toBe(0);
  });
});
