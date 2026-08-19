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
 * Nesne havuzu — sık doğup ölen kısa ömürlü nesneler için. Nesnenin ne olduğu
 * havuzu ilgilendirmez; üretimi ve sıfırlamayı çağıran verir.
 *
 * Amaç allocation'ı değil ÇÖP TOPLAMAYI azaltmaktır: kare başına yüzlerce
 * kısa ömürlü nesne, GC'yi görünür takılmalar üretecek sıklıkta tetikler.
 *
 * Havuz nesnenin ne olduğunu bilmez; üretimi ve sıfırlamayı çağıran verir.
 * `reset` içinde referansları bırakmak ÇAĞIRANIN sorumluluğudur: boşta duran
 * bir nesne hâlâ bir başkasına referans tutuyorsa o da serbest kalmaz.
 */
export class ObjectPool<T> {
  private readonly idle: T[] = [];
  private readonly createFn: () => T;
  private readonly resetFn?: (item: T) => void;
  private readonly maxIdle: number;
  private activeCount = 0;

  constructor(options: ObjectPoolOptions<T>) {
    this.createFn = options.create;
    this.resetFn = options.reset;
    this.maxIdle = options.maxIdle ?? Infinity;

    const prewarm = Math.max(0, options.prewarm ?? 0);
    for (let i = 0; i < prewarm; i++) {
      this.idle.push(this.createFn());
    }
  }

  /** Boştaki bir örneği verir; yoksa yenisini üretir. */
  acquire(): T {
    this.activeCount++;
    const reused = this.idle.pop();
    return reused ?? this.createFn();
  }

  /**
   * Örneği havuza iade eder ve `reset` uygular.
   *
   * Aynı örneği İKİ KEZ iade etmek sessiz ve ayıklanması çok zor bir hataya
   * yol açar (aynı nesne iki farklı sahibe dağıtılır), bu yüzden yakalanır.
   */
  release(item: T): void {
    if (this.idle.includes(item)) {
      throw new Error('ObjectPool: aynı örnek iki kez iade edildi');
    }

    this.activeCount = Math.max(0, this.activeCount - 1);
    this.resetFn?.(item);

    if (this.idle.length < this.maxIdle) {
      this.idle.push(item);
    }
  }

  /** Dışarıda kullanımda olan örnek sayısı. */
  getActiveCount(): number {
    return this.activeCount;
  }

  /** Havuzda bekleyen örnek sayısı. */
  getIdleCount(): number {
    return this.idle.length;
  }

  /**
   * Boştaki örnekleri bırakır. Aktif örnekler ETKİLENMEZ — havuz onların
   * sahibi değildir, yalnızca iade edilenleri saklar.
   */
  clear(): void {
    this.idle.length = 0;
  }
}
