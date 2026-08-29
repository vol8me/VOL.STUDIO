export type DisplayMode = 'windowed' | 'fullscreen';
export type GraphicsQuality = 'low' | 'balanced' | 'high';

export interface ResolutionPreset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface GraphicsQualityProfile {
  /** Phaser render yüzeyinin çıkabileceği en yüksek device-pixel-ratio. */
  readonly maxDpr: number;
  /** Efekt patlamalarında config sayısına uygulanan çarpan. */
  readonly particleScale: number;
}

/**
 * Masaüstü görüntü seçenekleri ve kalite profilleri.
 *
 * UI bu dizilerden türetilir; çözünürlük/kalite eklemek runtime koduna sayı
 * gömmeyi gerektirmez. Tam ekran native monitör çözünürlüğünü kullanır,
 * resolution yalnız pencere kipinin içerik boyutudur.
 */
export const videoConfig = {
  defaultDisplayMode: 'windowed' as DisplayMode,
  defaultResolution: '1280x720',
  defaultGraphicsQuality: 'high' as GraphicsQuality,
  resolutions: [
    { id: '1024x576', width: 1024, height: 576 },
    { id: '1280x720', width: 1280, height: 720 },
    { id: '1600x900', width: 1600, height: 900 },
    { id: '1920x1080', width: 1920, height: 1080 },
  ] as const satisfies readonly ResolutionPreset[],
  quality: {
    low: { maxDpr: 1, particleScale: 0.55 },
    balanced: { maxDpr: 1.25, particleScale: 0.8 },
    high: { maxDpr: 1.5, particleScale: 1 },
  } as const satisfies Record<GraphicsQuality, GraphicsQualityProfile>,
} as const;

export function getResolutionPreset(id: string): ResolutionPreset | undefined {
  return videoConfig.resolutions.find((preset) => preset.id === id);
}
