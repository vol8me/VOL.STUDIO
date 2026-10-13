export const CONTROLS = {
  moveSmoothing: 0.9999999999,
  fireEnter: 0.8,
  fireExit: 0.65,
  /** Fare nişan sayılır: bir karede en az bu kadar piksel hareket (donanım titremesi altı yok sayılır). */
  aimMovePx: 1.5,
  /** Fare durduktan sonra nişan çizgisinin yanık kaldığı süre (ms). */
  aimHoldMs: 900,
} as const;
