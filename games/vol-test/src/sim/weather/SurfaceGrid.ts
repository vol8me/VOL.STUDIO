import { clamp, clamp01, lerp } from '@volstudio/core/math/interpolation';
import { createRandom, valueNoise } from '@volstudio/core/random';
import { WEATHER } from '@/config/weather';
import type { SurfaceCell, SurfaceSample, SurfaceSnapshot, WeatherState } from './types';

interface StoredCell {
  wetness: number;
  puddle: number;
  snowWater: number;
  compaction: number;
  /** Yeşillik örtüsü [0, `fertility`]: yağmurla büyür, kuraklık, don ve kar örtüsüyle çekilir. */
  growth: number;
  readonly drain: number;
  /** Zeminin yeşillik taşıma gücü [0, 1]: sabit coğrafyadır, ekilebilir yamalar ve engel maskesi. */
  readonly fertility: number;
}

/** Bir noktanın yeşillik taşıma gücü çarpanı [0, 1]; göl ve kaya gibi yerleri 0'a indirir. */
export type FertilityMask = (x: number, y: number) => number;

const quantize = (value: number): number => Math.round(clamp01(value) * 255);

/** Sürmekte olan yumuşak uyum: her kanalın hedefe kalan farkı ve kalan süre. */
interface Blend {
  remainingMs: number;
  readonly wetness: Float32Array;
  readonly puddle: Float32Array;
  readonly snowWater: Float32Array;
  readonly compaction: Float32Array;
  readonly growth: Float32Array;
}

export class SurfaceGrid {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  private readonly cells: StoredCell[];
  private blend: Blend | null = null;

