/**
 * Dither matrisleri — §5.5.
 *
 * Dither, nicemlemenin ürettiği bantları kırar: gölge değerine matristen
 * gelen küçük bir sapma eklenir ve komşu pikseller farklı rampa adımlarına
 * düşer. Göz bunu ara ton olarak okur.
 */

import { createRandom } from '../../random/random';

export type DitherKind = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'blueNoise';

/**
 * Bayer matrisi ÖZYİNELEMELİ üretilir (§5.5) — elle tablo yazılmaz.
 *
 * ```
 * M(2n) = [[4·Mn + 0, 4·Mn + 2],
 *          [4·Mn + 3, 4·Mn + 1]]
 * ```
 *
 * Sonuç `n²`ye bölünerek `[0, 1)` aralığına taşınır.
 */
export function bayerMatrix(size: number): Float32Array {
  let current = Float32Array.from([0]);
  let side = 1;

  while (side < size) {
    const next = new Float32Array(side * side * 4);
    const nextSide = side * 2;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const base = 4 * current[y * side + x];
        next[y * nextSide + x] = base;
        next[y * nextSide + x + side] = base + 2;
        next[(y + side) * nextSide + x] = base + 3;
        next[(y + side) * nextSide + x + side] = base + 1;
      }
    }
    current = next;
    side = nextSide;
  }

  const total = side * side;
  const normalized = new Float32Array(total);
  for (let i = 0; i < total; i++) normalized[i] = current[i] / total;
  return normalized;
}

/** Mavi gürültü karosunun kenarı. Bellekte tutulacak kadar küçük, desen tekrarı görülmeyecek kadar büyük. */
export const BLUE_NOISE_SIZE = 64;

const BLUE_NOISE_SIGMA = 1.5;
const BLUE_NOISE_RADIUS = 6;
const BLUE_NOISE_SEED = 0xb10e;
/** Başlangıç desenindeki nokta oranı — Ulichney'in önerdiği yaklaşık %10. */
const INITIAL_RATIO = 0.1;

let cachedBlueNoise: Float32Array | null = null;

interface Footprint {
  readonly offsets: Int32Array;
  readonly weights: Float64Array;
  readonly total: number;
}

function buildFootprint(): Footprint {
  const offsets: number[] = [];
  const weights: number[] = [];
  let total = 0;
  for (let dy = -BLUE_NOISE_RADIUS; dy <= BLUE_NOISE_RADIUS; dy++) {
    for (let dx = -BLUE_NOISE_RADIUS; dx <= BLUE_NOISE_RADIUS; dx++) {
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * BLUE_NOISE_SIGMA * BLUE_NOISE_SIGMA));
      offsets.push(dx, dy);
      weights.push(weight);
      total += weight;
    }
  }
  return { offsets: Int32Array.from(offsets), weights: Float64Array.from(weights), total };
}

/**
 * Void-and-cluster (Ulichney) ile mavi gürültü karosu.
 *
 * **Hash tabanlı "rastgele" bir dizi mavi gürültü DEĞİLDİR** (§5.5):
 * spektrumu düzdür, yani düşük frekansta da enerji taşır ve dither kümelenip
 * kumlu görünür. Void-and-cluster düşük frekans enerjisini bilinçli olarak
 * boşaltır: her adımda ya en SIKI KÜME dağıtılır ya da en BÜYÜK BOŞLUK
 * doldurulur.
 *
 * Enerji alanı artımlı güncellenir; her adımda baştan hesaplamak karo başına
 * milyarlarca işlem demekti. Karo süreç başına BİR KEZ üretilip saklanır ve
 * tohumu sabittir (D5).
 */
