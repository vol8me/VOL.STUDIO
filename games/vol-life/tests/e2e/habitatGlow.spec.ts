import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const EVIDENCE_DIR = process.env.VOL_LIFE_GLOW_EVIDENCE ?? 'test-results/habitat-glow';

/**
 * HUD dünyaya ait değildir: üst şeritteki başlık ve düğmeler parlak piksellerdir
 * ve ölçüme girerlerse iddia dünyayı değil arayüzü ölçer.
 */
const HUD_TOP_SKIP = 64;

/**
 * Kıyı bandının kendisi ışımalıdır; aranan şey bandın DIŞINDA kalan lekedir.
 * Parlak maske bu yarıçap kadar aşındırılır — 12 piksel, ölçülen zoom
 * düzeylerinde kıyı geçişini güvenle dışarıda bırakır.
 */
const SHORE_EROSION_PX = 12;

/** Kiriş, habitatı boydan boya keser; bu oranın altındaki karanlık leke kiriş değildir. */
const CHORD_DIAGONAL_RATIO = 0.1;

/**
 * Parçacıklar habitattan ÇOK daha parlaktır ve ayrı bir popülasyon oluşturur.
 * Otsu iki sınıf varsaydığı için tam histogramda bu kuyruğu seçiyor (ölçüldü:
 * eşik 85–93, parlak oran %1–2, aşındırmadan sonra iç bölge SIFIR piksel).
 * Sorulan soru Void–habitat ayrımı olduğundan eşik bu kuyruğun altında aranır.
 */
const PARTICLE_LUMINANCE_CUTOFF = 40;

interface GlowScan {
  readonly width: number;
  readonly height: number;
  readonly threshold: number;
  readonly brightRatio: number;
  readonly interiorPixels: number;
  readonly darkInsideRatio: number;
  readonly longestDarkDiagonalRatio: number;
}

/**
 * Sahne DETERMİNİSTİK DEĞİLDİR: dünya tohumu her açılışta
 * `crypto.getRandomValues`'tan gelir, dolayısıyla elle sabitlenmiş küresel bir
 * parlaklık eşiği koşudan koşuya kayar (ölçüldü: aynı eşik iki koşuda 1 ve 2
 * bileşen verdi). Bu yüzden eşik GÖRÜNTÜNÜN KENDİSİNDEN türetilir (Otsu) ve
 * iddia kirişin gerçek imzasına bağlanır: aşınmış iç bölgede uzun karanlık
 * çizgi. Parçacıklar parlaktır, ölçütü kirletmezler.
 */
async function scanGlow(page: Page, label?: string): Promise<GlowScan> {
  const shot = await page.locator('canvas').screenshot();
  if (label) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(`${EVIDENCE_DIR}/${label}.png`, shot);
  }

  return page.evaluate(
    async ([url, hudSkip, erosion, cutoff]) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D bağlam kurulamadı.');
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);

      const first = hudSkip * width;
      const total = width * height - first;
      const luminance = new Uint8Array(width * height);
      const histogram = new Array<number>(256).fill(0);
      for (let pixel = first; pixel < width * height; pixel++) {
        const index = pixel * 4;
        const value = Math.min(
          255,
          Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]),
        );
        luminance[pixel] = value;
        histogram[value]++;
      }

      /*
       * Otsu: sınıf içi varyansı en aza indiren eşik; görüntüden türer, elle
       * seçilmez. Parçacık kuyruğunun ALTINDA koşturulur — yöntem iki sınıf
       * varsayar, görüntüde ise üç popülasyon var (Void, habitat, parçacık) ve
       * tam histogramda en yüksek kontrastlı yanlış ayrımı seçiyordu.
       */
      let restricted = 0;
      let sum = 0;
      for (let value = 0; value < cutoff; value++) {
        restricted += histogram[value];
        sum += value * histogram[value];
      }
      let backgroundWeight = 0;
      let backgroundSum = 0;
      let best = 0;
      let threshold = 0;
      for (let value = 0; value < cutoff; value++) {
        backgroundWeight += histogram[value];
        if (backgroundWeight === 0) continue;
        const foregroundWeight = restricted - backgroundWeight;
        if (foregroundWeight === 0) break;
        backgroundSum += value * histogram[value];
        const backgroundMean = backgroundSum / backgroundWeight;
        const foregroundMean = (sum - backgroundSum) / foregroundWeight;
        const between =
          backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
        if (between > best) {
          best = between;
          threshold = value;
        }
      }

      const bright = new Uint8Array(width * height);
      let brightCount = 0;
      for (let pixel = first; pixel < width * height; pixel++) {
        if (luminance[pixel] > threshold) {
          bright[pixel] = 1;
          brightCount++;
        }
      }

      /*
       * Aşındırma: parlak maskenin kenarından `erosion` piksel içeri girilir.
       * Kıyı geçişi böylece ölçümün dışında kalır; geriye habitatın gerçek içi
       * kalır. Chebyshev mesafesiyle iki geçişli yaklaşık aşındırma yeterlidir.
       */
      const distance = new Int32Array(width * height).fill(erosion + 1);
      for (let y = hudSkip; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          if (bright[index] === 0) {
            distance[index] = 0;
            continue;
          }
          let value = distance[index];
          if (x > 0) value = Math.min(value, distance[index - 1] + 1);
          if (y > hudSkip) value = Math.min(value, distance[index - width] + 1);
          distance[index] = value;
        }
      }
      for (let y = height - 1; y >= hudSkip; y--) {
        for (let x = width - 1; x >= 0; x--) {
          const index = y * width + x;
          if (bright[index] === 0) continue;
          let value = distance[index];
          if (x < width - 1) value = Math.min(value, distance[index + 1] + 1);
          if (y < height - 1) value = Math.min(value, distance[index + width] + 1);
          distance[index] = value;
        }
      }

      const interior = new Uint8Array(width * height);
      let interiorPixels = 0;
      for (let pixel = first; pixel < width * height; pixel++) {
        if (bright[pixel] === 1 && distance[pixel] >= erosion) {
          interior[pixel] = 1;
          interiorPixels++;
        }
      }

      /*
       * Kirişin imzası: iç bölgeyi kesen KARANLIK çizgi. Aşınmış iç bölgenin
       * komşuluğundaki karanlık pikseller bileşenlere ayrılır ve en uzun
       * bileşenin köşegeni ölçülür — kiriş habitatı boydan boya keser.
       */
      const seen = new Uint8Array(width * height);
      const stack: number[] = [];
      let darkInside = 0;
      let longestDiagonal = 0;
      for (let start = first; start < width * height; start++) {
        if (seen[start] === 1 || bright[start] === 1) continue;
        if (distance[start] !== 0) continue;
        let touchesInterior = false;
        let minX = width;
        let maxX = 0;
        let minY = height;
        let maxY = 0;
        let size = 0;
        stack.push(start);
        seen[start] = 1;
        while (stack.length > 0) {
          const current = stack.pop() as number;
          const x = current % width;
          const y = (current / width) | 0;
          size++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < hudSkip || nx >= width || ny >= height) continue;
              const neighbour = ny * width + nx;
              if (interior[neighbour] === 1) touchesInterior = true;
              if (seen[neighbour] === 1 || bright[neighbour] === 1) continue;
              seen[neighbour] = 1;
              stack.push(neighbour);
            }
          }
        }
        if (!touchesInterior) continue;
        darkInside += size;
        longestDiagonal = Math.max(longestDiagonal, Math.hypot(maxX - minX, maxY - minY));
      }

      return {
        width,
        height,
        threshold,
        brightRatio: brightCount / total,
        interiorPixels,
        darkInsideRatio: interiorPixels > 0 ? darkInside / interiorPixels : 0,
        longestDarkDiagonalRatio: longestDiagonal / width,
      };
    },
    [
      `data:image/png;base64,${shot.toString('base64')}`,
      HUD_TOP_SKIP,
      SHORE_EROSION_PX,
      PARTICLE_LUMINANCE_CUTOFF,
    ] as [string, number, number, number],
  );
}

