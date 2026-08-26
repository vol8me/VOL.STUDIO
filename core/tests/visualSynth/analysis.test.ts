import { describe, expect, it } from 'vitest';
import { analyzeSpriteDoc } from '../../src/visualSynth/analysis';
import type { SpriteDoc } from '../../src/visualSynth/types';

const PALETTE = {
  colors: ['#000000', '#ffffff'],
  ramps: [{ id: 0, indices: [0, 1] }],
};

describe('render öncesi yapısal analiz', () => {
  it('tampon maliyetini düğüm türüne göre sayar', () => {
    const analysis = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [32, 16],
      seed: 1,
      palette: PALETTE,
      layers: [
        {
          id: 'doku',
          source: {
            kind: 'blur',
            radius: 0.04,
            input: {
              kind: 'scatter',
              source: { kind: 'sdf.circle', r: 0.05 },
              count: 7,
            },
          },
          material: 0,
        },
      ],
    });

    expect(analysis.pixelCount).toBe(512);
    expect(analysis.fieldNodeCount).toBe(3);
    expect(analysis.bufferedNodeCount).toBe(2);
    // blur=1, scatter=2 tam çözünürlük tamponu.
    expect(analysis.requiredFullResolutionBuffers).toBe(3);
    expect(analysis.maxLayerBufferCount).toBe(3);
    expect(analysis.bufferedByKind).toEqual({ blur: 1, scatter: 1 });
    expect(analysis.requestedScatterCount).toBe(7);
    expect(analysis.regionSupport).toEqual({
      mode: 'fullFrame',
      haloPixels: null,
      blockers: ['buffered:blur', 'buffered:scatter'],
    });
    expect(analysis.estimatedPeakWorkingBytes).toBeGreaterThan(0);
  });

  it('iç içe maske yığınını katman ve stack derinliğine katar', () => {
    const doc: SpriteDoc = {
      schemaVersion: 1,
      size: [16, 16],
      seed: 2,
      palette: PALETTE,
      layers: [
        {
          id: 'üst',
          source: { kind: 'sdf.circle', r: 0.4 },
          mask: {
            layers: [
              {
                id: 'maske',
                source: { kind: 'blur', radius: 0.02, input: { kind: 'const', value: 1 } },
              },
            ],
          },
        },
      ],
    } as SpriteDoc;

    const analysis = analyzeSpriteDoc(doc);
    expect(analysis.layerCount).toBe(2);
    expect(analysis.maxStackDepth).toBe(1);
    expect(analysis.layersWithBufferedNodes).toBe(1);
    expect(analysis.maxLayerBufferCount).toBe(1);
    expect(analysis.regionSupport.mode).toBe('fullFrame');
  });

  it('yalın graph için halo sözleşmesini sıfır bölge olarak bildirir', () => {
    const analysis = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [32, 16],
      seed: 1,
      tileable: true,
      palette: PALETTE,
      layers: [{ id: 'zemin', source: { kind: 'noise.value', freq: 4 }, material: 0 }],
    });

    expect(analysis.regionSupport).toEqual({ mode: 'region', haloPixels: 0, blockers: [] });
  });

  it('ışık, glow ve RGBA çıktı tamponlarını çalışma belleği tahminine katar', () => {
    const plain = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [16, 16],
      seed: 1,
      palette: PALETTE,
      layers: [{ id: 'zemin', source: { kind: 'const', value: 1 } }],
    });
    const styled = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [16, 16],
      seed: 1,
      palette: PALETTE,
      layers: [{ id: 'zemin', source: { kind: 'const', value: 1 } }],
      shade: { ao: { radius: 0.1, strength: 0.4 } },
      post: { outline: { px: 1 }, glow: { radius: 3, strength: 0.5 } },
    });

    expect(styled.estimatedPeakWorkingBytes).toBeGreaterThan(plain.estimatedPeakWorkingBytes);
  });

  it('iç içe tamponlu maskenin bellek tahmini derinlikle ölçeklenir', () => {
    // renderLayer bir üst katmanın layerCoverage/layerHeight ve alan
    // tamponlarını serbest bırakmadan alt maske yığınının render'ını
    // rekürsif çağırır (render.ts); bu yüzden yalnız `channelBytes` değil
    // `layerBytes` da stack derinliğiyle çarpılmalı, yoksa tahmin iç içe
    // tamponlu maskelerde gerçek tepe belleğin altında kalır.
    const bufferedLayer = (id: string): SpriteDoc['layers'][number] => ({
      id,
      source: { kind: 'blur', radius: 0.02, input: { kind: 'const', value: 1 } },
    });
    const shallow = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [16, 16],
      seed: 1,
      palette: PALETTE,
      layers: [bufferedLayer('üst')],
    } as SpriteDoc);
    const deep = analyzeSpriteDoc({
      schemaVersion: 1,
      size: [16, 16],
      seed: 1,
      palette: PALETTE,
      layers: [
        {
          ...bufferedLayer('üst'),
          mask: {
            layers: [{ ...bufferedLayer('maske1'), mask: { layers: [bufferedLayer('maske2')] } }],
          },
        },
      ],
    } as SpriteDoc);

    expect(deep.maxStackDepth).toBe(2);
    expect(deep.maxLayerBufferCount).toBe(shallow.maxLayerBufferCount);
    // Yalnız `channelBytes` derinlikle ölçeklenip `layerBytes` sabit kalsaydı
    // (düzeltmeden önceki davranış) tahmin bu değerde kalırdı; düzeltmeden
    // sonra `layerBytes` da derinlikle çarpıldığı için bunu AŞMALI.
    const ifOnlyChannelBytesScaled =
      deep.pixelCount * (9 * (deep.maxStackDepth + 1) + (8 + deep.maxLayerBufferCount * 4) + 4);
    expect(deep.estimatedPeakWorkingBytes).toBeGreaterThan(ifOnlyChannelBytesScaled);
    expect(deep.estimatedPeakWorkingBytes).toBeGreaterThan(shallow.estimatedPeakWorkingBytes);
  });
});
