import { SEASONS, type SeasonKind } from '@/config/seasons';
import { CLIMATE_NET } from '@/config/climate';
import { WEATHER, type WeatherKind } from '@/config/weather';
import { SurfaceGrid, type FertilityMask } from './SurfaceGrid';
import { WeatherSchedule } from './WeatherSchedule';
import type {
  ClimateSnapshot,
  SurfaceCell,
  SurfaceSample,
  WeatherFrame,
  WeatherState,
} from './types';

export type { ClimateSnapshot, SurfaceCell, SurfaceSample, WeatherFrame } from './types';

export interface WeatherOptions {
  readonly seed?: number;
  readonly override?: WeatherKind;
  readonly season?: SeasonKind;
  /** Yeşilliğin kök salabileceği yerler: göl ve kaya gibi coğrafya çarpanı [0, 1]. */
  readonly fertility?: FertilityMask;
}

export function parseWeatherOverride(value: string | null | undefined): WeatherKind | undefined {
  return value && Object.hasOwn(WEATHER.profiles, value) ? (value as WeatherKind) : undefined;
}

export class WeatherSystem {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  private readonly surface: SurfaceGrid;
  private schedule: WeatherSchedule;
  private forced: WeatherKind | undefined;
  private readonly seed: number;
  private initialSeason: SeasonKind;
  private elapsedMs = 0;
  private surfaceMs = 0;
  private windMs = 0;
  private windTravelX = 0;
  private windTravelY = 0;
  private windX: number;
  private windY: number;
  private currentFrame: WeatherFrame;

  constructor(width: number, height: number, options: WeatherOptions = {}) {
    const seed = options.seed ?? WEATHER.seed;
    this.seed = seed;
    this.initialSeason = options.season ?? 'spring';
    this.surface = new SurfaceGrid(width, height, seed, options.fertility);
    this.forced = options.override;
    this.schedule = new WeatherSchedule(seed, options.override, options.season);
    this.cellSize = this.surface.cellSize;
    this.columns = this.surface.columns;
    this.rows = this.surface.rows;
    const initial = this.schedule.frameAt(0);
    this.windX = initial.windX;
    this.windY = initial.windY;
    this.currentFrame = this.withTravel(initial);
  }

  get frame(): WeatherFrame {
    return this.currentFrame;
  }

