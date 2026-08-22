/**
 * Komşuluk filtreleri — §4.4, D4'ün Aşama 2'si.
 *
 * Bunlar komşu piksel okur, dolayısıyla `(x, y)`nin saf fonksiyonu olarak
 * yazılamazlar; girdileri hedef çözünürlükte bir tampona yazılır ve sonuç o
 * tampon üzerinde hesaplanır.
 *
 * **Kenar davranışı `tileable`a bağlıdır (§4.4):** `clamp` kenar değerini
 * uzatır, `wrap` karşı kenardan okur. Sarmalanmazsa döşeme dikişinde
 * bulanıklık kırılır ve 3×3 önizlemede görülür.
 *
 * **Yarıçaplar buraya PİKSEL olarak gelir** ama belgede BİRİM uzaydadır;
 * dönüşüm derleme anında yapılır (§3: bu adım parametre sınırının birim
 * tarafındadır). Piksel yarıçapı aynı belgeyi 64² ve 512²'de bambaşka
 * gösterirdi.
 */

import type { EdgeMode } from './sample';

/** Ayrılabilir geçişin tek satır/sütun üzerinde yaptığı iş. */
type LineOperation = (padded: Float64Array, n: number, radius: number, out: Float64Array) => void;

function padLine(
  read: (index: number) => number,
  n: number,
  radius: number,
  edge: EdgeMode,
  out: Float64Array,
): void {
  for (let i = -radius; i < n + radius; i++) {
    let index = i;
    if (edge === 'wrap') {
      index = i % n;
      if (index < 0) index += n;
    } else {
      index = i < 0 ? 0 : i >= n ? n - 1 : i;
    }
    out[i + radius] = read(index);
  }
}

/**
 * Ayrılabilir geçiş: önce yatay, sonra dikey.
 *
 * Ayrılabilirlik O(r²)'yi O(r)'ye indirir; satır işlemi koşan toplam ya da
 * monoton kuyruk kullandığında O(1)'e iner (§5.3).
 */
function separablePass(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
  operation: LineOperation,
): void {
  const span = Math.max(width, height);
  const padded = new Float64Array(span + 2 * radius);
  const out = new Float64Array(span);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    padLine((i) => data[row + i], width, radius, edge, padded);
    operation(padded, width, radius, out);
    for (let x = 0; x < width; x++) data[row + x] = out[x];
  }

  for (let x = 0; x < width; x++) {
    padLine((i) => data[i * width + x], height, radius, edge, padded);
    operation(padded, height, radius, out);
    for (let y = 0; y < height; y++) data[y * width + x] = out[y];
  }
}

/**
 * Kutu bulanıklığı satır işlemi — KOŞAN TOPLAM.
 *
 * Naif kutu bulanıklığı piksel başına O(r); 1024²'de r=16 ile 33 milyon
 * toplama. Pencereden çıkanı düşüp gireni eklemek bunu piksel başına iki
 * işleme indirir (§5.3).
 */
const boxLine: LineOperation = (padded, n, radius, out) => {
  // `window` ADI KULLANILMAZ: headless bir modülde DOM global'ini gölgelemek
  // hem okuyucuyu hem `visualHeadless` bekçisini yanıltır.
  const windowSize = 2 * radius + 1;
  let sum = 0;
  for (let i = 0; i < windowSize; i++) sum += padded[i];
  out[0] = sum / windowSize;
  for (let x = 1; x < n; x++) {
    sum += padded[x + windowSize - 1] - padded[x - 1];
    out[x] = sum / windowSize;
  }
};

/**
 * Kayan pencere uç değeri — MONOTON KUYRUK.
 *
 * Pencere içindeki azalan (maks için) diziyi tutar; her indeks kuyruğa bir
 * kez girip bir kez çıktığı için amortize maliyet piksel başına sabittir.
 * Naif hâli pencere boyu kadar karşılaştırma yapardı.
 */
function createExtremeLine(isMax: boolean): LineOperation {
  let deque = new Int32Array(0);
  return (padded, n, radius, out) => {
    const total = n + 2 * radius;
    if (deque.length < total) deque = new Int32Array(total);

    let head = 0;
    let tail = 0;
    let next = 0;

    for (let x = 0; x < n; x++) {
      const end = x + 2 * radius;
      while (next <= end) {
        while (tail > head) {
          const candidate = padded[deque[tail - 1]];
          const incoming = padded[next];
          if (isMax ? candidate <= incoming : candidate >= incoming) tail--;
          else break;
        }
        deque[tail++] = next;
        next++;
      }
      while (deque[head] < x) head++;
      out[x] = padded[deque[head]];
    }
  };
}

const maxLine = createExtremeLine(true);
const minLine = createExtremeLine(false);

/** Kutu bulanıklığı; `passes` kez uygulanır (Gauss yaklaşımı için 3). */
export function boxBlur(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
  passes = 1,
): void {
  if (radius < 1) return;
  for (let pass = 0; pass < passes; pass++) {
    separablePass(data, width, height, radius, edge, boxLine);
  }
}

/**
 * Gauss yaklaşımı: ÜÇ kutu geçişi.
 *
 * Merkezi limit teoremi gereği art arda kutu evrişimi hızla Gauss'a yakınsar;
 * üç geçiş gözle ayırt edilemeyecek kadar yakındır ve her geçiş O(1)
 * kaldığı için gerçek bir Gauss çekirdeğinden ucuzdur (§5.3).
 */
export function gaussBlur(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
): void {
  boxBlur(data, width, height, radius, edge, 3);
}

export function dilate(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
): void {
  if (radius < 1) return;
  separablePass(data, width, height, radius, edge, maxLine);
}

export function erode(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
): void {
  if (radius < 1) return;
  separablePass(data, width, height, radius, edge, minLine);
}

/**
 * Keskinleştirme: `orijinal + (orijinal − bulanık) × amount`.
 *
 * Bulanık kopyanın yarıçapı parametredir; belgede yalnızca `amount` geçse de
 * bulanıklık olmadan bu işlem tanımsızdır — hangi ölçekteki detayın
 * vurgulanacağını yarıçap belirler.
 */
export function sharpen(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  amount: number,
  edge: EdgeMode,
): void {
  if (radius < 1 || amount === 0) return;
  const blurred = Float32Array.from(data);
  boxBlur(blurred, width, height, radius, edge);
  for (let i = 0; i < data.length; i++) {
    data[i] = data[i] + (data[i] - blurred[i]) * amount;
  }
}

/**
 * Sobel gradyan büyüklüğü.
 *
 * Ayrı bir yatay/dikey çıktı verilmez: kenar bir YOĞUNLUK alanıdır, yön
 * bilgisi normal hesabının (Tur 3) işidir.
 */
export function edgeMagnitude(
  data: Float32Array,
  width: number,
  height: number,
  edge: EdgeMode,
): void {
  const source = Float32Array.from(data);
  const at = (x: number, y: number): number => {
    let px = x;
    let py = y;
    if (edge === 'wrap') {
      px = ((x % width) + width) % width;
      py = ((y % height) + height) % height;
    } else {
      px = x < 0 ? 0 : x >= width ? width - 1 : x;
      py = y < 0 ? 0 : y >= height ? height - 1 : y;
    }
    return source[py * width + px];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        at(x - 1, y - 1) +
        2 * at(x - 1, y) +
        at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const gy =
        at(x - 1, y - 1) +
        2 * at(x, y - 1) +
        at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      data[y * width + x] = Math.hypot(gx, gy);
    }
  }
}
