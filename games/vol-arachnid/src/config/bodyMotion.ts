/** Gövde kabuğunun bacaklara göre ikincil ağırlık aktarımı. */
export const bodyMotionConfig = {
  idlePhaseSpeedDegPerSec: 150,
  signalFacingSpring: { stiffness: 120, damping: 15 },
  transformSpring: { stiffness: 95, damping: 16 },
  idleSwayPx: 0.7,
  walkSwayPx: 2.1,
  turnSwayPx: 3.2,
  walkRollDeg: 0.7,
  turnRollDeg: 2.8,
  turnVelocityForMaxRadPerSec: 5,
} as const;
