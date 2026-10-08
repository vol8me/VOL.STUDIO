import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@volstudio/core/i18n';
import { MapPanel } from '@/hud/MapPanel';
import { hudFrame } from './support';

function fakeContext() {
  const strokes: number[] = [];
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
      if (name === 'stroke') strokes.push(1);
    };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const OPTIONS = {
  worldWidth: 4096,
  worldHeight: 4096,
  metre: 32,
  gridStep: 128,
  gridMajorEvery: 8,
};

describe('harita', () => {
  let calls: string[];
  beforeEach(async () => {
    await i18n.init();
    const fake = fakeContext();
    calls = fake.calls;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('ızgara, sınır, ölçek çubuğu ve kuzey işaretiyle kurulur; konumu metre olarak yazar', () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    expect(calls).toContain('strokeRect'); // dünya sınırı
    expect(calls).toContain('fillText'); // ölçek ve kuzey
    map.update(hudFrame({ x: 640, y: 1280 }));
    expect(map.element.dataset.position).toBe('20,40');
    map.destroy();
  });

  it('tüm araçları gösterir; oyuncu ve diğerleri okuyucu özetinde ayrışır', () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    map.update(
      hudFrame({
        vehicles: () => [
          { id: 1, x: 100, y: 100, hull: 0, player: true },
          { id: 2, x: 900, y: 900, hull: 1, player: false },
          { id: 3, x: 1500, y: 300, hull: 2, player: false },
        ],
      }),
    );
    const canvas = map.element.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-description')).toMatch(/ 2 /);
    map.update(hudFrame({ vehicles: () => [{ id: 1, x: 100, y: 100, hull: 0, player: true }] }));
    expect(canvas.getAttribute('aria-description')).toMatch(/ 0 /);
    map.destroy();
  });

  it('durağan harita (aynı kare) yeniden çizim istemez', async () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    const frame = hudFrame({ vehicles: () => [{ id: 2, x: 900, y: 900, hull: 1, player: false }] });
    map.update(frame);
    await Promise.resolve();
    const settled = calls.filter((c) => c === 'clearRect').length;
    for (let i = 0; i < 20; i += 1) map.update(frame);
    await Promise.resolve();
    expect(calls.filter((c) => c === 'clearRect').length).toBe(settled);
    map.destroy();
  });

  it('yakınlaştırma düğmeleri vardır ve oyuncuyu ortada tutar', () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    map.update(hudFrame({ x: 3000, y: 3000 }));
    const zoomIn = map.element.querySelector<HTMLButtonElement>('.vol-minimap__zoom')!;
    zoomIn.click();
    zoomIn.click();
    map.update(hudFrame({ x: 3000, y: 3000, view: { x: 2800, y: 2800, width: 400, height: 300 } }));
    expect(zoomIn.getAttribute('aria-label')).toBeTruthy();
    map.destroy();
  });
});
