/** Fizik/hareket parametreleri. Top-down bullet-hell — yerçekimi yok. */
export const physicsConfig = {
  /** Yerçekimi (piksel/saniye²). Top-down olduğu için sıfır. */
  gravity: { x: 0, y: 0 },
  /** Matter.js fixed timestep (ms). 60 FPS = 16.67ms. */
  fixedDeltaMs: 16.67,
} as const;

export type PhysicsConfig = typeof physicsConfig;
