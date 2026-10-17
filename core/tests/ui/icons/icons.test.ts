import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ICON_CATEGORIES,
  configureIcons,
  loadIconSprite,
  registerIconSprite,
} from '../../../src/ui/icons';
import {
  LEGACY_ICON_ALIASES,
  SPRITE_PREFIX,
  resolveCatalogIcon,
  spriteOf,
} from '../../../src/ui/icons/sprite';
import { Icon, VOL_ICONS } from '../../../src/ui/primitives/Icon';
import { buildIcons, parsePhosphorIcon, roundPath } from '../../../scripts/icons/curate.mjs';

const assets = resolve(import.meta.dirname, '../../../public/assets/icons');
const read = (name: string): string => readFileSync(join(assets, name), 'utf8');
const manifest = JSON.parse(read('manifest.json')) as {
  sprites: Record<string, { file: string; count: number; bytes: number }>;
  icons: { id: string; sprite: string; category: string; author: string; license: string }[];
};

function symbolIds(svg: string): string[] {
  return [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
}

const okResponse = (text: string) =>
  Promise.resolve({ ok: true, text: () => Promise.resolve(text) });

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ikon varlıkları: manifest, sprite ve kimlik listesi aynı kümeyi anlatır', () => {
  const all: string[] = Object.values(ICON_CATEGORIES).flat();

  it('sprite simgeleri, manifest ve üretilmiş adlar birebir aynıdır', () => {
    const chrome = symbolIds(read('chrome.svg')).map((id) => id.replace(SPRITE_PREFIX, ''));
    const game = symbolIds(read('game.svg')).map((id) => id.replace(SPRITE_PREFIX, ''));
    expect(new Set([...chrome, ...game]).size).toBe(chrome.length + game.length);
    expect([...chrome, ...game].sort()).toEqual([...all].sort());
    expect(manifest.icons.map((icon) => icon.id).sort()).toEqual([...all].sort());
    expect(manifest.sprites.chrome.count).toBe(chrome.length);
    expect(manifest.sprites.game.count).toBe(game.length);
    expect(manifest.sprites.game.bytes).toBe(read('game.svg').length);
  });

  it('her ikon kaynak, yazar ve lisans taşır; atıf dosyası Phosphor lisansını ve özgün ikonları anar', () => {
    const credits = read('CREDITS.md');
    expect(manifest.icons.length).toBe(all.length);
    for (const icon of manifest.icons) {
      expect(icon.author, icon.id).toBeTruthy();
      expect(['MIT', 'proje'], icon.id).toContain(icon.license);
      expect(credits, icon.id).toContain(icon.id);
    }
    expect(manifest.icons.filter((icon) => icon.author === 'VOL.STUDIO').length).toBeLessThan(25);
    expect(credits).toContain('Phosphor Icons');
    expect(credits).toContain('MIT');
  });

  it('oyun ikonları currentColor ile boyanır: sabit renk yok, 256 ızgarası', () => {
    const game = read('game.svg');
    expect(game).not.toMatch(/(fill|stroke)="#/i);
    expect(game).not.toMatch(/(fill|stroke)="(?!currentColor|none)/);
    expect(game).toContain('viewBox="0 0 256 256"');
    expect(game).not.toContain('viewBox="0 0 512 512"');
  });

  it('kabuk ikonları da aynı dolu dilde, 256 ızgarasında ve tek renkli', () => {
    const chrome = read('chrome.svg');
    expect(chrome).toContain('viewBox="0 0 256 256"');
    expect(chrome).not.toContain('stroke-width="56"');
    expect(chrome).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('RTS komutları, yapılar, birimler, kaynaklar ve bullet hell ikonları yeterince geniştir', () => {
    for (const category of ['command', 'building', 'unit', 'resource', 'projectile'] as const) {
      expect(ICON_CATEGORIES[category].length, category).toBeGreaterThanOrEqual(10);
    }
    for (const id of [
      'attack',
      'move',
      'build',
      'repair',
      'bullet',
      'bomb',
      'heart',
      'castle',
      'wood',
      'gold',
    ]) {
      expect(all, id).toContain(id);
    }
  });

  it('eski çizgi adlarının eşlemesi yalnız var olan katalog ikonlarına işaret eder', () => {
    for (const [legacy, target] of Object.entries(LEGACY_ICON_ALIASES)) {
      expect(all, `${legacy} → ${target}`).toContain(target);
      expect(resolveCatalogIcon(legacy)).toBe(target);
    }
    expect(resolveCatalogIcon('merge-down')).toBeNull();
    expect(resolveCatalogIcon('yok')).toBeNull();
  });
});

describe('kürasyon üreticisi', () => {
  it('sayıları 1 ondalığa yuvarlar, tam sayıya dokunmaz, -0 yazmaz', () => {
    expect(roundPath('M12.3456 7.04l-0.04 10.5z')).toBe('M12.3 7l0 10.5z');
    expect(roundPath('M5 5L-0.001 3')).toBe('M5 5L0 3');
    // Sıkıştırılmış yazım: ".5.5" iki sayıdır; arc bayrakları "01.5" biçiminde yapışık olabilir.
    expect(roundPath('M1.25.75l.5.5')).toBe('M1.3 0.8l0.5 0.5');
    expect(roundPath('a10 10 0 01.5-3.25')).toBe('a10 10 0 0 1 0.5 -3.2');
    expect(roundPath('M0 0c1.123 2.456 3 4 5 6 7 8 9 10 11 12')).toBe(
      'M0 0c1.1 2.5 3 4 5 6 7 8 9 10 11 12',
    );
    expect(() => roundPath('M1 1X')).toThrow('tanınmıyor');
  });

  it('Phosphor şekil yollarını alır; ızgara dışı, grup, çizgi ve boş ikonu reddeder', () => {
    const svg = (body: string, box = '0 0 256 256'): string =>
      `<svg viewBox="${box}">${body}</svg>`;
    expect(parsePhosphorIcon(svg('<path d="M1.26,2z"/><path d="M5 5z"/>'))).toEqual([
      'M1.26,2z',
      'M5 5z',
    ]);
    expect(() => parsePhosphorIcon(svg('<path d="M1 1z"/>', '0 0 512 512'), 'x')).toThrow('256');
    expect(() => parsePhosphorIcon(svg('<g><path d="M1 1z"/></g>'), 'x')).toThrow('yalnız path');
    expect(() => parsePhosphorIcon(svg('<path stroke="red" d="M1 1z"/>'), 'x')).toThrow('çizgi');
    expect(() => parsePhosphorIcon(svg(''), 'x')).toThrow('şekil yok');
  });

  it('yinelenen kimlik, camelCase dışı ad ve bilinmeyen kaynak reddedilir; çıktı deterministiktir', () => {
    const source = (): string => '<svg viewBox="0 0 256 256"><path d="M1 1z"/></svg>';
    const entry = (id: string) => ({ id, category: 'item', source: 'phosphor/a' });
    expect(() => buildIcons({ curation: [entry('a'), entry('a')], readSource: source })).toThrow(
      'yinelenen',
    );
    expect(() => buildIcons({ curation: [entry('Kötü-ad')], readSource: source })).toThrow(
      'camelCase',
    );
    expect(() =>
      buildIcons({
        curation: [{ id: 'x', category: 'item', source: 'baska/yer' }],
        readSource: source,
      }),
    ).toThrow('bilinmeyen kaynak');
    expect(() =>
      buildIcons({
        curation: [{ id: 'yokIkon', category: 'item', source: 'authored' }],
        readSource: source,
      }),
    ).toThrow('çizimi yok');
    const one = buildIcons({ curation: [entry('zeta'), entry('alfa')], readSource: source });
    const two = buildIcons({ curation: [entry('alfa'), entry('zeta')], readSource: source });
    expect([...one]).toEqual([...two]);
  });
});

describe('Icon: katalog ikonu sprite simgesine bağlanır', () => {
  beforeEach(() => {
    registerIconSprite('chrome', read('chrome.svg'));
    registerIconSprite('game', read('game.svg'));
  });

  it('katalog adı, simge bağı ve erişilebilirlik: süs gizli, etiketli anlamlı', () => {
    const decorative = new Icon({ name: 'attack' });
    expect(decorative.element.querySelector('use')?.getAttribute('href')).toBe(
      `#${SPRITE_PREFIX}attack`,
    );
    expect(decorative.element.getAttribute('aria-hidden')).toBe('true');
    expect(decorative.element.classList.contains('vol-icon--sprite')).toBe(true);
    expect(decorative.element.getAttribute('width')).toBe('24');
    const labelled = new Icon({ name: 'castle', label: 'Kale', size: 48 });
    expect(labelled.element.getAttribute('role')).toBe('img');
    expect(labelled.element.getAttribute('aria-label')).toBe('Kale');
    expect(labelled.element.getAttribute('width')).toBe('48');
    expect(spriteOf('attack')).toBe('game');
    expect(spriteOf('close')).toBe('chrome');
  });

  it('eski çizgi adı kalın karşılığına yönlenir; eşlemesiz eski ad eski çizgi gövdesini korur', () => {
    const close = new Icon({ name: 'close' });
    expect(close.element.querySelector('use')).not.toBeNull();
    expect(close.element.getAttribute('stroke')).toBeNull();
    const merge = new Icon({ name: 'merge-down' });
    expect(merge.element.querySelector('use')).toBeNull();
    expect(merge.element.getAttribute('stroke')).toBe('currentColor');
    expect(merge.element.querySelectorAll('path').length).toBe(
      VOL_ICONS['merge-down'].paths.length,
    );
  });

  it('setName iki gövde arasında geçerken öznitelik sızdırmaz', () => {
    const icon = new Icon({ name: 'merge-down' });
    icon.setName('attack');
    expect(icon.element.getAttribute('stroke')).toBeNull();
    expect(icon.element.querySelector('path')).toBeNull();
    icon.setName('merge-down');
    expect(icon.element.querySelector('use')).toBeNull();
    expect(icon.element.getAttribute('stroke-width')).toBe('1.75');
    expect(icon.element.classList.contains('vol-icon--sprite')).toBe(false);
  });
});

describe('sprite yükleme', () => {
  it('eşzamanlı çağrılar tek istekte birleşir, bir kez yerleşir; sonrası istek yapmaz', async () => {
    const fetchMock = vi.fn(() => okResponse(read('chrome.svg')));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([loadIconSprite('chrome'), loadIconSprite('chrome')]);
    await loadIconSprite('chrome');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-vol-icon-sprite="chrome"]')).toHaveLength(1);
  });

  it('ağ hatası uyarıyla bildirilir, fırlatmaz ve sonraki çağrıda yeniden denenir', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(read('game.svg')) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadIconSprite('game')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-vol-icon-sprite="game"]')).toBeNull();
    await loadIconSprite('game');
    expect(document.querySelector('[data-vol-icon-sprite="game"]')).not.toBeNull();
  });

  it('ilk Icon kullanımı sprite yüklenmemişse yüklemeyi başlatır ve simge hazır olunca bağı yeniler', async () => {
    const fetchMock = vi.fn(() => okResponse(read('game.svg')));
    vi.stubGlobal('fetch', fetchMock);
    const icon = new Icon({ name: 'bomb' });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-vol-icon-sprite="game"]')).not.toBeNull(),
    );
    expect(icon.element.querySelector('use')?.getAttribute('href')).toBe(`#${SPRITE_PREFIX}bomb`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('geçersiz sprite metni reddedilir', () => {
    expect(() => registerIconSprite('chrome', '<html></html>')).toThrow('geçersiz');
  });

  it('configureIcons kökü değiştirir, sondaki eğik çizgiyi atar ve yalnız sonraki yüklemeleri etkiler', async () => {
    const fetchMock = vi.fn(() => okResponse(read('chrome.svg')));
    vi.stubGlobal('fetch', fetchMock);
    configureIcons({ baseUrl: '/oyun/assets/icons///' });
    await loadIconSprite('chrome');
    expect(fetchMock).toHaveBeenCalledWith('/oyun/assets/icons/chrome.svg');
    configureIcons({});
    configureIcons({ baseUrl: 'assets/icons' });
  });
});
