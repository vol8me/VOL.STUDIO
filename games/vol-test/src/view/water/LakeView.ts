import Phaser from 'phaser';
import { clamp01 } from '@volstudio/core';
import { LAKE } from '@/config/lakes';
import { SEASONS } from '@/config/seasons';
import { WATER_VIEW } from '@/config/waterView';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';
import type { Lake, LakeField } from '@/sim/world/LakeField';
import { daylightColor, mixColor } from '../weather/SeasonGround';
import type { WeatherRect } from '../weather/WeatherParticles';

/** Donma [0, 1]: sıcaklığa bağlıdır, kar yağarken biraz öne geçer. Göl kıyıdan merkeze doğru donar. */
export function iceThickness(frame: Pick<WeatherFrame, 'temperature' | 'snow'>): number {
  const { freezeAt, span, snowBoost } = WATER_VIEW.ice;
  const cold = clamp01((freezeAt - frame.temperature) / span);
  return cold === 0 ? 0 : clamp01(cold + frame.snow * snowBoost * cold);
}

/** Buzun iç sınırı (kıyı oranı): kıyıda 1, tam donmada merkeze yakın. `s` bundan büyükse buz vardır. */
export function iceFront(ice: number): number {
  return 1 - 0.97 * clamp01(ice);
}

type Point = Phaser.Math.Vector2;

const TWO_PI = Math.PI * 2;

/** 0xRRGGBB rengini canvas `rgba()` dizgisine çevirir. */
function hex(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}

