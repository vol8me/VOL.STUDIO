/** Genel oyun ayarları. `title` tek kaynak — index.html'deki `<title>` yalnızca ilk boyamadan önce statik yedek. */
export const gameConfig = {
  title: 'VOL.HELL',
  viewport: {
    strategy: 'resize',
  },
} as const;

export type GameConfig = typeof gameConfig;
