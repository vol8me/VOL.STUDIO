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
import { authorOf, buildIcons, parseGameIcon, roundPath } from '../../../scripts/icons/curate.mjs';

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

  it('her oyun ikonu yazar ve lisans taşır; atıf dosyası hepsini anar', () => {
    const credits = read('CREDITS.md');
    const games = manifest.icons.filter((icon) => icon.sprite === 'game');
    expect(games.length).toBeGreaterThan(100);
    for (const icon of games) {
      expect(icon.author, icon.id).toBeTruthy();
      expect(['CC BY 3.0', 'CC0 1.0']).toContain(icon.license);
      expect(credits, icon.id).toContain(icon.author);
      expect(credits, icon.id).toContain(icon.id);
    }
    expect(credits).toContain('Icons made by');
  });

  it('oyun ikonları currentColor ile boyanır: sabit renk ve siyah zemin yok', () => {
    const game = read('game.svg');
    expect(game).not.toMatch(/fill="#/i);
    expect(game).not.toContain('M0 0h512v512H0z');
    expect(game).not.toMatch(/stroke=/);
  });

  it('kabuk ikonları aynı 512 ızgarada kalın yuvarlak çizgiyle çizilir', () => {
    const chrome = read('chrome.svg');
    expect(chrome).toContain('stroke-width="56"');
    expect(chrome).toContain('stroke-linecap="round"');
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

  it('siyah zemini atar, beyaz şekilleri alır; dönüşüm, renkli dolgu ve boş ikonu reddeder', () => {
    const svg = (body: string): string => `<svg viewBox="0 0 512 512">${body}</svg>`;
    expect(
      parseGameIcon(svg('<path d="M0 0h512v512H0z"/><path fill="#fff" d="M1.26 2z"/>')),
    ).toEqual(['M1.3 2z']);
    expect(() => parseGameIcon(svg('<g><path d="M1 1z"/></g>'), 'x')).toThrow('grup');
    expect(() => parseGameIcon(svg('<path fill="#f00" d="M1 1z"/>'), 'x')).toThrow('beyaz olmayan');
    expect(() => parseGameIcon(svg('<path d="M0 0h512v512H0z"/>'), 'x')).toThrow('şekil yok');
  });

  it('yinelenen kimlik, camelCase dışı ad ve kabuk çakışması reddedilir; çıktı deterministiktir', () => {
    const source = (): string =>
      '<svg><path d="M0 0h512v512H0z"/><path fill="#fff" d="M1 1z"/></svg>';
    const entry = (id: string) => ({ id, category: 'item', source: 'lorc/a' });
    expect(() => buildIcons({ curation: [entry('a'), entry('a')], readSource: source })).toThrow(
      'yinelenen',
    );
    expect(() => buildIcons({ curation: [entry('Kötü-ad')], readSource: source })).toThrow(
      'camelCase',
    );
    expect(() => buildIcons({ curation: [entry('close')], readSource: source })).toThrow(
      'çakışıyor',
    );
    const one = buildIcons({ curation: [entry('zeta'), entry('alfa')], readSource: source });
    const two = buildIcons({ curation: [entry('alfa'), entry('zeta')], readSource: source });
    expect([...one]).toEqual([...two]);
    expect(authorOf('viscious-speed').license).toBe('CC0 1.0');
    expect(authorOf('lorc').license).toBe('CC BY 3.0');
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
