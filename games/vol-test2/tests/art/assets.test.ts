import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_LIST, ASSETS, type AssetId } from '../../src/art/manifest';
import { measureSvg } from '../../src/art/svg';

const DIR = join(import.meta.dirname, '../../src/art/kit');
const read = (file: string): string => readFileSync(join(DIR, file), 'utf8');

/**
 * Dolgun gövde: gradyan dolgulu, kalın dış çizgili biçimler (vol-test tank dili). Listede olmayan her
 * varlık hafiftir (parıltı, gölge, bant, çıkartma, efekt); yeni bir varlık iki sınıftan birine girmek
 * zorundadır, böylece ince çizgi ya da düz dolgu bir yer tutucu olarak sızamaz.
 */
const SOLID: ReadonlySet<AssetId> = new Set<AssetId>([
  'arachnid-abdomen',
  'arachnid-carapace',
  'arachnid-femur',
  'arachnid-tibia',
  'conveyor-base',
  'conveyor-rails',
  'core-base',
  'core-ring',
  'drill-base',
  'drill-rotor',
  'nest-base',
  'ore-a',
  'ore-b',
  'ore-c',
  'smelter-base',
  'smelter-fan',
  'tank-hull',
  'tank-turret',
  'turret-base',
  'turret-head',
  'wall',
]);

const SOLID_FLOOR = { elements: 30, paths: 3, gradients: 5, outlined: 2 } as const;
/** Dış çizgi bir sprite'ın ekranda kalınlığıdır: bunun altı 0,5 px/birimde saç teli olur. */
const MIN_OUTLINE_WIDTH = 1.6;
const MIN_ANY_STROKE = 1.2;

/** Dış çizgi rengi (scripts/art/lib.ts OL) taşıyan öğelerin çizgi kalınlıkları: dolgun gövdenin imzası. */
const outlineWidths = (source: string): number[] =>
  [...source.matchAll(/<[^>]*stroke="#0d1217"[^>]*>/g)].map((tag) => {
    const width = /stroke-width="([\d.]+)"/.exec(tag[0]);
    return width === null ? 1 : Number(width[1]);
  });

describe('lab SVG varlıkları', () => {
  it('manifest ile klasör birebir aynıdır', () => {
    const onDisk = readdirSync(DIR)
      .filter((name) => name.endsWith('.svg'))
      .sort();
    expect(ASSET_LIST.map((asset) => asset.file).sort()).toEqual(onDisk);
    expect(new Set(ASSET_LIST.map((asset) => asset.id)).size).toBe(ASSET_LIST.length);
    for (const asset of ASSET_LIST) expect(ASSETS[asset.id]).toBe(asset);
  });

  it('bütün aileler vardır ve örümcek iki kemikli bacak parçalarından oluşur', () => {
    const families = new Set(ASSET_LIST.map((asset) => asset.id.split('-')[0]));
    for (const family of [
      'arachnid',
      'conveyor',
      'core',
      'decal',
      'drill',
      'fx',
      'nest',
      'ore',
      'smelter',
      'tank',
      'turret',
      'wall',
      'wx',
    ])
      expect(families.has(family), family).toBe(true);
    const spiderParts = ASSET_LIST.filter((asset) => asset.id.startsWith('arachnid-')).map(
      (asset) => asset.id,
    );
    expect(spiderParts.sort()).toEqual([
      'arachnid-abdomen',
      'arachnid-carapace',
      'arachnid-femur',
      'arachnid-reactor',
      'arachnid-shadow',
      'arachnid-tibia',
    ]);
  });

  it('bildirilen boyut dosyadaki viewBox ile aynıdır', () => {
    for (const asset of ASSET_LIST) {
      const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(read(asset.file));
      expect(match, asset.file).not.toBeNull();
      expect([Number(match?.[1]), Number(match?.[2])], asset.file).toEqual([
        asset.width,
        asset.height,
      ]);
    }
  });

  it('her varlık dolgun gövde sınıfındadır ya da hafiftir; listede olmayan kimlik yoktur', () => {
    const ids = new Set<AssetId>(ASSET_LIST.map((asset) => asset.id));
    for (const id of SOLID) expect(ids.has(id), id).toBe(true);
  });

  it.each(
    ASSET_LIST.filter((asset) => SOLID.has(asset.id)).map((asset) => [asset.id, asset] as const),
  )('%s dolgun gövdedir: gradyan, kalın dış çizgi ve ayrıntı tabanının üstünde', (_id, asset) => {
    const source = read(asset.file);
    const measured = measureSvg(source);
    expect(measured.elements).toBeGreaterThanOrEqual(SOLID_FLOOR.elements);
    expect(measured.paths).toBeGreaterThanOrEqual(SOLID_FLOOR.paths);
    expect(measured.gradients).toBeGreaterThanOrEqual(SOLID_FLOOR.gradients);
    const widths = outlineWidths(source);
    expect(widths.length).toBeGreaterThanOrEqual(SOLID_FLOOR.outlined);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(MIN_OUTLINE_WIDTH);
  });

  it('düz dolgulu bir yer tutucu dolgun gövde tabanını geçemez', () => {
    const placeholder = measureSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#888"/></svg>',
    );
    expect(placeholder.gradients).toBeLessThan(SOLID_FLOOR.gradients);
    expect(placeholder.elements).toBeLessThan(SOLID_FLOOR.elements);
    expect(outlineWidths('<rect fill="#888"/>')).toEqual([]);
  });

  it('hiçbir çizgi saç teli değildir', () => {
    for (const asset of ASSET_LIST)
      for (const match of read(asset.file).matchAll(/stroke-width="([\d.]+)"/g))
        expect(Number(match[1]), asset.file).toBeGreaterThanOrEqual(MIN_ANY_STROKE);
  });

  it('SVG kaynağı geçerli XML ve dış kaynak çağırmaz', () => {
    for (const asset of ASSET_LIST) {
      const source = read(asset.file);
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      expect(parsed.querySelector('parsererror'), asset.file).toBeNull();
      expect(source, asset.file).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
      expect(source, asset.file).not.toMatch(/<script|<image|xlink:href="(?!#)/);
    }
  });

  it('bütün gradyan ve kırpma kimlikleri tanımlıdır (kırık url(#...) başvurusu yok)', () => {
    for (const asset of ASSET_LIST) {
      const source = read(asset.file);
      const defined = new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
      for (const match of source.matchAll(/url\(#([^)]+)\)/g))
        expect(defined.has(match[1]), `${asset.file}: ${match[1]}`).toBe(true);
    }
  });

  it('süzgeç ve maske yoktur: set Chromium ve WebKit rasterlemesinde aynı çıkar', () => {
    for (const asset of ASSET_LIST) {
      const measured = measureSvg(read(asset.file));
      expect(measured.filters, asset.file).toBe(0);
      expect(measured.masks, asset.file).toBe(0);
    }
  });

  it('üç cevher çeşidi birbirinden farklı çizilmiştir', () => {
    const sources = ['ore-a', 'ore-b', 'ore-c'].map((id) => read(`${id}.svg`));
    expect(new Set(sources).size).toBe(3);
  });
});
