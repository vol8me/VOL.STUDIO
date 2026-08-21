import { finiteOr, requireFinite } from '../math/numeric';

/**
 * Delta-time ile sürülen zamanlayıcı — gecikmeli ve tekrarlı işler.
 *
 * `setTimeout`/`setInterval` YERİNE oyun döngüsüne bağlıdır ve fark önemlidir:
 * duraklatılan bir oyunda tarayıcı zamanlayıcıları işlemeye devam eder, bu
 * scheduler ise `update()` çağrılmadığı sürece hiç ilerlemez. Sahne
 * duraklatıldığında yetenek cooldown'ının akmaya devam etmesi, vol-hell'de
 * her sınıfın kendi `elapsed += delta` sayacını elle yazmasının sebebiydi.
 *
 * Deterministiktir: aynı delta dizisi aynı tetiklenme sırasını üretir, yani
 * kayıtlı bir koşu tekrar oynatılabilir.
 */

/**
 * Tek bir `update()` içinde bir işin çalışabileceği azami tekrar sayısı.
 *
 * Birikmiş tetiklenmeleri işlemek bilinçlidir (kare düşmesinde iş yenmemeli)
 * ama SINIRSIZ olamaz: sekme dakikalarca donduktan sonra dönen tek bir dev
 * delta, 1ms periyotlu bir işi yüz binlerce kez çağırır ve kareyi kilitler.
 * Sınır aşılınca kalan borç DÜŞÜLÜR — mantık gerçek zamandan geri kalır ama
 * uygulama yanıt vermeye devam eder.
 */
const DEFAULT_MAX_CATCH_UP = 32;

/** Kaydedilmiş işi iptal eder. İkinci çağrı no-op'tur. */
export type CancelScheduled = () => void;

interface Task {
  id: number;
  /** Kalan süre (ms). */
  remainingMs: number;
  /** Tekrarlıysa periyot (ms); tek seferlikse null. */
  intervalMs: number | null;
  callback: () => void;
  cancelled: boolean;
}

export interface SchedulerOptions {
  /**
   * Tek `update()` içinde bir işin azami tekrar sayısı. Varsayılan 32.
   * `Infinity` verilebilir ama donmuş sekme dönüşünde kareyi kilitler.
   */
  maxCatchUp?: number;
  /**
   * Sınıra takılıp atlanan tetiklenmeler bildirilir — sessizce kaybolmaları,
   * "neden bu iş bir süre çalışmadı?" sorusunu ayıklanamaz kılardı.
   */
  onCatchUpLimit?: (skipped: number) => void;
  /**
   * Bir callback içinden `update()` çağrıldığında bildirilir. Sessiz
   * reddetme, "neden bu kare işlenmedi?" sorusunu ayıklanamaz kılardı.
   */
  onReentrantUpdate?: () => void;
}

export class Scheduler {
  private readonly tasks: Task[] = [];
  private nextId = 1;
  private readonly maxCatchUp: number;
  private readonly onCatchUpLimit?: (skipped: number) => void;
  private readonly onReentrantUpdate?: () => void;
  /** update() içindeyken eklenen işler bu turda İŞLENMEZ (bkz. update). */
  private draining = false;
  private readonly pending: Task[] = [];

  constructor(options: SchedulerOptions = {}) {
    const limit = options.maxCatchUp ?? DEFAULT_MAX_CATCH_UP;
    this.maxCatchUp = limit > 0 ? limit : DEFAULT_MAX_CATCH_UP;
    this.onCatchUpLimit = options.onCatchUpLimit;
    this.onReentrantUpdate = options.onReentrantUpdate;
  }

  /** Verilen süre sonra BİR KEZ çalışır. */
  after(delayMs: number, callback: () => void): CancelScheduled {
    return this.add(requireFinite(delayMs, 'Scheduler delayMs'), null, callback);
  }

  /**
   * Verilen periyotla TEKRAR TEKRAR çalışır. İlk çalışma bir periyot sonradır.
   *
   * Periyot 0 ya da negatifse iş eklenmez: sıfır periyot tek bir `update()`
   * içinde sonsuz döngü demektir.
   */
  every(intervalMs: number, callback: () => void): CancelScheduled {
    requireFinite(intervalMs, 'Scheduler intervalMs');
    if (intervalMs <= 0) return () => {};
    return this.add(intervalMs, intervalMs, callback);
  }

