export interface ObjectPoolOptions<T> {
  /** Yeni örnek üretir — havuz boşken çağrılır. */
  create: () => T;
  /** Havuza dönerken çağrılır: referansları bırak, durumu sıfırla. */
  reset?: (item: T) => void;
  /** Başlangıçta önceden üretilecek örnek sayısı. Varsayılan 0. */
  prewarm?: number;
  /**
   * Havuzda tutulacak azami boşta örnek. Aşan iade edilenler TUTULMAZ (çöpe
   * bırakılır). Verilmezse sınırsız — bir tepe anında şişen havuz o belleği
   * koşu boyunca elinde tutar.
   */
  maxIdle?: number;
}

/**
 * Nesne havuzu. Amaç allocation'ı değil ÇÖP TOPLAMAYI azaltmak: kare başına
 * yüzlerce kısa ömürlü nesne GC'yi görünür takılma üretecek sıklıkta tetikler.
 *
 * Nesnenin ne olduğunu bilmez. `reset` içinde referansları bırakmak ÇAĞIRANIN
 * işidir: boştaki nesne başkasına referans tutuyorsa o da serbest kalmaz.
 */
export class ObjectPool<T> {
  private readonly idle: T[] = [];
  private readonly createFn: () => T;
  private readonly resetFn?: (item: T) => void;
  private readonly maxIdle: number;
  /** Boştaki örneklerin O(1) iade kontrolü için kümesi. */
  private readonly idleSet: Set<T> = new Set();
  /**
   * DIŞARIDA kullanımdakiler. Salt sayaç yetmez: yabancı bir nesne `release`
   * edilip havuza girer ve bir sonraki `acquire()` ile başkasına dağıtılırdı.
   */
  private readonly activeSet: Set<T> = new Set();

  constructor(options: ObjectPoolOptions<T>) {
    this.createFn = options.create;
    this.resetFn = options.reset;
    this.maxIdle = options.maxIdle ?? Infinity;

    const prewarm = Math.max(0, options.prewarm ?? 0);
    for (let i = 0; i < prewarm; i++) {
      const item = this.createFn();
      this.idle.push(item);
      this.idleSet.add(item);
    }
  }

  /** Boştaki bir örneği verir; yoksa yenisini üretir. */
  acquire(): T {
    const reused = this.idle.pop();
    const item = reused ?? this.createFn();
    if (reused !== undefined) this.idleSet.delete(reused);
    this.activeSet.add(item);
    return item;
  }

  /**
   * İade eder ve `reset` uygular. İKİ KEZ iade yakalanır — aynı nesne iki
   * sahibe dağıtılırdı. `idleSet` sayesinde kontrol O(1); iade sıcak yoldadır.
   */
  release(item: T): void {
    if (this.idleSet.has(item)) {
      throw new Error('ObjectPool: aynı örnek iki kez iade edildi');
    }
    if (!this.activeSet.has(item)) {
      throw new Error('ObjectPool: bu havuzdan alınmamış bir örnek iade edilemez');
    }

    this.activeSet.delete(item);
    this.resetFn?.(item);

    if (this.idle.length < this.maxIdle) {
      this.idle.push(item);
      this.idleSet.add(item);
    }
  }

  getActiveCount(): number {
    return this.activeSet.size;
  }

  getIdleCount(): number {
    return this.idle.length;
  }

  /**
   * Boştakileri bırakır. Aktif örnekler ETKİLENMEZ ve sahiplikleri korunur:
   * havuz onların sahibi değildir, iade edilebilmeleri gerekir.
   */
  clear(): void {
    this.idle.length = 0;
    this.idleSet.clear();
  }
}