  constructor(
    private readonly width: number,
    private readonly height: number,
    seed: number,
    mask: FertilityMask = () => 1,
  ) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new RangeError('Zemin ölçüleri sonlu ve pozitif olmalı.');
    let cellSize = Math.max(
      WEATHER.surface.cellSize,
      Math.sqrt(width / WEATHER.surface.maxCells) * Math.sqrt(height),
    );
    while (Math.ceil(width / cellSize) * Math.ceil(height / cellSize) > WEATHER.surface.maxCells)
      cellSize *= 1.1;
    this.cellSize = cellSize;
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    const random = createRandom(seed);
    const growth = WEATHER.growth;
    this.cells = Array.from({ length: this.columns * this.rows }, (_, index) => {
      const x = ((index % this.columns) + 0.5) * cellSize;
      const y = (Math.floor(index / this.columns) + 0.5) * cellSize;
      // İki oktav: büyük yamalar ve kenarları dağıtan ince gürültü; eşik yamaları seyrekleştirir.
      const noise =
        valueNoise(x / growth.patchSize, y / growth.patchSize, seed) * 0.88 +
        valueNoise(x / (growth.patchSize * 0.3), y / (growth.patchSize * 0.3), seed ^ 0x5bd1) *
          0.12;
      const patch = clamp01(
        (noise - growth.threshold[0]) / (growth.threshold[1] - growth.threshold[0]),
      );
      const fertility = patch * patch * (3 - 2 * patch) * clamp01(mask(x, y));
      return {
        wetness: 0,
        puddle: 0,
        snowWater: 0,
        compaction: 0,
        growth: fertility * growth.initial,
        drain: WEATHER.surface.soilDrainMetresPerSecond * (0.5 + random.next()),
        fertility,
      };
    });
  }

  step(frame: WeatherState, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError('Zemin adımı sonlu ve negatif olmayan bir sayı olmalı.');
    const config = WEATHER.surface;
    const growth = WEATHER.growth;
    const rain = frame.rain * config.rainMetresPerSecond * seconds;
    const snow = frame.snow * config.snowWaterMetresPerSecond * seconds;
    const warmth = Math.max(0, frame.temperature);
    const dry = (1 - frame.rain) * Math.max(0, frame.temperature / 12);
    // Büyüme sabitleri hücreden bağımsızdır: adım başına bir kez hesaplanır, döngü yalnız toplar.
    const thermal = clamp01(
      (frame.temperature - growth.minTemperature) /
        (growth.idealTemperature - growth.minTemperature),
    );
    const growRate = growth.growPerSecond * thermal;
    const wiltRate = growth.wiltPerSecond * (thermal > 0 ? 1 : growth.dormantWilt);
    const hardyFloor = growth.hardyFloor;
    const frostRate = frame.temperature <= growth.frostTemperature ? growth.frostPerSecond : 0;
    const smotherRate = growth.snowSmotherPerSecond;
    // Kar örtüsü: yüklü kar su eşdeğeri / yoğunluk = derinlik; `snowSmotherDepth`te tam örtü.
    const smotherScale = 1 / (config.looseSnowDensity * growth.snowSmotherDepth);
    const puddleScale = 1 / config.maxPuddleDepth;
    const moistureSpan = 1 / (1 - growth.minMoisture);
    // Hücreden bağımsız çarpanlar adım başına bir kez hesaplanır (hücre başına üstel ve çarpım yok).
    const snowCapacity = config.maxSnowDepth * config.looseSnowDensity;
    const settle = Math.exp(-snow * config.freshSnowCompactionDecay);
    const meltCapacity = warmth * config.meltMetresPerDegreeSecond * seconds;
    const dryWetness = dry * config.wetDryPerSecond * seconds;
    const dryPuddle = dry * config.puddleDryMetresPerSecond * seconds;
    const maxPuddle = config.maxPuddleDepth;
    for (const cell of this.cells) {
      let snowWater = cell.snowWater + snow;
      if (snowWater > snowCapacity) snowWater = snowCapacity;
      cell.compaction *= settle;
      const melt = snowWater < meltCapacity ? snowWater : meltCapacity;
      snowWater -= melt;
      cell.snowWater = snowWater;
      if (snowWater === 0) cell.compaction = 0;
      const water = rain + melt;
      let wetness = cell.wetness + water * config.wetnessPerMetre - dryWetness;
      if (wetness < 0) wetness = 0;
      else if (wetness > 1) wetness = 1;
      cell.wetness = wetness;
      let puddle = cell.puddle + water - cell.drain * seconds - dryPuddle;
      if (puddle < 0) puddle = 0;
      else if (puddle > maxPuddle) puddle = maxPuddle;
      cell.puddle = puddle;
      const fertility = cell.fertility;
      if (fertility === 0) continue;
      // Nem: ıslak toprak ve birikinti büyütür. Yağmur yağarken, ıslaklık sönene dek ve birikinti
      // varken büyüme sürer; kuru zemin yeşilliği yavaşça çeker.
      let moisture = cell.wetness;
      const pooled = cell.puddle * puddleScale;
      if (pooled > moisture) moisture = pooled;
      moisture = (moisture - growth.minMoisture) * moistureSpan;
      if (moisture < 0) moisture = 0;
      let cover = cell.snowWater * smotherScale;
      if (cover > 1) cover = 1;
      // Soğukta bitki uykudadır (kuruma `dormantWilt` ile yavaşlar); don ve kar örtüsü ek çeker.
      const rate =
        growRate * moisture * (1 - cover) -
        wiltRate * (1 - moisture) -
        frostRate -
        smotherRate * cover;
      let next = cell.growth + rate * seconds;
      // Dayanıklı çim: kuraklık, don ve kar örtüyü bu tabana kadar çeker, tümden öldürmez (kar altında ve
      // kışın seyrek yeşillik görünür kalır). Ezilerek tabanın altına inen örtü yağmurla yeniden büyür.
      const floor = fertility * hardyFloor;
      if (rate < 0 && next < floor) next = cell.growth < floor ? cell.growth : floor;
      if (next < 0) next = 0;
      else if (next > fertility) next = fertility;
      cell.growth = next;
    }
    this.applyBlend(seconds * 1000);
  }

  sample(x: number, y: number, frame: WeatherState): SurfaceSample {
    return this.sampleCell(this.cells[this.index(x, y)], frame);
  }

  cell(column: number, row: number, frame: WeatherState): SurfaceCell | undefined {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    )
      return undefined;
    const x = column * this.cellSize;
    const y = row * this.cellSize;
    return {
      ...this.sampleCell(this.cells[row * this.columns + column], frame),
      x,
      y,
      width: Math.min(this.cellSize, this.width - x),
      height: Math.min(this.cellSize, this.height - y),
    };
  }

  compress(x: number, y: number, amount: number): void {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError('Kar sıkışma miktarı sonlu ve negatif olmayan bir sayı olmalı.');
    const cell = this.cells[this.index(x, y)];
    if (cell.snowWater > 0)
      cell.compaction = clamp01(1 - (1 - cell.compaction) * Math.exp(-amount));
  }

  /** Araç paletinin ezdiği yeşillik: büyüme `amount` oranında üstel azalır (negatif olmaz). */
  trample(x: number, y: number, amount: number): void {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError('Ezilme miktarı sonlu ve negatif olmayan bir sayı olmalı.');
    const cell = this.cells[this.index(x, y)];
    if (cell.growth > 0) cell.growth *= Math.exp(-amount);
  }

  /** Bütün hücre durumunu sıkıştırılmış baytlara yazar (ağ ve kalıcılık; 1/255 çözünürlük). */
  snapshot(): SurfaceSnapshot {
    const config = WEATHER.surface;
    const count = this.cells.length;
    const out: SurfaceSnapshot = {
      columns: this.columns,
      rows: this.rows,
      wetness: new Uint8Array(count),
      puddle: new Uint8Array(count),
      snow: new Uint8Array(count),
      compaction: new Uint8Array(count),
      growth: new Uint8Array(count),
    };
    const snowCapacity = config.maxSnowDepth * config.looseSnowDensity;
    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      out.wetness[index] = quantize(cell.wetness);
      out.puddle[index] = quantize(cell.puddle / config.maxPuddleDepth);
      out.snow[index] = quantize(cell.snowWater / snowCapacity);
      out.compaction[index] = quantize(cell.compaction);
      out.growth[index] = quantize(cell.growth);
    }
    return out;
  }

  /**
   * `snapshot`a `durationMs` içinde doğrusal olarak yaklaşır: hücreler sert yazılmaz, `step` her adımda farkın
   * kalan süreye oranını uygular. Sürmekte olan uyum varsa yenisi güncel hücreden yeniden hesaplanır.
   * Uyuşmayan ölçüde `false` döner ve hiçbir şey değişmez.
   */
  blendToward(snapshot: SurfaceSnapshot, durationMs: number): boolean {
    const count = this.cells.length;
    if (
      !(durationMs > 0) ||
      snapshot.columns !== this.columns ||
      snapshot.rows !== this.rows ||
      [snapshot.wetness, snapshot.puddle, snapshot.snow, snapshot.compaction, snapshot.growth].some(
        (field) => field.length !== count,
      )
    )
      return false;
    const config = WEATHER.surface;
    const snowCapacity = config.maxSnowDepth * config.looseSnowDensity;
    const blend: Blend = this.blend ?? {
      remainingMs: 0,
      wetness: new Float32Array(count),
      puddle: new Float32Array(count),
      snowWater: new Float32Array(count),
      compaction: new Float32Array(count),
      growth: new Float32Array(count),
    };
    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      blend.wetness[index] = snapshot.wetness[index] / 255 - cell.wetness;
      blend.puddle[index] = (snapshot.puddle[index] / 255) * config.maxPuddleDepth - cell.puddle;
      blend.snowWater[index] = (snapshot.snow[index] / 255) * snowCapacity - cell.snowWater;
      blend.compaction[index] = snapshot.compaction[index] / 255 - cell.compaction;
      blend.growth[index] = Math.min(cell.fertility, snapshot.growth[index] / 255) - cell.growth;
    }
    blend.remainingMs = durationMs;
    this.blend = blend;
    return true;
  }

  /** Sürmekte olan uyumun bu adıma düşen payını hücrelere uygular (`step` sonunda çağrılır). */
  private applyBlend(ms: number): void {
    const blend = this.blend;
    if (!blend) return;
    const share = ms >= blend.remainingMs ? 1 : ms / blend.remainingMs;
    blend.remainingMs -= ms;
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      cell.wetness = clamp01(cell.wetness + blend.wetness[index] * share);
      cell.puddle = Math.max(0, cell.puddle + blend.puddle[index] * share);
      cell.snowWater = Math.max(0, cell.snowWater + blend.snowWater[index] * share);
      cell.compaction = clamp01(cell.compaction + blend.compaction[index] * share);
      cell.growth = clamp(cell.growth + blend.growth[index] * share, 0, cell.fertility);
      // Kalan fark bu adımın payı kadar azalır: sonraki adım kalan süreye göre orantılanır.
      blend.wetness[index] *= 1 - share;
      blend.puddle[index] *= 1 - share;
      blend.snowWater[index] *= 1 - share;
      blend.compaction[index] *= 1 - share;
      blend.growth[index] *= 1 - share;
    }
    if (blend.remainingMs <= 0) this.blend = null;
  }

  /**
   * `snapshot`ı geri yükler. Ölçüler uyuşmuyorsa (başka dünya boyutu) `false` döner ve hiçbir şey
   * değişmez; verinin bütünlüğü çağıranın sorumluluğundadır.
   */
  restore(snapshot: SurfaceSnapshot): boolean {
    const count = this.cells.length;
    if (
      snapshot.columns !== this.columns ||
      snapshot.rows !== this.rows ||
      [snapshot.wetness, snapshot.puddle, snapshot.snow, snapshot.compaction, snapshot.growth].some(
        (field) => field.length !== count,
      )
    )
      return false;
    const config = WEATHER.surface;
    const snowCapacity = config.maxSnowDepth * config.looseSnowDensity;
    for (let index = 0; index < count; index++) {
      const cell = this.cells[index];
      cell.wetness = snapshot.wetness[index] / 255;
      cell.puddle = (snapshot.puddle[index] / 255) * config.maxPuddleDepth;
      cell.snowWater = (snapshot.snow[index] / 255) * snowCapacity;
      cell.compaction = snapshot.compaction[index] / 255;
      // Taşıma gücünün üstü olamaz: hasarlı ya da eski bir kayıt örtüyü fertility'ye indirir.
      cell.growth = Math.min(cell.fertility, snapshot.growth[index] / 255);
    }
    return true;
  }

  private index(x: number, y: number): number {
    const column = Math.min(this.columns - 1, Math.floor(clamp(x, 0, this.width) / this.cellSize));
    const row = Math.min(this.rows - 1, Math.floor(clamp(y, 0, this.height) / this.cellSize));
    return row * this.columns + column;
  }

  private sampleCell(cell: StoredCell, frame: WeatherState): SurfaceSample {
    const config = WEATHER.surface;
    const density = lerp(config.looseSnowDensity, config.packedSnowDensity, cell.compaction);
    const snowDepth = cell.snowWater / density;
    const puddle = cell.puddle / config.maxPuddleDepth;
    const snow = clamp01(snowDepth / config.maxSnowDepth);
    return {
      wetness: cell.wetness,
      puddleDepth: cell.puddle,
      snowDepth,
      snowCompaction: cell.compaction,
      growth: cell.growth,
      grip: Math.max(
        config.minGrip,
        1 -
          cell.wetness * config.wetGripLoss -
          puddle * config.puddleGripLoss -
          snow * (config.snowGripLoss + cell.compaction * config.packedSnowGripLoss),
      ),
      rollingResistance:
        1 +
        puddle * config.puddleRolling +
        snow * config.snowRolling * (1 - cell.compaction * config.packedSnowRollingReduction),
      windX: frame.windX,
      windY: frame.windY,
      airDrag: frame.airDrag,
    };
  }
}
