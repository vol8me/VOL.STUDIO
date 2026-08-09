/** Fizik/hareket parametreleri. Top-down bullet-hell — yerçekimi yok, custom hareket ve çarpışma. */
export const physicsConfig = {
  /** Yerçekimi (piksel/saniye²). Top-down olduğu için sıfır. */
  gravity: { x: 0, y: 0 },
  /** Spatial grid hücre boyutu çarpanı: cellSize = max(enemyRadius, bulletRadius) * multiplier. */
  spatialGridCellMultiplier: 4,
  /** Player-enemy overlap çözümü parametreleri. */
  overlapResolve: {
    /** Iterasyon sayısı — her turda overlap azalır, titreme önlenir. */
    iterations: 3,
    /** İtme katsayısı (0-1). İlk iterasyonda overlap * pushFactor kadar itme; sonrakilerde iterasyona bölünerek azalır. */
    pushFactor: 0.5,
  },
} as const;

export type PhysicsConfig = typeof physicsConfig;
