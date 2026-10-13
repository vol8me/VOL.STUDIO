import { KIND } from '@/config/factory';

/** Katı bina birim yolunu ve oyuncu tankını keser; bant ve boş tile'lar geçilebilirdir. */
export function isSolid(kind: number): boolean {
  return (
    kind === KIND.drill ||
    kind === KIND.smelter ||
    kind === KIND.turret ||
    kind === KIND.wall ||
    kind === KIND.core
  );
}
