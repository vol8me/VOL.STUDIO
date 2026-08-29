/** `Phaser.Input.Pointer`ın bu işlem için gereken en dar yüzeyi. */
export interface LatchablePointer {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  reset(): void;
}

export interface ReleasePointerLatchOptions {
  /**
   * Konumu koru. Masaüstünde `true` olmalı: nişan pointer konumundan türetilir.
   */
  preserveAim: boolean;
}

/**
 * Pointer'ın BASILI durumunu bırakır; masaüstünde nişanı korur.
 *
 * Duraklatma/dalga sınırı gibi geçişlerde amaç, ekranı kapatan tıklamanın ya da
 * ekranda kalan parmağın bir sonraki karede oyun girdisi sayılmamasıdır —
 * yani LATCH'i bırakmak. `Phaser.Input.Pointer.reset()` bunu yapar ama fazlasını
 * da yapar: `position`, `worldX` ve `worldY` alanlarını da sıfırlar.
 *
 * Masaüstünde nişan `pointer.worldX/worldY - oyuncu konumu` olarak hesaplandığı
 * için bu, fare hareket edene kadar oyuncuyu dünyanın (0,0) noktasına
 * nişanlatır. Phaser pointer konumunu yalnız gerçek `pointermove` olayında
 * tazelediğinden fare duruyorsa durum kalıcıdır: oyuncu duraklatmadan çıkınca
 * sol üst köşeye ateş eder ve aynı vektörle dash atar.
 *
 * Dokunmatikte konumu korumanın anlamı yoktur (parmak kalkmıştır) ve orada
 * `reset()`in tam hâli gereklidir: Phaser kalkmış bir parmağı basılı saymaya
 * devam edebiliyor.
 */
export function releasePointerLatch(
  pointer: LatchablePointer,
  options: ReleasePointerLatchOptions,
): void {
  if (!options.preserveAim) {
    pointer.reset();
    return;
  }

  const { x, y, worldX, worldY } = pointer;
  pointer.reset();
  // Sonlu olmayan bir konumu geri yazmak nişanı NaN'a çevirirdi; böyle bir
  // durumda sıfırlanmış konum daha güvenlidir.
  if (Number.isFinite(x) && Number.isFinite(y)) {
    pointer.x = x;
    pointer.y = y;
  }
  if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
    pointer.worldX = worldX;
    pointer.worldY = worldY;
  }
}
