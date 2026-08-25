import { describe, expect, it } from 'vitest';
import {
  PRESET_CATEGORIES,
  VISUAL_PRESET_CATALOG,
  collectSpriteDocIssues,
  createVisualPreset,
  findVisualPresets,
  measureSprite,
  renderSprite,
  type VisualPresetId,
} from '../../src/visualSynth';

const ids = Object.keys(VISUAL_PRESET_CATALOG) as VisualPresetId[];

describe('görsel preset kataloğu (§10.2)', () => {
  it('her kategori için en az bir başlangıç tarifi taşır', () => {
    const categories = new Set(Object.values(VISUAL_PRESET_CATALOG).map((item) => item.category));
    expect([...categories].sort()).toEqual([...PRESET_CATEGORIES].sort());
  });

  it.each(ids)('%s geçerli ve render edilebilir bir belge üretir', (id) => {
    const doc = createVisualPreset(id);
    expect(collectSpriteDocIssues(doc)).toEqual([]);
    const result = renderSprite(doc);
    expect(measureSprite(result).pass).toBe(true);
  });

  it.each(ids)('%s yeni tohumda gerçekten farklı piksel üretir', (id) => {
    const first = createVisualPreset(id, { seed: 1337 });
    const second = createVisualPreset(id, { seed: 1338 });

    expect(Array.from(renderSprite(second).rgba)).not.toEqual(Array.from(renderSprite(first).rgba));
  });

  it('serbest Türkçe niyeti etiketlerden doğru başlangıca eşler', () => {
    expect(findVisualPresets({ text: 'mor kristal kaya parçası' })[0]).toBe('cutMineral');
    expect(findVisualPresets({ text: 'döşenebilir su yüzeyi' })[0]).toBe('liquidRipples');
    expect(findVisualPresets({ text: 'yumuşak parıltılı ışık efekti' })[0]).toBe('softGlow');
  });

  it('kategori ve etiket süzgeçlerini birlikte uygular', () => {
    expect(findVisualPresets({ category: 'material', tags: ['metal'] })).toEqual([
      'brushedSurface',
    ]);
    expect(findVisualPresets({ category: 'organic', tags: ['metal'] })).toEqual([]);
  });

  it('üretilen belgeler birbirinden bağımsızdır ve ezmeleri taşır', () => {
    const first = createVisualPreset('softGlow', { size: [48, 32], seed: 9 });
    const second = createVisualPreset('softGlow');

    first.layers[0].id = 'changed';
    expect(second.layers[0].id).toBe('halo');
    expect(first.size).toEqual([48, 32]);
    expect(first.seed).toBe(9);
  });
});
