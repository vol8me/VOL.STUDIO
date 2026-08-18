import type { Diagnostics } from '@volstudio/core';

/**
 * Diagnostic overlay'e frame sayaçlarını basar.
 *
 * `GameScene`'den ayrıldı: bu liste her yeni sistemde büyüyor ve sahnenin
 * "oyunu sürme" işiyle hiç ilgisi yok. Ayrı durunca hangi sayaçların
 * bildirildiği tek bakışta görülür ve testle kilitlenebilir.
 */
export interface TelemetrySources {
  score: number;
  kills: number;
  elapsedMs: number;
  bullets: number;
  enemies: number;
  particles: number;
  gridCells: number;
  wave: number;
  waveRemainingMs: number;
  flux: number;
  fluxPickups: number;
  spark: number;
  sparkLevel: number;
  cards: number;
  fireZones: number;
}

/** Overlay'de görünen sayaç adları — test bu listeye karşı doğrular. */
export const TELEMETRY_KEYS = [
  'score',
  'kills',
  'elapsedSeconds',
  'bullets',
  'enemies',
  'particles',
  'gridCells',
  'wave',
  'waveRemainingSeconds',
  'flux',
  'fluxPickups',
  'spark',
  'sparkLevel',
  'cards',
  'fireZones',
] as const;

export function reportSceneTelemetry(diagnostics: Diagnostics, s: TelemetrySources): void {
  diagnostics.setCount('score', s.score);
  diagnostics.setCount('kills', s.kills);
  diagnostics.setCount('elapsedSeconds', Math.floor(s.elapsedMs / 1000));
  diagnostics.setCount('bullets', s.bullets);
  diagnostics.setCount('enemies', s.enemies);
  diagnostics.setCount('particles', s.particles);
  diagnostics.setCount('gridCells', s.gridCells);
  diagnostics.setCount('wave', s.wave);
  diagnostics.setCount('waveRemainingSeconds', Math.ceil(s.waveRemainingMs / 1000));
  diagnostics.setCount('flux', s.flux);
  diagnostics.setCount('fluxPickups', s.fluxPickups);
  diagnostics.setCount('spark', s.spark);
  diagnostics.setCount('sparkLevel', s.sparkLevel);
  diagnostics.setCount('cards', s.cards);
  diagnostics.setCount('fireZones', s.fireZones);
}
