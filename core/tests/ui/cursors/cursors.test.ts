import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CursorController,
  RETICLES,
  RTS_CURSORS,
  configureCursorAssets,
  UI_CURSORS,
  rtsCursorFor,
  scrollContextAt,
  type RtsContext,
} from '../../../src/ui/cursors';
import {
  provideCursorData,
  resetCursorData,
  loadCursorData,
  type CursorData,
} from '../../../src/ui/cursors/cursorData';
import {
  CURSOR_FALLBACK,
  cursorCssValue,
  cursorSvg,
  cursorVar,
} from '../../../src/ui/cursors/cursorImage';
import { buildCursors, hotspotOf, pathsOf } from '../../../scripts/cursors/curate.mjs';

const assets = resolve(import.meta.dirname, '../../../public/assets/cursors');
const data = JSON.parse(readFileSync(join(assets, 'cursors.json'), 'utf8')) as CursorData & {
  license: string;
};
const uiRoot = resolve(import.meta.dirname, '../../../src/ui');

function moveTo(target: Element, x: number, y: number, pointerType = 'mouse'): void {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

beforeEach(() => {
  provideCursorData(data);
  // Fare var (ince işaretçi), hareket azaltma yok.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('any-pointer') }));
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.body.replaceChildren();
  resetCursorData();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('imleç varlıkları: kayıt, adlar ve etkin noktalar', () => {
  it('kayıttaki kimlikler üretilmiş adlarla birebir aynıdır', () => {
    const all = [...UI_CURSORS, ...RTS_CURSORS];
    expect(Object.keys(data.cursors).sort()).toEqual([...all].sort());
    expect(Object.keys(data.reticles).sort()).toEqual([...RETICLES].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(UI_CURSORS.length).toBeGreaterThanOrEqual(15);
    expect(RTS_CURSORS.length).toBeGreaterThanOrEqual(15);
    expect(RETICLES.length).toBeGreaterThanOrEqual(15);
    expect(data.license).toContain('CC0');
  });

  it('her imleç iki katmanlıdır, etkin noktası ızgara içindedir ve sistem yedeği tanımlıdır', () => {
    for (const [id, entry] of Object.entries(data.cursors)) {
      expect(entry.outline.length, id).toBeGreaterThan(0);
      expect(entry.body.length, id).toBeGreaterThan(0);
      expect(entry.hotspot[0], id).toBeGreaterThanOrEqual(0);
      expect(entry.hotspot[0], id).toBeLessThanOrEqual(data.cursorSize);
      expect(entry.hotspot[1], id).toBeGreaterThanOrEqual(0);
      expect(entry.hotspot[1], id).toBeLessThanOrEqual(data.cursorSize);
      expect(CURSOR_FALLBACK[id as keyof typeof CURSOR_FALLBACK], id).toBeTruthy();
    }
    for (const [id, entry] of Object.entries(data.reticles))
      expect(entry.paths.length, id).toBeGreaterThan(0);
  });

  it('oklar sol-üst uçta, merkezli eylem imleçleri merkezde etkindir', () => {
    expect(data.cursors.default.hotspot[0]).toBeLessThan(12);
    expect(data.cursors.default.hotspot[1]).toBeLessThan(12);
    expect(data.cursors.link.hotspot[1]).toBeLessThan(8);
    for (const id of ['attack', 'build', 'repair', 'mine', 'walk', 'rally', 'resizeH', 'busy']) {
      expect(data.cursors[id as keyof typeof data.cursors].hotspot, id).toEqual([16, 16]);
    }
  });
});

describe('kürasyon üreticisi', () => {
  it('yolları çıkarır; dönüşüm ve yolsuz dosyayı reddeder', () => {
    expect(pathsOf('<svg><g><path fill="#fff" d="M1.26 2L3 4z"/></g></svg>', 'x')).toEqual([
      'M1.3 2L3 4z',
    ]);
    expect(() => pathsOf('<svg><g transform="rotate(5)"><path d="M0 0z"/></g></svg>', 'x')).toThrow(
      'dönüşüm',
    );
    expect(() => pathsOf('<svg></svg>', 'x')).toThrow('yol yok');
  });

  it('etkin nokta türleri: sol-üst uç, üst orta, merkez, açık değer; bilinmeyen tür reddedilir', () => {
    const outline = ['M10 6L20 12L12 20L10 6'];
    expect(hotspotOf('tipTL', outline, 'x')).toEqual([10, 6]);
    expect(hotspotOf('top', ['M8 2L16 2L12 20Z'], 'x')[1]).toBe(2);
    expect(hotspotOf('center', outline, 'x')).toEqual([16, 16]);
    expect(hotspotOf([9, 7], outline, 'x')).toEqual([9, 7]);
    expect(() => hotspotOf('köşe', outline, 'x')).toThrow('bilinmeyen');
  });

  it('yinelenen/camelCase dışı kimlik reddedilir; çıktı girdi sırasından bağımsız ve deterministiktir', () => {
    const readCursor = (): string => '<svg><path d="M5 5L10 10z"/></svg>';
    const readReticle = (): string => '<svg><path d="M1 1L2 2z"/></svg>';
    const cursor = (id: string) => ({ id, set: 'ui', source: 'a', hotspot: 'center' });
    const build = (cursors: ReturnType<typeof cursor>[]) =>
      buildCursors({
        curation: { cursors, reticles: [{ id: 'dot', source: 'c' }] },
        readCursor,
        readReticle,
      });
    expect(() => build([cursor('a'), cursor('a')])).toThrow('yinelenen');
    expect(() => build([cursor('Kötü-ad')])).toThrow('camelCase');
    expect([...build([cursor('b'), cursor('c')])]).toEqual([...build([cursor('b'), cursor('c')])]);
  });
});

describe('imleç görseli', () => {
  it("SVG iki katmanlıdır; CSS değeri veri URL'si, ölçeklenmiş etkin nokta ve sistem yedeği taşır", () => {
    const entry = data.cursors.default;
    const svg = cursorSvg(entry, data.cursorSize, 48, { body: '#ff0000', outline: '#000000' });
    expect(svg).toContain('width="48"');
    expect(svg.indexOf('#000000')).toBeLessThan(svg.indexOf('#ff0000'));
    const css = cursorCssValue('default', entry, data.cursorSize, 48, {
      body: '#ffffff',
      outline: '#000000',
    });
    expect(css).toMatch(/^url\("data:image\/svg\+xml,/);
    const scaled = Math.round((entry.hotspot[0] * 48) / data.cursorSize);
    expect(css).toContain(
      `") ${scaled} ${Math.round((entry.hotspot[1] * 48) / data.cursorSize)}, default`,
    );
  });
});

describe('RTS bağlamı', () => {
  it('dost, düşman, kaynak ve engelli bağlam ayrı şekil ve tonla eşlenir; renk tek kanal değildir', () => {
    expect(rtsCursorFor('hostile')).toEqual({ id: 'attack', tone: 'hostile' });
    expect(rtsCursorFor('friendly')).toEqual({ id: 'select', tone: 'friendly' });
    expect(rtsCursorFor('resource')).toEqual({ id: 'mine', tone: 'caution' });
    expect(rtsCursorFor('blocked').id).toBe('denied');
    const shapes = new Set(
      (['hostile', 'resource', 'tree', 'build', 'repair', 'move'] as RtsContext[]).map(
        (c) => rtsCursorFor(c).id,
      ),
    );
    expect(shapes.size).toBe(6);
    expect(rtsCursorFor('bilinmeyen' as RtsContext)).toEqual({ id: 'select', tone: 'neutral' });
  });

  it('ekran kenarı kaydırma bölgesi köşe ve kenarlara göre sekiz yönü verir', () => {
    const size = { width: 800, height: 600 };
    expect(scrollContextAt({ x: 400, y: 300 }, size)).toBeNull();
    expect(scrollContextAt({ x: 400, y: 2 }, size)).toBe('scrollN');
    expect(scrollContextAt({ x: 798, y: 300 }, size)).toBe('scrollE');
    expect(scrollContextAt({ x: 2, y: 598 }, size)).toBe('scrollSW');
    expect(scrollContextAt({ x: 798, y: 2 }, size)).toBe('scrollNE');
    expect(scrollContextAt({ x: 17, y: 300 }, size)).toBeNull();
  });
});

describe('CursorController', () => {
  async function make(options: ConstructorParameters<typeof CursorController>[0] = {}) {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const controller = new CursorController({ target, ...options });
    await controller.ready;
    return { controller, target };
  }

  it('arayüz imleçleri kökte CSS değişkeni olarak kurulur ve dispose ile kalkar', async () => {
    const { controller } = await make();
    const root = document.documentElement;
    for (const id of UI_CURSORS)
      expect(root.style.getPropertyValue(cursorVar(id)), id).toContain('data:image/svg+xml');
    expect(root.style.getPropertyValue('--vol-cursor-link')).toMatch(/, pointer$/);
    controller.dispose();
    for (const id of UI_CURSORS) expect(root.style.getPropertyValue(cursorVar(id))).toBe('');
    controller.dispose();
  });

  it('rts bağlamı hedef yüzeyin imlecini ve tonunu değiştirir; ui kipinde bağlam yok sayılır', async () => {
    const { controller, target } = await make({ mode: 'rts' });
    controller.setContext('hostile');
    expect(decodeURIComponent(target.style.cursor)).toContain('#ff6b6b');
    expect(target.style.cursor).toMatch(/, crosshair$/);
    controller.setContext('friendly');
    expect(decodeURIComponent(target.style.cursor)).toContain('#7be0a1');
    controller.setMode('ui');
    const before = target.style.cursor;
    controller.setContext('hostile');
    expect(target.style.cursor).toBe(before);
    controller.dispose();
  });

  it('önizleme yardımcıları: CSS değeri, SVG ve nişangâh işareti (kayıt yokken null)', async () => {
    const { controller } = await make({ chrome: false });
    expect(controller.cssValue('link')).toMatch(/, pointer$/);
    expect(controller.previewSvg('attack', 'hostile', 40)).toContain('width="40"');
    expect(controller.previewSvg('attack', 'hostile')).toContain('#ff6b6b');
    expect(controller.reticleMarkup('ring')).toContain('fill="currentColor"');
    controller.dispose();
    resetCursorData();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ağ yok'))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const empty = new CursorController({ chrome: false });
    await empty.ready;
    expect(empty.cssValue('link')).toBeNull();
    expect(empty.previewSvg('link')).toBeNull();
    expect(empty.reticleMarkup('ring')).toBeNull();
    empty.dispose();
  });

  it('palet ve boyut değişimi imleci yeniden üretir (önbellek temizlenir)', async () => {
    const { controller, target } = await make({ mode: 'rts' });
    controller.setCursor('build', 'accent');
    const small = target.style.cursor;
    controller.setSize(64);
    expect(target.style.cursor).not.toBe(small);
    expect(decodeURIComponent(target.style.cursor)).toContain('width="64"');
    controller.setPalette({ accent: '#00ff00' });
    expect(decodeURIComponent(target.style.cursor)).toContain('#00ff00');
    controller.dispose();
  });

  it('nişangâh kipi yerel imleci gizler, işaretçiyi aynı olayda izler ve dokunmada saklanır', async () => {
    const { controller, target } = await make({ mode: 'shooter', reticle: 'ring' });
    expect(target.style.cursor).toBe('none');
    const reticle = document.querySelector<HTMLElement>('.vol-reticle');
    expect(reticle).not.toBeNull();
    expect(reticle?.hidden).toBe(true);
    moveTo(target, 120, 80);
    // Olay işlendiği anda konum yazılmıştır (rAF beklenmez).
    expect(reticle?.style.transform).toContain('translate3d(120px, 80px, 0)');
    expect(reticle?.hidden).toBe(false);
    moveTo(target, 10, 10, 'touch');
    expect(reticle?.hidden).toBe(true);
    target.dispatchEvent(new Event('pointerleave'));
    expect(reticle?.hidden).toBe(true);
    controller.dispose();
    expect(document.querySelector('.vol-reticle')).toBeNull();
  });

  it('nişangâh açılımı sınırlıdır, seçim yenilenir; vuruş işareti renk değiştirip geri döner', async () => {
    vi.useFakeTimers();
    try {
      const { controller } = await make({ mode: 'shooter' });
      const reticle = document.querySelector<HTMLElement>('.vol-reticle')!;
      controller.setReticleScale(10);
      expect(reticle.style.width).toBe('192px');
      controller.setReticleScale(Number.NaN);
      expect(reticle.style.width).toBe('64px');
      controller.setReticle('dot');
      expect(reticle.querySelectorAll('path').length).toBe(data.reticles.dot.paths.length);
      controller.markHit('hostile');
      expect(reticle.style.color).toBe('rgb(255, 107, 107)');
      vi.advanceTimersByTime(130);
      expect(reticle.style.color).toBe('rgb(255, 255, 255)');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setVisible(false) özel imleci ve nişangâhı susturur, gerçek imleç geri gelir', async () => {
    const { controller, target } = await make({ mode: 'shooter' });
    controller.setVisible(false);
    expect(target.style.cursor).toBe('');
    controller.setVisible(true);
    expect(target.style.cursor).toBe('none');
    controller.dispose();
  });

  it('ince işaretçi yoksa (yalnız dokunmatik) etkisizdir ve sistem imleci kalır', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('any-pointer') }));
    const { controller, target } = await make({ mode: 'shooter' });
    expect(controller.active).toBe(false);
    expect(target.style.cursor).toBe('');
    expect(document.querySelector('.vol-reticle')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--vol-cursor-link')).toBe('');
    controller.dispose();
  });

  it('kayıt yüklenemezse uyarır, fırlatmaz ve sistem imleci kalır; önceki imleç dispose ile geri gelir', async () => {
    resetCursorData();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
    );
    const target = document.createElement('div');
    target.style.cursor = 'crosshair';
    document.body.appendChild(target);
    const controller = new CursorController({ target, mode: 'rts' });
    await controller.ready;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(controller.active).toBe(false);
    controller.setContext('hostile');
    expect(target.style.cursor).toBe('crosshair');
    controller.dispose();
    expect(target.style.cursor).toBe('crosshair');
    await expect(loadCursorData()).resolves.toBeNull();
  });
});

describe('CSS değişken adları', () => {
  it('camelCase kimlik kebab-case değişkene çevrilir ve her arayüz imleci için kökte varsayılan tanımlıdır', () => {
    expect(cursorVar('resizeH')).toBe('--vol-cursor-resize-h');
    expect(cursorVar('aimSmall')).toBe('--vol-cursor-aim-small');
    expect(cursorVar('link')).toBe('--vol-cursor-link');
    const css = readFileSync(join(uiRoot, 'cursors/cursors.css'), 'utf8');
    for (const id of UI_CURSORS) {
      expect(css, id).toMatch(new RegExp(`${cursorVar(id)}: [a-z-]+;`));
    }
  });
});

describe('kayıt yükleme', () => {
  it('configureCursorAssets kökü değiştirir, sondaki eğik çizgiyi atar ve kaydı o kökten getirir', async () => {
    resetCursorData();
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) }));
    vi.stubGlobal('fetch', fetchMock);
    configureCursorAssets({ baseUrl: '/oyun/assets/cursors//' });
    await expect(loadCursorData()).resolves.toMatchObject({ cursorSize: 32 });
    expect(fetchMock).toHaveBeenCalledWith('/oyun/assets/cursors/cursors.json');
    // İkinci çağrı önbellekten gelir.
    await loadCursorData();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    configureCursorAssets({});
    configureCursorAssets({ baseUrl: 'assets/cursors' });
  });

  it('geçersiz kayıt reddedilir ve imleç yüklenmemiş sayılır', async () => {
    resetCursorData();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ cursorSize: 'x' }) })),
    );
    await expect(loadCursorData()).resolves.toBeNull();
  });
});

describe('bileşen stilleri imleci değişkenden okur', () => {
  function cssFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  it('hiçbir CSS dosyası çıplak cursor değeri yazmaz: hepsi --vol-cursor-* değişkeni + sistem yedeğidir', () => {
    const bare: string[] = [];
    for (const file of cssFiles(uiRoot)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/cursor:\s*([^;]+);/g)) {
        if (!/^var\(--vol-cursor-[a-z-]+, [a-z-]+\)$/.test(match[1].trim()))
          bare.push(`${file}: ${match[1]}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
