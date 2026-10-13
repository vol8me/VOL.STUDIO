import { describe, expect, it } from 'vitest';
import { animationRange } from '../../src/lab/anim';
import { ASSETS, TILE_UNITS } from '../../src/lab/assets/manifest';
import { dynamicLayerCount, PROP_KINDS, PROPS, TURRET_PERIOD_MS } from '../../src/lab/props';

describe('PROPS: yapı tarifleri tutarlıdır', () => {
  it('her tarif kendi türünün adını taşır ve PROP_KINDS hepsini sayar', () => {
    expect(PROP_KINDS.sort()).toEqual(Object.keys(PROPS).sort());
    for (const kind of PROP_KINDS) {
      expect(PROPS[kind].kind).toBe(kind);
      expect(PROPS[kind].tiles[0]).toBeGreaterThanOrEqual(1);
      expect(PROPS[kind].tiles[1]).toBeGreaterThanOrEqual(1);
      expect(PROPS[kind].layers.length).toBeGreaterThan(0);
    }
  });

  it('katman kimlikleri tekildir, ebeveyn kendinden önce tanımlanır, varlıklar vardır', () => {
    for (const kind of PROP_KINDS) {
      const seen = new Set<string>();
      for (const layer of PROPS[kind].layers) {
        expect(seen.has(layer.id), `${kind}.${layer.id} tekrar`).toBe(false);
        expect(ASSETS[layer.asset], `${kind}.${layer.id} varlığı`).toBeDefined();
        if (layer.parent !== undefined)
          expect(seen.has(layer.parent), `${kind}.${layer.id} ebeveyni sonra gelir`).toBe(true);
        seen.add(layer.id);
      }
    }
  });

  it('bağlantı noktaları varlığın içinde, kök konumlar karonun içindedir', () => {
    for (const kind of PROP_KINDS) {
      const [tilesW, tilesH] = PROPS[kind].tiles;
      for (const layer of PROPS[kind].layers) {
        const asset = ASSETS[layer.asset];
        const [px, py] = layer.pivot ?? [0, 0];
        expect(px, `${kind}.${layer.id} pivot x`).toBeGreaterThanOrEqual(0);
        expect(px, `${kind}.${layer.id} pivot x`).toBeLessThanOrEqual(asset.width);
        expect(py, `${kind}.${layer.id} pivot y`).toBeGreaterThanOrEqual(0);
        expect(py, `${kind}.${layer.id} pivot y`).toBeLessThanOrEqual(asset.height);
        if (layer.parent === undefined) {
          expect(layer.at[0]).toBeGreaterThanOrEqual(0);
          expect(layer.at[0]).toBeLessThanOrEqual(tilesW * TILE_UNITS);
          expect(layer.at[1]).toBeGreaterThanOrEqual(0);
          expect(layer.at[1]).toBeLessThanOrEqual(tilesH * TILE_UNITS);
        }
      }
    }
  });

  it('dönen parçalar kendi eksenleri çevresinde döner: pivot varlığın merkezidir', () => {
    for (const kind of PROP_KINDS) {
      for (const layer of PROPS[kind].layers) {
        if (layer.rotate?.kind !== 'spin') continue;
        const asset = ASSETS[layer.asset];
        expect(layer.pivot, `${kind}.${layer.id}`).toEqual([asset.width / 2, asset.height / 2]);
        // Eksen, prop içinde varlığın tam yerleştiği noktadır (kök konum).
        expect(layer.at[0] - (layer.pivot?.[0] ?? 0)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('kayan bant dokusu bir karo genişliğindedir ve kaydırma dönemi doku genişliğine eşittir', () => {
    for (const kind of PROP_KINDS) {
      for (const layer of PROPS[kind].layers) {
        if (layer.scroll === undefined || layer.scroll.kind !== 'scroll') continue;
        expect(layer.scroll.period, `${kind}.${layer.id}`).toBe(ASSETS[layer.asset].width);
        expect(ASSETS[layer.asset].width).toBe(TILE_UNITS);
      }
    }
  });

  it('parlama katmanları toplamalı karışır ve alfa aralığı geçerlidir', () => {
    for (const kind of PROP_KINDS) {
      for (const layer of PROPS[kind].layers) {
        if (layer.alpha !== undefined) {
          const { min, max } = animationRange(layer.alpha);
          expect(min, `${kind}.${layer.id}`).toBeGreaterThanOrEqual(0);
          expect(max, `${kind}.${layer.id}`).toBeLessThanOrEqual(1);
        }
        if (layer.blend === 'add') expect(layer.alpha, `${kind}.${layer.id}`).toBeDefined();
      }
    }
  });

  it('taret ateşi, namlu geri tepmesi ve parlama aynı dönemde atar', () => {
    const head = PROPS.turret.layers.find((layer) => layer.id === 'head');
    const flash = PROPS.turret.layers.find((layer) => layer.id === 'flash');
    expect(flash?.parent).toBe('head');
    expect(head?.slide).toMatchObject({ kind: 'kick', periodMs: TURRET_PERIOD_MS });
    expect(flash?.alpha).toMatchObject({ kind: 'flash', periodMs: TURRET_PERIOD_MS });
  });
});

describe('dynamicLayerCount', () => {
  it('kendi animasyonu olan ve animasyonlu ebeveyne bağlı katmanları sayar', () => {
    const counts = Object.fromEntries(
      PROP_KINDS.map((kind) => [kind, dynamicLayerCount(PROPS[kind])]),
    );
    expect(counts).toEqual({
      conveyor: 1,
      drill: 1,
      smelter: 2,
      turret: 2,
      wall: 0,
      core: 2,
      'ore-a': 0,
      'ore-b': 0,
      'ore-c': 0,
    });
  });

  it('yalnız ebeveyni hareketli katmanı da hareketli sayar', () => {
    const count = dynamicLayerCount({
      kind: 'wall',
      tiles: [1, 1],
      layers: [
        { id: 'a', asset: 'wall', at: [0, 0], rotate: { kind: 'spin', rpm: 1 } },
        { id: 'b', asset: 'wall', at: [0, 0], parent: 'a' },
        { id: 'c', asset: 'wall', at: [0, 0] },
      ],
    });
    expect(count).toBe(2);
  });
});
