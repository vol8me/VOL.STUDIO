import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_LIST, ASSETS, floorViolations } from '../../src/art/manifest';
import { measureSvg } from '../../src/art/svg';

const DIR = join(import.meta.dirname, '../../src/art/kit');
const read = (file: string): string => readFileSync(join(DIR, file), 'utf8');

describe('lab SVG varlıkları', () => {
  it('manifest ile klasör birebir aynıdır', () => {
    const onDisk = readdirSync(DIR)
      .filter((name) => name.endsWith('.svg'))
      .sort();
    expect(ASSET_LIST.map((asset) => asset.file).sort()).toEqual(onDisk);
    expect(new Set(ASSET_LIST.map((asset) => asset.id)).size).toBe(ASSET_LIST.length);
    for (const asset of ASSET_LIST) expect(ASSETS[asset.id]).toBe(asset);
  });

  it('sekiz ailenin hepsi vardır ve örümcek bacaklı parçalardan oluşur', () => {
    const families = new Set(ASSET_LIST.map((asset) => asset.id.split('-')[0]));
    for (const family of [
      'arachnid',
      'conveyor',
      'drill',
      'smelter',
      'turret',
      'core',
      'ore',
      'wall',
    ])
      expect(families.has(family), family).toBe(true);
    const spiderParts = ASSET_LIST.filter((asset) => asset.id.startsWith('arachnid-')).map(
      (asset) => asset.id,
    );
    expect(spiderParts.sort()).toEqual([
      'arachnid-abdomen',
      'arachnid-carapace',
      'arachnid-claw',
      'arachnid-coxa',
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

  it.each(ASSET_LIST.map((asset) => [asset.id, asset] as const))(
    '%s yer tutucu değil: karmaşıklık tabanının üstünde',
    (_id, asset) => {
      expect(floorViolations(measureSvg(read(asset.file)), asset.floor)).toEqual([]);
      expect(Object.keys(asset.floor).length, 'her varlığın tabanı vardır').toBeGreaterThan(0);
    },
  );

  it('yer tutucu bir şekil hiçbir varlığın tabanını geçemez', () => {
    const placeholder = measureSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#888"/></svg>',
    );
    for (const asset of ASSET_LIST)
      expect(floorViolations(placeholder, asset.floor).length, asset.id).toBeGreaterThan(0);
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
