import type Phaser from 'phaser';
import { SEASONS } from '@/config/seasons';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';
import { daylightColor, mixColor } from './SeasonGround';
import type { TerrainField } from './TerrainField';
import { TerrainContours } from './TerrainContours';
import type { WeatherSource } from './SurfaceLayer';
import type { WeatherRect } from './WeatherParticles';

const VEGETATION = WEATHER_VIEW.vegetation;
const TILE = VEGETATION.tile;
const PI = Math.PI;
/** Bir döşemede tutulan en çok küme adayı (kapasite bunun çok altındadır; yalnız alan taşmasına karşı). */
const MAX_CANDIDATES = 4096;

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

/** Mevsim geçişi karışım oranı [0, 1] (`seasonPalette` ile aynı eğri). */
function seasonBlend(frame: Pick<WeatherFrame, 'seasonProgress'>): number {
  const fraction = SEASONS.transitionFraction;
  const phase = Math.max(0, Math.min(1, (frame.seasonProgress - (1 - fraction)) / fraction));
  return phase * phase * (3 - 2 * phase);
}

/** Mevsim paleti: geçiş döneminde bir sonraki mevsime karışır (`seasonPalette` ile aynı eğri). */
export function vegetationPalette(
  frame: Pick<WeatherFrame, 'season' | 'seasonProgress' | 'daylight'>,
): Palette {
  const current = VEGETATION.palette[frame.season];
  const order = SEASONS.order;
  const next = VEGETATION.palette[order[(order.indexOf(frame.season) + 1) % order.length]];
  const t = seasonBlend(frame);
  const leaf = daylightColor(mixColor(current.leaf, next.leaf, t), frame.daylight);
  return {
    leaf,
    light: daylightColor(mixColor(current.light, next.light, t), frame.daylight),
    bloom: daylightColor(mixColor(current.bloom, next.bloom, t), frame.daylight),
    shade: mixColor(leaf, 0x000000, VEGETATION.shadeDarken),
  };
}

/** Gün ışığının doku boyası: dokular tam gün ışığında pişer, çarpan geceye doğru karartır. */
function toneOf(daylight: number): number {
  const steps = TILE.toneSteps;
  const light = Math.round(Math.max(0, Math.min(1, daylight)) * steps) / steps;
  const brightness = (0.8 + light * (2 / 7)) / (0.8 + 2 / 7);
  const channel = Math.round(Math.max(0, Math.min(1, brightness)) * 255);
  return (channel << 16) | (channel << 8) | channel;
}

/** Dokuya basılacak bir kalem ve katmanın saydamlığı. */
export interface VegetationPaint {
  readonly pen: Phaser.GameObjects.Graphics;
  readonly alpha: number;
}

/** Bir döşeme görüntüsü: pişirilen doku ve gün ışığı boyası; sunum katmanına özgü (Phaser) ayrıntı burada. */
export interface VegetationImage {
  /**
   * Katmanlar dünya birimiyle çizilmiş opak kalemlerdir ve verilen sırayla dokuya basılır; `alpha` o
   * katmanın bütünüyle uygulanan saydamlığıdır (kalemin içindeki dolgu ile çizgi çakışması koyulaşmaz).
   * `origin` döşemenin sol üst köşesi, `size` kenarı (birim), `texel` birim başına doku pikseli. İçerik
   * eskisinin yerine geçer; boş kalemler görüntüyü boşaltır.
   */
  bake(
    layers: readonly VegetationPaint[],
    originX: number,
    originY: number,
    size: number,
    texel: number,
  ): void;
  tone(tint: number): void;
  show(visible: boolean): void;
  destroy(): void;
}

/**
 * Döşemenin çizim kalemleri; yığın sırası aşağıdan yukarıdadır. Taban, çekirdek ve kümeler tek dokuya
 * (`body`) basılır, uçlar kardan sonra çizildiği için ayrı dokudur (`tips`): ekranı kaplayan doku sayısı
 * (dolgu maliyeti) iki olur.
 */
