import type Phaser from 'phaser';
import { LIGHT } from '@/config/light';
import { ROCK_VIEW } from '@/config/rockView';
import type { SurfaceSample, WeatherFrame } from '@/sim/weather/WeatherSystem';
import type { Rock, RockField } from '@/sim/world/RockField';
import { daylightColor, mixColor } from '../weather/SeasonGround';
import type { WeatherRect } from '../weather/WeatherParticles';

/** Kayanın görünümünün okuduğu hava: yüzey örneği ve kare. */
export interface RockWeather {
  readonly frame: WeatherFrame;
  sample(x: number, y: number): SurfaceSample;
}

const TWO_PI = Math.PI * 2;
const LIGHT_LENGTH = Math.hypot(LIGHT.x, LIGHT.y) || 1;
/** Işığın geldiği yön (birim vektör): yüzün normali buna ne kadar dönükse o kadar aydınlıktır. */
const TOWARD_LIGHT = { x: -LIGHT.x / LIGHT_LENGTH, y: -LIGHT.y / LIGHT_LENGTH };

function hash(seed: number, index: number): number {
  let value = Math.imul(seed | 0, 73856093) ^ Math.imul(index | 0, 19349663);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

interface Shape {
  readonly rock: Rock;
  /** Dış çokgen köşeleri (merkeze göre birim), [x0, y0, x1, y1, ...]. */
  readonly outer: Float32Array;
  /** Üst düzlem köşeleri: dış çokgenin küçültülmüş, ışığa kaymış hâli. */
  readonly top: Float32Array;
  /** Yan yüz başına aydınlık [0, 1] (normalin ışıkla iç çarpımı) ve küçük sapma. */
  readonly lit: Float32Array;
  readonly tone: Float32Array;
  /** Kenardan içeri kısa kırıklar: [başlangıç köşesi, orta x, orta y, uç x, uç y]. */
  readonly cracks: readonly (readonly number[])[];
  /** Dipteki çakıllar: [x, y, yarıçap]. */
  readonly pebbles: readonly (readonly number[])[];
}

/**
 * Kayaların sunumu: tek bir Graphics, yalnız ekrana değen öbekler çizilir. Her lob, düzensiz bir dış
 * çokgen ve ışığa kaymış düz bir üst düzlemden oluşan yüzlü bir bloktur: yan yüzler normallerinin ışıkla
 * iç çarpımına göre boyanır, böylece kaya yuvarlak bir çizim değil ışık alan bir kütle gibi okunur.
 * Çokgen `Rock.seed`ten türer (iki taraf da aynı kayayı görür). Kar, ıslaklık ve dipteki yosun yüzey
 * örneğinden gelir (yağmurla büyüyen yeşillik kayanın dibine de tırmanır). Fiziğe dokunmaz.
 */
export class RockView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly shapes: readonly (readonly Shape[])[];
  private readonly scratch: number[] = [];
  /** Son karede çizilen lob sayısı (ölçüm). */
  drawn = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly field: RockField,
  ) {
    this.graphics = scene.add.graphics().setDepth(ROCK_VIEW.depth);
    this.shapes = field.outcrops.map((outcrop) =>
      // Üstteki lob altındakini örtsün: ışığa yakın (küçük y) lobu önce çiz.
      [...outcrop.rocks].sort((a, b) => a.y - b.y).map((rock) => this.shape(rock)),
    );
  }

  destroy(): void {
    this.graphics.destroy();
  }

  update(rect: WeatherRect, weather: RockWeather): void {
    const g = this.graphics;
    g.clear();
    this.drawn = 0;
    if (rect.width <= 0 || rect.height <= 0) return;
    const { daylight } = weather.frame;
    const margin = ROCK_VIEW.shadow.length;
    for (let index = 0; index < this.field.outcrops.length; index++) {
      const outcrop = this.field.outcrops[index];
      const reach = outcrop.reach + margin;
      if (
        outcrop.x + reach < rect.x ||
        outcrop.x - reach > rect.x + rect.width ||
        outcrop.y + reach < rect.y ||
        outcrop.y - reach > rect.y + rect.height
      )
        continue;
      const shapes = this.shapes[index];
      // Gölgeler ve çakıllar önce: komşu lobun gölgesi bir lobun üstüne çıkmasın.
      for (const shape of shapes) this.drawGround(g, shape, daylight);
      for (const shape of shapes) {
        this.drawBody(g, shape, weather, daylight);
        this.drawn++;
      }
    }
  }

  private shape(rock: Rock): Shape {
    const count = ROCK_VIEW.vertices;
    const outer = new Float32Array(count * 2);
    const top = new Float32Array(count * 2);
    // Açılar eşit aralıktan titreşir, yarıçaplar komşuyla yumuşatılır: köşeli ama kırık olmayan bir kütle.
    const radii: number[] = [];
    for (let index = 0; index < count; index++)
      radii.push(1 + (hash(rock.seed, index) - 0.5) * 2 * ROCK_VIEW.roughness);
    for (let index = 0; index < count; index++) {
      const smooth =
        (radii[index] * 2 + radii[(index + 1) % count] + radii[(index + count - 1) % count]) / 4;
      const jitter = (hash(rock.seed, 50 + index) - 0.5) * ROCK_VIEW.angleJitter;
      const angle = ((index + jitter) / count) * TWO_PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      outer[index * 2] = cos * rock.radius * smooth;
      outer[index * 2 + 1] = sin * rock.radius * smooth;
      const scale = ROCK_VIEW.top.scale * (0.85 + 0.3 * hash(rock.seed, 80 + index));
      top[index * 2] =
        cos * rock.radius * smooth * scale + TOWARD_LIGHT.x * rock.radius * ROCK_VIEW.top.shift;
      top[index * 2 + 1] =
        sin * rock.radius * smooth * scale + TOWARD_LIGHT.y * rock.radius * ROCK_VIEW.top.shift;
    }

    const lit = new Float32Array(count);
    const tone = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      // Yüzün normali: dış kenar ortasından üst kenar ortasına bakışın tersidir (yamaç dışarı iner).
      const nx = (outer[index * 2] + outer[next * 2]) / 2 - (top[index * 2] + top[next * 2]) / 2;
      const ny =
        (outer[index * 2 + 1] + outer[next * 2 + 1]) / 2 -
        (top[index * 2 + 1] + top[next * 2 + 1]) / 2;
      const length = Math.hypot(nx, ny) || 1;
      const dot = (nx / length) * TOWARD_LIGHT.x + (ny / length) * TOWARD_LIGHT.y;
      lit[index] = 0.5 + 0.5 * dot;
      tone[index] = (hash(rock.seed, 120 + index) - 0.5) * 2 * ROCK_VIEW.variance;
    }

    const cracks: number[][] = [];
    for (let crack = 0; crack < ROCK_VIEW.cracks; crack++) {
      const start = Math.floor(hash(rock.seed, 200 + crack) * count);
      const ox = outer[start * 2];
      const oy = outer[start * 2 + 1];
      const depth = 0.22 + 0.2 * hash(rock.seed, 210 + crack);
      const kink = (hash(rock.seed, 220 + crack) - 0.5) * 0.5 * rock.radius * 0.3;
      // İçeri doğru (merkeze) iki parçalı kırık; ortası yana kırılır.
      cracks.push([
        start,
        ox * (1 - depth * 0.5) - oy * (kink / rock.radius),
        oy * (1 - depth * 0.5) + ox * (kink / rock.radius),
        ox * (1 - depth),
        oy * (1 - depth),
      ]);
    }
    const pebbles: number[][] = [];
    for (let pebble = 0; pebble < ROCK_VIEW.pebbles; pebble++) {
      const angle = hash(rock.seed, 300 + pebble) * TWO_PI;
      const distance = rock.radius * (1.05 + 0.18 * hash(rock.seed, 310 + pebble));
      pebbles.push([
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        rock.radius * (0.022 + 0.03 * hash(rock.seed, 320 + pebble)),
      ]);
    }
    return { rock, outer, top, lit, tone, cracks, pebbles };
  }

  /** Köşeleri `scale` ve kaymayla dönüştürüp doldurur (düz dolgu). */
  private fillPolygon(
    g: Phaser.GameObjects.Graphics,
    shape: Shape,
    points: Float32Array,
    scale: number,
    dx: number,
    dy: number,
    color: number,
    alpha: number,
  ): void {
    const { rock } = shape;
    const path = this.scratch;
    path.length = 0;
    for (let index = 0; index < points.length; index += 2)
      path.push(rock.x + dx + points[index] * scale, rock.y + dy + points[index + 1] * scale);
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(path[0], path[1]);
    for (let index = 2; index < path.length; index += 2) g.lineTo(path[index], path[index + 1]);
    g.closePath();
    g.fillPath();
  }

  /** Zemine oturma: yumuşak dış gölge, dibe oturan koyu temas gölgesi ve etraftaki çakıllar. */
  private drawGround(g: Phaser.GameObjects.Graphics, shape: Shape, daylight: number): void {
    const { rock } = shape;
    const length = ROCK_VIEW.shadow.length * rock.height;
    const { color, alpha } = ROCK_VIEW.shadow;
    this.fillPolygon(
      g,
      shape,
      shape.outer,
      1.06,
      LIGHT.x * length,
      LIGHT.y * length,
      color,
      alpha * 0.5,
    );
    this.fillPolygon(
      g,
      shape,
      shape.outer,
      1.0,
      LIGHT.x * length * 0.45,
      LIGHT.y * length * 0.45,
      color,
      alpha,
    );
    const pebble = daylightColor(ROCK_VIEW.palette.dark, daylight);
    for (const [x, y, radius] of shape.pebbles) {
      g.fillStyle(color, alpha * 0.8);
      g.fillCircle(rock.x + x + LIGHT.x * radius, rock.y + y + LIGHT.y * radius, radius);
      g.fillStyle(pebble, 1);
      g.fillCircle(rock.x + x, rock.y + y, radius);
    }
  }

  private drawBody(
    g: Phaser.GameObjects.Graphics,
    shape: Shape,
    weather: RockWeather,
    daylight: number,
  ): void {
    const { rock, outer, top, lit, tone } = shape;
    const surface = weather.sample(rock.x, rock.y);
    const palette = ROCK_VIEW.palette;
    const count = lit.length;
    const wet = surface.wetness * ROCK_VIEW.wetDarken;
    const snow = Math.min(1, surface.snowDepth / ROCK_VIEW.snow.fullDepth);
    const tint = (color: number): number => daylightColor(mixColor(color, 0x1d1b18, wet), daylight);

    // Yan yüzler: normal ışığa döndükçe açık, döndükçe koyu; kar yüzleri üstten başlayarak örter.
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const t = Math.max(0, Math.min(1, lit[index] + tone[index]));
      let color = mixColor(palette.dark, palette.light, t);
      if (snow > 0.02) color = mixColor(color, ROCK_VIEW.snow.shade, snow * (0.3 + 0.55 * t));
      g.fillStyle(tint(color), 1);
      g.beginPath();
      g.moveTo(rock.x + outer[index * 2], rock.y + outer[index * 2 + 1]);
      g.lineTo(rock.x + outer[next * 2], rock.y + outer[next * 2 + 1]);
      g.lineTo(rock.x + top[next * 2], rock.y + top[next * 2 + 1]);
      g.lineTo(rock.x + top[index * 2], rock.y + top[index * 2 + 1]);
      g.closePath();
      g.fillPath();
    }

    // Kırıklar kenardan başlar: yüzlerin üstünde ince koyu çizgi.
    g.lineStyle(Math.max(1, rock.radius * 0.025), tint(palette.crack), 0.6);
    for (const [start, mx, my, ex, ey] of shape.cracks) {
      g.beginPath();
      g.moveTo(rock.x + outer[start * 2], rock.y + outer[start * 2 + 1]);
      g.lineTo(rock.x + mx, rock.y + my);
      g.lineTo(rock.x + ex, rock.y + ey);
      g.strokePath();
    }

    // Üst düzlem en açık yüzdür; kar yağınca beyazlaşır.
    let topColor: number = palette.top;
    if (snow > 0.02)
      topColor = mixColor(topColor, ROCK_VIEW.snow.color, snow * ROCK_VIEW.snow.alpha);
    this.fillPolygon(g, shape, top, 1, 0, 0, tint(topColor), 1);

    // Kenar çizgisi (koyu) ve ışık yüzündeki parlak kenar: kütleyi zeminden ayırır.
    g.lineStyle(Math.max(1.2, rock.radius * 0.035), tint(palette.rim), 0.85);
    g.beginPath();
    g.moveTo(rock.x + outer[0], rock.y + outer[1]);
    for (let index = 1; index < count; index++)
      g.lineTo(rock.x + outer[index * 2], rock.y + outer[index * 2 + 1]);
    g.closePath();
    g.strokePath();
    g.lineStyle(Math.max(1, rock.radius * 0.03), tint(palette.glint), 0.55);
    for (let index = 0; index < count; index++) {
      if (lit[index] < 0.72) continue;
      const next = (index + 1) % count;
      g.lineBetween(
        rock.x + top[index * 2],
        rock.y + top[index * 2 + 1],
        rock.x + top[next * 2],
        rock.y + top[next * 2 + 1],
      );
    }

    if (surface.growth > 0.04) this.drawMoss(g, rock, surface.growth * (1 - snow * 0.7), daylight);
  }

  /** Kayanın dibinde, gölge tarafında büyüyen yeşil tutamlar; yağmurla sayı ve boy artar. */
  private drawMoss(
    g: Phaser.GameObjects.Graphics,
    rock: Rock,
    growth: number,
    daylight: number,
  ): void {
    const moss = ROCK_VIEW.moss;
    const shown = Math.ceil(moss.count * growth);
    for (let index = 0; index < shown; index++) {
      // Tutamlar gölge yönüne (ışığın tersi) doğru kenarda toplanır.
      const spread = (hash(rock.seed, 400 + index) - 0.5) * 2.2;
      const angle = Math.atan2(LIGHT.y, LIGHT.x) + spread;
      const size =
        rock.radius * moss.size * (0.5 + 0.5 * growth) * (0.7 + hash(rock.seed, 500 + index) * 0.6);
      const x = rock.x + Math.cos(angle) * rock.radius * 0.97;
      const y = rock.y + Math.sin(angle) * rock.radius * 0.97;
      g.fillStyle(daylightColor(moss.dark, daylight), 0.9);
      g.fillEllipse(x, y + size * 0.15, size * 2.1, size * 1.3);
      g.fillStyle(daylightColor(moss.color, daylight), 0.95);
      g.fillEllipse(x - size * 0.1, y, size * 1.6, size);
    }
  }
}