/**
 * Işıma rasteri kareye yayılıyor (DESIGN §18), yani ölçüm yarım dokuyu
 * taramamalı. "Kare kararlı hâle gelene kadar bekle" ölçütü BURADA ÇALIŞMAZ:
 * sahne doğası gereği durağan değildir — parçacıklar her kare hareket eder ve
 * Void nabzı alfayı sürekli oynatır (ölçüldü: ardışık taramalar hiçbir zaman
 * %1 içinde sabitlenmedi). Rasterin dolması ise ölçülmüş bir süreçtir: 512
 * satır, kare başına 6 ms bütçe → ~128 kare ≈ 2,1 sn (60 Hz). Beklenen süre
 * bunun ~3 katıdır; bu bir zaman aşımı gevşetmesi değil, bitişi ölçülmüş bir
 * işin beklenmesidir.
 */
const RASTER_FILL_WAIT_MS = 6000;

/*
 * C5: kontur noktalarını normal yönünde öteleyip çizgiyle bağlayan eski yol
 * yüksek eğrilikte düz bir KİRİŞ bırakıyordu — Void'den habitatın içine geçen
 * bir çizgi. Birim testi bunu SDF ile arar; burada aranan şey aynı kusurun
 * gerçek WebGL çıktısındaki izidir ve ekran görüntüleri P1 kabul paketine girer.
 */
test('kıyı ışıması üç zoom düzeyinde habitatın içine kiriş bırakmaz', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(RASTER_FILL_WAIT_MS);

  const box = await canvas.boundingBox();
  const centerX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const centerY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  const scans: GlowScan[] = [];

  for (const [index, wheel] of [0, -240, -240].entries()) {
    if (wheel !== 0) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, wheel);
      await page.waitForTimeout(600);
    }
    const scan = await scanGlow(page, `zoom-${index}`);
    scans.push(scan);
    console.log(
      `[C5] zoom-${index} ${scan.width}×${scan.height} | Otsu eşiği ${scan.threshold} | ` +
        `parlak oran ${scan.brightRatio.toFixed(4)} | iç piksel ${scan.interiorPixels} | ` +
        `iç karanlık oran ${scan.darkInsideRatio.toFixed(5)} | ` +
        `en uzun karanlık köşegen ${scan.longestDarkDiagonalRatio.toFixed(4)}`,
    );
  }

  for (const [index, scan] of scans.entries()) {
    expect(scan.interiorPixels, `zoom-${index}: habitat iç bölgesi bulunamadı`).toBeGreaterThan(0);
    expect(
      scan.longestDarkDiagonalRatio,
      `zoom-${index}: habitatın içini kesen karanlık çizgi (kiriş) var`,
    ).toBeLessThan(CHORD_DIAGONAL_RATIO);
  }
});
