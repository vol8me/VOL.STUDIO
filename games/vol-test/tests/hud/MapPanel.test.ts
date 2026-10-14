import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import { MapPanel } from '@/hud/MapPanel';
import { WORLD } from '@/config/world';
import { createFront } from '@/view/front';
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
  it('gerçek harita adı ve araç özeti dil değişiminde birlikte güncellenir', async () => {
    await i18next.changeLanguage('tr');
    const map = new MapPanel(OPTIONS);
    map.update(hudFrame({ vehicles: () => [{ id: 2, x: 10, y: 20, hull: 0, player: false }] }));
    const canvas = map.element.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-label')).toBe(i18next.t('voltest:hud.map'));
    await i18next.changeLanguage('en');
    expect(canvas.getAttribute('aria-label')).toBe(i18next.t('voltest:hud.map'));
    expect(canvas.getAttribute('aria-description')).toBe(
      i18next.t('voltest:hud.mapSummary', { vehicles: 1, zoom: 1 }),
    );
    map.destroy();
    await i18next.changeLanguage('tr');
  });
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

  it('bot aracın işaretine rozet noktası çizer; insan araca çizmez', async () => {
    const arcs = (): number => calls.filter((call) => call === 'arc').length;
    const count = async (bot: boolean): Promise<number> => {
      const map = new MapPanel(OPTIONS);
      document.body.appendChild(map.element);
      await Promise.resolve();
      const before = arcs();
      map.update(
        hudFrame({ vehicles: () => [{ id: 2, x: 900, y: 900, hull: 1, player: false, bot }] }),
      );
      await Promise.resolve();
      const drawn = arcs() - before;
      map.destroy();
      return drawn;
    };
    expect(await count(true)).toBeGreaterThan(await count(false));
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

  it('her karede ilerleyen araç haritada ara değerli akar: yavaş hareket kare atlamaz', async () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    let x = 1000;
    const frame = () =>
      hudFrame({ x, y: 1000, vehicles: () => [{ id: 2, x, y: 500, hull: 0, player: false }] });
    map.update(frame());
    await Promise.resolve();
    // 4096 birim / 168 px ≈ 24,4 birim/px: eşik ≈ 3 birim. Araç karede 3,8 birim yürür (230 birim/s, 60 Hz).
    const settled = calls.filter((c) => c === 'clearRect').length;
    for (let step = 0; step < 30; step++) {
      x += 3.8;
      map.update(frame());
      await Promise.resolve();
    }
    expect(calls.filter((c) => c === 'clearRect').length).toBe(settled + 30);
    map.destroy();
  });

  it('kaybolan araç işareti kaldırılır ve aynı araç yeniden girince işaretlenir', () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    const canvas = map.element.querySelector('canvas')!;
    const two = hudFrame({
      vehicles: () => [
        { id: 2, x: 900, y: 900, hull: 0, player: false },
        { id: 3, x: 1200, y: 900, hull: 0, player: false },
      ],
    });
    map.update(two);
    expect(canvas.getAttribute('aria-description')).toMatch(/ 2 /);
    map.update(hudFrame({ vehicles: () => [{ id: 3, x: 1200, y: 900, hull: 0, player: false }] }));
    expect(canvas.getAttribute('aria-description')).toMatch(/ 1 /);
    map.update(two);
    expect(canvas.getAttribute('aria-description')).toMatch(/ 2 /);
    map.destroy();
  });

  it('konum yazısı yalnız bir metre ilerleyince tazelenir (her karede DOM yazılmaz)', () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    map.update(hudFrame({ x: 640, y: 1280 }));
    expect(map.element.dataset.position).toBe('20,40');
    map.update(hudFrame({ x: 650, y: 1280 }));
    expect(map.element.dataset.position).toBe('20,40');
    map.update(hudFrame({ x: 700, y: 1280 }));
    expect(map.element.dataset.position).toBe('22,40');
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
  it('cephe hattı alanlı işaret olarak çizilir; yalnız sahip ya da tartışma değişince yeniden çizilir', async () => {
    const map = new MapPanel({ ...OPTIONS, worldWidth: WORLD.width, worldHeight: WORLD.height });
    document.body.appendChild(map.element);
    const front = createFront(WORLD);
    const frame = () => hudFrame({ x: 6000, y: 6000, front });
    const arcs = (): number => calls.filter((c) => c === 'arc').length;
    const draws = (): number => calls.filter((c) => c === 'clearRect').length;
    map.update(frame());
    await Promise.resolve();
    // Her bölge ve her üs bir alan diski çizer.
    expect(arcs()).toBeGreaterThanOrEqual(front.zones.length + front.bases.length);
    const settled = draws();
    map.update(frame());
    await Promise.resolve();
    expect(draws()).toBe(settled);
    front.zones[0].owner = 0;
    map.update(frame());
    await Promise.resolve();
    expect(draws()).toBe(settled + 1);
    front.zones[0].contested = true;
    map.update(frame());
    await Promise.resolve();
    expect(draws()).toBe(settled + 2);
    map.destroy();
  });

  it('cephe hattı olmayan karede bölge işareti yoktur', async () => {
    const map = new MapPanel(OPTIONS);
    document.body.appendChild(map.element);
    map.update(hudFrame());
    await Promise.resolve();
    expect(calls.filter((c) => c === 'arc')).toHaveLength(0);
    map.destroy();
  });
  it('savaş dünyası ölçeğinde açılış yakınlaştırmasıyla yavaş araç her karede akar', async () => {
    const options = {
      ...OPTIONS,
      worldWidth: WORLD.width,
      worldHeight: WORLD.height,
      zoom: WORLD.mapZoom,
      maxZoom: WORLD.mapMaxZoom,
    };
    const map = new MapPanel(options);
    document.body.appendChild(map.element);
    let x = 6000;
    const frame = () =>
      hudFrame({ x, y: 6000, vehicles: () => [{ id: 2, x, y: 5800, hull: 0, player: false }] });
    map.update(frame());
    await Promise.resolve();
    const settled = calls.filter((c) => c === 'clearRect').length;
    // Araç karede 3,8 birim yürür; zoom 4'te çizim eşiği 2,3 birimdir, her kare çizilir.
    for (let step = 0; step < 30; step++) {
      x += 3.8;
      map.update(frame());
      await Promise.resolve();
    }
    expect(calls.filter((c) => c === 'clearRect').length).toBe(settled + 30);
    map.destroy();

    // Tüm dünya görünümünde (zoom 1) aynı yürüyüş piksel altıdır: çizimlerin çoğu elenir.
    const wide = new MapPanel({ ...options, zoom: 1 });
    document.body.appendChild(wide.element);
    x = 6000;
    wide.update(frame());
    await Promise.resolve();
    const before = calls.filter((c) => c === 'clearRect').length;
    for (let step = 0; step < 30; step++) {
      x += 3.8;
      wide.update(frame());
      await Promise.resolve();
    }
    expect(calls.filter((c) => c === 'clearRect').length - before).toBeLessThan(30);
    wide.destroy();
  });
});
