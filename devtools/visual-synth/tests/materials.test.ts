import { describe, expect, it } from 'vitest';
import {
  VISUAL_MATERIAL_RECIPES,
  createVisualMaterialDocument,
  createVisualMaterialLayer,
  findVisualMaterials,
} from '../src/materials';
import { collectSpriteDocIssues } from '../src/validate';
import { renderSprite } from '../src/render';
import { measureSprite } from '../src/qa';

describe('yeniden kullanılabilir malzeme tarifleri', () => {
  it('her tarif geçerli, serileştirilebilir bir test kartı üretir', () => {
    for (const id of Object.keys(VISUAL_MATERIAL_RECIPES) as Array<
      keyof typeof VISUAL_MATERIAL_RECIPES
    >) {
      const document = createVisualMaterialDocument(id, { size: [40, 32], seed: 9 });
      expect(collectSpriteDocIssues(JSON.parse(JSON.stringify(document)))).toEqual([]);

      const result = renderSprite(document);
      const palette = result.palette.packed;
      const offPalette = result.rgba.reduce((count, value, index) => {
        if (index % 4 !== 0 || result.rgba[index + 3] === 0) return count;
        const pixel = Math.floor(index / 4) * 4;
        const packed =
          (result.rgba[pixel] << 16) | (result.rgba[pixel + 1] << 8) | result.rgba[pixel + 2];
        return count + (palette.has(packed) ? 0 : 1);
      }, 0);

      expect(offPalette).toBe(0);
      expect(
        measureSprite(result).metrics.find((metric) => metric.id === 'finiteValues')?.pass,
      ).toBe(true);
    }
  });

  it('tarif araması niyeti ve etiketi eşleştirir', () => {
    expect(findVisualMaterials({ tags: ['metal'] })).toEqual(['brushedMetal']);
    expect(findVisualMaterials({ text: 'organik meyve' })).toContain('organicFlesh');
    expect(findVisualMaterials({ text: 'led ışık' })).toContain('emissiveGlow');
  });

  it('tarif şekilden bağımsız layer üretir ve yüksekliği kopyalar', () => {
    const layer = createVisualMaterialLayer(
      'kaya',
      { kind: 'sdf.roundBox', half: [0.5, 0.3], r: 0.08 },
      'coarseStone',
    );
    expect(layer.source.kind).toBe('sdf.roundBox');
    expect(layer.height?.kind).toBe('mul');
    expect(layer.material).toBe(0);
  });
});
