import type Phaser from 'phaser';
import { SEASONS } from '@/config/seasons';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';
import { daylightColor, mixColor } from './SeasonGround';
import type { TerrainField } from './TerrainField';
import { TerrainContours } from './TerrainContours';
import type { WeatherRect } from './WeatherParticles';

const VEGETATION = WEATHER_VIEW.vegetation;
const PI = Math.PI;
/** Bir karede tutulan en çok küme adayı (kapasite bunun çok altındadır; yalnız alan taşmasına karşı). */
const MAX_CANDIDATES = 12_288;

function hash(a: number, b: number, c: number): number {
  let value = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

interface Palette {
  leaf: number;
  light: number;
  bloom: number;
  /** Çayır çekirdeği ve küme altı gölge (koyu yaprak tonundan türer). */
  shade: number;
}

/** Mevsim paleti: geçiş döneminde bir sonraki mevsime karışır (`seasonPalette` ile aynı eğri). */
export function vegetationPalette(
  frame: Pick<WeatherFrame, 'season' | 'seasonProgress' | 'daylight'>,
): Palette {
  const current = VEGETATION.palette[frame.season];
  const order = SEASONS.order;
  const next = VEGETATION.palette[order[(order.indexOf(frame.season) + 1) % order.length]];
  const fraction = SEASONS.transitionFraction;
  const phase = Math.max(0, Math.min(1, (frame.seasonProgress - (1 - fraction)) / fraction));
  const t = phase * phase * (3 - 2 * phase);
  const leaf = daylightColor(mixColor(current.leaf, next.leaf, t), frame.daylight);
  return {
    leaf,
    light: daylightColor(mixColor(current.light, next.light, t), frame.daylight),
    bloom: daylightColor(mixColor(current.bloom, next.bloom, t), frame.daylight),
    shade: mixColor(leaf, 0x000000, VEGETATION.shadeDarken),
  };
}

/**
 * Çayır katmanı. Yeşillik bölge bölgedir: örtü alanı gürültüyle tırtıklanmış bir kenarla çevrilir
 * (kontur dolgusu), içinde kümeler sabit bir ızgaranın titreşik noktalarındadır ve kenara doğru seyrelir.
 * Küme konumu dünya ızgarasından türer: karede titremez, her istemci aynı çayırı görür. Kare başına küme
 * tavanı vardır (uzaklaşınca seyrelir); yeniden çizim yalnız görünür alan taşınca ya da sim saati
 * `redrawMs` ilerleyince olur.
 */
export class VegetationLayer {
  /** Son karede çizilen küme sayısı (ölçüm). */
  drawn = 0;
  private covered: { left: number; top: number; right: number; bottom: number } | undefined;
  private drawnAt = Number.NEGATIVE_INFINITY;
  private drawnQuality = -1;
  private readonly contours = new TerrainContours();
  private readonly xs = new Float32Array(MAX_CANDIDATES);
  private readonly ys = new Float32Array(MAX_CANDIDATES);
  private readonly growths = new Float32Array(MAX_CANDIDATES);
  /** Kümenin filizlenme oranı [0, 1]: eşiği yeni geçen küme küçüktür, kabul değeri arttıkça tam boya varır. */
  private readonly sprouts = new Float32Array(MAX_CANDIDATES);
  private readonly ids = new Int32Array(MAX_CANDIDATES);
  private count = 0;
  private rowA = new Float64Array(0);
  private rowB = new Float64Array(0);

  /** `tips` kar üstünde çizilen uç katmanıdır (yoksa kar altındaki yeşillik yalnız kar alfasıyla sezilir). */
  constructor(
    private readonly graphics: Phaser.GameObjects.Graphics,
    private readonly tips?: Phaser.GameObjects.Graphics,
  ) {}

  draw(field: TerrainField, frame: WeatherFrame, rect: WeatherRect, quality = 1): void {
    const g = this.graphics;
    if (rect.width <= 0 || rect.height <= 0 || field.cellSize <= 0) {
      g.clear();
      this.tips?.clear();
      this.drawn = 0;
      this.covered = undefined;
      return;
    }
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    const held = this.covered;
    if (
      held &&
      quality === this.drawnQuality &&
      left >= held.left &&
      top >= held.top &&
      right <= held.right &&
      bottom <= held.bottom &&
      Math.abs(frame.elapsedMs - this.drawnAt) < VEGETATION.redrawMs
    )
      return;

    g.clear();
    this.tips?.clear();
    this.drawn = 0;
    const size = field.cellSize;
    const columns = Math.ceil(field.width / size);
    const rows = Math.ceil(field.height / size);
    // Bir hücre pay (alan `TerrainField.prepare` payıyla aynı): kamera biraz kayınca yeniden çizilmez.
    const firstCol = Math.max(0, Math.floor(left / size) - 1);
    const lastCol = Math.min(columns - 1, Math.ceil(right / size));
    const firstRow = Math.max(0, Math.floor(top / size) - 1);
    const lastRow = Math.min(rows - 1, Math.ceil(bottom / size));
    const clip = {
      x: firstCol * size,
      y: firstRow * size,
      width: (lastCol + 1 - firstCol) * size,
      height: (lastRow + 1 - firstRow) * size,
    };
    this.covered = {
      left: clip.x,
      top: clip.y,
      right: clip.x + clip.width,
      bottom: clip.y + clip.height,
    };
    this.drawnAt = frame.elapsedMs;
    this.drawnQuality = quality;

    this.collect(field, clip);
    if (this.count === 0) return;
    const palette = vegetationPalette(frame);

    // Çayır tabanı ve yoğun çekirdek: kenarı gürültüyle tırtıklı iki kontur dolgusu.
    g.fillStyle(palette.leaf, VEGETATION.base.alpha);
    this.fillRegion(field, clip, VEGETATION.threshold);
    g.fillStyle(palette.shade, VEGETATION.core.alpha);
    this.fillRegion(field, clip, VEGETATION.core.threshold);

    const cap = VEGETATION.capacity * Math.max(0.25, Math.min(1, quality));
    const keep = Math.min(1, cap / this.count);
    this.drawClumps(palette, frame.season, keep);
    this.drawTips(field, palette, keep);
  }

  /** Bölge değeri (> 0 çayır içi): bilinear örtü, gürültüyle kenar tırtıklanır; çıplak toprakta -1. */
  private region(field: TerrainField, x: number, y: number, threshold: number): number {
    const growth = field.sample('growth', x, y);
    if (growth < VEGETATION.minGrowth) return -1;
    const ragged =
      (field.noise(x, y) - 0.5) * VEGETATION.edgeNoise +
      (field.noise(x * 2.7 + 311, y * 2.7 + 97) - 0.5) * VEGETATION.edgeNoise * 0.6;
    return growth + ragged - threshold;
  }

  /** Alandaki küme adaylarını toplar: ızgara noktaları, bölge içinde ve yoğunluk olasılığıyla. */
  private collect(field: TerrainField, clip: WeatherRect): void {
    const spacing = VEGETATION.spacing;
    const firstX = Math.floor(clip.x / spacing);
    const lastX = Math.ceil((clip.x + clip.width) / spacing);
    const firstY = Math.floor(clip.y / spacing);
    const lastY = Math.ceil((clip.y + clip.height) / spacing);
    this.count = 0;
    for (let gy = firstY; gy < lastY; gy++)
      for (let gx = firstX; gx < lastX; gx++) {
        const x = (gx + 0.15 + hash(gx, gy, 1) * 0.7) * spacing;
        const y = (gy + 0.15 + hash(gx, gy, 2) * 0.7) * spacing;
        if (x < clip.x || y < clip.y || x >= clip.x + clip.width || y >= clip.y + clip.height)
          continue;
        const value = this.region(field, x, y, VEGETATION.threshold);
        if (value <= 0) continue;
        // Kenarda seyrek, içeride sık; düşük frekanslı gürültü kümeleri öbekler ve ızgara düzenini kırar.
        const clump = VEGETATION.clump;
        const dense = clump.min + (1 - clump.min) * field.noise(x * 1.9 + 53, y * 1.9 + 17);
        const accept = Math.min(1, value * VEGETATION.density) * dense;
        const margin = accept - hash(gx, gy, 3);
        if (margin <= 0) continue;
        if (this.count >= MAX_CANDIDATES) return;
        const index = this.count++;
        const sprout = Math.min(1, margin / VEGETATION.sprout);
        this.sprouts[index] = sprout * sprout * (3 - 2 * sprout);
        this.xs[index] = x;
        this.ys[index] = y;
        // Boy çeşitliliği: aynı örtüde bile kümeler farklı boydadır.
        this.growths[index] = Math.min(
          1,
          field.sample('growth', x, y) * (0.7 + 0.6 * hash(gx, gy, 12)),
        );
        this.ids[index] = gx * 7919 + gy;
      }
  }

  /** `threshold` üstündeki bölgeyi satır satır konturla doldurur (kenar adımı `edgeStep`). */
  private fillRegion(field: TerrainField, clip: WeatherRect, threshold: number): void {
    const step = VEGETATION.edgeStep;
    const columns = Math.ceil(clip.width / step);
    const rows = Math.ceil(clip.height / step);
    if (this.rowA.length < columns + 1) {
      this.rowA = new Float64Array(columns + 1);
      this.rowB = new Float64Array(columns + 1);
    }
    let previous = this.rowA;
    let current = this.rowB;
    const fill = (row: number, target: Float64Array): void => {
      for (let col = 0; col <= columns; col++)
        target[col] = this.region(field, clip.x + col * step, clip.y + row * step, threshold);
    };
    fill(0, previous);
    for (let row = 0; row < rows; row++) {
      fill(row + 1, current);
      const y = clip.y + row * step;
      for (let col = 0; col < columns; col++) {
        const a = previous[col];
        const b = previous[col + 1];
        const c = current[col + 1];
        const d = current[col];
        if (a <= 0 && b <= 0 && c <= 0 && d <= 0) continue;
        this.contours.draw(this.graphics, clip, clip.x + col * step, y, step, a, b, c, d);
      }
      [previous, current] = [current, previous];
    }
  }

  /** Kümeler: zemine temas gölgesi, iki tonlu yukarı açılan yapraklar ve seyrek çiçekler. */
  private drawClumps(palette: Palette, season: WeatherFrame['season'], keep: number): void {
    const g = this.graphics;
    const [minLength, maxLength] = VEGETATION.length;
    const { blades, spread, bladeWidth } = VEGETATION;
    const fan = spread / (blades - 1);

    g.fillStyle(palette.shade, VEGETATION.shadeAlpha);
    for (let index = 0; index < this.count; index++) {
      if (hash(this.ids[index], 0, 4) > keep) continue;
      const length =
        (minLength + (maxLength - minLength) * this.growths[index]) * this.sprouts[index];
      g.fillEllipse(this.xs[index], this.ys[index] + 1.2, length * 1.25, length * 0.5);
    }

    for (const pass of [0, 1]) {
      g.lineStyle(bladeWidth, pass === 0 ? palette.leaf : palette.light, 1);
      g.beginPath();
      for (let index = 0; index < this.count; index++) {
        const id = this.ids[index];
        if (hash(id, 0, 4) > keep) continue;
        if (pass === 0) this.drawn++;
        const x = this.xs[index];
        const y = this.ys[index];
        const length =
          (minLength + (maxLength - minLength) * this.growths[index]) * this.sprouts[index];
        const lean = (hash(id, 0, 5) - 0.5) * 0.5;
        // Açık yapraklar tutamın arasındadır ve biraz kısadır: tutama hacim ve ışık verir.
        for (let blade = pass; blade < blades; blade += 2) {
          const wobble = (hash(id, blade, 6) - 0.5) * fan * 0.8;
          const angle = -PI / 2 - spread / 2 + blade * fan + lean + wobble;
          const middle = 1 - Math.abs(blade - (blades - 1) / 2) / blades;
          const reach =
            length *
            (0.55 + 0.45 * hash(id, blade, 7)) *
            (pass === 0 ? 1 : 0.8) *
            Math.sqrt(middle);
          const bend = (hash(id, blade, 8) - 0.5) * 0.9;
          g.moveTo(x, y);
          g.lineTo(
            x + Math.cos(angle + bend) * reach * 0.55,
            y + Math.sin(angle + bend) * reach * 0.55,
          );
          g.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
        }
      }
      g.strokePath();
    }

    const bloomShare = VEGETATION.bloomShare[season];
    if (bloomShare <= 0) return;
    g.fillStyle(palette.bloom, 1);
    for (let index = 0; index < this.count; index++) {
      const id = this.ids[index];
      if (this.sprouts[index] < 0.8) continue;
      if (hash(id, 0, 4) > keep || hash(id, 0, 9) > bloomShare * this.growths[index]) continue;
      const lift = (minLength + (maxLength - minLength) * this.growths[index]) * 0.8;
      g.fillCircle(
        this.xs[index] + (hash(id, 1, 9) - 0.5) * 6,
        this.ys[index] - lift,
        VEGETATION.bloomRadius,
      );
    }
  }

  /**
   * Karın içinden görünen uçlar: küme konumları aynıdır, yalnız karlı yerde kısa, kara karışmış uçlar
   * kar katmanının üstüne çizilir; kar derinleştikçe seyrelir. Yeşillik kar altında tümden silinmez:
   * "hafif yeşillik, üstünde kar birikmesi" okunur.
   */
  private drawTips(field: TerrainField, palette: Palette, keep: number): void {
    const tips = this.tips;
    if (!tips) return;
    const { tip } = VEGETATION;
    const fullDepth = WEATHER_VIEW.surface.snowFullDepth;
    const [minLength, maxLength] = VEGETATION.length;
    let any = false;
    tips.lineStyle(VEGETATION.bladeWidth, mixColor(palette.light, tip.snowColor, tip.snowMix), 1);
    tips.beginPath();
    for (let index = 0; index < this.count; index++) {
      const id = this.ids[index];
      if (hash(id, 0, 4) > keep) continue;
      const x = this.xs[index];
      const y = this.ys[index];
      const snow = field.sample('snowDepth', x, y);
      if (snow <= tip.minSnow) continue;
      // Kar derinleştikçe uç seyrelir; hiç kar yoksa uç yoktur (altta zaten tam küme çizilidir).
      const alive = Math.max(tip.floor, 1 - Math.min(1, snow / (fullDepth * tip.fadeDepth)));
      if (hash(id, 0, 10) > alive) continue;
      const length =
        (minLength + (maxLength - minLength) * this.growths[index]) *
        tip.length *
        this.sprouts[index];
      for (let blade = 0; blade < 3; blade++) {
        const angle = -PI / 2 + (blade - 1) * 0.7 + (hash(id, blade, 11) - 0.5) * 0.4;
        tips.moveTo(x, y);
        tips.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      }
      any = true;
    }
    if (any) tips.strokePath();
  }
}
