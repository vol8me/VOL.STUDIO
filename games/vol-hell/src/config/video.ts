export type DisplayMode = 'windowed' | 'fullscreen';

/**
 * Grafik kalitesi İKİ kademedir ve aralarındaki fark ölçülebilir olmalıdır.
 *
 * Üç kademe ("low/balanced/high") bu ölçüyü KARŞILAMAZ: pratikte tek bir şeyi
 * (partikül sayısını) değiştirir ve `maxDpr` bacağı standart 1x monitörde
 * hiçbir işe yaramaz. İki kademe her birini savunulabilir kılar: "Yüksek" tam
 * kalite, "Düşük" ölçülebilir biçimde daha ucuz.
 */
export type GraphicsQualityLevel = 'high' | 'low';

export interface ResolutionPreset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Bir kalite kademesinin knob'ları. CORE `GraphicsQuality` içini bilmez;
 * hangi kaldıraçların olduğu OYUNUN kararıdır.
 */
export interface GraphicsQualityProfile {
  /** En ağır kaldıraç: 0.7 çarpanı işlenen pikseli ~%51'e indirir. Dünya boyutu değişmez. */
  readonly renderScale: number;
  readonly maxDpr: number;
  readonly particleScale: number;
  /** Sayıdan bağımsız: aynı anda HAYATTA olanı düşürür, doldurma maliyetini kırpar. */
  readonly particleLifespanScale: number;
  /** Her mermi saniyede ~40 emisyon; 30 mermide saniyede 1200 eder. */
  readonly bulletTrails: boolean;
  /** Her kenar çizgisi arc başına İKİNCİ bir çizim geçişidir. */
  readonly entityStrokes: boolean;
  /**
   * Saha üstü yön/nişan göstergeleri. İkisi de her karede `Graphics` yeniden
   * çizer; düşük kademede oyuncu okunabilirliği HUD'dan gelmeye devam eder.
   */
  readonly groundIndicators: boolean;
}

/**
 * Masaüstü görüntü seçenekleri ve kalite profilleri.
 *
 * UI bu veriden türetilir; kademe eklemek runtime koduna sayı gömmeyi
 * gerektirmez. Tam ekran native monitör çözünürlüğünü kullanır, `resolution`
 * yalnız pencere kipinin içerik boyutudur.
 */
export const videoConfig = {
  defaultDisplayMode: 'windowed' as DisplayMode,
  defaultResolution: '1280x720',
  defaultGraphicsQuality: 'high' as GraphicsQualityLevel,
  resolutions: [
    { id: '1024x576', width: 1024, height: 576 },
    { id: '1280x720', width: 1280, height: 720 },
    { id: '1600x900', width: 1600, height: 900 },
    { id: '1920x1080', width: 1920, height: 1080 },
  ] as const satisfies readonly ResolutionPreset[],
  quality: {
    high: {
      renderScale: 1,
      maxDpr: 2,
      particleScale: 1,
      particleLifespanScale: 1,
      bulletTrails: true,
      entityStrokes: true,
      groundIndicators: true,
    },
    low: {
      // 0.7² ≈ piksellerin %49'u. Tek başına en büyük kazanç.
      renderScale: 0.7,
      maxDpr: 1,
      particleScale: 0.35,
      particleLifespanScale: 0.6,
      bulletTrails: false,
      entityStrokes: false,
      groundIndicators: false,
    },
  } as const satisfies Record<GraphicsQualityLevel, GraphicsQualityProfile>,
} as const;

export function getResolutionPreset(id: string): ResolutionPreset | undefined {
  return videoConfig.resolutions.find((preset) => preset.id === id);
}

/** DOM'a yansıtılan öznitelik adı — CSS `[data-vol-graphics='low']` ile eşleşir. */
export const GRAPHICS_QUALITY_ATTRIBUTE = 'vol-graphics';
