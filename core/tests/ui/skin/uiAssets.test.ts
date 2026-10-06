import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOL_COLORS } from '../../../src/ui/colors';
import { VOL_EMBER_OVERRIDES } from '../../../src/ui/themes/ember';
import { VOL_SEMANTIC_COLORS } from '../../../src/ui/themes/semanticColors';
import { UI_ASSET_SEED, buildUiAssets } from '../../../scripts/ui-assets/build.mjs';
import { ICON_NAMES, ICON_SIZES, STROKE_PX } from '../../../scripts/ui-assets/icons.mjs';

const outDir = resolve(import.meta.dirname, '../../../public/assets/ui');
const base: Record<string, string> = { ...VOL_COLORS, ...VOL_SEMANTIC_COLORS };
const tokens = { default: base, ember: { ...base, ...VOL_EMBER_OVERRIDES } };
const built = buildUiAssets({ tokens });
const text = (path: string): string => built.get(path)!;
const svgPaths = [...built.keys()].filter((path) => path.endsWith('.svg'));

function onDisk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) onDisk(path, found);
    else found.push(relative(outDir, path).split('\\').join('/'));
  }
  return found;
}

describe('UI varlıkları: üretim ↔ depo', () => {
  it('depodaki her dosya üreticinin çıktısıyla bayt bayt aynıdır ve fazla dosya yoktur', () => {
    expect(existsSync(outDir), '`pnpm gen:ui-assets` çalıştır').toBe(true);
    expect(onDisk(outDir).sort()).toEqual([...built.keys()].sort());
    for (const [path, content] of built) {
      expect(readFileSync(join(outDir, path), 'utf8'), path).toBe(content);
    }
  });

  it('aynı tohum aynı baytları verir; farklı tohum yalnız tohumlu dokuyu değiştirir', () => {
    const again = buildUiAssets({ tokens, seed: UI_ASSET_SEED });
    expect([...again.entries()]).toEqual([...built.entries()]);
    const other = buildUiAssets({ tokens, seed: UI_ASSET_SEED + 1 });
    const changed = [...built.keys()].filter((path) => built.get(path) !== other.get(path));
    expect(changed.sort()).toEqual(['manifest.json', 'SOURCES.md', 'textures/grain.svg'].sort());
  });

  it('token değişimi çerçeve ve imleç dosyalarına yansır (tema renkleri tokenlıdır)', () => {
    const changed = buildUiAssets({
      tokens: { ...tokens, default: { ...base, frameCorner: '#123456', uiText: '#abcdef' } },
    });
    expect(changed.get('frames/default/panel.svg')).toContain('#123456');
    expect(changed.get('cursors/default/arrow.svg')).toContain('#abcdef');
    expect(text('frames/default/panel.svg')).not.toContain('#123456');
    // Ember dosyaları ember değerlerini taşır, varsayılanınkini değil.
    expect(text('frames/ember/panel.svg')).toContain(VOL_EMBER_OVERRIDES.frameCorner);
    expect(text('frames/ember/panel.svg')).not.toContain(base.frameCorner);
  });

  it('eksik ya da geçersiz token ve eksik default tema açık hata verir', () => {
    expect(() => buildUiAssets({ tokens: { ember: base } })).toThrow('default tema');
    const missing = { ...base };
    delete missing.frameCorner;
    expect(() => buildUiAssets({ tokens: { default: missing } })).toThrow('frameCorner');
    expect(() => buildUiAssets({ tokens: { default: { ...base, panel: 'kırmızı' } } })).toThrow(
      'panel',
    );
  });
});

describe('UI varlıkları: manifest ve doktrin', () => {
  const manifest = JSON.parse(text('manifest.json')) as {
    schema: string;
    seed: number;
    themes: string[];
    icons: { names: string[]; sizes: number[]; strokePx: Record<string, number> };
    frames: { slice: Record<string, number> };
    cursors: { size: number; hotspot: { x: number; y: number } };
    fallbacks: { blur: { token: string }; motion: string };
    files: { path: string; bytes: number; sha256: string }[];
    totalBytes: number;
  };

  it('dosya başına bayt ve sha256 gerçek içerikle eşleşir; liste sıralı ve tam', () => {
    expect(manifest.schema).toBe('UiAssetsV1');
    const paths = manifest.files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(
      [...built.keys()].filter((p) => p !== 'manifest.json' && p !== 'SOURCES.md').sort(),
    );
    for (const file of manifest.files) {
      const content = text(file.path);
      expect(file.bytes, file.path).toBe(Buffer.byteLength(content, 'utf8'));
      expect(file.sha256, file.path).toBe(createHash('sha256').update(content).digest('hex'));
    }
    expect(manifest.totalBytes).toBe(manifest.files.reduce((sum, file) => sum + file.bytes, 0));
  });

  it('şişkin raster/video/betik/dış bağımlılık yok: yalnız küçük vektör SVG', () => {
    for (const path of svgPaths) {
      const content = text(path);
      expect(content, path).not.toMatch(
        /<image|data:|base64|<script|<foreignObject|href="(?:https?:|\/\/)/,
      );
      expect(Buffer.byteLength(content), path).toBeLessThanOrEqual(16 * 1024);
    }
    expect(manifest.totalBytes).toBeLessThanOrEqual(64 * 1024);
    for (const path of built.keys()) {
      expect(/\.(svg|json|md)$/.test(path), `${path}: beklenmeyen biçim`).toBe(true);
    }
  });

  it('kaynak kaydı özgün üretimi, üreticiyi ve tohumu söyler; yedekler görünür', () => {
    const sources = text('SOURCES.md');
    expect(sources).toContain('özgün üretim');
    expect(sources).toContain('core/scripts/ui-assets');
    expect(sources).toContain(String(UI_ASSET_SEED));
    expect(manifest.fallbacks.blur.token).toBe('--vol-ui-scrim');
    expect(manifest.fallbacks.motion).toMatch(/durağan/);
    expect(manifest.themes).toEqual(['default', 'ember']);
  });
});