  /**
   * Zamanı ilerletir ve süresi dolan işleri çalıştırır.
   *
   * Tek bir `update()` içinde bir tekrarlı iş birden fazla kez tetiklenebilir
   * (uzun bir kare, kısa bir periyot). Bu bilinçlidir: aksi halde kare
   * düşmelerinde iş sessizce YİYİLİR ve mantık gerçek zamandan geri kalır.
   *
   * **Yeniden giriş REDDEDİLİR.** Bir callback içinden `update()` çağrılırsa
   * çağrı sessizce yok sayılır ve `false` döner. Aksi halde iç çağrı zamanı
   * bir kez daha ilerletir (tek 10ms'lik kare içinde aynı iş üç kez çalışır),
   * üstelik `draining` bayrağını erken düşürerek "yayın sırasında eklenen iş
   * bu turda çalışmaz" garantisini de kırar.
   *
   * @returns Kare işlendiyse `true`; yeniden giriş yüzünden atlandıysa `false`.
   *
   * Ama `maxCatchUp` ile SINIRLIDIR (bkz. `DEFAULT_MAX_CATCH_UP`): sınırsız
   * telafi, donmuş bir sekmeden dönüşte tek karede yüz binlerce çağrı demektir.
   * Sınıra takılan iş kalan borcunu düşer ve `onCatchUpLimit` ile bildirir.
   */
  update(deltaMs: number): boolean {
    if (this.draining) {
      this.onReentrantUpdate?.();
      return false;
    }

    const delta = finiteOr(deltaMs, 0);
    if (delta <= 0) return true;

    this.draining = true;
    for (const task of this.tasks) {
      if (task.cancelled) continue;

      task.remainingMs -= delta;

      // `while`: uzun bir karede birikmiş tetiklenmeler atlanmaz — ama
      // sınırsız değil (bkz. DEFAULT_MAX_CATCH_UP).
      let runs = 0;
      while (!task.cancelled && task.remainingMs <= 0) {
        if (runs >= this.maxCatchUp) {
          const skipped =
            task.intervalMs !== null ? Math.ceil(-task.remainingMs / task.intervalMs) : 0;
          // Borcu düş: telafi edilemeyen tetiklenmeler geride bırakılır,
          // aksi halde her karede aynı sınıra takılıp asla kapanmaz.
          task.remainingMs = task.intervalMs ?? 0;
          this.onCatchUpLimit?.(skipped);
          break;
        }
        runs++;

        task.callback();
        if (task.intervalMs === null) {
          task.cancelled = true;
          break;
        }
        task.remainingMs += task.intervalMs;
      }
    }
    this.draining = false;

    if (this.pending.length > 0) {
      this.tasks.push(...this.pending);
      this.pending.length = 0;
    }
    this.purge();
    return true;
  }

  /** Kayıtlı (iptal edilmemiş) iş sayısı — teşhis ve test için. */
  get size(): number {
    return this.tasks.filter((task) => !task.cancelled).length + this.pending.length;
  }

  /** Tüm işleri iptal eder. Sahne kapanışında çağrılır. */
  clear(): void {
    for (const task of this.tasks) task.cancelled = true;
    this.pending.length = 0;
    if (!this.draining) this.purge();
  }

  private add(delayMs: number, intervalMs: number | null, callback: () => void): CancelScheduled {
    const task: Task = {
      id: this.nextId++,
      remainingMs: Math.max(0, delayMs),
      intervalMs,
      callback,
      cancelled: false,
    };

    // update() içinde eklenen iş AYNI turda çalışmamalı: bir callback'in
    // kendini yeniden kaydetmesi sonsuz döngü kurardı.
    if (this.draining) {
      this.pending.push(task);
    } else {
      this.tasks.push(task);
    }

    return () => {
      task.cancelled = true;
    };
  }

  private purge(): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].cancelled) this.tasks.splice(i, 1);
    }
  }
}
