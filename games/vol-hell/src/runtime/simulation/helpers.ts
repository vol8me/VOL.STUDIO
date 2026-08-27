import { getEnemyDefinition } from '@/config/enemies/catalog';
import type { EnemyDefinition } from '@/config/enemies/types';
import { simulationConfig } from '@/config/simulation';
import { finiteOr } from '@/runtime/utils/numeric';
import type { SimulationBounds, SimulationBoundsWithMetrics } from './types';

export function findDefinition(id: string): EnemyDefinition | null {
  try {
    // Katalog fonksiyonu hata fırlatmak yerine headless akışta geçersiz
    // minion'u yok sayar; render yöneticisiyle aynı güvenli sınır korunur.
    return getEnemyDefinition(id);
  } catch {
    return null;
  }
}

export function withMetrics(bounds: SimulationBounds): SimulationBoundsWithMetrics {
  const left = finiteOr(bounds.left, simulationConfig.bounds.left);
  const right = Math.max(left, finiteOr(bounds.right, simulationConfig.bounds.right));
  const top = finiteOr(bounds.top, simulationConfig.bounds.top);
  const bottom = Math.max(top, finiteOr(bounds.bottom, simulationConfig.bounds.bottom));
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function clampToBounds(value: number, min: number, max: number): number {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.min(safeMax, Math.max(safeMin, finiteOr(value, safeMin)));
}

export function defaultPlayerPosition(
  frame: number,
  bounds: SimulationBounds,
): { x: number; y: number } {
  const orbit = simulationConfig.playerOrbit;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return {
    x: centerX + Math.cos(frame / orbit.xPeriodFrames) * orbit.xRadius,
    y: centerY + Math.sin(frame / orbit.yPeriodFrames) * orbit.yRadius,
  };
}
