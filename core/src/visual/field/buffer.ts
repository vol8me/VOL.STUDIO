/**
 * Alan tamponu ve havuzu — D7'nin uygulaması.
 *
 * Katman yığını doğrusaldır, bu yüzden ara sonuçların ömrü bedavaya bilinir:
 * bir katman işlenip biriktiriciye harmanlandığında tamponu serbesttir.
 * Havuzlama isteğe bağlı bir iyileştirme değil, bütçenin parçasıdır — 1024²
 * bir `Float32Array` 4 MB'dır ve katman başına yeniden ayırmak elli katmanlı
 * bir belgede yüzlerce megabaytı çöp toplayıcıya bırakır.
 *
 * Havuz BOYUT BAŞINA tutulur: farklı boyutlu tamponlar birbirinin yerine
 * geçemez, tek bir havuzda karışırlarsa `acquire()` yanlış uzunlukta bir
 * dizi döndürür.
 */

import { ObjectPool } from '../../pool/ObjectPool';

export interface FieldBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

function createBuffer(width: number, height: number): FieldBuffer {
  return { width, height, data: new Float32Array(width * height) };
}

/**
 * Boyuta göre ayrılmış `FieldBuffer` havuzu.
 *
 * `ObjectPool` sahiplik denetimini zaten yapıyor (aynı tamponun iki kez iade
 * edilmesi ya da yabancı bir tamponun havuza girmesi hata verir); burada
 * yalnızca boyut anahtarlaması ekleniyor.
 */
export class FieldBufferPool {
  private readonly pools = new Map<string, ObjectPool<FieldBuffer>>();

  acquire(width: number, height: number): FieldBuffer {
    return this.poolFor(width, height).acquire();
  }

  /** Tamponu havuza iade eder. Veri sıfırlanır — kalıntı bir sonraki katmana sızmasın. */
  release(buffer: FieldBuffer): void {
    this.poolFor(buffer.width, buffer.height).release(buffer);
  }

  /** Havuzdaki boyut sayısı — ölçüm ve test için. */
  get sizeCount(): number {
    return this.pools.size;
  }

  /** Boşta bekleyen tamponları bırakır; kullanımdakiler etkilenmez. */
  clear(): void {
    for (const pool of this.pools.values()) pool.clear();
  }

  private poolFor(width: number, height: number): ObjectPool<FieldBuffer> {
    const key = `${width}x${height}`;
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new ObjectPool<FieldBuffer>({
        create: () => createBuffer(width, height),
        reset: (buffer) => buffer.data.fill(0),
      });
      this.pools.set(key, pool);
    }
    return pool;
  }
}
