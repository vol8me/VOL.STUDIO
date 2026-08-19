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

export class Scheduler {
  private readonly tasks: Task[] = [];
  private nextId = 1;
  /** update() içindeyken eklenen işler bu turda İŞLENMEZ (bkz. update). */
  private draining = false;
  private readonly pending: Task[] = [];

  /** Verilen süre sonra BİR KEZ çalışır. */
  after(delayMs: number, callback: () => void): CancelScheduled {
    return this.add(delayMs, null, callback);
  }

  /**
   * Verilen periyotla TEKRAR TEKRAR çalışır. İlk çalışma bir periyot sonradır.
   *
   * Periyot 0 ya da negatifse iş eklenmez: sıfır periyot tek bir `update()`
   * içinde sonsuz döngü demektir.
   */
  every(intervalMs: number, callback: () => void): CancelScheduled {
    if (intervalMs <= 0) return () => {};
    return this.add(intervalMs, intervalMs, callback);
  }

  /**
   * Zamanı ilerletir ve süresi dolan işleri çalıştırır.
   *
   * Tek bir `update()` içinde bir tekrarlı iş birden fazla kez tetiklenebilir
   * (uzun bir kare, kısa bir periyot). Bu bilinçlidir: aksi halde kare
   * düşmelerinde iş sessizce YİYİLİR ve mantık gerçek zamandan geri kalır.
   */
  update(deltaMs: number): void {
    if (deltaMs <= 0) return;

    this.draining = true;
    for (const task of this.tasks) {
      if (task.cancelled) continue;

      task.remainingMs -= deltaMs;
      // `while`: uzun bir karede birikmiş tetiklenmeler atlanmaz.
      while (!task.cancelled && task.remainingMs <= 0) {
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