function generateBlueNoise(): Float32Array {
  const size = BLUE_NOISE_SIZE;
  const count = size * size;
  const footprint = buildFootprint();
  const binary = new Uint8Array(count);
  const energyOne = new Float64Array(count);
  const energyZero = new Float64Array(count).fill(footprint.total);

  const stamp = (index: number, sign: number): void => {
    const px = index % size;
    const py = (index / size) | 0;
    for (let k = 0; k < footprint.weights.length; k++) {
      const nx = (((px + footprint.offsets[k * 2]) % size) + size) % size;
      const ny = (((py + footprint.offsets[k * 2 + 1]) % size) + size) % size;
      const target = ny * size + nx;
      energyOne[target] += sign * footprint.weights[k];
      energyZero[target] -= sign * footprint.weights[k];
    }
  };

  const setOne = (index: number): void => {
    binary[index] = 1;
    stamp(index, 1);
  };
  const setZero = (index: number): void => {
    binary[index] = 0;
    stamp(index, -1);
  };

  /** İçinde en çok komşusu olan nokta — dağıtılacak küme. */
  const tightestCluster = (energy: Float64Array, wanted: number): number => {
    let best = -1;
    let bestEnergy = -Infinity;
    for (let i = 0; i < count; i++) {
      if (binary[i] !== wanted) continue;
      if (energy[i] > bestEnergy) {
        bestEnergy = energy[i];
        best = i;
      }
    }
    return best;
  };

  /** Etrafında en az nokta olan boşluk — doldurulacak yer. */
  const largestVoid = (): number => {
    let best = -1;
    let bestEnergy = Infinity;
    for (let i = 0; i < count; i++) {
      if (binary[i] !== 0) continue;
      if (energyOne[i] < bestEnergy) {
        bestEnergy = energyOne[i];
        best = i;
      }
    }
    return best;
  };

  const initialOnes = Math.max(1, Math.round(count * INITIAL_RATIO));
  const random = createRandom(BLUE_NOISE_SEED);
  let placed = 0;
  while (placed < initialOnes) {
    const index = Math.floor(random.next() * count);
    if (binary[index] === 1) continue;
    setOne(index);
    placed++;
  }

  // Faz 0 — başlangıç desenini dengele: sıkı kümeyi boşalt, boşluğu doldur.
  // Aynı noktaya dönüldüğünde desen kararlıdır.
  for (let iteration = 0; iteration < count; iteration++) {
    const cluster = tightestCluster(energyOne, 1);
    setZero(cluster);
    const empty = largestVoid();
    if (empty === cluster) {
      setOne(cluster);
      break;
    }
    setOne(empty);
  }

  const pattern = Uint8Array.from(binary);
  const rank = new Int32Array(count).fill(-1);

  // Faz 1 — başlangıç deseni geriye doğru sökülür; en sıkı küme en yüksek
  // sıra numarasını alır.
  for (let value = initialOnes - 1; value >= 0; value--) {
    const cluster = tightestCluster(energyOne, 1);
    rank[cluster] = value;
    setZero(cluster);
  }

  // Faz 2 — desen geri kurulur ve boşluklar doldurularak yarıya kadar sıralanır.
  for (let i = 0; i < count; i++) if (pattern[i] === 1) setOne(i);
  const half = count >> 1;
  for (let value = initialOnes; value < half; value++) {
    const empty = largestVoid();
    rank[empty] = value;
    setOne(empty);
  }

  // Faz 3 — ikinci yarıda roller değişir: artık SIFIRLARIN en sıkı kümesi
  // bölünür. Aynı ölçütü tek enerji alanıyla sürdürmek, deseni ikinci yarıda
  // beyaz gürültüye çevirirdi.
  for (let value = half; value < count; value++) {
    const cluster = tightestCluster(energyZero, 0);
    rank[cluster] = value;
    setOne(cluster);
  }

  const tile = new Float32Array(count);
  for (let i = 0; i < count; i++) tile[i] = (rank[i] + 0.5) / count;
  return tile;
}

/** Mavi gürültü karosu; ilk çağrıda üretilir, sonra saklanır. */
export function blueNoiseTile(): Float32Array {
  cachedBlueNoise ??= generateBlueNoise();
  return cachedBlueNoise;
}

export interface DitherMatrix {
  readonly values: Float32Array;
  readonly size: number;
}

/** `kind` için matrisi çözer; `none` null döner. */
export function resolveDitherMatrix(kind: DitherKind): DitherMatrix | null {
  switch (kind) {
    case 'bayer2':
      return { values: bayerMatrix(2), size: 2 };
    case 'bayer4':
      return { values: bayerMatrix(4), size: 4 };
    case 'bayer8':
      return { values: bayerMatrix(8), size: 8 };
    case 'blueNoise':
      return { values: blueNoiseTile(), size: BLUE_NOISE_SIZE };
    default:
      return null;
  }
}

/**
 * Gölgeye dither sapması ekler.
 *
 * Matris PİKSEL konumuna göre okunur (`px % size`), birim uzaya göre değil:
 * ölçeklenen bir dither matrisi dither olmaktan çıkar (D2).
 */
export function applyDither(
  shade: Float32Array,
  width: number,
  rows: number,
  matrix: DitherMatrix,
  amount: number,
): void {
  for (let py = 0; py < rows; py++) {
    const row = (py % matrix.size) * matrix.size;
    for (let px = 0; px < width; px++) {
      const offset = matrix.values[row + (px % matrix.size)] - 0.5;
      const index = py * width + px;
      const value = shade[index] + offset * amount;
      shade[index] = value < 0 ? 0 : value > 1 ? 1 : value;
    }
  }
}
