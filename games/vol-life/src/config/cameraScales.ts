import { substrateConfig } from './substrate';

/**
 * Kamera ölçekleri (D2). Her ölçek, GÖRÜNÜR DÜNYA GENİŞLİĞİNİ kernel menzili
 * (cutoff) cinsinden tanımlar: ölçek "kaç etkileşim menzili görüyorum"
 * sorusunun cevabıdır. Piksel ya da zoom sayısı yazılmaz; ikisi de ekrana ve
 * dünya boyutuna göre değişir, menzil ise fiziğin kendi birimidir.
 *
 * Fiziksel dünya boyutu bu ölçeklerden ETKİLENMEZ; yalnız kameranın ne kadarını
 * gösterdiği değişir.
 */
export type CameraScaleName = 'world' | 'ecosystem' | 'organism' | 'micro';

export interface CameraScale {
  readonly name: CameraScaleName;
  /** Görünür dünya genişliği, kernel menzili cinsinden. */
  readonly visibleWidthInCutoffs: number;
}

export const cameraScales: Readonly<Record<CameraScaleName, CameraScale>> = {
  /** Bütün habitat ve çevresindeki Void; yönelme içindir. */
  world: { name: 'world', visibleWidthInCutoffs: 12 },
  /** Açılış ölçeği: birkaç yapı ve aralarındaki boşluk aynı anda görünür. */
  ecosystem: { name: 'ecosystem', visibleWidthInCutoffs: 6 },
  /** Tek bir yapının biçimi ve çeperi okunur. */
  organism: { name: 'organism', visibleWidthInCutoffs: 2.5 },
  /** Parçacık düzeyi: komşuluk ve bağ görünür. */
  micro: { name: 'micro', visibleWidthInCutoffs: 1 },
};

export const entryCameraScale: CameraScaleName = 'ecosystem';

/** Ölçeğin bu görüntü alanındaki zoom karşılığı. */
export function zoomForScale(
  scale: CameraScale,
  viewportWidthPx: number,
  cutoffUnits: number = substrateConfig.candidate.physics.cutoffUnits,
): number {
  const visibleWorldWidth = scale.visibleWidthInCutoffs * cutoffUnits;
  if (!(visibleWorldWidth > 0) || !(viewportWidthPx > 0)) {
    throw new RangeError('Ölçek ve görüntü alanı pozitif olmalı.');
  }
  return viewportWidthPx / visibleWorldWidth;
}
