/** Saha göstergelerinin ortak kurulum seçenekleri. */
export interface PlayerIndicatorOptions {
  /**
   * Gösterge çizilsin mi. Grafik kalitesi kademesi kapatabilir; her karede
   * okunur, böylece ayar oyun sırasında değiştiğinde anında etki eder.
   */
  isEnabled?: () => boolean;
}
