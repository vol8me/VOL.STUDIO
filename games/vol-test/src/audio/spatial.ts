import { clamp } from '@volstudio/core/math';
import { AUDIO } from '@/config/audio';

export interface AudioPosition {
  readonly x: number;
  readonly y: number;
}

export function spatialSound(
  source: AudioPosition,
  listener: AudioPosition,
): { gain: number; pan: number } {
  const dx = source.x - listener.x;
  const distance = Math.hypot(dx, source.y - listener.y);
  return {
    gain: distance >= AUDIO.audibleRadius ? 0 : 1 / Math.max(1, distance / AUDIO.nearRadius),
    pan: clamp(dx / AUDIO.panRadius, -1, 1),
  };
}

export function blastDistance(distance: number): 'near' | 'mid' | 'far' {
  return distance < AUDIO.blastMid ? 'near' : distance < AUDIO.blastFar ? 'mid' : 'far';
}