describe('UI varlıkları: SVG geçerliliği', () => {
  const parse = (content: string): Document =>
    new DOMParser().parseFromString(content, 'image/svg+xml');

  it('her SVG iyi biçimlidir ve açık boyut + görünüm kutusu taşır', () => {
    for (const path of svgPaths) {
      const doc = parse(text(path));
      expect(doc.getElementsByTagName('parsererror'), path).toHaveLength(0);
      const root = doc.documentElement;
      expect(root.tagName, path).toBe('svg');
      expect(root.getAttribute('width'), path).toMatch(/^\d+$/);
      expect(root.getAttribute('height'), path).toMatch(/^\d+$/);
      expect(root.getAttribute('viewBox'), path).toMatch(/^0 0 \d+ \d+$/);
    }
  });

  it('ikon spritelar: dört ölçü, her ad sembolü var, ekran çizgi kalınlığı 1,5/2/2,5/3 px', () => {
    expect(ICON_SIZES).toEqual([16, 24, 32, 48]);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(24);
    for (const size of ICON_SIZES) {
      const doc = parse(text(`icons/icons-${size}.svg`));
      expect(doc.documentElement.getAttribute('width')).toBe(String(size));
      const symbols = [...doc.getElementsByTagName('symbol')];
      expect(symbols.map((symbol) => symbol.id)).toEqual(ICON_NAMES);
      for (const symbol of symbols) {
        expect(symbol.children.length, `${size}/${symbol.id}`).toBeGreaterThan(0);
        expect(symbol.getAttribute('stroke')).toBe('currentColor');
        const units = Number(symbol.getAttribute('stroke-width'));
        expect((units * size) / 24, `${size}/${symbol.id}`).toBeCloseTo(STROKE_PX[size as 16], 2);
      }
    }
  });

  it('çerçeve dilimleri parçanın yarısından küçüktür ve köşe vurguları dilim içinde kalır', () => {
    expect(manifest().frames.slice).toEqual({ panel: 12, plate: 12, well: 12, header: 8 });
    for (const theme of ['default', 'ember']) {
      for (const piece of ['panel', 'plate', 'well', 'header', 'divider']) {
        expect(built.has(`frames/${theme}/${piece}.svg`), `${theme}/${piece}`).toBe(true);
      }
      const doc = parse(text(`frames/${theme}/panel.svg`));
      for (const path of [...doc.getElementsByTagName('path')]) {
        const numbers = (path.getAttribute('d') ?? '').match(/\d+/g)!.map(Number);
        // Köşe L'leri 12×12 köşe dilimine sığar (koordinatlar 0–9 ya da 39–46).
        expect(
          numbers.every((n) => n <= 9 || n >= 39),
          path.getAttribute('d')!,
        ).toBe(true);
      }
    }
    for (const [name, slice] of Object.entries(manifest().frames.slice)) {
      expect(slice * 2, name).toBeLessThan(name === 'header' ? 96 : 48);
    }
  });

  it('imleç etkin noktası görüntü içinde ve ok ucundadır', () => {
    const { size, hotspot } = manifest().cursors;
    expect(hotspot.x).toBeGreaterThanOrEqual(0);
    expect(hotspot.y).toBeGreaterThanOrEqual(0);
    expect(hotspot.x).toBeLessThan(size);
    expect(hotspot.y).toBeLessThan(size);
    for (const theme of ['default', 'ember']) {
      for (const name of ['arrow', 'pointer']) {
        const d = parse(text(`cursors/${theme}/${name}.svg`))
          .getElementsByTagName('path')[0]
          .getAttribute('d')!;
        expect(d.startsWith(`M${hotspot.x} ${hotspot.y}`)).toBe(true);
      }
    }
  });

  it('grain: sabit sayıda lekeyi görüntü içinde, düşük opaklıkta taşır', () => {
    const doc = parse(text('textures/grain.svg'));
    const rects = [...doc.getElementsByTagName('rect')];
    expect(rects).toHaveLength(160);
    for (const rect of rects) {
      expect(Number(rect.getAttribute('x'))).toBeGreaterThanOrEqual(0);
      expect(Number(rect.getAttribute('x'))).toBeLessThan(64);
      expect(Number(rect.getAttribute('y'))).toBeLessThan(64);
      const opacity = Number(rect.getAttribute('fill-opacity'));
      expect(opacity).toBeGreaterThanOrEqual(0.03);
      expect(opacity).toBeLessThanOrEqual(0.08);
    }
  });

  function manifest(): {
    frames: { slice: Record<string, number> };
    cursors: { size: number; hotspot: { x: number; y: number } };
  } {
    return JSON.parse(text('manifest.json')) as ReturnType<typeof manifest>;
  }
});
