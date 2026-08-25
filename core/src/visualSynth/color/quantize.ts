/**
 * Nicemleme — §3'ün 7. adımı ve boru hattının SON RENK İŞLEMİ.
 *
 * Palet kilidi (D6) uygulanabilir olmasını buna borçludur: nicemlemeden
 * sonra renk üreten bir adım yoktur, dolayısıyla çıktıda palet dışı piksel
 * kalamaz. Kenar yumuşatmadan gelen ara kapsama değerleri RENGİ değil
 * ALFAYI etkiler; renk yine paletten seçilir.
 *
 * **İki kip, TEK sıcak döngü.** Hem `ramp` hem `nearest` malzeme başına
 * 256 girişlik bir GÖLGE TABLOSUNA indirgenir; piksel başına kalan iş bir
 * dizi okumasıdır. Kipler yalnızca tablonun nasıl kurulduğunda ayrışır.
 */

import { clamp01 } from '../../math/interpolation';
import { oklabDistance, oklabToRgb, rgbToOklab, type Oklab } from './oklab';
import type { ResolvedPalette } from './palette';

export type QuantizeMode = 'ramp' | 'nearest';

/** Gölge tablosunun çözünürlüğü — 8-bit çıktıdan ince, fazlası görünmez. */
const SHADE_STEPS = 256;

export interface OutlineOverlay {
  readonly mask: Uint8Array;
  readonly colorIndex: number;
}

/** Malzeme kimliğinden 256 girişlik palet-indeksi tablosuna. */
export type ShadeTables = ReadonlyMap<number, Uint8Array>;

/** Paletin renklerini OKLab'a çevirir — en yakın renk araması bunu okur. */
function paletteToOklab(palette: ResolvedPalette): Oklab[] {
  const out: Oklab[] = [];
  for (let i = 0; i < palette.colorCount; i++) {
    out.push(rgbToOklab(palette.rgb[i * 3], palette.rgb[i * 3 + 1], palette.rgb[i * 3 + 2]));
  }
  return out;
}

/**
 * OKLab'da en yakın palet rengi.
 *
 * **Neden OKLab:** RGB Öklid mesafesi algısal değildir; koyu mavilerde ve
 * doygun kırmızılarda gözle alakasız eşleşmeler üretir.
 */
export function nearestPaletteIndex(color: Oklab, paletteLab: readonly Oklab[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < paletteLab.length; i++) {
    const distance = oklabDistance(color, paletteLab[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Malzeme başına gölge tablolarını kurar.
 *
 * - `ramp` — gölge doğrudan rampa adımına düşer. Bantlanma BİLİNÇLİdir;
 *   piksel sanatının görünümü odur.
 * - `nearest` — gölge rampa renkleri ARASINDA OKLab'da ara değer alır, sonra
 *   PALETİN TAMAMI içinde en yakın renge oturur. Böylece bir malzeme, kendi
 *   rampasında olmayan bir ara tonu komşu rampadan ödünç alabilir; yüksek
 *   çözünürlüklü doku bu yüzden pürüzsüz çıkar.
 *
 * Belge 32³ girişlik bir 3B arama tablosu öngörüyordu. Gerekmedi: renk
 * kaynağı keyfi bir RGB değil, malzeme başına TEK BOYUTLU bir eksen
 * (gölge). Tek boyutlu tablo hem 4096 kat küçük hem daha hızlıdır.
 */
export function buildShadeTables(palette: ResolvedPalette, mode: QuantizeMode): ShadeTables {
  const tables = new Map<number, Uint8Array>();
  const paletteLab = mode === 'nearest' ? paletteToOklab(palette) : [];

  for (const [id, indices] of palette.ramps) {
    const table = new Uint8Array(SHADE_STEPS);
    const steps = indices.length;

    if (mode === 'ramp') {
      for (let i = 0; i < SHADE_STEPS; i++) {
        const step = Math.min(steps - 1, Math.floor((i / SHADE_STEPS) * steps));
        table[i] = indices[step];
      }
      tables.set(id, table);
      continue;
    }

    const rampLab = indices.map((index) => paletteLab[index]);
    for (let i = 0; i < SHADE_STEPS; i++) {
      const position = (i / (SHADE_STEPS - 1)) * (steps - 1);
      const low = Math.floor(position);
      const high = Math.min(steps - 1, low + 1);
      const fraction = position - low;
      const blended: Oklab = {
        L: rampLab[low].L + (rampLab[high].L - rampLab[low].L) * fraction,
        a: rampLab[low].a + (rampLab[high].a - rampLab[low].a) * fraction,
        b: rampLab[low].b + (rampLab[high].b - rampLab[low].b) * fraction,
      };
      const [r, g, b] = oklabToRgb(blended);
      table[i] = nearestPaletteIndex(rgbToOklab(r, g, b), paletteLab);
    }
    tables.set(id, table);
  }

  return tables;
}

export interface QuantizeOptions {
  readonly tables: ShadeTables;
  readonly outline?: OutlineOverlay | null;
}

/**
 * Biriktirici kanallarını RGBA'ya çevirir.
 *
 * Dış çizgi pikselleri tabloyu ATLAR ve doğrudan kendi palet indeksini alır:
 * çizgi bir malzeme değil, silüetin kendisi hakkında bir ifadedir.
 */
export function quantizeToRgba(
  coverage: Float32Array,
  shade: Float32Array,
  material: Uint8Array,
  palette: ResolvedPalette,
  out: Uint8ClampedArray,
  options: QuantizeOptions,
): void {
  const pixelCount = coverage.length;
  const outline = options.outline ?? null;

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

    let colorIndex: number;
    if (outline && outline.mask[i] === 1) {
      colorIndex = outline.colorIndex;
    } else {
      const table = options.tables.get(material[i]);
      if (!table) throw new Error(`Nicemleme: ${material[i]} kimlikli rampa palette yok`);
      let slot = Math.floor(clamp01(shade[i]) * SHADE_STEPS);
      if (slot >= SHADE_STEPS) slot = SHADE_STEPS - 1;
      colorIndex = table[slot];
    }

    const source = colorIndex * 3;
    out[offset] = palette.rgb[source];
    out[offset + 1] = palette.rgb[source + 1];
    out[offset + 2] = palette.rgb[source + 2];
    out[offset + 3] = alpha;
  }
}
