import { gameConfig } from './game';

/**
 * Headless koşu simülasyonunun workload ayarları.
 *
 * Bunlar oyun dengesi değildir: render olmadan ekonomi/dalga zincirini
 * çalıştıran test ve benchmark'ın deterministik senaryosudur. Oyun sahnesinin
 * gerçek oyuncu girdisi bu değerlerden beslenmez.
 */
export const simulationConfig = {
  defaultSeed: 20_260_813,
  /**
   * Adım boyu PRODUCTION'dan türer, ayrı bir sayı DEĞİLDİR.
   *
   * Headless koşu, ölçtüğü yükün oyunda gerçekten oluşan yük olduğunu iddia
   * eder; farklı bir tempoda koşarsa o iddia boşa düşer. İki sayı elle
   * tutulduğunda ayrışma SESSİZDİR: biri değişir, benchmark eskisini ölçmeye
   * devam eder ve kimse fark etmez. (Ölçüldü: bir dönem 16 ms ile koşuyordu,
   * yani 62,5 Hz — production 60 Hz'ken.)
   */
  defaultStepMs: gameConfig.fixedStepMs,
  defaultKillRadius: 140,
  bounds: {
    left: 0,
    right: 900,
    top: 0,
    bottom: 700,
  },
  playerOrbit: {
    xRadius: 220,
    yRadius: 160,
    xPeriodFrames: 40,
    yPeriodFrames: 55,
  },
} as const;