  step(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs < 0 || this.elapsedMs + dtMs > Number.MAX_SAFE_INTEGER)
      throw new RangeError('Hava adımı sonlu ve negatif olmayan bir sayı olmalı.');
    const end = this.elapsedMs + dtMs;
    while (this.surfaceMs + WEATHER.surface.stepMs <= end) {
      this.surfaceMs += WEATHER.surface.stepMs;
      const state = this.schedule.frameAt(this.surfaceMs);
      this.integrateWind(state);
      this.surface.step(state, WEATHER.surface.stepMs / 1000);
    }
    this.elapsedMs = end;
    this.currentFrame = this.withTravel(this.schedule.frameAt(end));
  }

  setOverride(kind: WeatherKind | undefined): void {
    this.forced = kind;
    this.integrateWind(this.currentFrame);
    this.schedule.setOverride(kind, this.elapsedMs);
    this.currentFrame = this.withTravel(this.schedule.frameAt(this.elapsedMs));
  }

  /**
   * Mevsimi anında değiştirir: takvim saati yerinde kalır, başlangıç mevsimi öyle kaydırılır ki şu anki
   * mevsim `season` olur. `warmupMs` zemini yeni mevsime alıştırır (kar örtüsü, yeşillik); sıfırsa yalnız
   * takvim ve hava değişir. Çevrimiçi dünyada takvimi sunucu yönetir; çağıran orada bunu kullanmaz.
   */
  setSeason(season: SeasonKind, warmupMs = 0): void {
    if (
      !SEASONS.order.includes(season) ||
      !Number.isFinite(warmupMs) ||
      warmupMs < 0 ||
      this.elapsedMs + warmupMs > Number.MAX_SAFE_INTEGER
    )
      throw new RangeError('Mevsim geçerli, alıştırma süresi sonlu ve negatif olmayan sayı olmalı');
    const count = SEASONS.order.length;
    const phase = Math.floor(this.elapsedMs / SEASONS.durationMs);
    const index = SEASONS.order.indexOf(season);
    this.integrateWind(this.currentFrame);
    this.initialSeason = SEASONS.order[(((index - phase) % count) + count) % count];
    this.schedule = new WeatherSchedule(this.seed, this.forced, this.initialSeason);
    this.currentFrame = this.withTravel(this.schedule.frameAt(this.elapsedMs));
    if (warmupMs > 0) this.step(warmupMs);
  }

  sample(x: number, y: number): SurfaceSample {
    return this.surface.sample(x, y, this.frame);
  }

  cell(column: number, row: number): SurfaceCell | undefined {
    return this.surface.cell(column, row, this.frame);
  }

  compress(x: number, y: number, amount: number): void {
    this.surface.compress(x, y, amount);
  }

  /** Aracın bastığı yeşilliği ezer (`amount` sonlu, negatif olmayan üstel azalma). */
  trample(x: number, y: number, amount: number): void {
    this.surface.trample(x, y, amount);
  }

  /**
   * Dünya iklimini bir anlık görüntüye yazar: sunucu bunu bütün istemcilere yayar ve diske yazar.
   * Hava tohum ve saatten türediği için yalnız saat, rüzgâr birikimi ve zemin hücreleri taşınır.
   */
  snapshot(): ClimateSnapshot {
    return {
      version: 1,
      seed: this.seed,
      season: this.initialSeason,
      elapsedMs: this.elapsedMs,
      surfaceMs: this.surfaceMs,
      windMs: this.windMs,
      windTravelX: this.windTravelX,
      windTravelY: this.windTravelY,
      windX: this.windX,
      windY: this.windY,
      surface: this.surface.snapshot(),
    };
  }

  /**
   * Anlık görüntüyü yükler: saat, rüzgâr ve zemin onunla aynı olur. Tohum ya da zemin ölçüsü
   * uyuşmuyorsa `false` döner ve hiçbir şey değişmez (başka dünyanın kaydı bu dünyayı bozmaz).
   *
   * `smooth` verilirse canlı bir dünyaya uyum yapılır (sunucu yayını): zemin hücreleri sert yazılmaz,
   * `CLIMATE_NET.blendMs` içinde hedefe yaklaşır; saat yerelden `clockToleranceMs` kadar sapmadıysa yerel
   * takvim ve rüzgâr korunur (yağmur ve parçacıklar sıçramaz). Katılımdaki ilk görüntü sert yüklenir.
   */
  restore(snapshot: ClimateSnapshot, smooth = false): boolean {
    const numbers = [
      snapshot.elapsedMs,
      snapshot.surfaceMs,
      snapshot.windMs,
      snapshot.windTravelX,
      snapshot.windTravelY,
      snapshot.windX,
      snapshot.windY,
    ];
    if (
      snapshot.version !== 1 ||
      snapshot.seed !== this.seed ||
      !SEASONS.order.includes(snapshot.season) ||
      !numbers.every(Number.isFinite) ||
      snapshot.elapsedMs < 0 ||
      snapshot.elapsedMs > Number.MAX_SAFE_INTEGER ||
      snapshot.surfaceMs < 0 ||
      snapshot.surfaceMs > snapshot.elapsedMs ||
      snapshot.elapsedMs - snapshot.surfaceMs >= WEATHER.surface.stepMs ||
      snapshot.surfaceMs % WEATHER.surface.stepMs !== 0 ||
      snapshot.windMs < snapshot.surfaceMs ||
      snapshot.windMs > snapshot.elapsedMs
    )
      return false;
    const aligned =
      smooth && Math.abs(snapshot.elapsedMs - this.elapsedMs) <= CLIMATE_NET.clockToleranceMs;
    if (aligned) {
      if (snapshot.season !== this.initialSeason) return false;
      return this.surface.blendToward(snapshot.surface, CLIMATE_NET.blendMs);
    }
    if (!this.surface.restore(snapshot.surface)) return false;
    // Mevsim saati başlangıç mevsiminden sayılır: sunucunun takvimi, istemcinin yerel seçimini ezer.
    this.forced = undefined;
    this.initialSeason = snapshot.season;
    this.schedule = new WeatherSchedule(this.seed, undefined, snapshot.season);
    this.elapsedMs = snapshot.elapsedMs;
    this.surfaceMs = snapshot.surfaceMs;
    this.windMs = snapshot.windMs;
    this.windTravelX = snapshot.windTravelX;
    this.windTravelY = snapshot.windTravelY;
    this.windX = snapshot.windX;
    this.windY = snapshot.windY;
    this.currentFrame = this.withTravel(this.schedule.frameAt(this.elapsedMs));
    return true;
  }

  private integrateWind(state: WeatherState): void {
    const seconds = (state.elapsedMs - this.windMs) / 1000;
    this.windTravelX += ((this.windX + state.windX) / 2) * seconds;
    this.windTravelY += ((this.windY + state.windY) / 2) * seconds;
    this.windMs = state.elapsedMs;
    this.windX = state.windX;
    this.windY = state.windY;
  }

  private withTravel(state: WeatherState): WeatherFrame {
    const seconds = (state.elapsedMs - this.windMs) / 1000;
    return Object.freeze({
      ...state,
      windTravelX: this.windTravelX + ((this.windX + state.windX) / 2) * seconds,
      windTravelY: this.windTravelY + ((this.windY + state.windY) / 2) * seconds,
    });
  }
}
