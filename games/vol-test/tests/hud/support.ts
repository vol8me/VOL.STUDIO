import type { HudFrame } from '@/hud/HudFrame';

export function hudFrame(overrides: Partial<HudFrame> = {}): HudFrame {
  return {
    x: 2048,
    y: 2048,
    hull: 0,
    speed: 0,
    reversing: false,
    braking: false,
    boosting: false,
    boost: 100,
    boostCapacity: 100,
    fireProgress: 1,
    health: 100,
    maxHealth: 100,
    alive: true,
    respawnRemainingMs: 0,
    protectionRemainingMs: 0,
    view: { x: 1600, y: 1700, width: 900, height: 700 },
    ...overrides,
  };
}
