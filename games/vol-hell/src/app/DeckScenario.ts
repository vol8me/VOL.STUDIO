import { Vector2, type InputState } from '@volstudio/core';
import type { HellAction } from '@/config/input';

export interface DeckScenarioConfig {
  enemyCount: number;
  seed: number;
}

export function launchDeckScenario(
  scenes: { stop(key: string): unknown; start(key: string, data?: object): unknown },
  config: DeckScenarioConfig,
): void {
  scenes.stop('MainMenu');
  scenes.start('Game', { deckScenario: config });
}

export function keepDeckScenarioAlive(
  config: DeckScenarioConfig | null,
  player: { isAlive(): boolean; getMaxHealth(): number; heal(amount: number): void },
): boolean {
  if (!config || player.isAlive()) return false;
  player.heal(player.getMaxHealth());
  return true;
}

export function parseDeckScenario(
  env: Readonly<Record<string, string>>,
): DeckScenarioConfig | null {
  if (env.VOL_DECK_MEASURE !== '1') return null;
  const count = env.VOL_DECK_SCENARIO;
  if (count !== '0' && count !== '10' && count !== '20' && count !== '30' && count !== '40')
    return null;
  const rawSeed = env.VOL_DECK_SEED;
  if (rawSeed === undefined) return { enemyCount: Number(count), seed: 20260927 };
  if (!/^\d+$/.test(rawSeed)) return null;
  const seed = Number(rawSeed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  return { enemyCount: Number(count), seed };
}

export function sampleDeckScenarioInput(
  elapsedMs: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  position: { x: number; y: number },
): InputState<HellAction> {
  const idle = (): InputState<HellAction> => ({
    move: Vector2.zero(),
    aim: Vector2.zero(),
    actions: { fire: false, dash: false },
  });
  const values = [
    elapsedMs,
    bounds.left,
    bounds.right,
    bounds.top,
    bounds.bottom,
    position.x,
    position.y,
  ];
  if (values.some((value) => !Number.isFinite(value)) || elapsedMs < 0) return idle();
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return idle();
  const corners = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  const corner = corners[Math.floor(elapsedMs / 6000) % corners.length];
  const x = Math.max(bounds.left, Math.min(bounds.right, position.x));
  const y = Math.max(bounds.top, Math.min(bounds.bottom, position.y));
  const dx = bounds.left + width * corner.x - x;
  const dy = bounds.top + height * corner.y - y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return idle();
  const move = distance > 0 ? new Vector2(dx / distance, dy / distance) : Vector2.zero();
  return { move, aim: Vector2.zero(), actions: { fire: true, dash: false } };
}
