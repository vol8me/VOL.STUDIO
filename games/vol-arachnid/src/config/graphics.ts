/**
 * VOL.ARACHNID tek ve sabit bir YÜKSEK kalite profili kullanır.
 *
 * Oyuncuya kalite seçeneği sunulmaz: render ölçeği cihazın gerçek DPR'ı üstünde
 * 1.0'dır; WebGL hem geometri hem doku kenarlarında yumuşatma kullanır. Profil
 * veri olarak burada durur ki ilerideki bir performans turu kaliteyi runtime'a
 * gömülü sayılarla sessizce düşürmesin.
 */
export const arachnidGraphicsConfig = {
  renderScale: 1,
  renderer: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
} as const;
