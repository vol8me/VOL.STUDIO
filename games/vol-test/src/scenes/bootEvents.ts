/** Açılış yüklemesinin Phaser olay adları: `BootScene` yayar, `main.ts` yükleme ekranına bağlar. */
export const BOOT_EVENT = {
  /** Değer: 0–1 arası varlık yükleme oranı. */
  progress: 'vol-test:boot-progress',
  /** Dokular hazır, dünya sahnesi başlıyor. */
  ready: 'vol-test:boot-ready',
} as const;