function hash(a: number, b: number, c: number): number {
  let value = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export interface WaterColors {
  readonly bank: number;
  readonly shallow: number;
  readonly deep: number;
}

/** Mevsim paleti: geçiş döneminde bir sonraki mevsime karışır (`seasonPalette` ile aynı eğri). */
export function waterColors(
  frame: Pick<WeatherFrame, 'season' | 'seasonProgress' | 'daylight'>,
): WaterColors {
  const current = WATER_VIEW.palette[frame.season];
  const order = SEASONS.order;
  const next = WATER_VIEW.palette[order[(order.indexOf(frame.season) + 1) % order.length]];
  const fraction = SEASONS.transitionFraction;
  const phase = clamp01((frame.seasonProgress - (1 - fraction)) / fraction);
  const t = phase * phase * (3 - 2 * phase);
  return {
    bank: daylightColor(mixColor(current.bank, next.bank, t), frame.daylight),
    shallow: daylightColor(mixColor(current.shallow, next.shallow, t), frame.daylight),
    deep: daylightColor(mixColor(current.deep, next.deep, t), frame.daylight),
  };
}

/**
 * Sabit göllerin sunumu: tek bir Graphics, yalnız ekrana değen göller çizilir. Derinlik bantları
 * `LakeField`in derinlik eğrisinden gelir (kıyı oranı -> derinlik), yani gözün okuduğu derinlik ile
 * fiziğin derinliği aynıdır. Dalga çizgileri, köpük, kış buzu ve yağmur halkaları salt sunumdur;
 * kare başına yalnız bu çizgilerin konumu hesaplanır, geometri `LakeField`den okunur.
 */
interface Baked {
  readonly lake: Lake;
  readonly image: Phaser.GameObjects.Image;
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly context: CanvasRenderingContext2D;
  readonly originX: number;
  readonly originY: number;
  signature: string;
  bakedAt: number;
}

export class LakeView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly baked: Baked[] = [];
  private readonly points: Point[] = Array.from(
    { length: LAKE.outlinePoints },
    () => new Phaser.Math.Vector2(),
  );
  private readonly inner: Point[] = Array.from(
    { length: LAKE.outlinePoints },
    () => new Phaser.Math.Vector2(),
  );
  /** Hareketli çizgiler yarı çözünürlüklü kıyı çokgeni kullanır: yarı sayıda nokta, aynı görüntü. */
  private readonly coarse: Point[] = Array.from(
    { length: LAKE.outlinePoints / 2 },
    () => new Phaser.Math.Vector2(),
  );
  /** Göl başına çatlakların yön açıları (kıyıdan merkeze doğru kırık çizgi). */
  private readonly cracks: ReadonlyMap<number, readonly (readonly number[])[]>;
  /** Son karede ekrana değen göl sayısı (ölçüm). */
  visibleLakes = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly field: LakeField,
  ) {
    // Hareketli çizgiler (dalga, köpük, buz, halka) bantların hemen üstündedir.
    this.graphics = scene.add.graphics().setDepth(WATER_VIEW.depth + 0.1);
    for (const lake of field.lakes) {
      const { scale, margin } = WATER_VIEW.bake;
      const half = lake.reach + margin;
      const size = Math.ceil(half * 2 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Göl dokusu için 2B canvas bağlamı alınamadı');
      const key = `lake-${lake.id}`;
      const texture = scene.textures.addCanvas(key, canvas);
      if (!texture) throw new Error(`Göl dokusu kaydedilemedi: ${lake.id}`);
      const image = scene.add
        .image(lake.x - half, lake.y - half, key)
        .setOrigin(0, 0)
        .setScale(1 / scale)
        .setDepth(WATER_VIEW.depth);
      this.baked.push({
        lake,
        image,
        texture,
        context,
        originX: lake.x - half,
        originY: lake.y - half,
        signature: '',
        bakedAt: Number.NEGATIVE_INFINITY,
      });
    }
    const cracks = new Map<number, (readonly number[])[]>();
    for (const lake of field.lakes) {
      const list: number[][] = [];
      for (let index = 0; index < WATER_VIEW.ice.cracks; index++) {
        const base = hash(lake.index, index, 1) * TWO_PI;
        list.push(
          [0, 1, 2, 3, 4].map((step) => base + (hash(lake.index, index, 10 + step) - 0.5) * 0.7),
        );
      }
      cracks.set(lake.index, list);
    }
    this.cracks = cracks;
  }

  destroy(): void {
    this.graphics.destroy();
    for (const entry of this.baked) {
      entry.image.destroy();
      entry.texture.destroy();
    }
  }

  /** Ekrana değen her gölü çizer; `quality` [0, 1] dalga ve halka sayısını azaltır. */
  update(rect: WeatherRect, frame: WeatherFrame, quality = 1): void {
    this.graphics.clear();
    this.visibleLakes = 0;
    if (rect.width <= 0 || rect.height <= 0) return;
    const colors = waterColors(frame);
    const ice = iceThickness(frame);
    for (const entry of this.baked) {
      const lake = entry.lake;
      const visible =
        lake.x + lake.reach >= rect.x &&
        lake.x - lake.reach <= rect.x + rect.width &&
        lake.y + lake.reach >= rect.y &&
        lake.y - lake.reach <= rect.y + rect.height;
      entry.image.setVisible(visible);
      if (!visible) continue;
      this.visibleLakes++;
      this.bake(entry, colors, ice, frame.elapsedMs);
      this.drawLake(lake, frame.elapsedMs, ice, frame.rain, quality);
    }
  }

  /**
   * Durağan bantları göl dokusuna basar: kıyı şeridi ve derinlik halkaları. Renkler (mevsim,
   * gün ışığı) değişince, en sık `bake.minIntervalMs` aralığıyla yeniden basılır.
   */
  private bake(entry: Baked, colors: WaterColors, ice: number, time: number): void {
    // Buz yavaş ilerler: kademelendirilir, böylece donma sırasında doku seyrek yeniden basılır.
    const steps = Math.round(ice * WATER_VIEW.ice.steps);
    const signature = `${colors.bank}.${colors.shallow}.${colors.deep}.${steps}`;
    if (signature === entry.signature) return;
    if (entry.signature !== '' && time - entry.bakedAt < WATER_VIEW.bake.minIntervalMs) return;
    entry.signature = signature;
    entry.bakedAt = time;
    const { scale } = WATER_VIEW.bake;
    const c = entry.context;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    this.fillPolygon(entry, 1 + LAKE.bank, colors.bank, WATER_VIEW.bankAlpha, scale);
    for (const s of WATER_VIEW.bands) {
      const depth = this.field.depthOfRatio(s);
      this.fillPolygon(
        entry,
        s,
        mixColor(colors.shallow, colors.deep, Math.pow(depth, 0.85)),
        WATER_VIEW.shallowAlpha + (WATER_VIEW.deepAlpha - WATER_VIEW.shallowAlpha) * depth,
        scale,
      );
    }
    if (steps > 0) this.bakeIce(entry, steps / WATER_VIEW.ice.steps, scale);
    entry.texture.refresh();
  }

  /**
   * Buz halkası: kıyıdan `iceFront`a kadar. Dış kenar kıyıdır, iç kenar donma cephesidir; bir
   * yol iki alt yoldan kurulur ve çift-tek kuralıyla doldurulur, ortası su olarak kalır. Cephede
   * ince, daha koyu bir şerit buzun incelmesini söyler; çatlaklar kıyıdan merkeze uzanır.
   */
  private bakeIce(entry: Baked, ice: number, scale: number): void {
    const { color, shade, crack, alpha } = WATER_VIEW.ice;
    const lake = entry.lake;
    const c = entry.context;
    const front = iceFront(ice);
    const toPixels = (point: Point, index: number): void => {
      const x = (point.x - entry.originX) * scale;
      const y = (point.y - entry.originY) * scale;
      if (index === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    };
    const ring = (inner: number, fill: number, opacity: number): void => {
      this.trace(lake, 1, this.points);
      this.trace(lake, inner, this.inner);
      c.beginPath();
      this.points.forEach(toPixels);
      c.closePath();
      this.inner.forEach(toPixels);
      c.closePath();
      c.fillStyle = hex(fill, opacity);
      c.fill('evenodd');
    };
    ring(front, color, alpha * (0.55 + 0.45 * ice));
    // İnce buz cephede: iç kenara yakın şerit biraz koyudur (altındaki su görünür).
    const band = Math.min(0.1, (1 - front) * 0.35);
    this.trace(lake, front + band, this.points);
    this.trace(lake, front, this.inner);
    c.beginPath();
    this.points.forEach(toPixels);
    c.closePath();
    this.inner.forEach(toPixels);
    c.closePath();
    c.fillStyle = hex(shade, 0.35 * ice + 0.1);
    c.fill('evenodd');

    c.strokeStyle = hex(crack, 0.55 * ice);
    c.lineWidth = Math.max(1, 1.4 * scale * 3);
    c.lineJoin = 'round';
    for (const angles of this.cracks.get(lake.index) ?? []) {
      c.beginPath();
      let started = false;
      for (let step = 0; step < angles.length; step++) {
        const r = 1 - step * 0.2;
        if (r < front - 0.02) break;
        const bound = this.field.boundAt(lake, angles[step]);
        const u = Math.cos(angles[step]) * lake.rx * bound * r;
        const v = Math.sin(angles[step]) * lake.ry * bound * r;
        const x = (lake.x + u * lake.cos - v * lake.sin - entry.originX) * scale;
        const y = (lake.y + u * lake.sin + v * lake.cos - entry.originY) * scale;
        if (started) c.lineTo(x, y);
        else c.moveTo(x, y);
        started = true;
      }
      c.stroke();
    }
  }

  /** Bir bandı doku bağlamına doldurur (kıyı oranı `s`, dünya birimi -> doku pikseli `scale`). */
  private fillPolygon(entry: Baked, s: number, color: number, alpha: number, scale: number): void {
    const c = entry.context;
    this.trace(entry.lake, s, this.points);
    c.beginPath();
    for (let index = 0; index < this.points.length; index++) {
      const x = (this.points[index].x - entry.originX) * scale;
      const y = (this.points[index].y - entry.originY) * scale;
      if (index === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = hex(color, alpha);
    c.fill();
  }

  private drawLake(lake: Lake, time: number, ice: number, rain: number, quality: number): void {
    this.drawWaves(lake, time, quality);
    this.drawFoam(lake, time);
    if (ice > 0.001) this.drawFrostLine(lake, time, ice);
    if (rain > 0.05) this.drawRipples(lake, time, rain, quality, iceFront(ice));
  }

  /** Kıyı çokgenini `scale` oranında `out`a yazar (dalgalı kıyı harmonikleriyle). */
  private trace(lake: Lake, scale: number, out: Point[]): void {
    const count = out.length;
    for (let index = 0; index < count; index++) {
      const theta = (index / count) * TWO_PI;
      const bound = this.field.boundAt(lake, theta);
      const u = Math.cos(theta) * lake.rx * bound * scale;
      const v = Math.sin(theta) * lake.ry * bound * scale;
      out[index].x = lake.x + u * lake.cos - v * lake.sin;
      out[index].y = lake.y + u * lake.sin + v * lake.cos;
    }
  }

  /** Derinlik üzerinde süzülen yumuşak çizgiler: suyun hafif dalgalandığını söyler. */
  private drawWaves(lake: Lake, time: number, quality: number): void {
    const { lines, color, alpha, width, amplitude, speed, segments } = WATER_VIEW.waves;
    const g = this.graphics;
    const shown = Math.max(1, Math.round(lines.length * (0.5 + quality / 2)));
    const coarse = this.coarse;
    const count = coarse.length;
    const step = count / segments;
    g.lineStyle(width, color, alpha);
    for (let line = 0; line < shown; line++) {
      const s = lines[line] + amplitude * Math.sin(time * speed + line * 2.1 + lake.index * 0.7);
      this.trace(lake, s, coarse);
      // Bir çizgideki bütün parçalar tek yolda toplanır: tek çizim komutu.
      g.beginPath();
      for (let segment = 0; segment < segments; segment++) {
        if (Math.sin(segment * 0.9 + time * speed * 1.7 + line * 1.3) < -0.1) continue;
        const from = Math.floor(segment * step);
        const to = Math.floor((segment + 0.7) * step);
        g.moveTo(coarse[from % count].x, coarse[from % count].y);
        for (let at = from + 1; at <= to; at++)
          g.lineTo(coarse[at % count].x, coarse[at % count].y);
      }
      g.strokePath();
    }
  }

  /** Kıyıda yanıp sönen köpük şeridi ve ince kıyı çizgisi. */
  private drawFoam(lake: Lake, time: number): void {
    const { color, alpha, width, inset, breathe, segments, speed } = WATER_VIEW.foam;
    const g = this.graphics;
    const coarse = this.coarse;
    this.trace(lake, 1, coarse);
    g.lineStyle(WATER_VIEW.shoreline.width, WATER_VIEW.shoreline.color, WATER_VIEW.shoreline.alpha);
    g.strokePoints(coarse, true, true);

    const count = coarse.length;
    const step = count / segments;
    // Köpük iki yoğunlukta toplanır: güçlü parçalar bir yolda, zayıflar öteki yolda.
    for (const strong of [false, true]) {
      g.lineStyle(width, color, alpha * (strong ? 1 : 0.45));
      g.beginPath();
      for (let segment = 0; segment < segments; segment++) {
        const pulse = Math.sin(segment * 1.7 + time * speed + lake.index);
        if (pulse < -0.35 || pulse > 0.4 !== strong) continue;
        const theta = (segment / segments) * TWO_PI;
        const toward =
          inset + breathe * Math.sin(time * speed * 1.3 + theta * 3 + lake.index) + breathe;
        const from = Math.floor(segment * step);
        const to = Math.floor((segment + 1) * step);
        for (let at = from; at <= to; at++) {
          const point = coarse[at % count];
          const x = point.x + (lake.x - point.x) * toward;
          const y = point.y + (lake.y - point.y) * toward;
          if (at === from) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }
      g.strokePath();
    }
  }

  /** Donma cephesinde hafif titreşen ışıklı çizgi: buzun kenarı su ile buluşur. */
  private drawFrostLine(lake: Lake, time: number, ice: number): void {
    const { crack } = WATER_VIEW.ice;
    const front = iceFront(ice);
    const shimmer = 0.35 + 0.15 * Math.sin(time * 0.0016 + lake.index);
    this.graphics.lineStyle(1.8, crack, shimmer * ice);
    this.trace(lake, front, this.coarse);
    this.graphics.strokePoints(this.coarse, true, true);
  }

  /** Yağmurda su yüzünde genişleyen halkalar; buzun altına düşenler çizilmez. */
  private drawRipples(
    lake: Lake,
    time: number,
    rain: number,
    quality: number,
    front: number,
  ): void {
    const { periodMs, maxRadius, perLake, color, alpha } = WATER_VIEW.ripple;
    const g = this.graphics;
    const count = Math.max(1, Math.round(perLake * rain * quality));
    for (let index = 0; index < count; index++) {
      const clock = time + index * 977;
      const slot = Math.floor(clock / periodMs);
      const phase = (clock % periodMs) / periodMs;
      const s = 0.12 + hash(lake.index, index, slot) * 0.7;
      if (s >= front - 0.03) continue;
      const theta = hash(lake.index, index, slot + 4093) * TWO_PI;
      const bound = this.field.boundAt(lake, theta);
      const u = Math.cos(theta) * lake.rx * bound * s;
      const v = Math.sin(theta) * lake.ry * bound * s;
      const x = lake.x + u * lake.cos - v * lake.sin;
      const y = lake.y + u * lake.sin + v * lake.cos;
      const radius = maxRadius * phase;
      g.lineStyle(1.2, color, alpha * rain * (1 - phase));
      g.strokeEllipse(x, y, radius * 2, radius * 1.1);
    }
  }
}
