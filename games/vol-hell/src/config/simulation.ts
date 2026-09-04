/**
 * Headless koşu simülasyonunun workload ayarları.
 *
 * Bunlar oyun dengesi değildir: render olmadan ekonomi/dalga zincirini
 * çalıştıran test ve benchmark'ın deterministik senaryosudur. Oyun sahnesinin
 * gerçek oyuncu girdisi bu değerlerden beslenmez.
 */
export const simulationConfig = {
  defaultSeed: 20_260_813,
  defaultStepMs: 16,
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
