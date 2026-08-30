export type DisplayMode = 'windowed' | 'fullscreen';

/**
 * Grafik kalitesi İKİ kademedir ve aralarındaki fark ölçülebilir olmalıdır.
 *
 * Üç kademeli eski sürüm ("low/balanced/high") pratikte tek bir şeyi
 * değiştiriyordu — partikül sayısı — ve `maxDpr` bacağı standart 1x monitörde
 * hiçbir işe yaramıyordu. İki kademe, her birinin ne anlama geldiğini
 * savunulabilir kılar: "Yüksek" tam kalite, "Düşük" ölçülebilir biçimde daha
 * ucuz.
 */
export type GraphicsQualityLevel = 'high' | 'low';

export interface ResolutionPreset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Bir kalite kademesinin taşıdığı bütün knob'lar.
 *
 * CORE `GraphicsQuality` bu nesnenin içini bilmez; hangi kaldıraçların var
 * olduğu OYUNUN kararıdır ve hepsi burada, veri olarak durur.
 */
export interface GraphicsQualityProfile {
  /**
   * Rasterleme çözünürlüğü çarpanı (DPR'den bağımsız).
   *
   * En ağır kaldıraç: 0.7 çarpanı GPU'nun işlediği piksel sayısını ~%51'e
   * indirir. Dünya boyutu ve ekrandaki görüntü boyutu DEĞİŞMEZ — kamera aynı
   * çarpanla yakınlaştırıldığı için fark yalnızca netliktir.
   */
  readonly renderScale: number;
  /** Yüksek DPR ekranlarda rasterleme tavanı. */
  readonly maxDpr: number;
  /** Efekt patlamalarında partikül sayısı çarpanı. */
  readonly particleScale: number;
  /**
   * Partikül ömrü çarpanı. Sayıdan bağımsız bir kaldıraç: aynı anda HAYATTA
   * olan partikül sayısını düşürür, yani doldurma (fill-rate) maliyetini
   * partikül sayısını azaltmadan da kırpar.
   */
  readonly particleLifespanScale: number;
  /**
   * Mermi izi. Her mermi saniyede ~40 kez partikül üretiyor; 30 mermilik bir
   * ekranda saniyede 1200 emisyon demek. Kapatmak tek başına belirgin fark
   * yaratır.
   */
  readonly bulletTrails: boolean;
  /**
   * Varlık kenar çizgileri (mermi, düşman, pickup). Her kenar çizgisi arc
   * başına ikinci bir çizim geçişidir; ekranda onlarca varlık olur.
   */
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