export type VegetationPenKind = 'region' | 'core' | 'clumps' | 'tips';
export type VegetationLayerKind = 'body' | 'tips';
const LAYERS: readonly VegetationLayerKind[] = ['body', 'tips'];

export interface VegetationHost {
  /**
   * Katman başına geçici çizim kalemi; yalnız pişirme sırasında kullanılır. Çayır tabanı ve çekirdeği opak
   * çizilir (üst üste binen çokgenler birikmez, çatlak çizgiyle kapanır) ve saydamlığı doku katmanı taşır.
   */
  pen(kind: VegetationPenKind): Phaser.GameObjects.Graphics;
  create(kind: VegetationLayerKind): VegetationImage;
}

interface Tile {
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly layers: Record<VegetationLayerKind, VegetationImage | null>;
  /** Son pişirmenin içerik imzası; `null` henüz pişmedi. */
  signature: number | null;
  /** Son pişirmenin birim başına doku pikseli. */
  texel: number;
  checkedAt: number;
  /** İmza denetimi sonuçlandı: içerik pişenden farklı. */
  stale: boolean;
  seen: number;
  drawn: number;
}

/**
 * Çayır katmanı. Yeşillik bölge bölgedir: örtü alanı gürültüyle tırtıklanmış bir kenarla çevrilir
 * (kontur dolgusu), içinde kümeler sabit bir ızgaranın titreşik noktalarındadır ve kenara doğru seyrelir.
 * Küme konumu dünya ızgarasından türer: karede titremez, her istemci aynı çayırı görür.
 *
 * Çizim dünya ızgarasına oturan döşemeler olarak dokuya pişirilir (`VEGETATION.tile`). Çizim komutları
 * her karede yeniden üçgenlenir; binlerce çizgi ve kontur çokgenini her kare yeniden çizmek uzaklaşmış
 * kamerada karenin üçte ikisini yerdi. Döşeme yalnız içeriği (örtü, kar, mevsim paleti) niceliklenmiş
 * imzasıyla değişince yeniden pişer; gün ışığı doku boyasıdır, kamera kaymak bedavadır. Karede pişirme
 * süre bütçelidir ve en yakın eksik döşemeden başlar; eskimiş döşeme yenisi pişene dek görünmeye devam eder.
 */
export class VegetationLayer {
  /** Görünür döşemelerdeki küme sayısı (ölçüm). */
  drawn = 0;
  /** Son karede pişirilen döşeme sayısı (ölçüm). */
  baked = 0;
  private readonly tiles = new Map<number, Tile>();
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
  private level = 0;
  private tint = -1;
  private pass = 0;
  private readonly wanted: Tile[] = [];

  constructor(private readonly host: VegetationHost) {}

