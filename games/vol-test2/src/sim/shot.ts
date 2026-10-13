/** Atışın kaynağı: taret binası ya da oyuncu tankı. */
export const SHOT_SOURCE = { turret: 0, player: 1 } as const;
export type ShotSource = (typeof SHOT_SOURCE)[keyof typeof SHOT_SOURCE];

/**
 * Bir adımda yapılan atış (tile uzayı). `tile` taret kaynağında kaynak tile dizinidir, oyuncuda -1;
 * çıkış noktası her iki durumda `fromX/fromY`dir. Simülasyon her adım başında listeyi temizler.
 */
export interface Shot {
  tile: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  source: ShotSource;
}
