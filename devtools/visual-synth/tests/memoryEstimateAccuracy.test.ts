import { describe, expect, it } from 'vitest';
import {
  VISUAL_PRESET_CATALOG,
  analyzeSpriteDoc,
  createVisualPreset,
  renderSprite,
  type VisualPresetId,
} from '../src';

/**
 * `estimatedPeakWorkingBytes` ile GERÇEK yığın artışını karşılaştırır.
 *
 * Model kendini `confidence: 'conservative'` diye etiketler ama ölçüm 128²
 * belgelerde tahminin **~5–31 katını** verdi. Kök neden kanıtlanmadı; açık
 * bulgu olarak `TODO.md`de duruyor.
 *
 * Bu test formülü DÜZELTMEYE çalışmaz — hangi tarafın yanlış olduğu
 * kanıtlanmadan formülü değiştirmek `RenderCache`/tile kararlarını sessizce
 * bozardı. Bugünkü ölçülen tavanın üstüne bir sınır kilitler: oran fark
 * edilmeden katlanarak büyürse test kırılır, bilinen boşluk için sürekli
 * "başarısız" raporlamaz.
 *
 * `global.gc()` varsa (`--expose-gc`) ölçüm öncesi zorla toplanır; yoksa aynı
 * ölçüm daha gevşek sınırla yapılır — test hiçbir koşuda ATLANMAZ.
 */

const SIZE: readonly [number, number] = [128, 128];
// Ölçülen tavan ~31x (cutMineral, --expose-gc ile). Pay bırakılarak kilitlenir.
const CONSERVATIVE_MULTIPLIER_WITH_FORCED_GC = 40;
const LOOSE_MULTIPLIER_WITHOUT_FORCED_GC = 70;

function samplePresetIds(): VisualPresetId[] {
  const seenCategories = new Set<string>();
  const sampled: VisualPresetId[] = [];
  for (const id of Object.keys(VISUAL_PRESET_CATALOG) as VisualPresetId[]) {
    const category = VISUAL_PRESET_CATALOG[id].category;
    if (seenCategories.has(category)) continue;
    seenCategories.add(category);
    sampled.push(id);
  }
  return sampled;
}

function measureRealHeapDelta(render: () => void): { bytes: number; gcForced: boolean } {
  const forcedGc = (global as { gc?: () => void }).gc;
  const gcForced = typeof forcedGc === 'function';

  if (gcForced) forcedGc();
  const before = process.memoryUsage().heapUsed;
  render();
  const after = process.memoryUsage().heapUsed;
  return { bytes: Math.max(0, after - before), gcForced };
}

describe('VisualSynth bellek tahmini doğruluğu', () => {
  it.each(samplePresetIds())(
    '%s — gerçek yığın artışı bilinen boşluk oranını (ölçülmüş) aşmaz',
    (id) => {
      const doc = createVisualPreset(id, { seed: 7 });
      const analysis = analyzeSpriteDoc(doc);
      const estimatedBytes = analysis.estimatedPeakWorkingBytes;
      expect(estimatedBytes, `${id}: tahmin pozitif olmalı`).toBeGreaterThan(0);

      // Isınma: JIT ve ilk palette/tampon havuzu maliyetini ölçümden ayır.
      renderSprite(doc, { size: SIZE });

      const { bytes: realBytes, gcForced } = measureRealHeapDelta(() => {
        renderSprite(doc, { size: SIZE });
      });

      const multiplier = gcForced
        ? CONSERVATIVE_MULTIPLIER_WITH_FORCED_GC
        : LOOSE_MULTIPLIER_WITHOUT_FORCED_GC;
      const bound = estimatedBytes * multiplier;
      const ratio = realBytes / estimatedBytes;
      expect(
        realBytes,
        `${id}: gerçek yığın artışı (${(realBytes / 1024).toFixed(1)} KB) tahminin ` +
          `(${(estimatedBytes / 1024).toFixed(1)} KB) ${ratio.toFixed(1)}x'i — bilinen ` +
          `boşluk (bkz. dosya başı yorumu) ${multiplier}x sınırını da aştı, YENİ bir ` +
          `regresyon var` +
          (gcForced ? '' : ' (NOT: --expose-gc olmadan gürültülü ölçüm)'),
      ).toBeLessThanOrEqual(bound);
    },
  );
});
