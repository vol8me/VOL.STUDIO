/**
 * Form / yoğunluk eğrisi motoru — parça boyunca katman giriş/çıkış planı.
 */

import { createRandom } from '../../src/audio/synth/random';

export interface LayerEvent {
  /** Katman adı / rolü. */
  layer: string;
  /** Başlangıç beat'i. */
  startBeat: number;
  /** Bitiş beat'i (bu beat'e kadar açık). */
  endBeat: number;
  /** O anki yoğunluk (0-1) — giriş/çıkış gain hesaplarında kullanılabilir. */
  intensity: number;
}

export interface LayerSchedule {
  /** Toplam beat sayısı. */
  totalBeats: number;
  /** Etkin katmanların anlık listesi (zamanla). */
  events: LayerEvent[];
  /** Her beat'teki toplam yoğunluk (eğri). */
  intensityCurve: number[];
}

export interface ArrangementOptions {
  /** Toplam beat sayısı. */
  totalBeats: number;
  /** Tanımlanmış katmanlar. */
  layers: string[];
  /**
   * Yoğunluk eğrisi parçacıkları: [beat, yoğunluk] çiftleri.
   * Ara değerler cosine interpolasyon ile doldurulur.
   */
  intensityPoints: [number, number][];
  /** Her katmanın aktif olduğu beat aralıkları. Belirtilmezse eğriden türetilir. */
  layerRanges?: Record<string, [number, number]>;
  /** Eğriyi belirli aralıklarla kısaltma (örn. [4, 12, 28, 44, 60]). */
  layerEntrances?: number[];
  /** Deterministik seçim için seed. */
  seed?: number;
}

/** Cosine interpolasyonu. */
function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** Yoğunluk eğrisini noktalardan genişletir. */
function buildIntensityCurve(totalBeats: number, points: [number, number][]): number[] {
  const curve = new Float32Array(totalBeats);
  const sorted = [...points].sort((a, b) => a[0] - b[0]);

  if (sorted.length === 0) {
    curve.fill(0.5);
    return Array.from(curve);
  }

  for (let beat = 0; beat < totalBeats; beat++) {
    // beat'in düştüğü segmenti bul.
    let right = sorted.findIndex((p) => p[0] > beat);
    if (right === -1) {
      // Son noktanın sağında: son değeri sabit tut.
      curve[beat] = sorted[sorted.length - 1]![1];
      continue;
    }
    if (right === 0) {
      // İlk noktanın solunda: ilk değeri sabit tut.
      curve[beat] = sorted[0]![1];
      continue;
    }
    const left = right - 1;
    const [x0, y0] = sorted[left]!;
    const [x1, y1] = sorted[right]!;
    const t = smoothstep(x0, x1, beat);
    curve[beat] = y0 + (y1 - y0) * t;
  }

  return Array.from(curve);
}

/**
 * Parça için katman zamanlaması üretir.
 *
 * Yoğunluk eğrisi (ADSR benzeri) katmanların ne zaman girip çıkacağını
 * belirler. `layerRanges` verilmezse eğriye göre otomatik giriş noktaları
 * atanır.
 */
export function generateArrangement(options: ArrangementOptions): LayerSchedule {
  const { totalBeats, layers, intensityPoints, layerRanges, layerEntrances, seed = 1 } = options;
  const random = createRandom(seed);
  const curve = buildIntensityCurve(totalBeats, intensityPoints);

  const events: LayerEvent[] = [];

  if (layerRanges) {
    for (const [layer, [start, end]] of Object.entries(layerRanges)) {
      const intensity =
        curve.slice(start, end).reduce((a, b) => a + b, 0) / Math.max(1, end - start);
      events.push({ layer, startBeat: start, endBeat: end, intensity });
    }
  } else if (layerEntrances && layerEntrances.length >= layers.length) {
    // Her katman belirlenen girişten parça sonuna kadar açık.
    for (let i = 0; i < layers.length; i++) {
      const start = layerEntrances[i]!;
      const end = i < layers.length - 1 ? layerEntrances[i + 1]! : totalBeats;
      const intensity =
        curve.slice(start, end).reduce((a, b) => a + b, 0) / Math.max(1, end - start);
      events.push({ layer: layers[i]!, startBeat: start, endBeat: end, intensity });
    }
  } else {
    // Yoğunlukta artış noktalarını giriş olarak kullan.
    const sortedPoints = [...intensityPoints].sort((a, b) => a[0] - b[0]);
    const layerStartBeats = sortedPoints.map((p) => p[0]);
    while (layerStartBeats.length < layers.length) {
      const extra = Math.floor(random.next() * totalBeats);
      if (!layerStartBeats.includes(extra)) layerStartBeats.push(extra);
    }
    layerStartBeats.sort((a, b) => a - b);

    for (let i = 0; i < layers.length; i++) {
      const start = layerStartBeats[i]!;
      const end = i < layers.length - 1 ? layerStartBeats[i + 1]! : totalBeats;
      const intensity =
        curve.slice(start, end).reduce((a, b) => a + b, 0) / Math.max(1, end - start);
      events.push({ layer: layers[i]!, startBeat: start, endBeat: end, intensity });
    }
  }

  return { totalBeats, events, intensityCurve: curve };
}
