import type { DisposableScope, SimulationClockFrame } from '@volstudio/core';
import type { MessageKey } from '@/i18n/keys';
import type Phaser from 'phaser';
import type { GameServices } from '@/app/GameServices';
import type { WeatherKind } from '@/config/weather';
import type { Hud } from '@/hud/Hud';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import type { Simulation } from '@/sim/Simulation';
import type { WeatherSystem } from '@/sim/weather/WeatherSystem';
import type { World } from '@/sim/world/World';
import type { FrontFrame } from '@/view/front';
import type { PlayerControls } from './PlayerControls';

/** Sahnenin sürücüye verdiği kurulum bağlamı. */
export interface DriverContext {
  /** Sürücünün sunum nesnelerini (etiket, işaret) kuracağı sahne. */
  readonly scene: Phaser.Scene;
  readonly world: World;
  /** Çizilen hava modeli; çevrimdışı benzetim onunla ilerler. */
  readonly weather: WeatherSystem;
  readonly controls: PlayerControls;
  readonly services?: GameServices;
  readonly seed: number;
  /** Sürücünün kaynakları sahneyle birlikte kapanır. */
  readonly scope: DisposableScope;
  /** Ana menüye döner; sahne kapanırken sürücünün kaynakları (bağlantı dahil) sahneyle birlikte sökülür. */
  readonly toMenu: () => void;
  /** Dünyayı başka kipte yeniden kurar; veri verilmezse çevrimdışı sandbox açılır. */
  readonly restart: (data?: WorldStartData) => void;
}

export interface DriverFrame {
  /** `tankFrame(tank, alpha)` için ara değer oranı. */
  readonly alpha: number;
  /** Sabit adım saatinin kare raporu; saati olmayan sürücü vermez. */
  readonly clock?: SimulationClockFrame;
}

/** Ölçüm kayıtlarının dünya bağlamı. */
export interface DriverMeasurement {
  readonly scenario: string;
  readonly seed: number;
}

/**
 * Sahnenin çizdiği dünyayı kimin ilerlettiği: çevrimdışı yerel benzetim ya da çevrimiçi sunucu
 * görünümü. Sahne yalnız bu sözleşmeyi okur; araçlar, mermiler ve olaylar aynı `Simulation` yüzeyinden
 * görünür, böylece görünüm, ses, harita ve efekt katmanı iki kipte de aynıdır.
 */
export interface WorldDriver {
  /** Araçları ve mermileri tutan benzetim; çevrimiçi kipte yalnız sunumdur, kuralları sunucu işletir. */
  readonly sim: Simulation;
  /** Kontrol edilen araç. */
  readonly player: Vehicle;
  readonly measurement: DriverMeasurement;
  /**
   * Gerçek zamanlı kare süresini dünyaya yedirir. `timeMs` sahnenin kare saatidir; `paused`
   * çevrimdışı dünyayı dondurur, çevrimiçi dünya sunucuda aktığı için yalnız girdiyi keser.
   */
  advance(timeMs: number, deltaMs: number, paused: boolean): DriverFrame;
  /** Bu karede biriken benzetim olaylarını `out`a aktarır. */
  drainEvents(out: SimEvent[]): SimEvent[];
  /** HUD kurulduktan sonra bir kez çağrılır; sürücü kendi panellerini ve duraklatma eylemlerini bağlar. */
  attachHud?(hud: Hud): void;
  /** Her karenin sonunda sunum tarafı için çağrılır (panel ve etiket güncellemesi). */
  present?(nowMs: number): void;
  /**
   * Savaş dünyasında cephe hattı: bölgelerin ve üslerin bu karedeki durumu. Dünyada cephe
   * yoksa tanımsızdır. Sürücü durumu yerinde günceller; çağıran saklamaz.
   */
  front?(): FrontFrame | undefined;
  /** Ölçüm kaydına eklenen sürücüye özgü sayılar (örn. ağ gecikmesi). */
  metrics?(): Readonly<Record<string, number>>;
}

export type DriverFactory = (context: DriverContext) => WorldDriver;

/**
 * `scene.start('World', data)` ile verilen kip. Verilmezse sahne çevrimdışı sandbox'ı açar. Çevrimiçi
 * kod ayrı bir parçadan geldiği için sahne ona statik bağlanmaz; sürücü fabrikası olarak taşınır.
 */
export interface WorldStartData {
  readonly createDriver?: DriverFactory;
  /** Çizilen havayı sabitler: çevrimiçi dünyada hava benzetime girmez. */
  readonly weather?: WeatherKind;
  /** Sahne açılınca oyuncuya gösterilecek ileti (i18n anahtarı; örn. bağlantı koptu). */
  readonly notice?: MessageKey;
}
