import { describe, expect, it } from 'vitest';
import { collectSpriteDocIssues, createVisualPreset, renderSprite } from '@volstudio/core/visual';
import { resolveVisualIntent } from '../../src/intent/resolveVisualIntent';

const CURRENT = createVisualPreset('organicCluster', { size: [64, 48], seed: 71 });

describe('genişletilebilir nesne ve katalog niyeti', () => {
  it('“solucan”ı organik kümeye düşürmeden ayrı, geçerli ve çizilebilir tarif yapar', () => {
    const resolution = resolveVisualIntent({ prompt: 'mor solucan', current: CURRENT });
    expect(resolution.kind).toBe('object');
    if (resolution.kind !== 'object') return;

    expect(resolution.object).toBe('worm');
    expect(resolution.category).toBe('organic');
    expect(resolution.doc.layers.map((layer) => layer.id)).toEqual(['body', 'eye']);
    expect(resolution.doc.palette.generate?.[0]?.base).toBe('#8b67c6');
    expect(collectSpriteDocIssues(resolution.doc)).toEqual([]);
    expect(Array.from(renderSprite(resolution.doc).rgba)).not.toEqual(
      Array.from(renderSprite(CURRENT).rgba),
    );
  });

  it.each(['worm', 'kurtçuk', 'larva'])('%s eş anlamlısını aynı nesneye çözer', (term) => {
    expect(resolveVisualIntent({ prompt: term, current: CURRENT })).toMatchObject({
      kind: 'object',
      object: 'worm',
    });
  });

  it('katalog niyetini boyut ve bitiriş değiştiricileriyle birlikte uygular', () => {
    const resolution = resolveVisualIntent({
      prompt: '512x256 pürüzsüz kristal',
      current: CURRENT,
    });
    expect(resolution).toMatchObject({ kind: 'preset', preset: 'cutMineral' });
    if (resolution.kind !== 'preset') return;
    expect(resolution.doc.size).toEqual([512, 256]);
    expect(resolution.doc.antialias).toBe(true);
  });

  it('açık katalog kartını serbest metin aramasından öncelikli tutar', () => {
    expect(
      resolveVisualIntent({
        prompt: 'mor kristal',
        preset: 'liquidRipples',
        current: CURRENT,
      }),
    ).toMatchObject({ kind: 'preset', preset: 'liquidRipples' });
  });

  it('yalnız evrensel değiştirici varsa açık belgeyi koruyarak uygular', () => {
    const resolution = resolveVisualIntent({ prompt: '256×128 mor', current: CURRENT });
    expect(resolution.kind).toBe('modifiers');
    if (resolution.kind !== 'modifiers') return;
    expect(resolution.doc.layers).toEqual(CURRENT.layers);
    expect(resolution.doc.size).toEqual([256, 128]);
  });

  it('bilinmeyen metinde belge uydurmaz; boş metni ayrı bildirir', () => {
    expect(resolveVisualIntent({ prompt: 'xyzzy', current: CURRENT })).toEqual({
      kind: 'unknown',
    });
    expect(resolveVisualIntent({ prompt: '   ', current: CURRENT })).toEqual({ kind: 'empty' });
  });
});
