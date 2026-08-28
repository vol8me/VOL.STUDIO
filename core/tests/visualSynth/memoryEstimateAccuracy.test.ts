import { describe, expect, it } from 'vitest';
import {
  VISUAL_PRESET_CATALOG,
  analyzeSpriteDoc,
  createVisualPreset,
  renderSprite,
  type VisualPresetId,
} from '../../src/visualSynth';

/**
 * `analyzeSpriteDoc().estimatedPeakWorkingBytes` gerçek çalışma zamanı bellek
 * kullanımına karşı ÖLÇÜLEREK doğrulanır — önceden hiç ölçülmüyordu.
 * `visual-synth-asset benchmark` komutu tahmini VE gerçek RSS'i yan yana
 * raporluyor ama ikisini hiç KARŞILAŞTIRMIYORDU.
 *
 * **Gerçek bulgu (bu test yazılırken ölçüldü):** model kendini
 * `confidence: 'conservative'` diye etiketliyor (bkz. analysis.ts — bilinen
 * typed-array + geçici scratch + metadata + %50 pay) ama `--expose-gc` ile
 * zorla ölçülen gerçek yığın artışı, 128×128 örnek belgelerde tahminin
 * **~5–31 katı** çıktı (7 kategoriden örnek: brushedSurface 4.8x, liquidRipples
 * 13.0x, softGlow 18.8x, organicCluster 22.3x, structureGrid 25.4x,
 * terrainCells 25.6x, cutMineral 30.7x). Kök neden KANITLANMADI ama en
 * olası açıklama: `analyzeSpriteDoc` yalnızca `category: 'buffered'` düğümler
 * için kalıcı tam-çözünürlük tampon SAYAR (bkz. `bufferCount()`); tamponsuz
 * (non-buffered) düğümlerin render.ts'te GERÇEKTEN piksel-piksel akışla mı
 * değerlendirildiği, yoksa her düğümün kendi ara Float64Array'ini mi
 * ürettiği doğrulanmadı — ikincisi doğruysa kümülatif ayırma, tamponlu alt
 * kümeyi değil TÜM graph düğüm sayısını ölçeklerdi. Bu, ayrı bir profil
 * incelemesi gerektiren AÇIK bir bulgu olarak bırakılıyor.
 *
 * Bu test formülü "düzeltmeye" ÇALIŞMAZ (hangi tarafın — model mi,
 * render.ts mi — yanlış olduğu kanıtlanmadan formülü değiştirmek
 * `RenderCache`/tile uygunluk kararlarını sessizce bozabilirdi). Bunun yerine
 * BUGÜNKÜ ölçülen tavanın üstünde, KEŞFEDİLEN gerçeğe dayalı bir sınır
 * kilitler: gelecekte bu oran fark edilmeden KATLANARAK büyürse (ör. yeni
 * bir non-buffered filtre kümülatif ayırmayı ikiye katlarsa) test kırılır;
 * bugünkü bilinen boşluğu tekrar tekrar "başarısız" diye raporlamaz.
 *
 * `global.gc()` (Node `--expose-gc`) varsa ölçüm öncesi zorla toplanır ve
 * gürültü büyük ölçüde elenir. Yoksa (normal `pnpm test` GC'yi açığa
 * çıkarmaz) aynı ölçüm ek GC gürültüsüyle yapılır ve daha gevşek bir sınırla
 * karşılaştırılır — sıkı doğrulama
 * `NODE_OPTIONS=--expose-gc pnpm --filter @volstudio/core test` ile
 * istenince koşar, ama test normal koşuda da ATLANMAZ.
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
