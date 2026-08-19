import { SpatialIndex } from '@volstudio/core';
import type { Enemy } from '@/runtime/entity/Enemy';

/**
 * VOL.HELL'in düşman uzamsal indeksi.
 *
 * Mekanizmanın kendisi CORE'dadır (`SpatialIndex<T>`); bu dosya yalnızca onu
 * oyunun tipiyle (`Enemy`) ve oyunun "aktif" tanımıyla (`isAlive`)
 * parametreler. Hücre bazlı indeksleme, negatif koordinat anahtarlaması,
 * artımlı güncelleme ve yeniden kullanılan sorgu tamponları jenerik olduğu
 * için bir sonraki oyun aynı kodu sıfırdan yazmaz.
 *
 * `queryNearby` adı korunur: çağrı yerleri oyunun sözlüğünde okunur
 * (`grid.queryNearby(x, y)`), altındaki `query` jenerik kalır.
 */
export class SpatialGrid extends SpatialIndex<Enemy> {
  constructor(cellSize: number) {
    super(cellSize, (enemy) => enemy.isAlive);
  }

  /** Verilen konuma yakın, HAYATTA olan düşmanlar. */
  queryNearby(x: number, y: number): readonly Enemy[] {
    return this.query(x, y);
  }

  /** Aktif hücre sayısı — diagnostic. */
  getIndexedCount(): number {
    return this.size;
  }
}
