/**
 * Nicemleme — §3'ün 7. adımı ve boru hattının SON RENK İŞLEMİ.
 *
 * Palet kilidi (D6) uygulanabilir olmasını buna borçludur: nicemlemeden
 * sonra renk üreten bir adım yoktur, dolayısıyla çıktıda palet dışı piksel
 * kalamaz. Kenar yumuşatma açıkken oluşan ara kapsama değerleri RENGİ değil
 * ALFAYI etkiler; renk yine rampadan seçilir.
 *
 * `ramp` modunda arama yoktur — `(material, shade)` çifti doğrudan indekse
 * gider. `nearest` (OKLab en yakın renk) Tur 3'te gelir.
 */

import { clamp01 } from '../../math/interpolation';
import type { ResolvedPalette } from './palette';

/**
 * Biriktirici kanallarını RGBA'ya çevirir.
 *
 * `shade` Tur 1'de yükseklik kanalının kendisidir. Tur 3 buraya Lambert +
 * ambient + rim + AO sonucunu verecek; nicemleyicinin sözleşmesi değişmez,
 * yalnızca `shade`in kaynağı değişir.
 */
export function quantizeToRgba(
  coverage: Float32Array,
  shade: Float32Array,
  material: Uint8Array,
  palette: ResolvedPalette,
  out: Uint8ClampedArray,
): void {
  const pixelCount = coverage.length;

  for (let i = 0; i < pixelCount; i++) {
    const alpha = Math.round(clamp01(coverage[i]) * 255);
    const offset = i * 4;

    if (alpha === 0) {
      // Tamamen saydam piksel renk TAŞIMAZ. Altında bir renk bırakmak,
      // PNG'yi indeksli yazarken gereksiz palet girdisi üretir ve "kullanılan
      // renk sayısı" ölçümünü (§9) görünmeyen renklerle şişirirdi.
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = 0;
      continue;
    }

    const indices = palette.ramps.get(material[i]);
    if (!indices) {
      throw new Error(`Nicemleme: ${material[i]} kimlikli rampa palette yok`);
    }

    const steps = indices.length;
    let step = Math.floor(clamp01(shade[i]) * steps);
    if (step >= steps) step = steps - 1;

    const colorIndex = indices[step] * 3;
    out[offset] = palette.rgb[colorIndex];
    out[offset + 1] = palette.rgb[colorIndex + 1];
    out[offset + 2] = palette.rgb[colorIndex + 2];
    out[offset + 3] = alpha;
  }
}