  /**
   * @param detail ekranda birim başına aygıt pikseli (kamera yakınlığı × çözünürlük); doku yoğunluğunu seçer.
   */
  draw(
    field: TerrainField,
    weather: WeatherSource,
    rect: WeatherRect,
    quality = 1,
    detail = 1,
  ): void {
    const frame = weather.frame;
    this.baked = 0;
    this.drawn = 0;
    if (rect.width <= 0 || rect.height <= 0 || field.cellSize <= 0) {
      this.hideAll();
      return;
    }
    this.pass++;
    const level = this.pickLevel(detail);
    const tint = toneOf(frame.daylight);
    const toneChanged = tint !== this.tint;
    this.tint = tint;

    const size = TILE.size;
    const reach = TILE.pad;
    const firstColumn = Math.max(0, Math.floor((rect.x - reach) / size));
    const firstRow = Math.max(0, Math.floor((rect.y - reach) / size));
    const lastColumn = Math.min(
      Math.max(0, Math.ceil(field.width / size) - 1),
      Math.floor((rect.x + rect.width + reach) / size),
    );
    const lastRow = Math.min(
      Math.max(0, Math.ceil(field.height / size) - 1),
      Math.floor((rect.y + rect.height + reach) / size),
    );
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    this.wanted.length = 0;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const tile = this.tile(column, row);
        tile.seen = this.pass;
        if (toneChanged) this.applyTone(tile);
        for (const kind of LAYERS) tile.layers[kind]?.show(true);
        if (this.needsBake(tile, field, weather, quality, level, frame)) this.wanted.push(tile);
      }
    }
    this.bakeWanted(field, weather, quality, level, frame, centerX, centerY);
    for (const tile of this.tiles.values()) if (tile.seen === this.pass) this.drawn += tile.drawn;
    this.evict();
  }

  /** Tüm döşemeleri ve bellekteki dokularını bırakır. */
  destroy(): void {
    for (const tile of this.tiles.values()) this.release(tile);
    this.tiles.clear();
  }

  /** Bellekte tutulan döşeme sayısı (ölçüm ve test). */
  get tileCount(): number {
    return this.tiles.size;
  }

  private tile(column: number, row: number): Tile {
    const key = row * 65536 + column;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = {
        column,
        row,
        x: column * TILE.size,
        y: row * TILE.size,
        layers: { body: null, tips: null },
        signature: null,
        texel: 0,
        checkedAt: Number.NEGATIVE_INFINITY,
        stale: false,
        seen: 0,
        drawn: 0,
      };
      this.tiles.set(key, tile);
    }
    return tile;
  }

  /** Ekran yoğunluğunu en yakın üst doku kademesine yuvarlar; kademe titremesin diye aralıklıdır (histerezis). */
  private pickLevel(detail: number): number {
    const levels = TILE.texel;
    const need = Number.isFinite(detail) && detail > 0 ? detail : 1;
    let best = levels[levels.length - 1];
    for (const candidate of levels) {
      if (candidate >= need * 0.9) {
        best = candidate;
        break;
      }
    }
    if (this.level === 0) this.level = best;
    else if (best !== this.level) {
      const ratio = need / this.level;
      if (ratio > 1.25 || ratio < 0.55) this.level = best;
    }
    return this.level;
  }

  private applyTone(tile: Tile): void {
    for (const kind of LAYERS) tile.layers[kind]?.tone(this.tint);
  }

  /**
   * Döşemenin pişmesi gerekir mi: hiç pişmediyse ya da doku kademesi değiştiyse evet; aksi hâlde içerik
   * imzası `checkMs` aralığıyla denetlenir, farklıysa eskidir.
   */
  private needsBake(
    tile: Tile,
    field: TerrainField,
    weather: WeatherSource,
    quality: number,
    level: number,
    frame: WeatherFrame,
  ): boolean {
    if (tile.signature === null || tile.texel !== level) return true;
    if (Math.abs(frame.elapsedMs - tile.checkedAt) >= TILE.checkMs) {
      tile.checkedAt = frame.elapsedMs;
      this.prepare(field, weather, tile);
      tile.stale = this.signatureOf(field, tile, frame, quality) !== tile.signature;
    }
    return tile.stale;
  }

  private bakeWanted(
    field: TerrainField,
    weather: WeatherSource,
    quality: number,
    level: number,
    frame: WeatherFrame,
    centerX: number,
    centerY: number,
  ): void {
    if (this.wanted.length === 0) return;
    const half = TILE.size / 2;
    // Hiç pişmemiş döşeme bayatlamışa göre önce gelir; aynı sınıfta kameraya en yakın başta.
    const rank = (tile: Tile): number =>
      Math.hypot(tile.x + half - centerX, tile.y + half - centerY) +
      (tile.signature === null ? 0 : 1e6);
    this.wanted.sort((a, b) => rank(a) - rank(b));
    const deadline = performance.now() + TILE.bakeBudgetMs;
    for (const tile of this.wanted) {
      if (this.baked > 0 && performance.now() >= deadline) break;
      this.bake(tile, field, weather, quality, level, frame);
      this.baked++;
    }
  }

  private prepare(field: TerrainField, weather: WeatherSource, tile: Tile): void {
    const pad = TILE.pad + weather.cellSize;
    field.prepare(weather, {
      x: tile.x - pad,
      y: tile.y - pad,
      width: TILE.size + pad * 2,
      height: TILE.size + pad * 2,
    });
  }

  /** İçerik imzası: örtü ve kar derinliğinin niceliklenmiş örnekleri, palet karışımı ve kalite. */
  private signatureOf(
    field: TerrainField,
    tile: Tile,
    frame: WeatherFrame,
    quality: number,
  ): number {
    const step = Math.max(8, field.cellSize / 2);
    const fullDepth = WEATHER_VIEW.surface.snowFullDepth * VEGETATION.tip.fadeDepth;
    let value = Math.imul(SEASONS.order.indexOf(frame.season) + 1, 40503);
    value ^= Math.round(seasonBlend(frame) * 16) * 977;
    value = Math.imul(value ^ Math.round(Math.max(0, Math.min(1, quality)) * 8), 2654435761);
    for (let y = tile.y; y <= tile.y + TILE.size; y += step) {
      for (let x = tile.x; x <= tile.x + TILE.size; x += step) {
        const growth = Math.round(field.sample('growth', x, y) * TILE.growthSteps);
        const snow = field.sample('snowDepth', x, y);
        const tip =
          snow > VEGETATION.tip.minSnow
            ? 1 + Math.round(Math.min(1, snow / fullDepth) * TILE.snowSteps)
            : 0;
        value = Math.imul(value ^ (growth * 31 + tip), 16777619);
      }
    }
    return value >>> 0;
  }

  private bake(
    tile: Tile,
    field: TerrainField,
    weather: WeatherSource,
    quality: number,
    level: number,
    frame: WeatherFrame,
  ): void {
    const pad = TILE.pad;
    const clip = { x: tile.x, y: tile.y, width: TILE.size, height: TILE.size };
    this.prepare(field, weather, tile);
    const pens = {
      region: this.host.pen('region'),
      core: this.host.pen('core'),
      clumps: this.host.pen('clumps'),
      tips: this.host.pen('tips'),
    };
    for (const pen of Object.values(pens)) pen.clear();
    tile.drawn = 0;
    this.collect(field, clip);
    const filled: Record<VegetationLayerKind, boolean> = { body: false, tips: false };
    if (this.count > 0) {
      // Dokular tam gün ışığında pişer; gün ışığı doku boyasıdır (`toneOf`).
      const palette = vegetationPalette({ ...frame, daylight: 1 });
      // Taban ve çekirdek iki doku pikseli kalınlığında çizgiyle mühürlenir (bitişik çokgenler arası çatlak);
      // çizgi döşeme sınırını aşmasın diye çokgenler o kadar içeriden kırpılır.
      const seal = 2 / level;
      pens.region.fillStyle(palette.leaf, 1);
      pens.region.lineStyle(seal, palette.leaf, 1);
      this.fillRegion(pens.region, field, clip, VEGETATION.threshold, seal);
      pens.core.fillStyle(palette.shade, 1);
      pens.core.lineStyle(seal, palette.shade, 1);
      this.fillRegion(pens.core, field, clip, VEGETATION.core.threshold, seal);
      const cap = TILE.capacity * Math.max(0.25, Math.min(1, quality));
      const keep = Math.min(1, cap / this.count);
      tile.drawn = this.drawClumps(pens.clumps, palette, frame.season, keep);
      filled.body = true;
      filled.tips = this.drawTips(pens.tips, field, palette, keep);
    }
    const originX = tile.x - pad;
    const originY = tile.y - pad;
    const size = TILE.size + pad * 2;
    for (const kind of LAYERS) {
      // Boş katman için doku üretilmez; önceden pişmiş içerik varsa boşaltılır.
      if (!filled[kind] && !tile.layers[kind]) continue;
      const image = (tile.layers[kind] ??= this.host.create(kind));
      // Taban ve çekirdek dokuya ayrı ayrı bu saydamlıkla basılır (alfa karışımı birleşimlidir: iki ayrı doku
      // katmanıyla aynı görüntüyü verir, ama çokgen dolgusu ile mühür çizgisi çakıştığı yerde koyulaşmaz).
      const paints: readonly VegetationPaint[] =
        kind === 'body'
          ? [
              { pen: pens.region, alpha: VEGETATION.base.alpha },
              { pen: pens.core, alpha: VEGETATION.core.alpha },
              { pen: pens.clumps, alpha: 1 },
            ]
          : [{ pen: pens.tips, alpha: 1 }];
      image.bake(paints, originX, originY, size, level);
      image.tone(this.tint);
    }
    tile.texel = level;
    tile.stale = false;
    tile.checkedAt = frame.elapsedMs;
    tile.signature = this.signatureOf(field, tile, frame, quality);
  }

  private hideAll(): void {
    for (const tile of this.tiles.values())
      for (const kind of LAYERS) tile.layers[kind]?.show(false);
  }

  /**
   * Görünmeyen döşemeleri gizler; en eskileri `retain` kadarı kalacak biçimde bırakır (kamera hızla dönerse
   * yeniden pişmesin diye).
   */
  private evict(): void {
    let visible = 0;
    for (const tile of this.tiles.values()) {
      if (tile.seen === this.pass) {
        visible++;
        continue;
      }
      for (const kind of LAYERS) tile.layers[kind]?.show(false);
    }
    const surplus = this.tiles.size - visible - TILE.retain;
    if (surplus <= 0) return;
    const gone = [...this.tiles.entries()]
      .filter(([, tile]) => tile.seen !== this.pass)
      .sort((a, b) => a[1].seen - b[1].seen)
      .slice(0, surplus);
    for (const [key, tile] of gone) {
      this.release(tile);
      this.tiles.delete(key);
    }
  }

  private release(tile: Tile): void {
    for (const kind of LAYERS) {
      tile.layers[kind]?.destroy();
      tile.layers[kind] = null;
    }
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
  private fillRegion(
    pen: Phaser.GameObjects.Graphics,
    field: TerrainField,
    clip: WeatherRect,
    threshold: number,
    seal: number,
  ): void {
    const step = VEGETATION.edgeStep;
    const edge = seal / 2;
    const bounds =
      seal > 0
        ? {
            x: clip.x + edge,
            y: clip.y + edge,
            width: clip.width - seal,
            height: clip.height - seal,
          }
        : clip;
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
        this.contours.draw(pen, bounds, clip.x + col * step, y, step, a, b, c, d, seal > 0);
      }
      [previous, current] = [current, previous];
    }
  }

  /**
   * Kümeler: zemine temas gölgesi, iki tonlu yukarı açılan yapraklar ve seyrek çiçekler. Çizilen küme
   * sayısını döner.
   */
  private drawClumps(
    g: Phaser.GameObjects.Graphics,
    palette: Palette,
    season: WeatherFrame['season'],
    keep: number,
  ): number {
    const [minLength, maxLength] = VEGETATION.length;
    const { blades, spread, bladeWidth } = VEGETATION;
    const fan = spread / (blades - 1);
    let drawn = 0;

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
        if (pass === 0) drawn++;
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
    if (bloomShare <= 0) return drawn;
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
    return drawn;
  }

  /**
   * Karın içinden görünen uçlar: küme konumları aynıdır, yalnız karlı yerde kısa, kara karışmış uçlar
   * kar katmanının üstüne çizilir; kar derinleştikçe seyrelir. Yeşillik kar altında tümden silinmez:
   * "hafif yeşillik, üstünde kar birikmesi" okunur. Hiç uç çizildiyse `true`.
   */
  private drawTips(
    tips: Phaser.GameObjects.Graphics,
    field: TerrainField,
    palette: Palette,
    keep: number,
  ): boolean {
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
    return any;
  }
}
